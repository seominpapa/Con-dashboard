import { useEffect, useState } from 'react'
import { Gavel } from 'lucide-react'
import { api } from '../lib/api'
import type { BidNotice } from '../../shared/types/bidding'

export function BidsPage() {
  const [bids, setBids] = useState<BidNotice[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<string | null>(null)

  useEffect(() => {
    api.get<BidNotice[]>('/api/bids?limit=30').then((res) => {
      setBids(res.data ?? [])
      setSource(res.source)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <h1 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
        <Gavel size={20} /> 관심입찰 {source === 'mock' && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Mock</span>}
      </h1>
      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : bids.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 입찰 공고가 없습니다</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {bids.map((b) => (
            <li key={b.id} className="px-4 py-3">
              <a href={b.url ?? '#'} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-800 hover:text-blue-600 hover:underline">
                {b.title}
              </a>
              <p className="mt-0.5 text-xs text-slate-400">
                {b.organization} · {b.region} · {b.workType} · 마감 {new Date(b.deadlineDate).toLocaleDateString('ko-KR')} · 추정금액 {b.estimatedAmount.toLocaleString('ko-KR')}원
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
