import type { Bindings } from '../../env'
import type { OilPriceProvider } from './OilPriceProvider'
import type { OilPriceItem, OilKind } from '../../../shared/types/market'
import { OpinetOilPriceProvider } from './OpinetOilPriceProvider'
import { MockOilPriceProvider } from './MockOilPriceProvider'

/**
 * 국내 유가(Opinet, 실데이터 가능) + 국제유가(Dubai/WTI/Brent, 현재는 공식 무료
 * API 부재로 Mock 유지)를 조합하는 Provider.
 * 향후 국제유가 공식 소스가 확보되면 이 조합기만 교체하면 된다.
 */
class CompositeOilPriceProvider implements OilPriceProvider {
  readonly source = 'live' as const
  constructor(private opinet: OpinetOilPriceProvider, private mock: MockOilPriceProvider) {}

  async getPrices(kinds: OilKind[]): Promise<OilPriceItem[]> {
    const domestic = kinds.filter((k) => k === 'domestic-diesel' || k === 'domestic-gasoline')
    const international = kinds.filter((k) => k !== 'domestic-diesel' && k !== 'domestic-gasoline')

    const [domesticResult, intlResult] = await Promise.allSettled([
      domestic.length ? this.opinet.getPrices(domestic) : Promise.resolve([]),
      international.length ? this.mock.getPrices(international) : Promise.resolve([]),
    ])

    const items: OilPriceItem[] = [
      ...(domesticResult.status === 'fulfilled' ? domesticResult.value : []),
      ...(intlResult.status === 'fulfilled' ? intlResult.value : []),
    ]
    if (items.length === 0) throw new Error('유가 조회 실패')
    return items
  }
}

export function getOilPriceProvider(env: Bindings): OilPriceProvider {
  if (env.OPINET_API_KEY) {
    return new CompositeOilPriceProvider(new OpinetOilPriceProvider(env.OPINET_API_KEY), new MockOilPriceProvider())
  }
  return new MockOilPriceProvider()
}

export * from './OilPriceProvider'
