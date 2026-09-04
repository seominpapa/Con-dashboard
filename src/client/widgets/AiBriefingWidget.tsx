import { Sparkles } from 'lucide-react'
import { WidgetShell } from './WidgetShell'
import { useWidgetData } from '../hooks/useWidgetData'
import { Badge } from './badges'
import type { WidgetProps } from '../../shared/types/widget'
import type { AiBriefingResponse, BriefingPriorityLevel } from '../../shared/types/briefing'

const PRIORITY_TONE: Record<BriefingPriorityLevel, 'danger' | 'caution' | 'info'> = {
  high: 'danger',
  normal: 'caution',
  low: 'info',
}

function SourceTags({ sourceWidgets }: { sourceWidgets: string[] }) {
  if (!sourceWidgets || sourceWidgets.length === 0) return null
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1">
      {sourceWidgets.map((w) => (
        <span key={w} className="rounded bg-slate-100 px-1 text-[9px] text-slate-400">
          {w}
        </span>
      ))}
    </span>
  )
}

/**
 * AI 브리핑 위젯 (기획 38~51번).
 * - 사용자별 하루 1회 생성, 서버(BriefingService)가 캐싱/동시성 처리를 모두 담당한다.
 * - LLM 미설정/생성 실패 시에도 이 위젯만 격리되어 실패하고 나머지 대시보드는 영향받지 않는다
 *   (다른 위젯과 달리 error 상태에서도 WidgetShell 기본 에러 UI 대신 커스텀 안내 문구를 보여준다).
 */
export function AiBriefingWidget({}: WidgetProps) {
  const { data, loading, updatedAt, refresh } = useWidgetData<AiBriefingResponse>('/api/briefing/today', 0)

  const status = data?.status
  const structured = data?.structured

  return (
    <WidgetShell
      title="AI 브리핑"
      icon={<Sparkles size={16} />}
      loading={loading}
      error={null}
      stale={false}
      updatedAt={data?.generatedAt ?? updatedAt}
      onRefresh={refresh}
    >
      {!data ? (
        <p className="text-xs text-slate-400">데이터 없음</p>
      ) : status === 'generating' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-4 text-center text-slate-400">
          <Sparkles size={20} className="animate-pulse text-blue-400" />
          <p className="text-xs">오늘의 브리핑을 준비하고 있습니다...</p>
        </div>
      ) : status === 'unavailable' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-4 text-center text-slate-400">
          <p className="text-xs">AI 브리핑 기능이 아직 준비 중입니다.</p>
          <p className="text-[10px]">관리자가 AI 연동을 설정하면 자동으로 활성화됩니다.</p>
        </div>
      ) : status === 'error' ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-4 text-center text-slate-400">
          <p className="text-xs">오늘 AI 브리핑을 생성하지 못했습니다.</p>
          {data.message && <p className="text-[10px] text-slate-400">{data.message}</p>}
        </div>
      ) : structured ? (
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-700">{structured.summary}</p>

          {structured.priorityItems.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">⚠ 확인 필요</p>
              <ol className="space-y-1.5">
                {structured.priorityItems.map((p, idx) => (
                  <li key={idx} className="flex items-start gap-1.5 text-xs">
                    <span className="mt-0.5 text-[10px] text-slate-400">{idx + 1}.</span>
                    <Badge tone={PRIORITY_TONE[p.level]}>{p.title}</Badge>
                    <span className="min-w-0 text-slate-600">
                      {p.reason}
                      <SourceTags sourceWidgets={p.sourceWidgets} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {structured.scheduleItems.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">📅 일정</p>
              <ul className="space-y-1">
                {structured.scheduleItems.map((it, idx) => (
                  <li key={idx} className="text-xs text-slate-600">
                    {it.title} — {it.detail}
                    <SourceTags sourceWidgets={it.sourceWidgets} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {structured.riskItems.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">⚠ 리스크</p>
              <ul className="space-y-1">
                {structured.riskItems.map((it, idx) => (
                  <li key={idx} className="text-xs text-slate-600">
                    {it.title} — {it.detail}
                    <SourceTags sourceWidgets={it.sourceWidgets} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {structured.marketItems.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">📊 시장</p>
              <ul className="space-y-1">
                {structured.marketItems.map((it, idx) => (
                  <li key={idx} className="text-xs text-slate-600">
                    {it.title} — {it.detail}
                    <SourceTags sourceWidgets={it.sourceWidgets} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {structured.informationItems.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-semibold text-slate-500">ℹ 참고</p>
              <ul className="space-y-1">
                {structured.informationItems.map((it, idx) => (
                  <li key={idx} className="text-xs text-slate-600">
                    {it.title} — {it.detail}
                    <SourceTags sourceWidgets={it.sourceWidgets} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-slate-100 pt-1.5 text-[10px] text-slate-400">
            AI가 대시보드 데이터를 기반으로 요약한 참고 정보입니다. 안전 기준 판단은 규칙 엔진 결과를 따르며, 최종 의사결정은 반드시 현장 담당자가 확인하세요.
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-400">데이터 없음</p>
      )}
    </WidgetShell>
  )
}
