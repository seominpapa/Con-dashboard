/** 법령·제도 도메인 모델 */

export interface LawItem {
  id: string
  name: string
  lastAmendedDate: string
  effectiveDate: string
  changed: boolean
  url?: string
}

export const RECOMMENDED_LAWS = [
  '건설산업기본법',
  '건설기술진흥법',
  '산업안전보건법',
  '중대재해 처벌 등에 관한 법률',
  '국가를 당사자로 하는 계약에 관한 법률',
  '지방자치단체를 당사자로 하는 계약에 관한 법률',
] as const
