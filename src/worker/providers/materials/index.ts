import type { Bindings } from '../../env'
import type { MaterialPriceProvider } from './MaterialPriceProvider'
import { MockMaterialPriceProvider } from './MockMaterialPriceProvider'

/**
 * 자재가격은 자재별로 데이터 출처가 상이하여(기획 17번), 현재는 공식/상업적
 * 이용이 허용된 통합 API가 확보되지 않아 Mock Provider만 제공한다.
 * 향후 자재별 공식 출처(예: 대한건설협회 물가정보 등)가 확보되면
 * 이 Registry에 실제 Provider를 등록하기만 하면 된다.
 */
export function getMaterialPriceProvider(_env: Bindings): MaterialPriceProvider {
  return new MockMaterialPriceProvider()
}

export * from './MaterialPriceProvider'
