import type { NewsItem, NewsCategory } from '../../../shared/types/news'
import type { DataSource } from '../../../shared/types/common'

export interface NewsProvider {
  readonly source: DataSource
  getNews(categories: NewsCategory[], limit?: number): Promise<NewsItem[]>
}
