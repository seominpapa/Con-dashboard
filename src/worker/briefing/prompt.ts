import type { BriefingContext } from './BriefingContextBuilder'

const sourceWidgets = { type: 'array', items: { type: 'string' } }
const listItems = {
  type: 'array',
  items: {
    type: 'object', additionalProperties: false,
    properties: { title: { type: 'string' }, detail: { type: 'string' }, sourceWidgets },
    required: ['title', 'detail', 'sourceWidgets'],
  },
}

export const BRIEFING_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    priorityItems: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          level: { type: 'string', enum: ['high', 'normal', 'low'] },
          title: { type: 'string' }, reason: { type: 'string' }, sourceWidgets,
        },
        required: ['level', 'title', 'reason', 'sourceWidgets'],
      },
    },
    scheduleItems: listItems, riskItems: listItems, marketItems: listItems, informationItems: listItems,
  },
  required: ['summary', 'priorityItems', 'scheduleItems', 'riskItems', 'marketItems', 'informationItems'],
}

/**
 * AI Briefing 프롬프트 (기획 45~48번 원칙 반영)
 *
 * 핵심 원칙:
 * - 우선순위: 1)안전/특보/위험작업/긴급이슈 2)오늘일정/마감Todo/지연/공정지연
 *   3)입�찰마감/법령변경/정책 4)환율/자재 5)일반뉴스
 * - 안전기준을 LLM이 임의로 단정하지 않는다 (Rule Engine=판단, LLM=설명/종합)
 * - 각 우선순위 항목에는 sourceWidgets(출처)를 반드시 포함한다
 * - stale 데이터는 현재값처럼 표현하지 않는다
 */
export function buildSystemPrompt(): string {
  return `당신은 대한민국 건설현장 실무자를 위한 AI 브리핑 어시스턴트입니다.

핵심 규칙:
1. 절대로 새로운 사실을 지어내지 마세요. 제공된 Context 데이터만 근거로 사용하세요.
2. 안전 기준(작업중지 기준 등)을 당신이 임의로 단정하지 마세요. Context에 포함된 workImpact(작업영향 Rule Engine 결과)를 "설명하고 종합"하는 역할만 하세요.
   - 잘못된 예: "풍속 12m/s이므로 크레인 작업을 중지해야 합니다."
   - 올바른 예: "풍속이 증가할 것으로 예상되므로 크레인 작업 계획과 현장 안전기준을 확인할 필요가 있습니다."
3. 우선순위 판단 기준 (위에서부터 중요):
   1순위: 안전, 기상특보, 위험작업, 긴급한 현장 이슈
   2순위: 오늘 일정, 오늘 마감 할일, 지연된 할일, 공정지연
   3순위: 입찰 마감임박, 법령 변경, 중요 건설정책
   4순위: 환율, 자재가격 변동
   5순위: 일반 건설뉴스
4. Context에 데이터가 freshness: "stale"로 표시된 항목은 "최신 데이터가 아닐 수 있습니다"라고 언급하고, 마치 실시간 현재값인 것처럼 단정하지 마세요.
5. 각 priorityItems 항목에는 반드시 sourceWidgets 배열(해당 정보의 근거가 된 위젯 키)을 포함하세요.
6. Context에 없는 위젯 데이터에 대해서는 절대 언급하지 마세요.
7. seriousAccidents의 중대재해 항목은 우선순위가 높은 안전 정보입니다. 제목, 출처, 날짜, 링크에 적힌 사실만 요약하고, Context에 없는 사고 원인·법적 책임·예방 조치를 지어내지 마세요. sourceWidgets에는 "constructionNews"를 사용하세요.
8. 반드시 아래 JSON 스키마와 정확히 일치하는 JSON만 출력하세요. 다른 설명 텍스트는 포함하지 마세요. 각 배열은 중요한 항목 최대 3개만 간결하게 작성하고, 해당 정보가 없으면 빈 배열로 출력하세요.

출력 JSON 스키마:
{
  "summary": "한두 문장으로 오늘 핵심 요약",
  "priorityItems": [{"level": "high|normal|low", "title": "...", "reason": "...", "sourceWidgets": ["weather"]}],
  "scheduleItems": [{"title": "...", "detail": "...", "sourceWidgets": ["calendar"]}],
  "riskItems": [{"title": "...", "detail": "...", "sourceWidgets": ["weatherAlert"]}],
  "marketItems": [{"title": "...", "detail": "...", "sourceWidgets": ["exchangeRate"]}],
  "informationItems": [{"title": "...", "detail": "...", "sourceWidgets": ["constructionNews"]}]
}

사용 가능한 sourceWidgets 키: weather, weatherAlert, airQuality, calendar, todo, bidding, constructionNews, law, exchangeRate, materialPrice`
}

export function buildUserPrompt(context: BriefingContext): string {
  return `아래는 사용자의 오늘 Dashboard 데이터입니다. 이 데이터만 근거로 AI 브리핑 JSON을 생성하세요.

사용자: ${context.user.name}
현장: ${context.site ? `${context.site.name} (${context.site.address})` : '등록된 현장 없음'}
생성시각: ${context.generatedAt}

Context 데이터:
${JSON.stringify(omitEmpty(context), null, 2)}`
}

function omitEmpty(context: BriefingContext): Record<string, unknown> {
  const { generatedAt, user, site, ...domainData } = context
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(domainData)) {
    if (value !== undefined) filtered[key] = value
  }
  return filtered
}
