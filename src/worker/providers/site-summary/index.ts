import type { Bindings } from '../../env'
import type { SiteSummaryProvider } from './SiteSummaryProvider'
import { MockSiteSummaryProvider } from './MockSiteSummaryProvider'

export function getSiteSummaryProvider(_env: Bindings): SiteSummaryProvider {
  // 향후 작업일보 시스템(DB) 연동 시 이 함수만 교체
  return new MockSiteSummaryProvider()
}

export * from './SiteSummaryProvider'
