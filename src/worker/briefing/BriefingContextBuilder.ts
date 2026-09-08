import type { Bindings } from '../env'
import type { Site } from '../../shared/types/site'
import { getWeatherProvider } from '../providers/weather'
import { getAirQualityProvider } from '../providers/air-quality'
import { getSiteSummaryProvider } from '../providers/site-summary'
import { getBidProvider } from '../providers/bidding'
import { getNewsProvider } from '../providers/news'
import { getLawProvider } from '../providers/laws'
import { getExchangeRateProvider } from '../providers/exchange'
import { getMaterialPriceProvider } from '../providers/materials'
import { MockMaterialPriceProvider } from '../providers/materials/MockMaterialPriceProvider'
import { ScheduleRepository } from '../repositories/ScheduleRepository'
import { TodoRepository } from '../repositories/TodoRepository'
import { evaluateConstructionWeatherRisk } from '../../shared/utils/constructionWeatherRisk'
import { RECOMMENDED_LAWS } from '../../shared/types/law'
import { MATERIAL_CATALOG } from '../../shared/types/market'
import type { ActiveDashboardWidget } from '../repositories/DashboardConfigRepository'

/**
 * BriefingContextBuilder (기획 40번)
 *
 * 원칙:
 * - 외부 API Raw JSON을 그대로 LLM에 전달하지 않는다. 각 Provider의
 *   Normalized Domain Data만 사용한다.
 * - 사용자의 현재 Dashboard에 존재하지 않는 Widget 데이터는 Context에서 제외한다
 *   (기획 39번 - Dashboard Widget 구성이 곧 Briefing 대상을 자동 결정).
 * - Context Token 사용량 최소화를 위해 각 도메인 데이터를 요약/제한한다 (기획 50번).
 */

export interface BriefingContext {
  generatedAt: string
  user: { name: string }
  site: { id: string; name: string; address: string } | null
  weather?: { data: unknown; risk: unknown; freshness: 'fresh' | 'stale' }
  weatherAlerts?: { data: unknown; freshness: 'fresh' | 'stale' }
  airQuality?: { data: unknown; freshness: 'fresh' | 'stale' }
  calendar?: { todayEvents: unknown[]; freshness: 'fresh' | 'stale' }
  todos?: { today: unknown[]; overdue: unknown[]; freshness: 'fresh' | 'stale' }
  siteSummary?: { data: unknown; freshness: 'fresh' | 'stale' }
  bidding?: { data: unknown[]; freshness: 'fresh' | 'stale' }
  news?: { data: unknown[]; freshness: 'fresh' | 'stale' }
  seriousAccidents?: { data: unknown[]; freshness: 'fresh' | 'stale' }
  laws?: { data: unknown[]; freshness: 'fresh' | 'stale' }
  exchangeRates?: { data: unknown[]; freshness: 'fresh' | 'stale' }
  materialPrices?: { data: unknown[]; freshness: 'fresh' | 'stale' }
}

function isFresh(updatedAt: string, maxAgeMs: number): 'fresh' | 'stale' {
  return Date.now() - new Date(updatedAt).getTime() <= maxAgeMs ? 'fresh' : 'stale'
}

/**
 * activeWidgetIds: 사용자 Dashboard에 현재 등록된(hidden 아닌) Widget ID 목록.
 * 이 목록에 없는 도메인은 Context 필드 자체를 생성하지 않는다.
 */
export async function buildBriefingContext(
  env: Bindings,
  params: {
    userName: string
    site: Site | null
    activeWidgets: ActiveDashboardWidget[]
    userId: string
  }
): Promise<BriefingContext> {
  const { site, activeWidgets, userId } = params
  const has = (id: string) => activeWidgets.some((widget) => widget.widgetId === id)

  const context: BriefingContext = {
    generatedAt: new Date().toISOString(),
    user: { name: params.userName },
    site: site ? { id: site.id, name: site.name, address: site.address } : null,
  }

  const tasks: Promise<void>[] = []

  if (site && has('weather')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getWeatherProvider(env)
          const weather = await provider.getCurrentWeather(site)
          const risk = evaluateConstructionWeatherRisk(weather)
          context.weather = { data: summarizeWeather(weather), risk, freshness: 'fresh' }
        } catch {
          /* 조회 실패 시 Context에서 조용히 제외 (Briefing이 실패하지 않도록) */
        }
      })()
    )
  }

  if (site && has('weatherAlert')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getWeatherProvider(env)
          const alerts = await provider.getAlerts(site)
          if (alerts.length > 0) context.weatherAlerts = { data: alerts, freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (site && has('airQuality')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getAirQualityProvider(env)
          const aq = await provider.getCurrentAirQuality(site)
          context.airQuality = { data: aq, freshness: isFresh(aq.measuredAt, 60 * 60 * 1000) }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('calendar')) {
    tasks.push(
      (async () => {
        try {
          const repo = new ScheduleRepository(env.DB)
          const now = new Date()
          const start = new Date(now); start.setHours(0, 0, 0, 0)
          const end = new Date(now); end.setHours(23, 59, 59, 999)
          const events = await repo.listByUser(userId, start.toISOString(), end.toISOString())
          context.calendar = { todayEvents: events.slice(0, 8), freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('todo')) {
    tasks.push(
      (async () => {
        try {
          const repo = new TodoRepository(env.DB)
          const all = await repo.listByUser(userId)
          const todayStr = new Date().toISOString().slice(0, 10)
          const today = all.filter((t) => t.status !== 'done' && t.dueDate === todayStr).slice(0, 10)
          const overdue = all.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr).slice(0, 10)
          context.todos = { today, overdue, freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (site && has('siteSummary')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getSiteSummaryProvider(env)
          const summary = await provider.getTodaySummary(site)
          context.siteSummary = { data: summary, freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('bidding')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getBidProvider(env)
          const bids = await provider.searchBids({}, 5)
          context.bidding = { data: bids, freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('constructionNews')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getNewsProvider(env)
          const items = await provider.getNews([], 20)
          const seriousAccidents = items.filter((news) => news.category === '중대재해').slice(0, 3)
          const news = items.filter((news) => news.category !== '중대재해').slice(0, 5)
          if (news.length > 0) context.news = { data: news, freshness: 'fresh' }
          if (seriousAccidents.length > 0) context.seriousAccidents = { data: seriousAccidents, freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('law')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getLawProvider(env)
          const names = selectedWidgetStrings(activeWidgets, 'law', 'lawNames', RECOMMENDED_LAWS, 20)
          const laws = await provider.getLaws(names)
          const changed = laws.filter((l) => l.changed)
          context.laws = { data: changed.length ? changed : laws.slice(0, 3), freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('exchangeRate')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getExchangeRateProvider(env)
          const rates = await provider.getRates(['USD'])
          context.exchangeRates = { data: rates, freshness: 'fresh' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  if (has('materialPrice')) {
    tasks.push(
      (async () => {
        try {
          const provider = await getMaterialPriceProvider(env)
          const allowedKeys = new Set(MATERIAL_CATALOG.map((material) => material.key))
          const keys = selectedWidgetStrings(
            activeWidgets,
            'materialPrice',
            'materialKeys',
            MATERIAL_CATALOG.slice(0, 4).map((material) => material.key),
            MATERIAL_CATALOG.length,
          ).filter((key) => allowedKeys.has(key))
          let prices
          let source = provider.source
          try {
            prices = await provider.getPrices(keys)
          } catch {
            const fallback = new MockMaterialPriceProvider()
            prices = await fallback.getPrices(keys)
            source = fallback.source
          }
          context.materialPrices = { data: prices, freshness: source === 'live' ? 'fresh' : 'stale' }
        } catch {
          /* noop */
        }
      })()
    )
  }

  await Promise.all(tasks)
  return context
}

export function selectedWidgetStrings(
  widgets: ActiveDashboardWidget[],
  widgetId: string,
  settingKey: string,
  fallback: readonly string[],
  limit: number,
): string[] {
  const selected = widgets.flatMap((widget) => {
    const value = widget.widgetId === widgetId ? widget.settings?.[settingKey] : undefined
    return Array.isArray(value) ? value : []
  })
  const valid = [...new Set(selected.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
  return (valid.length > 0 ? valid : [...fallback]).slice(0, limit)
}

/** 날씨는 hourly 배열이 크므로 Briefing용으로는 요약본만 사용 (Token 절약) */
function summarizeWeather(weather: any) {
  const { hourly, ...rest } = weather
  return { ...rest, hourlyPreview: (hourly ?? []).slice(0, 4) }
}

/** Context 해시 (동일 Context 중복 생성 방지/디버깅용) */
export async function hashContext(context: BriefingContext): Promise<string> {
  const json = JSON.stringify(context)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
