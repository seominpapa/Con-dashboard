import type { Bindings } from '../../env'
import type { LawProvider } from './LawProvider'
import { NlicLawProvider } from './NlicLawProvider'
import { MockLawProvider } from './MockLawProvider'

export function getLawProvider(env: Bindings): LawProvider {
  if (env.LAW_API_KEY) {
    return new NlicLawProvider(env.LAW_API_KEY)
  }
  return new MockLawProvider()
}

export * from './LawProvider'
