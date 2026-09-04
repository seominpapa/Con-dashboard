import type { NewsProvider } from './NewsProvider'
import type { NewsItem, NewsCategory } from '../../../shared/types/news'
import { seededRandom, pick, hourSeed } from '../mockRandom'

const SOURCES = ['국토교통부', '고용노동부', '조달청', '국토안전관리원', '한국건설기술연구원', '건설경제', '대한건설신문']

const HEADLINES: Record<NewsCategory, string[]> = {
  건설정책: ['건설산업 활력 제고 방안 발표', '건설업 등록기준 개선 추진', '공공공사 하도급 관리 강화'],
  SOC: ['국가 SOC 예산 편성안 공개', '지방 국도 확장사업 착공', '노후 인프라 안전점검 확대'],
  건설안전: ['중대재해 예방 가이드라인 개정', '건설현장 스마트 안전장비 보급 확대', '여름철 건설현장 온열질환 예방 대책'],
  건설사: ['대형 건설사 3분기 실적 발표', '건설사 해외 수주 잔고 현황 공개', '중견 건설사 ESG 경영 강화'],
  수주: ['이번주 대형 공공공사 입찰 결과', '해외 플랜트 수주 낭보', '민간 재건축 수주전 치열'],
  부동산: ['분양시장 동향 리포트 발표', '주택 공급 계획 발표', '재건축 규제 완화 검토'],
  스마트건설: ['BIM 의무화 로드맵 공개', '건설 자동화 장비 실증사업 선정', 'AI 기반 시공관리 플랫폼 도입 확대'],
  'AI/AX': ['건설업 AI 전환(AX) 지원사업 공고', '생성형 AI 활용 설계 자동화 사례', '스마트 현장관리 AI 솔루션 출시'],
  해외건설: ['중동 대형 프로젝트 수주 소식', '동남아 인프라 시장 진출 확대', '해외건설 금융지원 제도 개편'],
}

export class MockNewsProvider implements NewsProvider {
  readonly source = 'mock' as const

  async getNews(categories: NewsCategory[], limit = 10): Promise<NewsItem[]> {
    const cats = categories.length ? categories : (Object.keys(HEADLINES) as NewsCategory[])
    const rnd = seededRandom(`news-${hourSeed()}-${cats.join(',')}`)
    const items: NewsItem[] = []
    let idx = 0
    for (const cat of cats) {
      for (const headline of HEADLINES[cat]) {
        const hoursAgo = Math.floor(rnd() * 48)
        items.push({
          id: `mock-news-${cat}-${idx++}`,
          title: headline,
          source: pick(rnd, SOURCES),
          publishedAt: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
          category: cat,
          url: '#',
          isNew: hoursAgo < 6,
        })
      }
    }
    return items
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, limit)
  }
}
