# AI PPT 생성 중 읽기 전용 에디터 미리보기 계획

> 구현 상태: 2026-07-17 `feature/ai-ppt-progressive-preview`에서 artifact 기반 REST preview, 순차 공개 Web UI와 canonical editor handoff를 구현했다. Story 생성 자체는 단일 structured content plan과 조건부 repair 호출을 완료한 뒤 공개하므로 slide 단위 streaming 대상이 아니다.

## 문서 목적

이 문서는 AI PPT 생성 요청 후 최종 결과가 완성될 때까지 별도 대기 화면에 머무는 현재 UX를 개선하기 위한 후속 계획이다.

현재 진행 중인 `docs/plans/ai-ppt-postgresql-transport.md` Goal을 먼저 완료한 뒤 별도 Goal과 PR로 진행한다. 기존 Story Review 정책은 유지하며, 1차 목표는 **Story Review 승인 직후 읽기 전용 에디터로 이동해 전체 슬라이드 뼈대와 슬라이드별 이미지 처리 결과가 채워지는 과정을 보여주는 것**이다.

생성 도중 편집, 슬라이드별 ownership, 자동 rebase, WebSocket 전달 보장은 1차 범위에 포함하지 않는다.

## 결론

Orbit은 이미 staged pipeline, 전체 Deck을 포함하는 `layout-compile` artifact, 슬라이드별 `image-slide` checkpoint와 artifact를 가지고 있다. 따라서 읽기 전용 progressive preview를 위해 pipeline을 `slide-compose` 구조로 다시 만들 필요가 없다.

권장 구현은 다음과 같다.

```text
Story Review 승인
→ 읽기 전용 에디터로 즉시 이동
→ 기존 artifact 기반 preview endpoint polling
→ layout-compile 완료 시 전체 슬라이드 뼈대 표시
→ image-slide 완료 시 해당 슬라이드 결과 반영
→ Semantic QA / Visual QA 진행 상태 표시
→ publication 성공 시 정식 Deck으로 전환하고 편집 허용
```

미완성 결과는 정식 `decks` 테이블에 저장하지 않는다. 최종 `publication`의 원자적 전체 Deck 저장 정책도 그대로 유지한다.

## 현재 구현 확인

### 생성 요청과 화면 이동

- Web은 `POST /api/v1/projects/:projectId/jobs/generate-deck`로 Job을 생성한다.
- 현재 Web은 약 1.2초 간격으로 Job을 polling한다.
- Job이 `succeeded`가 된 뒤에만 프로젝트 에디터로 이동한다.
- 현재 Goal의 Story Review가 적용되면 `content-planning` 이후 사용자 승인을 기다리고, 승인 후 나머지 생성 단계를 수행한다.

관련 코드:

- [`apps/web/src/features/ai-ppt/AiPptMockupPage.tsx`](../../apps/web/src/features/ai-ppt/AiPptMockupPage.tsx)

### Worker pipeline

현재 staged pipeline의 주요 순서는 다음과 같다.

```text
source-grounding
→ content-planning
→ design-planning
→ layout-compile
→ image-slide fan-out
→ semantic-quality
→ rendered-visual-quality
→ publication
```

확인된 계약은 다음과 같다.

- `layout-compile` artifact의 `workerPayload`에는 `generateDeckResponseSchema`를 통과한 전체 Deck이 들어 있다.
- 모든 슬라이드의 `slideId`, 순서, 텍스트, 요소와 레이아웃은 이 시점에 이미 존재한다.
- `image-slide`는 슬라이드 전체 콘텐츠를 새로 생성하는 단계가 아니다.
- `image-slide`는 `layout-compile`의 전체 Deck을 읽고, 지정된 `slideId`의 이미지 asset만 처리한 뒤 완성된 `SlideSchema` payload를 artifact로 저장한다.
- 이미지가 필요 없는 슬라이드는 `image-slide` checkpoint를 만들지 않는다.
- `semantic-quality`는 모든 `image-slide` checkpoint가 성공한 뒤 실행되며, 슬라이드별 artifact를 전체 Deck에 병합한다.
- `rendered-visual-quality`는 전체 Deck을 대상으로 검증과 허용된 repair를 수행할 수 있다.
- `publication`은 최종 Deck 전체와 부모 Job 성공 상태를 하나의 transaction에서 반영한다.

관련 코드:

- [`apps/worker/src/generate-deck/planning-stage-contract.ts`](../../apps/worker/src/generate-deck/planning-stage-contract.ts)
- [`apps/worker/src/generate-deck/planning-stage.processor.ts`](../../apps/worker/src/generate-deck/planning-stage.processor.ts)
- [`apps/worker/src/generate-deck/execution-stage-contract.ts`](../../apps/worker/src/generate-deck/execution-stage-contract.ts)
- [`apps/worker/src/generate-deck/execution-stage.processor.ts`](../../apps/worker/src/generate-deck/execution-stage.processor.ts)

### 현재 Deck 발행과 에디터 렌더링

- `publication`은 `decks` row의 `deck_json`을 전체 upsert한다.
- 에디터는 `GET /api/v1/projects/:projectId/deck`으로 전체 Deck을 한 번에 조회한다.
- 왼쪽 슬라이드 목록은 `deck.slides` 전체를 한 번에 렌더링한다.
- 중앙 Konva 편집 캔버스는 현재 선택된 슬라이드 한 장만 렌더링한다.
- 썸네일 파일 생성은 내부적으로 슬라이드를 순차 처리하지만, 현재 cache 반영은 렌더링 batch가 끝난 뒤 한 번에 수행한다.

관련 코드:

- [`apps/web/src/features/editor/shell/EditorShell.tsx`](../../apps/web/src/features/editor/shell/EditorShell.tsx)
- [`apps/api/src/decks/decks.service.ts`](../../apps/api/src/decks/decks.service.ts)

## 외부 제안 내용의 정합성 판단

### 맞는 내용

- 현재 staged pipeline과 `image-slide` fan-out을 기반으로 활용할 수 있다.
- 최종 publication 전에 canonical Deck 편집을 허용하면 Worker의 전체 upsert가 사용자 변경을 덮을 위험이 있다.
- 불완전한 JSON을 토큰 단위로 스트리밍하지 않고 `SlideSchema`를 통과한 결과만 노출해야 한다.
- Socket.IO 이벤트에는 전체 Slide JSON보다 식별자와 revision만 싣고 최신 상태는 REST로 다시 조회하는 방식이 안전하다.
- Socket.IO 서버→클라이언트 전달은 기본적으로 `at most once`이므로 재접속 복구가 필요하다.

Socket.IO 공식 근거:

- [Rooms](https://socket.io/docs/v4/rooms/)
- [Delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

### 현재 기능이 아니라 새로 구현해야 하는 내용

- `slide-compose` 장별 fan-out
- 완성된 슬라이드의 canonical Deck 장별 저장
- `slide-generation-updated` WebSocket 이벤트
- `user-owned`, `userTouchedAt` 기반 소유권 정책
- 서로 다른 `slideId` 변경의 자동 rebase
- 같은 슬라이드 충돌 시 사용자 변경 우선 병합
- publication을 전체 저장 없이 성공 상태 확정만 수행하도록 변경
- 생성 중 완료된 슬라이드의 즉시 편집 허용

현재 Deck patch는 `baseVersion`과 Deck 전체 버전을 비교한다. 서로 다른 슬라이드 수정이라도 version이 어긋나면 자동 rebase하지 않고 `STALE_BASE_VERSION` 충돌로 처리한다. 따라서 “서로 다른 `slideId`면 현재도 안전하게 rebase된다”는 설명은 사실이 아니다.

### 읽기 전용 요구에는 과한 내용

다음 작업은 생성 중 편집까지 허용할 때만 필요하다.

- 별도 slide ownership
- 사용자 수정 보호
- 장별 canonical 저장
- 장별 QA repair 제한
- slide-aware rebase
- publication 구조 변경

읽기 전용 preview는 canonical Deck을 변경하지 않으므로 위 충돌 정책이 필요하지 않다.

## 1차 권장 범위: artifact 기반 읽기 전용 preview

### 핵심 원칙

1. Story Review 승인 전에는 기존 구성 확인 화면을 유지한다.
2. 승인 직후 생성 완료를 기다리지 않고 읽기 전용 에디터로 이동한다.
3. 미완성 Deck은 `decks` 테이블에 저장하지 않는다.
4. 기존 planning/execution artifact를 조회해 preview projection을 만든다.
5. 생성 중 에디터의 변경 동작과 저장 API를 비활성화한다.
6. `publication` 성공 후에만 canonical Deck을 다시 조회하고 편집을 허용한다.
7. QA 전 preview는 최종 결과가 아니며 QA 또는 repair 과정에서 달라질 수 있음을 명시한다.
8. raw source, OCR, provider 응답, 내부 prompt와 비공개 artifact 필드는 노출하지 않는다.

### Preview lifecycle

```text
planning
  deck 없음, Story Review 목차 전체와 skeleton 화면 표시

composing
  layout-compile artifact의 전체 Deck 표시
  이미지 대상 슬라이드는 skeleton 또는 처리 중 상태 표시

rendering
  성공한 image-slide artifact를 slideId 기준으로 교체
  나머지 슬라이드는 기존 layout 결과와 처리 상태 유지

quality-check
  전체 이미지 처리 완료
  Semantic QA / Visual QA 진행 중 배너 표시

ready
  publication 성공
  canonical Deck 재조회 후 일반 편집 모드로 전환

failed / cancelled
  마지막으로 안전하게 구성된 preview가 있으면 읽기 전용으로 유지
  오류 또는 취소 상태와 재시도·이동 action 표시
```

### API 계약

예상 endpoint:

```http
GET /api/v1/projects/:projectId/jobs/:jobId/deck-preview
```

예상 response의 최소 필드:

```ts
type AiDeckPreviewResponse = {
  jobId: string;
  projectId: string;
  status:
    | "planning"
    | "composing"
    | "rendering"
    | "quality-check"
    | "ready"
    | "failed"
    | "cancelled";
  progress: number;
  editable: false;
  outline: Array<{ order: number; title: string; message: string }>;
  deck: Deck | null;
  completedSlideIds: string[];
  pendingSlideIds: string[];
  updatedAt: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
};
```

구현 규칙:

- `packages/shared`에 strict Zod schema를 둔다.
- 기존 project read 권한과 Job의 `projectId`, `type=ai-deck-generation`을 확인한다.
- `layout-compile` 이전에는 content-planning의 안전한 order/title/message 목차와 `deck=null`을 반환한다.
- `layout-compile` 이후에는 artifact의 `workerPayload.deck`만 public schema로 다시 검증한다.
- 성공한 `image-slide` artifact만 `slideId` 기준으로 교체한다.
- 내부 `layoutResult`, raw `visualRequirements`, prompt, provider 응답은 반환하지 않는다.
- Job이 이미 성공했다면 artifact를 재구성하지 않고 canonical Deck을 기준으로 `ready`를 반환한다.
- 새로운 DB table이나 migration을 추가하지 않는다.

### Web 계약

- Story Review 승인 후 `/project/:projectId/generation/:jobId`와 같은 명시적인 preview route로 이동한다.
- generic project editor route보다 먼저 매칭한다.
- 기존 `EditorShell`의 렌더링 컴포넌트를 재사용한다.
- read-only mode에서는 다음 동작을 막는다.
  - 요소 이동·크기 변경·편집
  - 슬라이드 추가·삭제·순서 변경
  - 이미지 업로드
  - AI 편집 proposal 적용
  - 저장, undo, redo
- 슬라이드 선택, 확대·축소, speaker notes 읽기와 source 상태 확인은 허용한다.
- preview endpoint는 기존과 동일한 약 1.2초 polling으로 조회한다.
- backend 완료 순서와 무관하게 Web은 준비된 연속 prefix만 약 500ms 간격으로 공개한다.
- 사용자가 이전 slide를 직접 선택하기 전까지만 새 slide를 자동 선택한다.
- 새 Deck projection을 받을 때 `slideId` 기준으로 화면을 갱신한다.
- 이미지 대상 미완료 슬라이드는 skeleton과 단계 상태를 표시한다.
- QA 중에는 `최종 품질 확인 중` 배너를 표시한다.
- `ready`가 되면 canonical Deck query를 invalidate하고 일반 프로젝트 editor route로 전환한다.
- reload 시 URL의 `jobId`로 preview를 다시 복구한다.

### “그려지는 느낌”의 범위

서버가 불완전한 element JSON을 스트리밍하지 않는다. Web은 검증이 끝난 Slide JSON을 받은 다음 짧은 presentation animation만 적용한다.

- skeleton → 완성된 slide fade-in
- 새 이미지가 반영된 slide thumbnail 강조
- 현재 선택된 slide라면 이미지 영역 fade-in
- `prefers-reduced-motion`에서는 animation을 생략한다.

이 animation은 상태 전달을 위한 UI 연출일 뿐 생성 결과나 저장 계약을 변경하지 않는다.

## WebSocket을 1차 범위에서 제외하는 이유

- 기존 polling 주기가 이미 1.2초이므로 초기 UX에 충분하다.
- 기존 project Socket.IO room은 재사용할 수 있지만 생성 Worker와 API Socket.IO Gateway는 별도 프로세스다.
- Worker의 stage event를 API Gateway로 전달하려면 별도 cross-process bridge가 필요하다.
- Socket.IO 기본 전달은 누락될 수 있으므로 event ID 저장과 재접속 복구 계약까지 추가해야 한다.
- 결국 REST가 source of truth여야 하므로 첫 구현에서는 polling만으로 같은 결과를 더 작게 달성할 수 있다.

polling 부하가 실제 측정에서 문제가 되거나 1초 미만 반응성이 필요해질 때 WebSocket을 추가한다. 그때도 이벤트는 invalidation 신호로만 사용하고 실제 preview는 REST로 다시 조회한다.

## 생성 중 편집을 허용할 경우의 후속 범위

다음 요구가 실제로 확인될 때 별도 설계와 Goal로 진행한다.

- 완료된 슬라이드를 전체 생성 완료 전에 편집해야 한다.
- 사용자가 편집한 슬라이드에 AI 이미지 또는 QA repair가 추가로 적용되어야 한다.
- 여러 사용자가 생성 중인 Deck을 동시에 편집해야 한다.

이 경우 필요한 작업은 다음과 같다.

1. 슬라이드별 generation 상태와 ownership 저장
2. canonical Deck의 장별 원자적 patch
3. 사용자 수정 감지와 `user-owned` 또는 더 세밀한 field ownership 정책
4. slide-aware rebase와 같은 slide 충돌 정책
5. QA repair의 사용자 수정 보호
6. partial failure와 취소 시 canonical Deck 상태 계약
7. publication의 전체 upsert 제거 또는 조건부 finalize 전환
8. Worker→API realtime bridge와 재접속 복구

이는 진행 화면 개선이 아니라 Deck 저장·협업·QA 경계를 바꾸는 별도 아키텍처 작업이다.

## 구현 순서

PostgreSQL transport와 Story Review 병합 이후 공통 계약, API projection, Web을 한 PR로 구현한다.

### PR A — Preview contract와 API projection

- `AiDeckPreviewResponse` strict shared schema
- preview endpoint와 project 권한 검사
- `layout-compile` Deck projection
- 성공한 `image-slide` artifact 병합
- Job terminal 상태 projection
- raw artifact 비노출 테스트
- `docs/contracts.md` 갱신

### PR B — 읽기 전용 에디터와 progressive 표시

- generation preview route
- 기존 editor rendering 재사용
- read-only interaction gate
- polling과 reload 복구
- skeleton, slide 상태, QA banner
- 성공 후 canonical Deck handoff
- 실패·취소 상태
- accessibility와 reduced motion 검증

PR A와 PR B는 리뷰 규모가 작으면 한 PR로 합칠 수 있지만, 공통 계약과 Web 검증을 분리하는 편이 실패 원인과 회귀 범위를 확인하기 쉽다.

## 검증 기준

### Shared

- response strict parsing
- `deck=null` planning 상태
- 유효한 partial Deck preview
- unknown field 거부
- raw artifact/provider field 비노출

### API

- 다른 프로젝트와 다른 사용자의 preview 접근 거부
- 잘못된 Job type 거부
- layout artifact 이전 상태
- 전체 layout preview
- 이미지 0개, 일부, 전체 완료 projection
- 동일 `slideId`만 교체되는지 검증
- QA 상태 projection
- succeeded canonical Deck handoff
- failed/cancelled 안전한 error projection

### Web

- Story Review 승인 후 preview route 이동
- reload 복구
- 전체 슬라이드 skeleton 표시
- image-slide 완료에 따른 장별 갱신
- 중앙 캔버스는 선택 슬라이드만 렌더링
- 모든 편집·저장 동작 차단
- QA 전 결과 경고
- 성공 후 일반 editor 전환
- 실패·취소 상태 유지
- keyboard/focus와 `prefers-reduced-motion`

### 회귀

- 기존 일반 editor 저장과 Deck patch
- 기존 Story Review 승인·취소·재제안
- 기존 AI Deck final publication
- `bullmq`, `pg`, `monolith` 실행 경로
- 최종 Visual QA와 canonical Deck 계약

## 예상 규모

### 권장 읽기 전용 progressive preview

- 규모: 중간
- PR: 1~2개
- 주요 변경 영역: shared, API, Web
- Worker 변경: 없거나 안전한 조회 helper 공유 정도
- DB migration: 없음
- WebSocket: 없음
- 예상 구현·테스트 시간: 8~16시간
- 현실적인 작업 기간: 1~3 작업일

Goal 모드에서는 PR별 자동 CI 확인과 사용자 병합 대기가 있으므로 실제 경과 시간은 병합 응답 시간에 따라 늘어난다.

### 생성 중 편집까지 포함한 전체 제안

- 규모: 큼
- PR: 약 4~6개
- 예상 구현·회귀 검증: 최소 5~10 작업일
- 현실적인 Goal 기간: 병합 대기를 포함해 1~2주 이상

## 완료 조건

- Story Review 승인 직후 읽기 전용 에디터로 이동한다.
- `layout-compile` 완료 후 전체 슬라이드 뼈대를 볼 수 있다.
- 완료된 `image-slide` 결과가 해당 슬라이드에만 반영된다.
- 새 table, `slide-compose`, WebSocket 없이 기존 artifact와 polling을 재사용한다.
- 생성 중 canonical Deck과 사용자 저장 데이터는 변경되지 않는다.
- QA 전 preview임을 명확히 표시한다.
- 최종 publication 성공 후 canonical Deck으로 전환하고 편집을 허용한다.
- 실패·취소·reload 상황에서도 안전한 상태로 복구한다.
- 기존 Story Review, final publication, editor 저장과 실행 mode 회귀가 유지된다.

## 명시적 비범위

- 생성 버튼 클릭 직후 Story Review를 생략하는 흐름
- Story Review를 에디터 overlay로 옮기는 작업
- 생성 중 편집
- 사용자 수정 slide ownership
- slide-aware rebase
- 토큰 단위 또는 element 단위 JSON streaming
- 신규 generation table
- WebSocket과 persistent event log
- publication의 장별 저장 전환
- 이전 preview revision 비교

사용자가 구성 승인 전에도 에디터로 진입해야 한다는 요구가 확정되면 Story Review를 editor overlay 또는 side panel로 옮기는 별도 UX 변경을 추가한다.
