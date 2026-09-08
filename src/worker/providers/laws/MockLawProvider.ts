import type { LawProvider } from './LawProvider'
import type { LawItem } from '../../../shared/types/law'
import { LAW_SEARCH_MAX_RESULTS, RECOMMENDED_LAWS } from '../../../shared/types/law.ts'
import { seededRandom, todaySeed } from '../mockRandom'

export class MockLawProvider implements LawProvider {
  readonly source = 'mock' as const

  async getLaws(lawNames: string[]): Promise<LawItem[]> {
    return lawNames.map((name, idx) => {
      const rnd = seededRandom(`${name}-${todaySeed()}`)
      const changed = rnd() > 0.7
      const daysAgo = Math.floor(rnd() * 200)
      const lastAmended = new Date(Date.now() - daysAgo * 86400000)
      const effective = new Date(lastAmended.getTime() + 30 * 86400000)
      return {
        id: `mock-law-${idx}`,
        name,
        lastAmendedDate: lastAmended.toISOString().slice(0, 10),
        effectiveDate: effective.toISOString().slice(0, 10),
        changed,
        url: `https://www.law.go.kr/법령/${encodeURIComponent(name)}`,
      }
    })
  }

  async searchLaws(query: string, limit = 10): Promise<LawItem[]> {
    const names = RECOMMENDED_LAWS.filter((name) => name.includes(query.trim()))
    return this.getLaws(names.slice(0, Math.min(LAW_SEARCH_MAX_RESULTS, Math.max(1, limit))))
  }
}
