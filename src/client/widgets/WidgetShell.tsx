import { RefreshCw, GripVertical, EyeOff, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/cn'
import type { ReactNode } from 'react'

interface WidgetShellProps {
  title: string
  icon: ReactNode
  loading?: boolean
  error?: string | null
  stale?: boolean
  updatedAt?: string | null
  /** 자료 기준 시점: 고시일(YYYY-MM-DD) 또는 관측·발표 시각(ISO) */
  asOf?: string | null
  mockBadge?: boolean
  onRefresh?: () => void
  onHide?: () => void
  detailPath?: string
  dragHandleProps?: any
  children: ReactNode
}

function formatTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}

/** 날짜만 있으면 그대로, 시각이 있으면 'M/D HH:mm'으로 표시한다. */
export function formatAsOf(value?: string | null): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * 모든 Widget 공통 뼈대 (기획 22번: 로딩/성공/빈값/에러/stale 상태 표현,
 * 업데이트 시각, 새로고침, 숨기기, 전체보기). API 실패 시에도 Widget 자체가
 * 사라지지 않고 이 Shell 안에서 마지막 정상 데이터 + stale 표시를 유지한다.
 */
export function WidgetShell({ title, icon, loading, error, stale, updatedAt, asOf, mockBadge, onRefresh, onHide, detailPath, dragHandleProps, children }: WidgetShellProps) {
  return (
    <div className="widget-card flex h-full flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button {...dragHandleProps} className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing" aria-label="위젯 이동">
            <GripVertical size={14} />
          </button>
          <span className="text-slate-500">{icon}</span>
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          {mockBadge && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Mock</span>}
          {stale && !error && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">이전 데이터</span>}
        </div>
        <div className="flex items-center gap-1 text-slate-400">
          {asOf && !loading && !error && <span className="text-[11px] tabular-nums" title="자료 기준 시점">기준 {formatAsOf(asOf)}</span>}
          {updatedAt && !loading && <span className="text-[11px] tabular-nums">{formatTime(updatedAt)}</span>}
          {onRefresh && (
            <button onClick={onRefresh} className="rounded p-1 hover:bg-slate-100 hover:text-slate-600" aria-label="새로고침">
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </button>
          )}
          {onHide && (
            <button onClick={onHide} className="rounded p-1 hover:bg-slate-100 hover:text-slate-600" aria-label="위젯 숨기기">
              <EyeOff size={13} />
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-auto p-3 text-sm text-slate-700">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-slate-400">
            <AlertTriangle size={20} className="text-amber-500" />
            <p className="text-xs">{error}</p>
          </div>
        ) : (
          children
        )}
      </div>
      {detailPath && (
        <a href={detailPath} className="border-t border-slate-100 px-3 py-1.5 text-center text-xs font-medium text-blue-600 hover:bg-slate-50">
          전체보기
        </a>
      )}
    </div>
  )
}
