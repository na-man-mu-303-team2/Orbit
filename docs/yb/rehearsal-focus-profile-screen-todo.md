# RehearsalFocusProfile 화면·API TODO

## 문서 목적

`RehearsalFocusProfile` 계약에 정의된 필드가 실제 제품의 어느 화면에서 설정되고, 어떤 시점에 평가 snapshot으로 고정되는지 정리한다.

현재 코드는 shared schema, DB migration, 리허설 시작 시 snapshot 생성·소비까지 구현되어 있다. Focus Profile을 사용자가 직접 입력·수정하는 API와 화면은 아직 구현되지 않았다.

기준 문서:

- [`AGENTS.md`](../../AGENTS.md)
- [`docs/contracts.md`](../contracts.md)
- [`docs/Orbit-업무분담.md`](../Orbit-업무분담.md)
- [`p0-core-contract-guide.md`](../rehearsal-report/p0-core-contract-guide.md)
- [`rehearsal-focus-profile.schema.ts`](../../packages/shared/src/coaching/rehearsal-focus-profile.schema.ts)

## 현재 화면과 역할

| 화면 | 경로 | 현재 역할 | Focus Profile과의 관계 |
| --- | --- | --- | --- |
| 프로젝트 에디터 | `/project/:projectId` | 발표 자료와 `deck.slides` 편집 | `slides`의 원본을 제공한다 |
| 발표 브리프 | `/project/:projectId/brief` | 청중, 목적, 발표 시간, 필수 내용, 오프닝·클로징 조건 입력 | 별도 aggregate이며 Focus Profile을 설정하지 않는다 |
| 리허설 시작 전 | `/rehearsal/:projectId` | 마이크, 음성 인식, 슬라이드 로드 상태 확인 | Focus Profile 편집 영역을 추가할 후보 화면이다 |
| 연습 계획 | `/rehearsal/:projectId/plan/:runId` | 분석 결과로 생성된 Top 3 목표 표시 | 사용자 Focus Profile을 수정하지 않는다 |
| 집중 연습 | `/rehearsal/:projectId/focus/:goalId` | 이미 결정된 목표와 `targetScope`로 반복 연습 | Focus Profile을 소비할 뿐 설정하지 않는다 |

## 필드별 설정 위치

| 필드 | 사용자 설정 위치 | 구현 방식 | 상태 |
| --- | --- | --- | --- |
| `items` | 리허설 시작 전 Focus Profile 카드 | 최대 3개의 목표 행을 추가·삭제·정렬한다 | TODO |
| `focusItemId` | 사용자에게 직접 노출하지 않음 | 목표 생성 시 client/server에서 고유 ID를 발급한다 | TODO |
| `priority` | Focus Profile 목표 행의 순서 | 배열 순서와 `1`, `2`, `3`을 동기화한다 | schema 검증만 있음 |
| `kind` | 목표 유형 선택 | `opening`, `closing`, `timing`, `semantic-coverage`, `filler-words`, `pauses`, `custom` 중 선택한다 | TODO |
| `label` | 목표명 입력 | 사용자에게 보여줄 짧은 목표명을 입력한다 | TODO |
| `targetScope` | 목표별 연습 범위 선택 | 전체 발표, 슬라이드, 문장, 슬라이드 구간, 도입, 마무리 중 선택한다. 전체 발표는 `null`이다 | TODO |
| `slides` | 별도 입력 화면 없음 | 프로젝트 에디터의 `deck.slides`에서 리허설 시작 시 평가용 정보만 자동 복사한다 | 자동 snapshot 구현 |

### `targetScope` 선택 규칙

`focusedPracticeTargetScopeSchema`가 허용하는 값만 UI에서 선택할 수 있어야 한다.

- 전체 발표: `null`
- 특정 슬라이드: `{ type: "slide", scopeId, slideId }`
- 특정 문장: `{ type: "sentence", scopeId, slideId, sentenceIndex, textSnapshotHash }`
- 슬라이드 구간: `{ type: "slide-range", scopeId, startSlideId, endSlideId }`
- 도입: `{ type: "opening", scopeId }`
- 마무리: `{ type: "closing", scopeId }`

문장 target은 선택 당시 문장의 `textSnapshotHash`를 저장해야 한다. 이후 문장 내용이 변경되면 stale target으로 취급하고 자동 실행하거나 과거 결과와 비교하지 않는다.

## 구현 TODO

### 1. API

- [ ] `GET /api/v1/projects/:projectId/rehearsal-focus-profile` 구현
- [ ] `PUT /api/v1/projects/:projectId/rehearsal-focus-profile` 구현
- [ ] 최초 저장 시 `expectedRevision=0`, 이후 저장 시 현재 `revision`을 사용
- [ ] `putRehearsalFocusProfileRequestSchema`로 request 검증
- [ ] `rehearsalFocusItemsSchema`로 최대 3개, ID 중복, priority 연속성을 검증
- [ ] revision 불일치 시 HTTP 409와 `REHEARSAL_FOCUS_PROFILE_REVISION_CONFLICT` 반환
- [ ] owner/editor 권한을 확인하고 viewer는 수정하지 못하게 처리
- [ ] 저장·충돌·권한 거부 업무 이벤트 로그 추가

현재 리허설 생성 로직은 DB에서 Focus Profile을 읽어 snapshot에 넣는 것만 구현되어 있다. [`rehearsals.service.ts`](../../apps/api/src/rehearsals/rehearsals.service.ts)의 `resolveFocusProfile()`는 입력 API를 대체하지 않는다.

### 2. 리허설 시작 전 Focus Profile 화면

권장 위치는 기존 `/rehearsal/:projectId` 시작 전 화면이다. 사용자는 마이크 확인과 함께 이번 발표에서 우선적으로 연습할 목표를 확인·수정할 수 있어야 한다.

- [ ] 목표 카드 또는 목표 행을 최대 3개까지 표시
- [ ] 목표 추가·삭제 기능 구현
- [ ] 목표 행의 순서 변경으로 `priority` 지정
- [ ] `kind` 선택 UI와 유형별 설명 추가
- [ ] `label` 입력 UI 추가
- [ ] `targetScope` 선택 UI 추가
- [ ] 슬라이드·문장·슬라이드 구간 선택 시 현재 deck 정보 사용
- [ ] 문장 target 생성 시 `textSnapshotHash` 계산
- [ ] 저장 중 중복 요청 방지
- [ ] revision 충돌 시 최신 profile을 보여주고 다시 편집할 수 있게 처리
- [ ] 저장 완료 후 리허설 시작 요청이 최신 profile revision을 사용하도록 연결

권장 컴포넌트 후보:

- `apps/web/src/features/coaching/RehearsalFocusProfilePage.tsx`
- `apps/web/src/features/coaching/rehearsalFocusProfileApi.ts`
- `apps/web/src/features/coaching/rehearsal-focus-profile.css`

단, 별도 route를 만들지 않고 `RehearsalWorkspace`의 preflight 영역에 패널로 넣는 구현도 가능하다. route와 컴포넌트 분리는 구현 시 기존 navigation 흐름을 확인해 결정한다.

### 3. `slides` 평가 snapshot 확인

`slides`는 Focus Profile 입력 필드가 아니다. 리허설 시작 시 `deck.slides`에서 다음 정보만 복사한다.

- `slideId`
- `order`
- `title`
- `estimatedSeconds`
- `keywords`
- 승인 또는 제외 상태의 `semanticCues`

관련 구현:

- [`createRehearsalEvaluationSnapshot()`](../../packages/shared/src/rehearsals/rehearsal-evaluation-snapshot.ts)
- [`rehearsalEvaluationSnapshotSchema`](../../packages/shared/src/rehearsals/rehearsal.schema.ts)
- [`EditorShell.tsx`](../../apps/web/src/features/editor/shell/EditorShell.tsx)

TODO:

- [ ] 리허설 시작 시 snapshot이 현재 deck version과 일치하는지 확인
- [ ] 평가 중에는 mutable한 현재 deck이 아니라 snapshot의 `slides`만 사용
- [ ] deck 변경 시 기존 sentence target과 snapshot을 stale 처리
- [ ] snapshot에 발표자 script 원문이나 전체 편집기 상태가 들어가지 않는지 테스트

## 기존 화면과 혼동하면 안 되는 항목

발표 브리프 화면의 오프닝·클로징 입력은 `PresentationBrief`의 요구사항이다. Focus Profile의 `kind: "opening" | "closing"`과 이름이 비슷하지만 저장 위치와 평가 목적이 다르다.

- Brief: 발표가 어떤 조건을 만족해야 하는지 정의
- Focus Profile: 사용자가 이번 연습에서 무엇을 우선적으로 고칠지 정의
- Practice Plan: 분석 결과를 바탕으로 시스템이 다음 연습 목표를 생성
- Focused Practice: 선택된 목표를 실제로 반복 연습

## 완료 조건

- [ ] 리허설 전에 최대 3개의 Focus Profile 목표를 생성·수정·삭제할 수 있다.
- [ ] `priority`가 항상 `1`부터 연속되고 저장 시 schema validation을 통과한다.
- [ ] `targetScope=null`인 전체 발표 목표와 각 scope 유형을 저장할 수 있다.
- [ ] 문장 target은 `textSnapshotHash`를 가지고, 자료 변경 시 stale 처리된다.
- [ ] revision 충돌이 HTTP 409로 전달되고 사용자가 최신 profile을 확인할 수 있다.
- [ ] 리허설 시작 시 `profileId`, revision, items가 `evaluationSnapshot.focusProfileSnapshot`에 고정된다.
- [ ] 과거 run은 이후 수정된 Focus Profile이 아니라 시작 당시 snapshot으로 평가된다.
- [ ] `slides`는 현재 편집기 상태 전체가 아니라 평가에 필요한 축약 정보만 snapshot에 저장한다.
- [ ] 발표자 script 원문, raw audio, transcript 원문이 Focus Profile·snapshot·public API에 포함되지 않는다.

