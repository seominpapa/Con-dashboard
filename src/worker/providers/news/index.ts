import type { Bindings } from '../../env'
import type { NewsProvider } from './NewsProvider'
import { RssNewsProvider } from './RssNewsProvider'
import { MockNewsProvider } from './MockNewsProvider'

export async function getNewsProvider(_env: Bindings): Promise<NewsProvider> {
  return new RssNewsProvider()
}

export function getMockNewsProvider(): NewsProvider {
  return new MockNewsProvider()
}

export * from './NewsProvider'
