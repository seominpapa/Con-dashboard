# 건설 Dashboard

건설업 종사자를 위한 **반응형 위젯 대시보드**. 날씨/대기질/입찰/뉴스/환율/유가/자재가격 등
현장 업무에 필요한 정보를 개인화된 위젯으로 한 곳에서 확인하고, 관리자가 중앙에서 승인/외부
API 연동을 관리하는 구조로 설계되었습니다.

## 프로젝트 개요
- **목표**: 바쁜 건설 현장 관리자/실무자가 일정, 할일, 날씨/재난특보, 입찰, 시세 등을 한 화면에서
  드래그&드롭으로 배치해 보는 개인화 대시보드 제공. 사용자는 절대 API Key를 직접 다루지 않음.
- **핵심 원칙**
  1. 사용자는 API Key를 절대 입력/관리하지 않는다.
  2. 관리자가 `/admin/integrations`, `/admin/integrations/ai` 에서 모든 외부 연동을 중앙 관리한다.
  3. 신규 가입자는 관리자 승인 전까지 대시보드에 접근할 수 없다 (서버 미들웨어에서 강제 차단).
  4. AI 브리핑의 범위는 사용자가 설정한 대시보드 위젯 구성에서 자동으로 결정된다.
  5. AI 브리핑은 1일 1회, 최초 로그인 시점(Asia/Seoul 기준)에만 생성된다.

## URLs
- **로컬 프리뷰**: http://localhost:3000 (PM2 + `wrangler pages dev`)
- **운영 배포**: (Cloudflare Pages 배포 후 갱신 예정)
- **GitHub**: (연동 시 갱신 예정)

## 완료된 기능

### 인증 / 권한
- Google OAuth 전용 로그인 (`/api/auth/google` → 콜백 → 세션 쿠키)
- 사용자 상태: `PENDING`(승인대기) / `APPROVED`(승인됨) / `REJECTED`(거절) / `SUSPENDED`(정지)
- 역할: `ADMIN` / `USER`
- `PENDING`/`REJECTED`/`SUSPENDED` 사용자는 서버 미들웨어(`requireApproved`)에서 API 자체를
  차단하며, 클라이언트도 승인대기 전용 화면만 노출 (우회 불가)
- `INITIAL_ADMIN_EMAIL` + `DISABLE_ADMIN_BOOTSTRAP` 로 최초 관리자 부트스트랩 (기존 ADMIN
  존재 시 자동 비활성화되는 이중 안전장치)

### 대시보드 (개인화 위젯 시스템)
- PC 2~4열 / 태블릿 2열 / 모바일 1열 반응형 그리드
- `@dnd-kit` 기반 드래그&드롭 순서 변경, 위젯별 데스크톱/모바일 순서 별도 저장
- 위젯 추가/제거(숨기기)/리사이즈(컬럼 스팬 순환)
- 위젯 상태 머신: `loading` / `success` / `empty` / `error` / `stale` — API 장애 시에도
  위젯이 사라지지 않고 "마지막 정상 데이터 + 시각"을 보여줌
- 위젯 레지스트리(`src/client/widgets/registry.ts`) 기반 — 신규 위젯 추가 시 레지스트리에만
  등록하면 Picker/Grid/아이콘 렌더링에 자동 반영

### 위젯 14종 (업무 2 / 현장환경 4 / 수주정보 3 / 경제원가 4, +AI 브리핑)
| 위젯 | 데이터 소스 | 비고 |
|---|---|---|
| AI 브리핑 | 대시보드 구성 기반 LLM 요약 | 1일 1회, DB UNIQUE(userId,date) |
| 일정관리 | `/api/schedules` | 7일 창, CRUD |
| 할일관리 | `/api/todos` | CRUD, 인라인 완료 처리 |
| 건설날씨 | 기상청(KMA) / Mock | 건설현장 리스크 룰엔진 + 면책문구 |
| 기상·재난특보 | 기상청(KMA) / Mock | |
| 대기질 | 에어코리아(AirKorea) / Mock | |
| 오늘의 현장 | 현장요약 Provider / Mock | |
| 관심입찰 | 나라장터(G2B) / Mock | |
| 건설뉴스 | 네이버 뉴스 / Mock | |
| 법령·제도 | 법제처 / Mock | 개정 여부 뱃지 |
| 환율 | 한국은행(ECOS) / Mock | |
| 유가 | 오피넷(Opinet) / Mock | |
| 주요자재가격 | **Mock 전용** | 상업 API 미확보, 명시적 면책문구 |
| 건설시장 종합 | 환율+유가+자재가격 클라이언트 조합 | |

### 다중 현장(Site) 관리
- `/sites` 페이지에서 현장 CRUD (이름/회사/주소/위경도/기간/상태)
- 위경도 → 기상청 격자(nx,ny) 자동 변환 (`src/shared/utils/kmaGrid.ts`)
- Header 상단 현장 선택 드롭다운으로 활성 현장 전환

### 관리자 패널 (`/admin`, ADMIN 전용)
- 사용자 관리: 승인/거절/정지/재승인, 역할 변경 (최후 1인 ADMIN 강제 유지)
- API 연결 센터: 공공데이터 7종 Provider 연결/테스트/해제, Credential은 AES-GCM 암호화 후 DB
  저장, 클라이언트로 절대 반환/로그 출력되지 않음
- LLM Provider 관리: Claude / Codex(OpenAI) 공식 API Key 연결, 기본 Provider 지정 (전체
  승인 사용자가 공유)

### AI 브리핑
- 사용자 대시보드에 배치된 위젯을 기준으로 컨텍스트 자동 산정 (사용자가 직접 범위 설정 불가)
- 최초 로그인 시 1회 생성, 같은 날 재방문 시 캐시된 결과 재사용
- 구조화 출력: `summary`, `priorityItems`, `scheduleItems`, `riskItems`, `marketItems`,
  `informationItems` — 각 항목에 `sourceWidgets[]`로 근거 위젯 추적
- **안전 원칙**: 위험도/우선순위 판단은 룰엔진이 수행하고, LLM은 설명/종합만 담당
- LLM 실패 시에도 대시보드 전체는 정상 동작 (해당 위젯만 안내 문구로 격하)

## 데이터 아키텍처
- **저장소**: Cloudflare D1 (SQLite) — 사용자, 세션, 현장, 일정, 할일, 대시보드 설정, 연동
  Credential(암호화), AI 브리핑 캐시 등
- **로컬 대시보드 설정**: `localStorage` 우선 캐시 후 서버(`/api/dashboard`)와 동기화하는
  `DashboardRepository` 추상화 — 추후 DB 단독 구조로 교체 가능하도록 인터페이스 분리
- **API 응답 정규화**: 모든 외부 데이터 API는 `ApiEnvelope<T>` 형태
  (`status`/`data`/`source: live|mock|unconfigured`/`updatedAt`/`cached`)로 통일
- **Provider 계층**: 관리자 DB 연결 → 환경변수(ENV) 폴백 → Mock Provider 순으로 자동 결정.
  키가 하나도 없어도 서비스 전체가 Mock 데이터로 정상 동작 (Graceful Degradation)
- **캐싱**: 도메인별 TTL 캐시 (`src/worker/cache/memoryCache.ts`)

## 사용 가이드
1. Google 계정으로 로그인
2. 최초 로그인 시 "승인 대기" 화면이 노출됨 (관리자 승인 전까지 대시보드 접근 불가)
3. 관리자가 `/admin` → 사용자 관리에서 승인
4. 승인 후 대시보드에서 위젯 추가(➕)/드래그로 순서 변경/카드 우측 상단 버튼으로 리사이즈·숨기기
5. 상단 헤더에서 현장 선택, `/sites`에서 현장 등록/수정
6. (ADMIN) `/admin/integrations`, `/admin/integrations/ai`에서 외부 API·LLM 연동 관리

## 배포 상태
- **플랫폼**: Cloudflare Pages (Hono Worker + React SPA 듀얼 빌드)
- **상태**: ✅ 로컬 샌드박스에서 정상 기동 확인 (PM2 + `wrangler pages dev --local`)
  - `npm run build:client`, `npm run build:worker` 모두 성공
  - `tsc --noEmit` 타입체크 통과 (에러 0건)
  - D1 로컬 마이그레이션 적용 완료
  - 운영 Cloudflare 배포는 아직 미실행 (D1 `database_id`가 placeholder 상태)
- **기술 스택**: Hono 4 + TypeScript + React 19 + react-router-dom v7 + @dnd-kit +
  Tailwind CSS v4 + Cloudflare D1
- **최종 업데이트**: 2026-09-04

## 아직 구현되지 않은 기능 / 알려진 제약
- 운영 Cloudflare 계정으로의 실제 배포 (D1 production database 미생성)
- 클라이언트 JS 번들 코드 스플리팅 (현재 단일 청크 ~1MB, 경고 수준이며 기능상 문제 없음)
- 실제 Google OAuth 자격증명 / 공공데이터 API Key 미설정 상태이므로 모든 위젯이 Mock
  데이터로 동작 중 (설계상 의도된 동작)
- E2E 브라우저 테스트 (로그인→승인→대시보드 전체 플로우의 실제 사용자 시나리오 테스트)

## 다음 단계 권장
1. Google OAuth Client ID/Secret 발급 및 `.dev.vars`/Secret 등록
2. Cloudflare D1 production 데이터베이스 생성 후 `wrangler.jsonc`의 `database_id` 교체
3. 운영 배포 (`npm run deploy` 또는 Hosted Deploy) 및 커스텀 도메인 연결
4. 관리자 계정으로 공공데이터/LLM Provider 실 연동 테스트
5. 필요 시 JS 번들 code-splitting 적용

## 로컬 개발
```bash
npm install
npm run build            # client + worker 빌드
npm run db:migrate:local # D1 로컬 마이그레이션 적용
pm2 start ecosystem.config.cjs
curl http://localhost:3000
```

환경변수는 `.env.example`을 참고해 `.dev.vars`로 복사 후 채워주세요 (모두 선택사항이며,
비워두면 Mock 데이터로 정상 동작합니다).

