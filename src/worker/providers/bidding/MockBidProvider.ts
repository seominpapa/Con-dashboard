import type { BidProvider } from './BidProvider'
import type { BidNotice, BidFilter } from '../../../shared/types/bidding'
import { seededRandom, pick, range, todaySeed } from '../mockRandom'

const REGIONS = ['서울', '부산', '경남', '경기', '인천', '대구', '광주', '세종', '강원', '충남']
const WORK_TYPES = ['토목', '건축', '전기', '조경', '통신', '기계설비']
const ORGS = ['한국토지주택공사', '조달청', '서울시', '부산시', '한국도로공사', '한국수자원공사', '국가철도공단']

export class MockBidProvider implements BidProvider {
  readonly source = 'mock' as const

  async searchBids(filter: Partial<BidFilter>, limit = 5): Promise<BidNotice[]> {
    const rnd = seededRandom(`bids-${todaySeed()}-${JSON.stringify(filter)}`)
    const count = Math.max(limit, 5)
    const results: BidNotice[] = Array.from({ length: count }).map((_, i) => {
      const region = filter.regions?.length ? pick(rnd, filter.regions) : pick(rnd, REGIONS)
      const workType = filter.workTypes?.length ? pick(rnd, filter.workTypes) : pick(rnd, WORK_TYPES)
      const org = filter.organization || pick(rnd, ORGS)
      const amount = Math.round(range(rnd, filter.minAmount ?? 5, (filter.maxAmount ?? 300)) ) * 100_000_000
      const now = new Date()
      const announced = new Date(now.getTime() - range(rnd, 0, 5) * 86400000)
      const deadline = new Date(now.getTime() + range(rnd, 1, 20) * 86400000)
      return {
        id: `mock-bid-${todaySeed()}-${i}`,
        title: `${region} ${workType} 공사 (${i + 1}차)${filter.keyword ? ` - ${filter.keyword}` : ''}`,
        organization: org,
        estimatedAmount: amount,
        announcedDate: announced.toISOString(),
        deadlineDate: deadline.toISOString(),
        region,
        workType,
      }
    })
    return results.sort((a, b) => new Date(b.announcedDate).getTime() - new Date(a.announcedDate).getTime())
  }
}
