# ORBIT UI/UX 대수선 플레이북

작성일: 2026-07-15. 목적: "기능은 다 있는데 들어가는 길이 너무 깊다"를 해결하는 도구·프롬프트 가이드.

## 1. 진단: 문제는 픽셀이 아니라 동선

`apps/web/src/App.tsx`의 Route 타입 기준, 접근에 선행 상태가 필요한 화면이 과반이다.

| 화면 | 필요한 선행 상태 | 홈에서 도달 경로(추정) |
| --- | --- | --- |
| focused-practice | projectId + goalId + sourceFullRunId | 홈 → 프로젝트 목록 → 프로젝트 → 리허설 → 리포트 → 연습 계획 → 집중 연습 (6단계) |
| challenge-qna | projectId + sourceFullRunId | 5단계 |
| practice-plan | projectId + sourceFullRunId | 5단계 |
| rehearsal-report | projectId + runId | 4단계 |
| project-brief / history / request | projectId | 에디터 진입 후 발견 |

즉 대수선은 두 트랙으로 나눠야 한다.

- 트랙 A — IA·네비게이션 재설계: 클릭 깊이 축소, 컨텍스트 자동 주입. 이것이 본질.
- 트랙 B — 화면 리디자인: 트랙 A 확정 후. A 없이 B만 하면 "예쁜 미로"가 된다.

## 2. 도구 지도 (가능한 모든 방법)

### 2.1 Claude 플러그인 / 스킬

| 도구 | 단계 | 용도 |
| --- | --- | --- |
| design 플러그인 (Cowork 마켓플레이스) | 진단·검증 | design-critique(구조적 디자인 비평), accessibility-review(WCAG 감사), design-system(토큰·일관성 감사), ux-copy, user-research |
| engineering:system-design (설치됨) | 설계 | 새 IA·라우팅 구조 설계 |
| engineering:architecture (설치됨) | 설계 | IA 개편안을 ADR로 문서화, 대안 비교 |
| engineering:tech-debt (설치됨) | 진단 | 수제 라우터(App.tsx) 등 리팩터링 부채 목록화 |
| frontend-design 플러그인 (Claude Code 공식, anthropics/claude-code) | 컨셉 | 목적·톤·제약·차별화 4질문 강제로 제네릭 "AI slop" 방지. `/plugin marketplace add anthropics/claude-code` 후 설치 |

### 2.2 MCP 서버

| MCP | 용도 |
| --- | --- |
| Playwright MCP | 구현 → 스크린샷 → 수정 반복 루프. 이미 playwright.config.ts 보유라 즉시 활용 가능 |
| Chrome DevTools MCP | 콘솔·네트워크·성능 관찰 (디버깅 축) |
| Claude in Chrome | 빠른 시각 확인 |
| Figma Dev Mode MCP | Figma로 시안 작업 시 디자인→코드 연결 |
| shadcn MCP | 외부 컴포넌트 레지스트리 탐색·설치 (자체 디자인 시스템 보완용) |

### 2.3 오픈소스 툴

| 툴 | 성격 | ORBIT 적합성 |
| --- | --- | --- |
| Onlook | 오픈소스 React 비주얼 에디터, 브라우저에서 DOM 직접 편집 | React 19 + Vite라 적합. 트랙 B에서 레이아웃 실험 |
| superdesign.dev | IDE 내 디자인 에이전트, 캔버스에 시안 여러 개 병렬 생성 | 컨셉 탐색 단계 |
| cmdk / kbar | 커맨드 팔레트(⌘K) 라이브러리 | 트랙 A의 핵심 부품. "매몰 기능"을 1키로 노출 |
| tweakcn | 테마/토큰 비주얼 실험 | 토큰 변형 실험용 |
| Penpot | 오픈소스 Figma 대체 | 디자이너 협업 시 |
| (비OSS 참고) Google Stitch, Magic Patterns, v0 | 프롬프트→시안 | 컨셉 무드 탐색만, 코드는 버리는 용도 |

### 2.4 단계별 추천 조합

1. 진단: Cowork 세션 + design-critique + 아래 4.1 프롬프트
2. IA 설계: system-design + architecture 스킬 + 4.2
3. 컨셉 시안: frontend-design 스킬 → `prototypes/`에 HTML 시안 N개 + 4.3
4. 구현: Claude Code + orbit-design-system 토큰 + Playwright MCP 루프 + 4.5
5. 검증: accessibility-review + 기존 design-qa.md 프로세스 + 4.6

## 3. 프롬프트 작성 원칙

1. "예쁘게, 모던하게, 직관적으로" 금지. 측정 가능한 목표로 쓴다: "핵심 과업 7개 모두 2클릭 이내", "재방문 시 마지막 컨텍스트 자동 복원".
2. 근거 자산을 명시한다: `App.tsx Route 타입`, `apps/web/src/design-system 토큰`, `design-qa.md 형식` 등 파일 경로를 프롬프트에 직접 적는다.
3. 미적 방향을 미리 커밋한다(frontend-design 4질문: 목적/톤/제약/차별화). 안 정하면 제네릭 SaaS 대시보드가 나온다.
4. 시안은 항상 N개(2~3개) 요구 → 스크린샷 비교 → 선택 → 수렴. 1개만 받으면 비교 기준이 없다.
5. IA 먼저, 픽셀 나중. 프롬프트도 그 순서로 분리해서 던진다.
6. 불변 제약을 명시한다: packages/shared Zod 계약·API 변경 금지, 기존 URL 리다이렉트 유지, 토큰 외 색상 추가 금지.

## 4. 복붙용 프롬프트 템플릿

### 4.1 IA·동선 감사 (트랙 A 시작점)

```text
apps/web/src/App.tsx의 Route 타입과 apps/web/src/features/ 구조를 근거로 ORBIT 정보구조를 감사해줘.
1. 모든 화면을 나열하고, 로그인 직후 홈 기준 최소 클릭 수와 필요한 선행 상태(projectId, runId, goalId 등)를 표로 정리
2. 클릭 깊이 3 이상이거나 선행 상태 2개 이상인 화면을 "매몰 기능"으로 표시
3. 사용자 과업(자료 생성/편집/리허설/코칭/발표/청중 참여/리포트) 기준으로 화면을 재그룹
4. 각 매몰 기능에 대해 "사용자가 이 기능의 존재를 알 수 있는 첫 접점"을 기록
결과는 docs/ia-audit.md로 저장. 코드는 수정하지 마.
```

### 4.2 차세대 IA 설계 (system-design + architecture 스킬)

```text
docs/ia-audit.md를 근거로 ORBIT의 차세대 IA를 설계해줘. 제약:
- 핵심 과업 7개는 어디서든 2클릭 또는 단축키 1회 이내 도달
- 프로젝트 허브 구조: /project/:id 아래 브리프·편집·리허설·코칭·히스토리·리포트를 사이드바/탭으로 평탄화
- 전역 커맨드 팔레트(⌘K, cmdk 기반)로 모든 화면·액션 점프. 최근 컨텍스트(마지막 run, goal)를 자동 주입해 focused-practice 같은 다중 파라미터 화면도 1회 점프 가능하게
- 홈은 "다음 할 일"(이어서 리허설, 피드백 확인 등) 중심의 resume 화면으로
- URL 딥링크 유지, 기존 라우트는 리다이렉트로 보존
대안 2개(허브형 vs 워크플로우 레일형)를 트레이드오프와 함께 ADR로 작성해줘.
```

### 4.3 컨셉 시안 (frontend-design 스킬, 트랙 B)

```text
ORBIT는 발표 준비 전 과정(자료→리허설→코칭→본발표→청중 참여)을 다루는 툴이다.
- 목적: 발표 준비의 불안을 통제감으로 바꾸는 조종석(cockpit)
- 톤: editorial + 차분한 프리미엄. Pretendard/Inter 유지, 기존 토큰(Ink/Canvas/Surface/Lilac/Lime/Cream/Navy)만 사용
- 제약: React 19 + Vite로 이식 가능한 구조, 1440×1000과 390×844 모두 대응
- 차별화: 제네릭 SaaS 대시보드 금지. 발표까지의 타임라인(D-day, 리허설 횟수, 개선 추이)이 화면의 중심축
확정된 새 IA(docs/adr/xxx 참조)의 "프로젝트 허브" 화면 시안 3개를 각각 독립 HTML 파일로 prototypes/에 만들어줘. 시나리오 데이터 사용, 시안 간 레이아웃 전략은 서로 달라야 함.
```

### 4.4 매몰 기능 노출 패턴 (커맨드 팔레트 + resume)

```text
cmdk로 전역 커맨드 팔레트를 설계해줘.
- 화면 이동뿐 아니라 액션(리허설 시작, 마지막 리포트 열기, 집중 연습 이어하기)을 1급 항목으로
- 다중 파라미터 화면은 최근 컨텍스트로 프리필: "집중 연습" 선택 시 마지막 sourceFullRunId/goalId 자동 사용, 없으면 인라인으로 선택지 제시
- 최근 항목/추천 항목 섹션, 한국어 fuzzy 검색 대응
API 목록은 packages/shared 스키마에서 도출하고, 액션 레지스트리 타입 설계부터 보여줘.
```

### 4.5 구현 + 스크린샷 수렴 루프 (Claude Code + Playwright MCP)

```text
시안 B(prototypes/hub-b.html)를 apps/web에 구현해줘. 루프:
1. 구현 → pnpm dev 상태에서 Playwright로 1440×1000, 390×844 스크린샷 캡처
2. 시안과 나란히 비교해 차이를 P0/P1/P2로 기록 (기존 design-qa.md 형식 그대로)
3. P2까지 수렴할 때까지 반복하고 각 라운드를 design-qa.md에 추가
불변 제약: packages/shared 계약·API 변경 금지, 기존 라우트는 리다이렉트 유지, design-system 토큰 외 색상·폰트 추가 금지, 스크롤 가로 오버플로 0.
```

### 4.6 검증 (design-critique + accessibility-review)

```text
새 허브·팔레트 화면 스크린샷(데스크톱/모바일)에 대해:
1. design-critique: 시각 위계, 스캔 패턴, 첫 5초에 파악되는 정보 기준으로 비평. 칭찬 생략, 심각도순
2. accessibility-review: WCAG 2.1 AA 기준 감사. 키보드 전용 동선(팔레트 포함)과 포커스 트랩 중점
3. 발견 사항을 P0/P1/P2로 design-qa.md에 병합
```

## 5. 추천 실행 순서

1주차: 4.1 감사 → 4.2 IA ADR 확정 → design 플러그인으로 현 화면 비평(베이스라인).
2주차: 4.3 시안 3개 → 팀 선택 → 4.4 팔레트 설계 → 4.5 구현 루프 → 4.6 검증.
이후: Onlook으로 세부 레이아웃 미세조정, tech-debt 스킬로 App.tsx 수제 라우터 정리 여부 결정.

## 참고 링크

- frontend-design 플러그인: https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design
- Playwright MCP vs Chrome DevTools MCP: https://stevekinney.com/writing/driving-vs-debugging-the-browser
- shadcn MCP: https://ui.shadcn.com/docs/mcp
- Onlook: https://onlook.com (GitHub: onlook-dev/onlook)
- superdesign: https://superdesign.dev
- cmdk: https://github.com/pacocoursey/cmdk
