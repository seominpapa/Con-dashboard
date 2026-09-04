import type { LawProvider } from './LawProvider'
import type { LawItem } from '../../../shared/types/law'
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
      }
    })
  }
}
