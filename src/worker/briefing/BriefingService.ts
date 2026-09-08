import type { Bindings } from '../env'
import type { AiBriefingResponse, BriefingStructuredContent } from '../../shared/types/briefing'
import { AiBriefingRepository } from '../repositories/AiBriefingRepository'
import { DashboardConfigRepository } from '../repositories/DashboardConfigRepository'
import { SiteRepository } from '../repositories/SiteRepository'
import { buildBriefingContext, hashContext } from './BriefingContextBuilder'
import { buildSystemPrompt, buildUserPrompt } from './prompt'
import { getDefaultLLMProvider } from '../llm'
import { todayKeySeoul } from '../../shared/utils/timezone'
import { AiUsageLogRepository } from '../repositories/AiUsageLogRepository'
import type { Site } from '../../shared/types/site'
import type { StoredBriefing } from '../repositories/AiBriefingRepository'
import { SettingsRepository } from '../repositories/SettingsRepository'
import type { BriefingContext } from './BriefingContextBuilder'

const LEGACY_EMPTY_BRIEFING_SUMMARY = '오늘 대시보드에 등록된 데이터가 없습니다. 현장 정보와 대시보드 위젯을 확인해 주세요.'
const BRIEFING_DATA_KEYS: (keyof BriefingContext)[] = [
  'weather',
  'weatherAlerts',
  'airQuality',
  'calendar',
  'todos',
  'bidding',
  'news',
  'seriousAccidents',
  'laws',
  'exchangeRates',
  'materialPrices',
]

/**
 * BriefingService (기획 41~51번 오케스트레이션)
 *
 * 흐름:
 * 1. 오늘(Asia/Seoul) Briefing이 이미 존재하면 즉시 반환 (LLM 재호출 없음)
 * 2. 없으면 사용자의 Dashboard Widget 구성을 조회하여 Context 자동 결정 (기획 39번)
 * 3. BriefingContextBuilder로 Normalized Data만 수집
 * 4. 관리자가 지정한 기본 LLM Provider 호출
 * 5. DB Unique Constraint로 동시 중복 생성 방지 (기획 42번)
 * 6. LLM 장애 시에도 Dashboard 전체에는 영향 없음 - 이 서비스 자체가 실패해도 예외를 던지지 않고
 *    unavailable/error 상태를 반환한다 (기획 49번)
 */
export async function getOrCreateTodayBriefing(
  env: Bindings,
  params: { userId: string; userName: string }
): Promise<AiBriefingResponse> {
  const briefingDate = todayKeySeoul()
  const briefingRepo = new AiBriefingRepository(env.DB)

  const existing = await loadSuccessfulCachedBriefing(briefingRepo, params.userId, briefingDate)
  if (existing) {
    return {
      status: 'ready',
      briefingDate,
      provider: existing.provider,
      model: existing.model ?? undefined,
      structured: existing.structured,
      generatedAt: existing.generatedAt,
    }
  }

  // LLM Provider 준비 여부 먼저 확인 (기획 53번: 미연결 시 "준비 중" 상태)
  let llm
  try {
    llm = await getDefaultLLMProvider(env)
  } catch (err) {
    console.error('[briefing] provider setup failed:', err instanceof Error ? err.message : 'unknown error')
    return { status: 'unavailable', briefingDate, message: 'AI 브리핑 Provider 설정을 확인해 주세요' }
  }
  if (!llm) {
    return { status: 'unavailable', briefingDate, message: 'AI 브리핑 기능이 아직 준비 중입니다 (관리자 연결 필요)' }
  }

  try {
    const dashboardRepo = new DashboardConfigRepository(env.DB)
    const siteRepo = new SiteRepository(env.DB)

    const dashboardConfig = await dashboardRepo.getBriefingConfig(params.userId)
    if (!dashboardConfig.configured) {
      return { status: 'unavailable', briefingDate, message: '대시보드 설정을 동기화한 뒤 다시 시도해 주세요' }
    }
    const sites = await siteRepo.listByUser(params.userId)
    const site = selectBriefingSite(sites, dashboardConfig.activeSiteId)

    const context = await buildBriefingContext(env, {
      userName: params.userName,
      site,
      activeWidgets: dashboardConfig.widgets,
      userId: params.userId,
    })
    if (!hasBriefingData(context)) {
      return { status: 'unavailable', briefingDate, message: '브리핑에 사용할 대시보드 데이터를 불러오지 못했습니다. 위젯을 새로고침한 뒤 다시 시도해 주세요' }
    }
    const contextHash = await hashContext(context)

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(context)

    const settingsRepo = new SettingsRepository(env.DB)
    const leaseKey = `ai_briefing_generation_lease:${params.userId}:${briefingDate}`
    // ponytail: 5분 lease. LLM 요청이 5분을 넘기면 소유자 토큰이 있는 lease로 교체한다.
    const hasLease = await settingsRepo.consumeFixedWindow(leaseKey, 1, 300)
    if (!hasLease) {
      return { status: 'generating', briefingDate, message: '다른 요청에서 오늘의 AI 브리핑을 생성하고 있습니다' }
    }

    try {
      const canGenerate = await settingsRepo.consumeFixedWindow(
        `ai_briefing_generate_rate:${params.userId}:${briefingDate}`,
        5,
        60 * 60,
      )
      if (!canGenerate) {
        return { status: 'error', briefingDate, message: 'AI 브리핑 재시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요' }
      }

      const result = await llm.generateBriefing(systemPrompt, userPrompt, { jsonMode: true, maxTokens: 2000 })
      const structured = parseStructuredOutput(result.text)

      const inserted = await briefingRepo.tryInsert({
        userId: params.userId,
        siteId: site?.id ?? null,
        briefingDate,
        provider: llm.key,
        model: result.model,
        structured,
        contextHash,
        status: 'success',
      })

      // 사용량 로그 기록 (기획 50번)
      await new AiUsageLogRepository(env.DB).log({
        userId: params.userId,
        provider: llm.key,
        model: result.model,
        purpose: 'briefing',
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        success: true,
      })

      if (!inserted) {
        // lease 만료 후 시작된 다른 요청이 먼저 저장한 경우를 보정한다.
        const raced = await briefingRepo.findByUserAndDate(params.userId, briefingDate)
        if (raced && raced.status === 'success') {
          return { status: 'ready', briefingDate, provider: raced.provider, model: raced.model ?? undefined, structured: raced.structured, generatedAt: raced.generatedAt }
        }
      }

      return { status: 'ready', briefingDate, provider: llm.key, model: result.model, structured, generatedAt: new Date().toISOString() }
    } finally {
      try {
        await settingsRepo.delete(leaseKey)
      } catch (err) {
        console.error('[briefing] lease cleanup failed:', err instanceof Error ? err.message : 'unknown error')
      }
    }
  } catch (err: any) {
    console.error('[briefing] generation failed:', err.message)
    try {
      await new AiUsageLogRepository(env.DB).log({
        userId: params.userId,
        provider: llm.key,
        model: null,
        purpose: 'briefing',
        inputTokens: 0,
        outputTokens: 0,
        success: false,
        errorMessage: err.message,
      })
    } catch {
      /* usage 로깅 실패는 무시 */
    }
    return { status: 'error', briefingDate, message: '오늘 AI 브리핑을 생성하지 못했습니다' }
  }
}

export async function loadSuccessfulCachedBriefing(
  repository: Pick<AiBriefingRepository, 'findByUserAndDate' | 'deleteErrorByUserAndDate' | 'deleteLegacyEmptySuccessById'>,
  userId: string,
  briefingDate: string,
): Promise<StoredBriefing | null> {
  const existing = await repository.findByUserAndDate(userId, briefingDate)
  if (existing?.status === 'error') {
    await repository.deleteErrorByUserAndDate(userId, briefingDate)
    return null
  }
  if (existing?.status === 'success' && existing.structured?.summary === LEGACY_EMPTY_BRIEFING_SUMMARY) {
    await repository.deleteLegacyEmptySuccessById(existing.id)
    return null
  }
  return existing
}

export function hasBriefingData(context: BriefingContext): boolean {
  return BRIEFING_DATA_KEYS.some((key) => context[key] !== undefined)
}

export function selectBriefingSite(sites: Site[], activeSiteId?: string): Site | null {
  return sites.find((site) => site.id === activeSiteId) ?? sites[0] ?? null
}

export function parseStructuredOutput(text: string): BriefingStructuredContent {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
    const parsed = JSON.parse(cleaned)
    if (!isRecord(parsed) || typeof parsed.summary !== 'string') throw new Error('invalid summary')
    return {
      summary: parsed.summary,
      priorityItems: parsePriorityItems(parsed.priorityItems),
      scheduleItems: parseListItems(parsed.scheduleItems),
      riskItems: parseListItems(parsed.riskItems),
      marketItems: parseListItems(parsed.marketItems),
      informationItems: parseListItems(parsed.informationItems),
    }
  } catch {
    throw new Error('AI 브리핑 응답 형식이 올바르지 않습니다')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseSourceWidgets(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) throw new Error('invalid sources')
  return value
}

function parsePriorityItems(value: unknown): BriefingStructuredContent['priorityItems'] {
  if (!Array.isArray(value)) throw new Error('invalid priority items')
  return value.map((item) => {
    if (
      !isRecord(item)
      || !['high', 'normal', 'low'].includes(String(item.level))
      || typeof item.title !== 'string'
      || typeof item.reason !== 'string'
    ) throw new Error('invalid priority item')
    return {
      level: item.level as 'high' | 'normal' | 'low',
      title: item.title,
      reason: item.reason,
      sourceWidgets: parseSourceWidgets(item.sourceWidgets),
    }
  })
}

function parseListItems(value: unknown): BriefingStructuredContent['scheduleItems'] {
  if (!Array.isArray(value)) throw new Error('invalid list items')
  return value.map((item) => {
    if (!isRecord(item) || typeof item.title !== 'string' || typeof item.detail !== 'string') throw new Error('invalid list item')
    return { title: item.title, detail: item.detail, sourceWidgets: parseSourceWidgets(item.sourceWidgets) }
  })
}
