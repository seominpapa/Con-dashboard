import { useEffect, useState } from 'react'
import { Newspaper } from 'lucide-react'
import { api } from '../lib/api'
import type { NewsItem } from '../../shared/types/news'

export function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    api.get<NewsItem[]>('/api/news?limit=30').then((res) => {
      setNews(res.data ?? [])
      setSource(res.source)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
        <Newspaper size={20} /> 건설뉴스 {source === 'mock' && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Mock</span>}
      </h1>
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : news.length === 0 ? (
        <p className="text-sm text-slate-400">뉴스가 없습니다</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {news.map((n) => (
            <li key={n.id} className="px-4 py-3">
              <a href={n.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-800 hover:text-blue-600 hover:underline">
                {n.title}
              </a>
              <p className="mt-0.5 text-xs text-slate-400">
                {n.source} · {n.category} · {new Date(n.publishedAt).toLocaleDateString('ko-KR')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
