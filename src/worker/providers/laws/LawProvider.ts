import type { LawItem } from '../../../shared/types/law'
import type { DataSource } from '../../../shared/types/common'

export interface LawProvider {
  readonly source: DataSource
  getLaws(lawNames: string[]): Promise<LawItem[]>
  searchLaws(query: string, limit?: number): Promise<LawItem[]>
}
