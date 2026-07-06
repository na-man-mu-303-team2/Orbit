# Audience Chrome Test Progress

## 목표

- 발표자 화면과 청중 화면 중심으로 청중 관련 기능을 Chrome에서 검증한다.
- 접속, 발표자 화면과 청중 화면의 표시 일치, 실시간 통신, 라이브 참여, 종료 후 투표/설문 흐름을 확인한다.
- 첨부된 `test-engineer.md`의 방식에 따라 동작 이해, 적절한 테스트 레벨 선택, 증거 중심 기록을 유지한다.

## 진행 원칙

- 브라우저에서 관찰한 DOM, 콘솔, 네트워크 응답은 검증 자료로만 취급한다.
- API 키, 토큰, cookie, password, secret, raw audio, transcript 원문, 발표자 script 값은 기록하지 않는다.
- 자동 테스트로 이미 증명되는 영역과 Chrome에서 직접 확인한 영역을 구분한다.

## 체크리스트

- [x] 첨부 테스트 스킬 읽기
- [x] 기존 청중 기능 문서와 E2E 범위 확인
- [x] 로컬 앱 실행
- [x] 발표자 제어 화면 접속 확인
- [x] 청중 입장 화면 접속 확인
- [x] 청중 라이브 입장 및 현재 슬라이드 표시 확인
- [x] 발표자 화면의 슬라이드 상태와 청중 화면의 슬라이드 상태 일치 확인
- [x] 발표자-청중 실시간 이벤트 통신 확인
- [x] Q&A 제출 및 발표자 대기/응답 흐름 확인
- [x] live poll 참여와 응답 저장 흐름 확인
- [x] quiz 참여와 종료 후 결과 공개 흐름 확인
- [x] reaction 전송과 발표자 화면 반영 확인
- [x] 세션 종료 후 설문 제출 흐름 확인
- [x] 청중 화면에 presenter-only/private 필드가 노출되지 않는지 확인
- [x] 관련 자동 테스트 실행

## 진행 기록

### 2026-07-06

- `test-engineer.md`를 읽고, QA 접근 원칙을 이번 검증 기준으로 채택했다.
- `docs/testing/audience-engagement-m11.md`를 확인해 기존 자동 테스트 범위와 수동/환경 의존 체크 범위를 파악했다.
- `tests/e2e/audience-engagement.spec.ts`, `tests/e2e/audience-features.spec.ts`를 확인해 현재 Playwright smoke가 join, Q&A, poll, quiz, reaction, post-session survey, presenter results를 목킹 기반으로 검증하고 있음을 확인했다.
- `pnpm --filter @orbit/web dev`를 일반 샌드박스에서 실행했으나 `listen EPERM: operation not permitted 0.0.0.0:5173`으로 실패했다.
- 권한 상승 후 웹 dev 서버가 실행됐다. `5173`은 사용 중이라 Vite가 `http://localhost:5174/`로 자동 전환했다.
- `docker compose ps`로 전체 로컬 스택이 이미 실행 중임을 확인했다. `api`는 `3000`, Docker `web`은 `5173`에서 실행 중이고 API가 healthy 상태다.
- `http://localhost:5174/join/123456`은 웹 단독 서버에서는 로드되지만 실제 세션 조회 API가 연결되지 않아 입장 코드 확인 상태에서 멈춘다.
- `5174` 종료 시 Vite proxy가 `/api/v1/presentation-sessions/join/123456`, `/api/v1/auth/me` 요청을 `api-staging.example.com`으로 보내려다 DNS 실패한 로그를 확인했다. 값 자체는 출력하지 않고 대상 호스트 실패 사실만 기록한다.
- Chrome에서 Docker web `http://localhost:5173/login` 접속, 테스트 계정 회원가입, 홈 화면 진입을 확인했다. 콘솔 오류/경고는 없었다.
- 새 테스트 계정은 데모 프로젝트 권한이 없어 `/audience/project_demo_1/control` 접근 시 `/project/project_demo_1/request`로 이동했다.
- 로컬 DB `project_members`에 테스트 계정을 `project_demo_1`의 `editor`/`accepted` 멤버로 추가했다.
- 편집기 `/project/project_demo_1`이 정상 로드되고 콘솔 오류/경고가 없음을 확인했다.
- `프레젠테이션` 메뉴에서 `청중 링크/QR` 모달을 열고 `QR코드 생성`으로 청중 세션을 생성했다.
- 생성된 입장 코드: `744848`, 청중 URL: `http://localhost:5173/join/744848`, 상세 제어 URL: `/presentations/session_bdbae1d1-6f62-4a80-9609-0a90537a58af/audience?projectId=project_demo_1`
- 발표자 상세 제어 화면에서 Q&A, Poll, Quiz, Reactions, Survey 토글을 켰고, 화면 상태와 콘솔 오류/경고 없음 확인.
- `Poll 추가`, `Quiz 추가` 버튼 클릭 시 화면에 `Internal server error`가 표시됐다. API 로그에서 `POST /api/v1/projects/project_demo_1/presentation-sessions/session_bdbae1d1-6f62-4a80-9609-0a90537a58af/interactions`가 500으로 실패하고 `questions_json`의 `jsonb` 변환에서 `invalid input syntax for type json`가 발생함을 확인했다.
- 청중은 `http://localhost:5173/join/744848`에서 닉네임 입력 후 입장 성공. 청중 화면에 `실시간 연결됨`, Q&A, Reactions, Poll, Quiz, Survey 카드가 표시됐다.
- 발표자 리허설 화면 `/rehearsal/project_demo_1`에서 다음 슬라이드로 이동하자 청중 화면의 제목이 `현재 슬라이드 2`로 변경됐다. 발표자-청중 WebSocket 슬라이드 상태 동기화는 동작한다.
- 단, 청중 슬라이드 snapshot 이미지는 깨진 이미지로 표시됐다. 브라우저에서 `img.naturalWidth = 0`, `img.naturalHeight = 0`이며, 같은 MinIO URL을 `curl -I`로 확인하면 `200 OK`, `Content-Type: image/svg+xml`이다.
- Q&A 제출은 정상 동작했다. 청중 화면에 `발표자 대기열에 질문을 전달했습니다.`가 표시됐고, 발표자 결과/대기열은 `Q&A 1개, 미답변 1개`, `답변 대기 1개`로 갱신됐다.
- Reaction 제출은 정상 동작했다. 청중 화면에 `반응을 보냈습니다.`가 표시됐고, 발표자 결과는 `반응 1개`로 갱신됐다.
- Poll은 API 기준 active interaction 조회와 응답 제출이 정상 동작했다. 하지만 Chrome 청중 UI에서는 active Poll이 표시되지 않고 `Poll 대기 중`으로 남아 사용자가 직접 투표할 수 없다.
- Quiz는 API 기준 active interaction 조회, 응답 제출, 종료 후 정답 공개(`quizReveal`)가 정상 동작했다. 하지만 Chrome 청중 UI에서는 active Quiz가 표시되지 않고 `Quiz 대기 중`으로 남아 사용자가 직접 참여하거나 결과를 볼 수 없다.
- 종료 후 설문은 API 기준 조회와 제출이 정상 동작했다. 하지만 Chrome 청중 UI에서 `/join/744848` 새로고침 시 종료 세션/기존 청중을 복원하지 못하고 입장 코드 확인 단계로 돌아가 설문 화면에 도달하지 못한다.
- 청중 화면과 공통 schema를 확인했다. 실제 Chrome 청중 화면에는 `speakerNotes`, `rawAudio`, `presenterScript`, token/cookie/secret류 필드가 노출되지 않았고, `packages/shared/src/audience/audience.schema.ts`는 청중 payload에서 해당 key를 재귀적으로 차단한다.
- `apps/api/src/presentation-sessions/audience-sessions.controller.spec.ts`에는 public join 응답에서 `deckId`, `presenterUserId`를 제외하는 테스트가 있다.
- 일반 샌드박스에서 `pnpm test:smoke tests/e2e/audience-engagement.spec.ts tests/e2e/audience-features.spec.ts`를 실행했을 때 Playwright Chromium이 macOS Mach port 권한 문제로 launch 실패했다.
- 같은 명령을 권한 상승으로 재실행했고 `15 passed (17.8s)`로 완료됐다.

## 발견한 문제

- 일반 샌드박스에서는 Vite dev server의 `0.0.0.0:5173` 바인딩이 `EPERM`으로 실패했다. 권한 상승 실행으로 우회했다.
- 웹 단독 서버 `5174`는 API/Socket 실제 검증에 적합하지 않다. 전체 Docker 스택의 `5173`을 기준으로 검증해야 한다.
- `.env.local` 기반 로컬 Vite 단독 실행은 현재 API 대상 DNS 해석 실패로 청중 API 검증에 부적합하다.
- 새 계정은 데모 프로젝트 접근 권한이 기본으로 없으므로 발표자 테스트 전 로컬 멤버십 준비가 필요하다.
- [P1] 발표자 상세 제어 화면에서 ad-hoc `Poll 추가`/`Quiz 추가`가 실패한다. API `createAdHocSessionInteraction`의 `questions_json` 파라미터가 PostgreSQL `jsonb`로 올바르게 직렬화되지 않아 500 응답이 발생한다. 청중 poll/quiz 흐름 검증은 테스트 데이터 직접 시드로 우회한다.
- [P1] 발표자 화면의 슬라이드 상태는 청중으로 전달되지만 청중 화면의 snapshot 이미지가 깨져 발표자 화면과 시각적으로 동일하지 않다. MinIO 객체는 `200 OK`라서, web의 cross-origin isolation 헤더(`Cross-Origin-Embedder-Policy: require-corp`)와 MinIO 이미지 응답 헤더 조합을 확인해야 한다.
- [P1] active Poll/Quiz API는 정상 응답하지만 Chrome 청중 UI가 active interaction을 렌더링하지 못하고 계속 `대기 중`으로 표시한다. 사용자가 실제 화면에서 Poll/Quiz에 참여할 수 없다.
- [P1] 종료된 세션의 `/join/:code` 진입이 기존 청중 쿠키를 복원하지 못해 종료 후 설문 UI에 도달할 수 없다. API `/audience/survey`는 기존 청중 쿠키로 조회/제출 가능하다.

## 실행 결과

- Docker stack: 실행 중, web `http://localhost:5173/`, api `http://localhost:3000/`
- Extra web dev server: 종료함.
- Automated smoke: `pnpm test:smoke tests/e2e/audience-engagement.spec.ts tests/e2e/audience-features.spec.ts` 통과, 15 passed.

## 최종 상태

- 청중 관련 기능 범위는 Chrome 수동 검증, API 보조 검증, 기존 Playwright smoke 재실행까지 완료했다.
- 정상 확인: 접속/입장, 발표자-청중 슬라이드 상태 동기화, WebSocket 상태 반영, Q&A 제출/발표자 대기열 반영, Reaction 제출/발표자 결과 반영, Poll/Quiz API 응답 제출/결과 공개, 설문 API 조회/제출, 청중 public/private payload 경계.
- 미해결 위험: 발표자 Poll/Quiz 생성 500, 청중 slide snapshot 이미지 표시 실패, Chrome 청중 UI active Poll/Quiz 미표시, 종료 후 `/join/:code`에서 설문 UI 복원 실패.

## 2026-07-06 수정 후 재검증

### 재검증 목표

- P1 수정 사항이 실제 Chrome 발표자/청중 화면에서 회복됐는지 확인한다.
- 발표자 ad-hoc Poll/Quiz 생성, 청중 slide snapshot, active Poll/Quiz UI, 종료 후 설문 복원 흐름을 중심으로 본다.

### 재검증 체크리스트

- [x] 최신 코드로 로컬 web/api 실행
  - Docker Compose로 `api`, `web`을 최신 코드 기준 재빌드/재시작했고 `api` health 및 `web` 포트 `5173` 노출을 확인했다.
  - API 로그에서 audience slide snapshot proxy route 매핑을 확인했다.
- [x] 발표자 화면 접속 및 새 청중 세션 생성
  - Chrome 발표자 탭에서 `http://localhost:5173/project/project_demo_1` 접속 성공.
  - `프레젠테이션` > `청중 링크/QR` > `QR코드 생성`으로 새 청중 코드 `191206` 생성 확인.
  - Q&A, AI Q&A, Poll, Quiz, Reactions, Survey 토글이 모두 켜진 상태로 표시됨.
- [x] 청중 화면 입장 및 WebSocket 연결 확인
  - Chrome 청중 탭에서 `/join/191206` 접근, 닉네임 `청중재검증`으로 입장 성공.
  - 청중 화면에 `실시간 연결됨` 상태가 표시됨.
- [x] 발표자 slide 이동과 청중 slide snapshot 표시 확인
  - 1차 재검증에서 발표자 `다음 슬라이드` 후 청중 화면이 `현재 슬라이드 2`로 바뀌어 realtime slide state는 동기화됨.
  - 단, snapshot image는 same-origin URL을 사용했지만 `naturalWidth=0`으로 깨졌고, API 로그에서 endpoint가 `500`을 반환했다.
  - 원인: API 컨테이너가 snapshot의 browser-facing `http://localhost:9000/...` presigned URL을 fetch해 내부에서 `ECONNREFUSED` 발생.
  - 조치: `StoragePort.getObject`를 추가하고 snapshot proxy가 내부 storage client로 object 본문을 읽도록 수정했다.
  - `pnpm --filter @orbit/storage test`, `pnpm --filter @orbit/api test -- presentation-sessions`, `pnpm --filter @orbit/api test -- files.service` 통과 후 Docker API/Web 재빌드 완료.
  - 재빌드 후 Chrome 청중 화면에서 same-origin snapshot URL이 `naturalWidth=1920`, `naturalHeight=1080`으로 표시됨.
- [x] 발표자 Poll 생성 및 청중 Poll UI/응답 확인
  - 1차 시도에서 `Poll 추가`는 500 없이 성공했지만 `활성화`가 500을 반환했다.
  - API 로그 원인: `activateSessionInteraction`이 TypeORM `UPDATE ... RETURNING` 결과를 `unwrapQueryRows` 없이 DTO로 변환해 `Cannot read properties of undefined (reading 'match')` 발생.
  - 조치: `activateSessionInteraction`, `closeSessionInteraction`, result exposure update path에 `unwrapQueryRows` 적용. TypeORM wrapped rows 회귀 테스트 추가.
  - `pnpm --filter @orbit/api test -- presentation-sessions` 통과 후 Docker API/Web 재빌드 완료.
  - 재검증에서 Q&A, AI Q&A, Poll, Quiz, Reactions, Survey 토글을 모두 실제 checkbox checked 상태로 켰다.
  - 청중 화면에서 active Poll form(`어떤 선택지가 가장 적절한가요?`, A/B radio, `응답 제출`)이 표시됐고 placeholder 중복은 없었다.
  - A 선택 후 `응답 제출` 시 청중 화면에 `응답이 저장되었습니다.` 표시 확인.
- [x] 발표자 Quiz 생성 및 청중 Quiz UI/결과 공개 확인
  - `Quiz 추가`가 500 없이 성공했고 청중 화면에 `오늘 발표의 핵심 문장을 확인했습니다.`, `참/거짓`, `퀴즈 제출` form 표시 확인.
  - 기존 active Quiz를 닫지 않은 상태에서 새 Quiz 활성화 시 DB unique 제약으로 409가 발생함을 확인했다. active interaction을 닫은 뒤 새 Quiz 활성화 필요.
  - 지연된 제출은 `timeLimitSeconds: 30` 초과로 `응답 시간이 종료되었습니다.`가 표시됨을 확인했다.
  - 제한 시간 내 `참` 선택 후 `퀴즈 제출` 시 `퀴즈 응답이 제출되었습니다.` 표시 확인.
  - 1차 close에서는 reload 후에만 reveal이 보였다. 원인: REST `activate`/`close` 경로가 `audience:slide-state` broadcast를 하지 않음.
  - 조치: `AudienceRealtimeGateway.broadcastSlideState` 추가, REST `activateSessionInteraction`/`closeSessionInteraction` 후 최신 realtime state broadcast 연결, `AudienceEntrance` active interaction fetch dependency에 `state.updatedAt` 추가.
  - 재검증에서 Quiz 닫기 직후 청중 화면이 reload 없이 `퀴즈 결과가 공개되었습니다.`, `내 답 참`, `정답 참`, `정답입니다.`로 자동 전환됨.
- [x] Q&A 제출과 presenter 대기열 반영 확인
  - 1차 재검증에서 Q&A 제출 후 `audience_question_answers` INSERT 컬럼 목록에 `created_at::text AS created_at`가 들어가 PostgreSQL syntax error로 500 발생.
  - 조치: INSERT 컬럼을 `created_at`으로 수정하고 `RETURNING`에서만 `created_at::text AS created_at` 유지. 회귀 테스트 추가.
  - 재검증에서 청중 화면에 `발표자 대기열에 질문을 전달했습니다.` 표시, 발표자 화면에 `답변 대기 1개`, `Q&A 1개, 미답변 1개` 표시 확인.
  - 이전 실패에서 남은 `Internal server error` 문구가 성공 후에도 화면에 잔상으로 남았다. 기능은 성공하지만 UX cleanup 후보로 기록.
- [x] Reaction 제출과 presenter 반영 확인
  - 청중 `박수 반응 보내기` 클릭 후 `반응을 보냈습니다.` 표시.
  - 발표자 `최근 반응` 영역에 👏 표시 확인.
- [x] 세션 종료 후 기존 청중 `/join/:code` 설문 복원 및 제출 확인
  - `기본 설문 저장` 후 로컬 테스트 세션을 ended/closed 상태로 전환해 발표 종료 상태를 시뮬레이션.
  - 기존 청중 cookie가 있는 Chrome `/join/191206`에서 `발표 설문`, `설문 제출` 복원 확인.
  - 만족도 `5`, 의견 `좋았습니다.` 제출 후 `설문이 제출되었습니다.` 표시 확인.
  - cookie 없는 신규 join lookup은 404로 종료 세션 신규 입장이 막힘을 확인.
- [x] 청중 화면에 presenter-only/private 필드 미노출 확인
  - Chrome 청중 화면 주요 상태에서 `speakerNotes`, `rawAudio`, `presenterScript`, `token`, `cookie`, `secret` 문자열 미노출 확인.
- [x] 자동 smoke/regression 결과 확인
  - `pnpm --filter @orbit/storage test` 통과.
  - `pnpm --filter @orbit/api test -- presentation-sessions` 통과.
  - `pnpm --filter @orbit/web test -- AudienceEntrance` 통과.
  - `pnpm test:smoke tests/e2e/audience-engagement.spec.ts tests/e2e/audience-features.spec.ts` 최종 재실행 통과, 15 passed.

### 재검증 최종 상태

- Chrome 기준 청중 접속, 기존 청중 재입장, WebSocket 연결, slide snapshot, Poll 생성/활성/응답, Quiz 생성/활성/제출/종료 후 자동 reveal, Q&A 제출/발표자 대기열, Reaction, 종료 후 설문 복원/제출, 신규 종료 세션 입장 차단을 확인했다.
- 이번 재검증 중 발견한 추가 결함은 모두 코드 수정 후 재검증했다.
