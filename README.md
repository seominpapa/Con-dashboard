# 건설 Dashboard

건설업 종사자를 위한 **반응형 위젯 대시보드**. 날씨/대기질/입찰/뉴스/환율/자재가격 등
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

### 위젯 13종
| 위젯 | 데이터 소스 | 비고 |
|---|---|---|
| AI 브리핑 | 대시보드 구성 기반 LLM 요약 | 1일 1회, DB UNIQUE(userId,date) |
| 일정관리 | `/api/schedules` | 7일 창, CRUD |
| 할일관리 | `/api/todos` | CRUD, 인라인 완료 처리 |
| 건설날씨 | 기상청(KMA) / Mock | 건설현장 리스크 룰엔진 + 면책문구 |
| 기상·재난특보 | 기상청(KMA) / Mock | 단기예보와 별도로 기상특보 조회서비스 활용승인 필요 |
| 대기질 | 에어코리아(AirKorea) / Mock | |
| 관심입찰 | 나라장터(G2B) / Mock | |
| 건설뉴스 | 네이버 뉴스 / Mock | |
| 법령·제도 | 법제처 / Mock | 개정 여부 뱃지 |
| 환율 | 한국은행(ECOS) / Mock | |
| 주요자재가격 | 조달청 가격정보현황 / Mock | 가격정보 서비스 별도 활용승인 필요 |
| 건설시장 종합 | 환율+자재가격 클라이언트 조합 | |

### 다중 현장(Site) 관리
- `/sites` 페이지에서 현장 CRUD (이름/회사/주소/기간/상태, NAVER Cloud Maps로 주소 자동 검색·좌표 변환)
- 위경도 → 기상청 격자(nx,ny) 자동 변환 (`src/shared/utils/kmaGrid.ts`)
- Header 상단 현장 선택 드롭다운으로 활성 현장 전환

### 관리자 패널 (`/admin`, ADMIN 전용)
- 사용자 관리: 승인/거절/정지/재승인, 역할 변경 (최후 1인 ADMIN 강제 유지)
- API 연결 센터: 공공데이터 8종 Provider 연결/테스트/해제, Credential은 AES-GCM 암호화 후 DB
  저장, 클라이언트로 절대 반환/로그 출력되지 않음
  - 국가법령정보는 일반 API Key 대신 공동활용 신청에서 발급된 `OC` 값을 입력 (`LAW_OC`, 기존 `LAW_API_KEY`도 폴백 지원)
- LLM Provider 관리: Claude / Codex(OpenAI) 공식 API Key 연결, OpenAI 모델 선택, 기본 Provider 지정
  (전체 승인 사용자가 공유)

### AI 브리핑
- 사용자 대시보드에 배치된 위젯을 기준으로 컨텍스트 자동 산정 (사용자가 직접 범위 설정 불가)
- 최초 로그인 시 1회 생성, 같은 날 재방문 시 캐시된 결과 재사용
- 구조화 출력: `summary`, `priorityItems`, `scheduleItems`, `riskItems`, `marketItems`,
  `informationItems` — 각 항목에 `sourceWidgets[]`로 근거 위젯 추적
- **안전 원칙**: 위험도/우선순위 판단은 룰엔진이 수행하고, LLM은 설명/종합만 담당
- LLM 실패 시에도 대시보드 전체는 정상 동작 (해당 위젯만 안내 문구로 격하)

### LLM 인증 방식 (API Key 전용)
- 이 배포는 서버에서 OpenAI/Anthropic REST API를 직접 호출하며, 관리자가 등록한 공식 API Key만
  사용한다.
- **OpenAI API Key 발급**: https://platform.openai.com/api-keys
- **Anthropic API Key 발급**: https://platform.claude.com/settings/keys
- ChatGPT/Codex 구독 OAuth는 별도 `Codex App Server` 프로세스와 OAuth 토큰 영구 저장소가
  필요하다. 현재 Cloudflare Pages/Worker 배포에는 해당 서버가 없으므로 지원하지 않는다. 도입하려면
  Cloudflare Container 또는 별도 VM을 추가하고 배포·보안 구조를 분리해야 한다.
- Claude Pro/Max OAuth를 제3자 웹앱 사용자의 요청에 중계하는 방식은 Anthropic 정책상 허용되지
  않으므로 Anthropic API Key를 사용한다:
  https://code.claude.com/docs/en/legal-and-compliance
- Google OAuth는 웹앱 사용자 로그인 전용이며 LLM Provider 인증과는 무관하다.

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

환경변수는 `.env.example`을 참고해 `.dev.vars`로 복사 후 채워주세요. Google OAuth와
`AUTH_SECRET`은 로그인에 필수이며, 공개데이터/LLM 키는 비워두면 Mock 또는 준비 중 상태로 동작합니다.

## Cloudflare 외 환경 배포 (Node.js / Docker)

기존 Cloudflare 배포 명령(`npm run build`, `npm run deploy`)에 더해, 같은 앱을
**Node.js 24 이상 + 로컬 SQLite**로 실행할 수 있습니다. Cloudflare 계정이나 D1은 필요하지
않으며 Docker, VM, 영구 디스크를 제공하는 컨테이너 클라우드에서 사용할 수 있습니다.

### 공통 설정

```bash
git clone https://github.com/seominpapa/Con-dashboard.git
cd Con-dashboard
cp .env.example .env
```

`.env`에서 아래 값을 채웁니다. 비밀값은 Git에 올리거나 Docker 이미지에 넣지 마세요.

| 변수 | 설정 |
|---|---|
| `AUTH_SECRET` | 32자 이상 임의 비밀키. `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`로 생성 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console에서 발급한 웹 애플리케이션 OAuth 자격증명 |
| `APP_BASE_URL` | 로컬은 `http://localhost:3000`, 외부 배포는 실제 접속할 HTTPS origin(예: `https://dashboard.example.com`) |
| `INITIAL_ADMIN_EMAIL` | 최초 관리자 권한을 받을 Google 계정 이메일 |

Google OAuth의 **승인된 리디렉션 URI**에 `${APP_BASE_URL}/api/auth/google/callback`을
실제 주소로 등록합니다. 로컬 예시는 `http://localhost:3000/api/auth/google/callback`이며,
외부 주소로 배포하면 Google 설정과 `APP_BASE_URL`을 함께 변경해야 합니다.
`APP_BASE_URL`에는 경로나 쿼리 없이 origin만 사용합니다. HTTP는 localhost/127.0.0.1/[::1]
로컬 접속에만 허용하며, 원격 배포에는 HTTPS가 필요합니다.

Google OAuth는 로그인에 필수입니다. 공개데이터·지도·LLM 키는 선택 사항이며, 없으면 해당
기능에 Mock 데이터 또는 설정 안내가 표시됩니다. 최초 관리자 로그인 후
`DISABLE_ADMIN_BOOTSTRAP=true`로 설정하고 재시작할 수 있습니다.

### Docker Compose로 실행

Docker Engine과 Compose 플러그인이 설치된 환경에서, 공통 설정을 마친 뒤 실행합니다.

```bash
docker compose up -d --build
docker compose logs -f dashboard
```

`http://localhost:3000`에 접속합니다. `http://localhost:3000/healthz`로 서버와 DB 상태를
확인할 수 있습니다. 이 경로에서는 Docker 이미지를 빌드하며, 호스트에 Node.js를 설치할
필요는 없습니다. 이미지에는 빌드 결과·마이그레이션·운영 의존성만 포함되고 root가 아닌
`node` 사용자로 실행됩니다. `.env`는 실행 시 전달됩니다.

Compose는 호스트의 `127.0.0.1:3000`에만 포트를 열고, DB를 `dashboard-data` 이름의
영구 볼륨(`/data/dashboard.sqlite`)에 보관합니다. `.env`의 Node 전용 경로/포트 설정과
관계없이 컨테이너 내부는 `HOST=0.0.0.0`, `PORT=3000`, `DATABASE_PATH=/data/dashboard.sqlite`를
사용합니다. 호스트 포트를 바꾸려면 `compose.yaml`의 `ports` 왼쪽 포트를 바꿉니다.

```bash
docker compose down          # 컨테이너 종료, DB 볼륨 유지
docker compose up -d --build  # 코드 업데이트 후 재빌드·재시작
```

`docker compose down -v`는 DB 볼륨까지 삭제하므로 데이터가 필요하면 사용하지 마세요.
외부 공개 시 HTTPS 리버스 프록시/로드밸런서를 앞에 두고 `APP_BASE_URL`을 공개 주소로
설정합니다. 다른 머신이나 컨테이너의 프록시가 접근해야 한다면 네트워크 구성에 맞게
포트 바인딩을 변경하고 방화벽으로 접근을 제한합니다.

### Docker 없이 Node.js로 실행

Node.js 24 이상과 npm을 설치하고, 공통 설정 후 저장소 루트에서 실행합니다.

```bash
npm ci
npm run build:node
npm start
```

`npm start`는 `.env`가 있으면 읽고, 기본 `0.0.0.0:3000`에서 실행합니다.
로컬 머신에서만 접근하려면 `.env`의 `HOST=127.0.0.1`로 제한합니다.
`DATABASE_PATH` 기본값은 `./data/dashboard.sqlite`이며 부모 디렉터리가 자동 생성됩니다.
Docker 이미지 빌드는 필요하지 않습니다. 운영에서는 서비스 관리자나 플랫폼의 재시작 정책으로
프로세스를 관리하고 HTTPS 프록시를 연결합니다.

### 다른 클라우드에서 운영

| 항목 | 설정 |
|---|---|
| 컨테이너 | 저장소의 `Dockerfile`로 빌드. 플랫폼이 지정하는 `PORT`와 `HOST=0.0.0.0` 사용 |
| Node 직접 실행 | 빌드 `npm ci && npm run build:node`, 시작 `npm start` |
| 저장소 | 쓰기 가능한 영구 디스크를 마운트하고 `DATABASE_PATH`를 그 디스크의 파일 경로로 지정 |
| 인스턴스 | SQLite 파일을 사용하는 **단일 인스턴스/복제본 1개**로 운영 |
| 도메인/인증 | HTTPS, 실제 `APP_BASE_URL`, 일치하는 Google OAuth 리디렉션 URI 설정 |
| 상태 확인 | `GET /healthz` |

임시 파일시스템만 제공하는 서버리스 환경이나 여러 복제본으로의 자동 확장은 이 SQLite
배포 방식에 맞지 않습니다. `/data`를 마운트하는 클라우드는 `node` 사용자(UID 1000)가 쓸 수
있게 권한도 설정해야 합니다.

첫 실행 시 `migrations/*.sql`을 순서대로 적용해 새 DB를 만들고, 이후에는 미적용
마이그레이션만 적용합니다. 기존 Cloudflare D1의 운영 데이터는 자동으로 복사되지 않습니다.
플랫폼 이동이나 코드/스키마 업데이트 전에는 DB를 백업하세요. 파일 복사로 백업하려면 앱을
먼저 종료하고 DB 디렉터리 전체를 보관합니다. `AUTH_SECRET`도 DB와 함께 안전하게 백업해야
저장된 연동 자격증명을 복호화할 수 있습니다. 비밀키를 잃거나 변경하면 관리자 화면에서
자격증명을 다시 등록해야 합니다.

## 라이선스

이 프로젝트의 코드는 [MIT License](LICENSE)를 따릅니다. 외부 의존성과 데이터는 각 제공자의
라이선스 및 이용 조건을 따릅니다.
