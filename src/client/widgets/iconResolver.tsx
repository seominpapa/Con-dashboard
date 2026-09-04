import * as LucideIcons from 'lucide-react'
import { HelpCircle } from 'lucide-react'
import type { ComponentType } from 'react'

/**
 * WidgetDefinition.icon 은 lucide-react 아이콘 이름을 문자열로 갖는다
 * (Widget Registry가 컴포넌트를 직접 import하지 않고도 위젯 목록/설정 UI에서
 * 아이콘을 그릴 수 있게 하기 위함). 실제 Widget 내부 렌더링은 각 컴포넌트가
 * 아이콘을 직접 import해서 사용하고, 이 resolver는 WidgetPicker 등
 * Registry 메타데이터만으로 아이콘을 그려야 하는 곳에서 사용한다.
 */
export function resolveIcon(name: string): ComponentType<{ size?: number; className?: string }> {
  const icons = LucideIcons as unknown as Record<string, ComponentType<{ size?: number; className?: string }>>
  return icons[name] ?? HelpCircle
}
