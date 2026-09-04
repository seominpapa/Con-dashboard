/** 건설뉴스 도메인 모델 */

export type NewsCategory =
  | '건설정책'
  | 'SOC'
  | '건설안전'
  | '건설사'
  | '수주'
  | '부동산'
  | '스마트건설'
  | 'AI/AX'
  | '해외건설'

export interface NewsItem {
  id: string
  title: string
  source: string
  publishedAt: string
  category: NewsCategory
  url: string
  isNew: boolean
}
