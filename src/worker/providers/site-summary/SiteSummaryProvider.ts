import type { Site } from '../../../shared/types/site'
import type { SiteSummaryToday } from '../../../shared/types/site-summary'

export interface SiteSummaryProvider {
  getTodaySummary(site: Site): Promise<SiteSummaryToday>
}
