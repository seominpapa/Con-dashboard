import { cn } from '../lib/cn'

type Tone = 'normal' | 'caution' | 'danger' | 'new' | 'closing-soon' | 'delayed' | 'info'

const TONE_CLASS: Record<Tone, string> = {
  normal: 'bg-emerald-50 text-emerald-700',
  caution: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  new: 'bg-blue-50 text-blue-700',
  'closing-soon': 'bg-orange-50 text-orange-700',
  delayed: 'bg-red-50 text-red-700',
  info: 'bg-slate-100 text-slate-600',
}

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium', TONE_CLASS[tone])}>{children}</span>
}
