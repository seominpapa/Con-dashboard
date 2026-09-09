import { Newspaper } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { NewsItem } from '../../shared/types/news'

export function ConstructionNewsWidget({}: WidgetProps) {
  const { data, loading, error, stale, isMock, updatedAt, refresh } = useWidgetData<NewsItem[]>('/api/news?limit=6', 20 * 60 * 1000)

  return (
    <WidgetShell title="건설뉴스" icon={<Newspaper size={16} />} loading={loading} error={error} stale={stale} mockBadge={isMock} updatedAt={updatedAt} onRefresh={refresh}>
      {data && data.length > 0 ? (
        <ul className="space-y-2">
          {data.map((n) => (
            <li key={n.id}>
              <a href={n.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 hover:underline">
                {n.isNew && <Badge tone="new">신규</Badge>}
                <span className="min-w-0 truncate text-xs text-slate-700">{n.title}</span>
              </a>
              <p className="text-[10px] text-slate-400">{n.source} · {n.category}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="text-xs text-slate-400">{loading ? '건설뉴스를 불러오는 중입니다…' : '뉴스가 없습니다'}</p>
      )}
      <a href="https://news.google.com/?hl=ko&gl=KR&ceid=KR:ko" target="_blank" rel="noreferrer" className="mt-2 block text-[10px] text-slate-400 hover:text-blue-600 hover:underline">
        뉴스 데이터: Google 뉴스 RSS
      </a>
    </WidgetShell>
  )
}
