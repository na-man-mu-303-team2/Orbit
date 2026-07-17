# AI PPT 실제 슬라이드 단위 서버 생성 계획

## 요약

- 선행 PR #446은 `origin/develop@24ab6a4a`에 병합됐고 CI도 통과했다.
- 별도 worktree의 `feature/ai-ppt-slide-streaming-generation` 브랜치를 `origin/develop`로 fast-forward한 뒤 작업한다.
- 새 `slide-compose` stage와 DB migration은 추가하지 않는다. 이미 slide별 fan-out, lease, fencing, retry, artifact 저장을 지원하는 `image-slide` stage를 v2 슬라이드 생성 transport로 재사용한다.
- 내부 단계별 커밋만 만들고 중간 PR은 만들지 않는다. 모든 구현이 끝난 후 최종 PR 하나만 생성한다.
- 기존 `monolith`, legacy layout artifact, 기존 `image-slide` asset-only 처리는 유지한다.

## 생성 구조와 계약

### Story 경량화

- staged pipeline은 기존 `ContentPlan`/Story Review projection을 재사용하고 artifact에 `artifactVersion: 2`를 추가한다. 별도 Story table이나 중복 schema는 만들지 않는다.
- `content-planning`은 attempt당 LLM을 정확히 한 번만 호출해 다음만 생성한다.
  - Deck 제목
  - 현재 `order` (`sourceOrder`는 승인된 최종 순서에서 manifest가 고정)
  - 슬라이드 제목과 핵심 메시지
  - `slideType`
  - 검증된 `sourceRefs`
- 발표자 노트, `contentItems`, keywords, visual/media intent는 생성하지 않는다.
- 기존 deck-wide content repair와 두 차례 speaker-note repair를 완전히 우회한다. 잘못된 LLM 응답은 동일 attempt 안에서 추가 호출하지 않고 기존 checkpoint retry로 처리한다.
- Story Review의 대본 탭은 제거하고 제목·메시지 수정, 순서 변경, 재제안, 취소를 유지한다.
- 기존 speaker-notes API는 호환용으로 유지하며 직접 입력된 non-empty 값은 후속 생성보다 우선한다.
- `monolith`는 기존 full `ContentPlan` 생성 경로를 그대로 사용한다.

### Versioned artifact

기존 artifact를 깨지 않도록 명시적 union을 사용한다.

```ts
type ContentPlanningV2 = {
  artifactVersion: 2;
  rawInput: object;
  contentPlan: {
    outline: { title: string; slideTitles: string[] };
    slidePlans: Array<{
      order: number;
      title: string;
      message: string;
      slide_type: string;
      source_refs: string[];
      speaker_notes: string;
      content_items: [];
      keywords: [];
    }>;
  };
};

type LayoutManifestV2 = {
  artifactVersion: 2;
  deckShell: Omit<Deck, "slides">;
  slides: Array<{
    sourceOrder: number;
    order: number;
    slideId: string;
    shardKey: string;
  }>;
};

type CompletedSlideV2 = {
  artifactVersion: 2;
  sourceOrder: number;
  order: number;
  slideId: string;
  slide: Slide;
  warnings: string[];
  validation: GenerateDeckValidation;
};
```

- `shardKey`는 `001-slide_1`처럼 zero-padding된 순서와 `slideId`를 결합한다. PostgreSQL의 사전순 claim에서도 1번부터 우선 배정된다.
- 최종 `Deck`, editor 저장, PPTX export 계약은 변경하지 않는다.
- DB table, stage enum, queue, WebSocket, dependency는 추가하지 않는다.

## 내부 구현 단계

### 1. 계약과 legacy 호환

커밋: `feat(shared): add versioned slide generation artifacts`

- content/layout/image artifact schema를 legacy/v2 union으로 확장한다.
- v2 identity에서 order, slideId, artifact slide 값의 일치를 검증한다.
- 기존 `image-slide` queue, checkpoint, execution artifact repository를 그대로 사용한다.
- `design-planning`은 전체 Story를 보고 theme, design program, 슬라이드별 composition direction과 media budget을 미리 결정한다.
- `layout-compile` v2는 전체 Deck을 컴파일하거나 QA하지 않고 `deckShell`과 ordered manifest만 저장한다.

### 2. Story 병목 제거와 슬라이드 상세 생성

커밋: `feat(ai): split story and slide detail generation`

- staged `content-planning`을 `StoryPlanV2` 전용 1회 호출로 변경한다.
- `POST /internal/ai/deck-generation/slide-compose` strict endpoint를 추가한다.
- endpoint에는 전체 Story의 제목·메시지와 대상 slide 정보만 전달한다.
- grounding은 대상 `sourceRefs`로 선택한 source excerpt만 전달하고 기존 길이 제한을 재사용한다. 전체 OCR/reference context를 slide 수만큼 반복 전송하지 않는다.
- endpoint는 대상 slide의 발표자 노트, contentItems, keywords, visual/media intent를 생성하고 manifest의 composition direction으로 한 장만 컴파일한다.
- 승인된 order, title, message, slideType, sourceRefs와 사용자가 직접 입력한 발표자 노트는 변경하지 않는다.
- legacy full content가 이미 있으면 완성된 필드를 재사용하고 누락된 필드만 생성한다.

### 3. 실제 slide별 fan-out과 완료 저장

커밋: `feat(worker): compose slides through existing image shards`

- v2 `layout-compile` 완료 시 이미지 필요 여부와 관계없이 모든 slide에 `image-slide` checkpoint를 sourceOrder 순으로 생성한다.
- 기존 process/user concurrency를 재사용하므로 최대 5개 shard가 가용 slot 내에서 병렬 실행된다.
- v2 handler는 다음 순서로 처리한다.
  1. Story, design, manifest identity 검증
  2. 대상 source만 포함한 Python slide-compose 호출
  3. 기존 asset resolution 적용
  4. 한 장짜리 Deck으로 semantic/rendered QA와 bounded repair 수행
  5. 승인된 Story 필드 재검증
  6. 검증된 `CompletedSlideV2` artifact 저장 후 checkpoint 성공 처리
- artifact 저장 전 결과는 Preview API에 노출하지 않는다.
- slide 완료마다 raw content 없이 `jobId`, `slideId`, `sourceOrder`, duration을 업무 로그로 남긴다.
- parent progress는 고정값이 아니라 `60 + completed / total` 비율로 갱신한다.

### 4. 실패, 조립, publication

커밋: `feat(worker): assemble immutable completed slides`

- 한 v2 shard가 최종 실패해도 부모 Job을 즉시 종료하지 않고 다른 queued/running shard를 계속 처리한다.
- 성공과 실패 양쪽이 공통 fan-out join을 실행한다.
  - 모두 성공: `semantic-quality`을 한 번만 enqueue
  - 모두 terminal이고 실패 존재: 부모 Job 실패, 성공 artifact 유지
- 명시적 retry는 기존 `image-slide` retry를 사용해 failed shard만 초기화하고 성공 shard를 보존한다.
- `semantic-quality`은 manifest identity와 정확한 slide 수를 검증한 뒤 `sourceOrder`로 조립한다.
- 공개된 slide 불변성을 위해 v2 global semantic/rendered QA는 repair 없이 검증만 수행한다.
  - advisory issue: 경고와 diagnostics에 기록하고 publication 허용
  - blocking/non-advisory issue: non-retryable 실패, 완성된 preview 유지
- publication transaction에서만 canonical `decks` row와 부모 Job을 성공 처리한다.
- Preview에 공개된 slide 배열과 publication Deck의 slide 배열이 완전히 같아야 한다.

### 5. Progressive Preview 연결

커밋: `feat(web): show server-completed slide prefix`

- #446의 route와 `AiDeckPreviewResponse`, read-only canvas, 1.2초 polling을 재사용한다.
- `GET /api/v1/projects/:projectId/jobs/:jobId/deck-preview`는 다음 의미로 고정한다.
  - ready 0장: `deck=null`
  - ready 1장 이상: `deck`은 검증된 연속 prefix만 포함한 유효한 partial Deck
  - `completedSlideIds`: 공개된 연속 prefix만
  - `pendingSlideIds`: 서버 내부에서 먼저 완료됐더라도 prefix 밖의 모든 slide
- 인위적인 500ms stagger를 제거한다. 한 polling 사이에 여러 장이 완료되면 함께 나타날 수 있다.
- 왼쪽 패널은 Story 목차 전체를 즉시 표시하고 `pending/composing`은 skeleton으로 유지한다.
- 새 slide 자동 선택, 사용자의 이전 slide 선택 유지, reload 복구, 실패 preview 유지, publication 후 editor handoff는 #446 동작을 유지한다.
- QA 안내는 “공개된 슬라이드는 변경되지 않는다”는 계약에 맞게 수정한다.

## 테스트, PR, 완료 조건

- 구현 시작 전 격리 worktree에서 `git merge --ff-only origin/develop`로 `24ab6a4a`까지 갱신한다.
- 자동 테스트는 CI에서 다음 위험만 검증한다.
  - legacy/v2 strict artifact parsing
  - Story provider 호출 1회 및 speaker-note repair 미호출
  - sourceRefs 기반 grounding 축소
  - padded shard 순서와 최대 5개 concurrent claim
  - shard 독립 retry 및 sibling 계속 실행
  - fan-out join exactly once
  - publication 전 canonical Deck 미변경
  - global QA 전후 Deck 동일성
  - preview contiguous prefix와 raw OCR/prompt/provider 응답 미노출
  - legacy `image-slide`, monolith, BullMQ/pg 경로 회귀
- 로컬 build/test와 별도 브라우저 자동화는 실행하지 않는다.
- 모든 커밋 완료 후 branch를 push하고 ready 상태의 최종 PR 하나를 생성한다.
- PR CI의 `typescript`, `unit-contracts`, `db-integration`, `python`, `e2e`, `environment-contract`를 확인하고 실패 시 수정 커밋만 추가한다.
- CI 통과 후 merge하지 않고 사용자 수동 검수와 승인을 기다린다.
- 사용자의 수동 검수 범위는 다음과 같다.
  - Story 대기시간과 대본 탭 제거
  - Story 승인 후 첫 slide가 전체 Deck보다 먼저 나타나는지
  - reload, 실패, retry 시 완성 slide 유지
  - 최종 editor/PPTX가 Preview와 동일한지
- `docs/contracts.md`, environment 규칙, 디자인 시스템, Progressive Preview 계획서와 로컬 runbook을 실제 v2 동작에 맞춰 갱신한다.
