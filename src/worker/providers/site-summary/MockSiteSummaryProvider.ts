import type { SiteSummaryProvider } from './SiteSummaryProvider'
import type { Site } from '../../../shared/types/site'
import type { SiteSummaryToday, SiteIssue } from '../../../shared/types/site-summary'
import { seededRandom, range, todaySeed } from '../mockRandom'

/**
 * "오늘의 현장" 데이터는 외부 API가 아니라 사용자가 관리하는 현장 운영 데이터다.
 * 향후 작업일보 시스템과 연동될 것을 전제로 이 계층을 분리해두었다 (기획 11번).
 * 현재는 Site 기반 결정론적 Mock 데이터를 제공한다.
 */
const ISSUE_TEMPLATES = [
  { text: 'A구간 굴착 작업 지연', severity: 'warning' as const },
  { text: 'B구간 레미콘 반입 예정', severity: 'info' as const },
  { text: '발주처 정기 공정회의 예정', severity: 'info' as const },
  { text: '우천으로 인한 토공사 중단', severity: 'critical' as const },
  { text: '자재 반입 지연 발생', severity: 'warning' as const },
  { text: '안전점검 결과 시정조치 필요', severity: 'critical' as const },
]

export class MockSiteSummaryProvider implements SiteSummaryProvider {
  async getTodaySummary(site: Site): Promise<SiteSummaryToday> {
    const rnd = seededRandom(`${site.id}-summary-${todaySeed()}`)
    const issueCount = Math.floor(range(rnd, 1, 4))
    const issues: SiteIssue[] = Array.from({ length: issueCount }).map((_, i) => {
      const t = ISSUE_TEMPLATES[Math.floor(rnd() * ISSUE_TEMPLATES.length)]
      return { id: `issue-${site.id}-${i}`, text: t.text, severity: t.severity }
    })

    return {
      siteId: site.id,
      siteName: site.name,
      date: new Date().toISOString().slice(0, 10),
      workTypeCount: Math.floor(range(rnd, 6, 18)),
      workerCount: Math.floor(range(rnd, 40, 220)),
      equipmentCount: Math.floor(range(rnd, 5, 35)),
      riskWorkCount: Math.floor(range(rnd, 0, 6)),
      delayCount: Math.floor(range(rnd, 0, 4)),
      issues,
    }
  }
}
