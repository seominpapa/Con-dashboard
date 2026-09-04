import { useEffect, useState } from 'react'

/** md(768px) 미만을 모바일로 간주한다 (기획: 모바일 1열, 태블릿 2열, PC 2~4열) */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < breakpoint : false))

  useEffect(() => {
    function onResize() {
      setIsMobile(window.innerWidth < breakpoint)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [breakpoint])

  return isMobile
}

/** 현재 뷰포트에서 사용할 grid 컬럼 수 (모바일 1 / 태블릿 2 / PC 3) */
export function useGridColumns(): number {
  const [columns, setColumns] = useState(() => computeColumns(typeof window !== 'undefined' ? window.innerWidth : 1280))

  useEffect(() => {
    function onResize() {
      setColumns(computeColumns(window.innerWidth))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return columns
}

function computeColumns(width: number): number {
  if (width < 768) return 1
  if (width < 1280) return 2
  return 3
}
