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

  const existing = await briefingRepo.findByUserAndDate(params.userId, briefingDate)
  if (existing) {
    if (existing.status === 'error') {
      return { status: 'error', briefingDate, message: existing.errorMessage ?? 'AI 브리핑 생성에 실패했습니다' }
    }
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

    const activeWidgetIds = await dashboardRepo.getActiveWidgetIds(params.userId)
    const sites = await siteRepo.listByUser(params.userId)
    const site = sites[0] ?? null // 사용자의 기본/첫 현장 (기획상 "현재 선택된 현장" 개념, MVP는 첫번째)

    const context = await buildBriefingContext(env, {
      userName: params.userName,
      site,
      activeWidgetIds,
      userId: params.userId,
    })
    const contextHash = await hashContext(context)

    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(context)

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
      // 동시 요청 경합에서 패배 -> 이미 저장된 것을 재조회하여 반환
      const raced = await briefingRepo.findByUserAndDate(params.userId, briefingDate)
      if (raced && raced.status === 'success') {
        return { status: 'ready', briefingDate, provider: raced.provider, model: raced.model ?? undefined, structured: raced.structured, generatedAt: raced.generatedAt }
      }
    }

    return { status: 'ready', briefingDate, provider: llm.key, model: result.model, structured, generatedAt: new Date().toISOString() }
  } catch (err: any) {
    console.error('[briefing] generation failed:', err.message)
    await briefingRepo.tryInsert({
      userId: params.userId,
      siteId: null,
      briefingDate,
      provider: llm.key,
      model: null,
      structured: emptyStructured(),
      contextHash: 'error',
      status: 'error',
      errorMessage: err.message,
    })
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

function parseStructuredOutput(text: string): BriefingStructuredContent {
  try {
    // JSON 코드블록 감싸짐 대비
    const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')
    const parsed = JSON.parse(cleaned)
    return {
      summary: parsed.summary ?? '',
      priorityItems: Array.isArray(parsed.priorityItems) ? parsed.priorityItems : [],
      scheduleItems: Array.isArray(parsed.scheduleItems) ? parsed.scheduleItems : [],
      riskItems: Array.isArray(parsed.riskItems) ? parsed.riskItems : [],
      marketItems: Array.isArray(parsed.marketItems) ? parsed.marketItems : [],
      informationItems: Array.isArray(parsed.informationItems) ? parsed.informationItems : [],
    }
  } catch {
    return { summary: text.slice(0, 500), priorityItems: [], scheduleItems: [], riskItems: [], marketItems: [], informationItems: [] }
  }
}

function emptyStructured(): BriefingStructuredContent {
  return { summary: '', priorityItems: [], scheduleItems: [], riskItems: [], marketItems: [], informationItems: [] }
}
