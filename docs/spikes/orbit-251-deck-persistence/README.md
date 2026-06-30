# ORBIT-251 Deck 구조 및 동작 정리

## 목적

이 문서는 ORBIT의 덱 구조와 현재 구현 상태를 빠르게 파악하기 위한 작업 문서다.

- 덱 데이터가 어디에서 정의되는지
- 편집, 저장, 복원, AI 생성이 어떤 경로로 연결되는지
- 현재 구조의 장점과 제약이 무엇인지
- 리팩터링 전에 어떤 성능 지표와 안정성 지표를 봐야 하는지

설명은 가능한 한 쉽게 쓰되, 실제 코드 경로와 구현 경계를 놓치지 않는 것을 목표로 한다.

## 한 줄 요약

현재 ORBIT의 덱은 `JSON 문서 + version 기반 patch + snapshot 복원` 구조로 설계되어 있다. 공통 schema와 patch 엔진은 잘 잡혀 있고, editor와 AI suggestion apply도 같은 저장 경계를 탄다. 반면 AI deck generation worker는 아직 같은 persistence boundary를 완전히 따르지 않아 저장 정책 일관성이 깨질 여지가 있다.

## 핵심 파일 지도

### 공통 계약

- `packages/shared/src/deck/deck.schema.ts`
- `packages/shared/src/deck/patch.schema.ts`
- `packages/shared/src/deck/deck-api.schema.ts`
- `docs/contracts.md`
- `docs/api/deck-persistence.md`

### 도메인 로직

- `packages/editor-core/src/patches/applyPatch.ts`

### API 저장 계층

- `apps/api/src/decks/decks.controller.ts`
- `apps/api/src/decks/decks.service.ts`
- `apps/api/src/database/migrations/2026062701000-CreateDeckPersistenceTables.ts`

### Web editor 사용처

- `apps/web/src/features/editor/EditorShell.tsx`
- `apps/web/src/features/projects/ProjectAssetWorkspace.tsx`
- `apps/web/src/features/rehearsal/keywords/keywordEditorApi.ts`

### AI 관련 경로

- `apps/api/src/ai-suggestions/ai-suggestions.service.ts`
- `apps/worker/src/generate-deck.processor.ts`

## 현재 덱 모델

### 최상위 구조

덱의 원본은 Konva 상태가 아니라 `Deck` JSON이다. 이 결정은 중요하다. UI 라이브러리 내부 상태를 저장하지 않고, 저장 가능한 문서 구조를 먼저 정의해 두었기 때문에 editor, API, AI, export, rehearsal이 같은 원본을 본다.

현재 최상위 필드는 아래와 같다.

- `deckId`
- `projectId`
- `title`
- `version`
- `metadata`
- `canvas`
- `theme`
- `slides`

코드 기준:

- `packages/shared/src/deck/deck.schema.ts`

### 슬라이드 구조

각 슬라이드는 아래를 가진다.

- `slideId`
- `order`
- `title`
- `thumbnailUrl`
- `style`
- `speakerNotes`
- `elements`
- `keywords`
- `animations`
- `aiNotes` optional

### 요소 구조

실제 편집 가능한 개체는 `elements` 배열에 들어간다. 텍스트, 도형, 이미지, 그룹, 차트까지 한 배열에서 관리한다. 이 방식은 구현이 단순하고 patch 적용이 쉽다. 반면 element 수가 매우 많아지면 배열 검색 비용이 늘어난다.

### 키 설계

ID prefix를 강제한다.

- `deck_`
- `slide_`
- `el_`
- `anim_`
- `kw_`
- `change_`
- `snapshot_`

장점:

- 디버깅 시 객체 종류가 바로 보인다.
- 잘못된 ID 혼입을 schema 레벨에서 빨리 잡을 수 있다.

## 편집 모델

### 현재 편집 철학

편집은 전체 deck overwrite와 patch append를 함께 사용한다.

- 큰 저장: `PUT /deck`
- 작은 변경: `POST /deck/patches`

이 구조는 문서 편집기에서 흔한 패턴이다.

- 사용자 상호작용은 patch로 쪼갠다.
- 서버는 current deck과 version을 authoritative source로 유지한다.
- 필요할 때 전체 deck을 다시 저장한다.

### patch 구조

patch는 아래 필드를 가진다.

- `deckId`
- `baseVersion`
- `source`
- `actorUserId`
- `operations`

지원 operation 예시:

- `update_deck`
- `add_slide`
- `update_slide`
- `reorder_slides`
- `add_element`
- `update_element_frame`
- `update_element_props`
- `replace_keywords`
- `add_animation`

코드 기준:

- `packages/shared/src/deck/patch.schema.ts`

### patch 적용 엔진

실제 patch 계산은 `packages/editor-core/src/patches/applyPatch.ts`가 담당한다.

동작 순서:

1. 현재 deck schema 검증
2. patch schema 검증
3. `deckId` 일치 확인
4. `baseVersion === deck.version` 확인
5. operation 순서대로 적용
6. `deck.version + 1`
7. 결과 deck 재검증
8. change record 생성

좋은 점:

- UI와 서버가 같은 patch 규칙을 쓸 수 있다.
- 적용 실패 지점이 명확하다.
- 최종 결과를 다시 schema 검증해서 손상된 deck 저장을 막는다.

제약:

- operation 적용이 슬라이드/요소 배열 순회 위주다.
- 대규모 deck에서는 patch 1건당 탐색 비용이 커질 수 있다.
- CRDT나 fine-grained collaboration 모델은 아니다.

## 저장 계층

### API 경계

현재 공식 deck persistence boundary는 NestJS `DecksService`다.

주요 endpoint:

- `GET /api/v1/projects/:projectId/deck`
- `PUT /api/v1/projects/:projectId/deck`
- `POST /api/v1/projects/:projectId/deck/patches`
- `GET /api/v1/projects/:projectId/snapshots`
- `POST /api/v1/projects/:projectId/snapshots/:snapshotId/restore`

코드 기준:

- `apps/api/src/decks/decks.service.ts`
- `docs/api/deck-persistence.md`

### DB 구조

현재 deck persistence 관련 테이블은 3개다.

- `decks`: project별 current deck
- `deck_patches`: patch 적용 이력
- `deck_snapshots`: 복원 가능한 snapshot

핵심 설계:

- `decks.project_id`가 primary key
- current deck은 프로젝트마다 하나
- patch append 시 version 증가
- 저장 성공 시 snapshot 생성
- restore는 snapshot의 deck JSON으로 current deck 교체

좋은 점:

- 모델이 단순하다.
- 조회 패턴이 명확하다.
- snapshot restore가 구현하기 쉽다.

제약:

- project당 current deck이 1개라는 가정이 강하다.
- version history를 current deck과 별도 patch/snapshot로 나눠 관리한다.
- full event sourcing은 아니다.

## 실제 기능 흐름

### 1. editor 진입

`EditorShell`은 먼저 `GET /deck`을 호출한다.

- 있으면 그대로 hydrate
- 없으면 seed deck을 만들어 `PUT /deck`

즉 현재 editor는 "빈 프로젝트에 들어가면 첫 덱을 자동 생성"하는 방식이다.

코드 기준:

- `apps/web/src/features/editor/EditorShell.tsx`

### 2. 일반 편집

사용자가 편집하면 브라우저 안에서 먼저 `applyDeckPatch`를 적용한다. 즉 optimistic update다.

그 다음:

- React Query cache 갱신
- 비동기 save queue에 patch 요청 추가
- 서버의 `appendPatch` 호출

좋은 점:

- 체감 반응성이 좋다.
- 사용자 입력이 서버 응답을 기다리지 않는다.

주의점:

- 저장 실패 시 refetch와 상태 복구가 중요하다.
- local optimistic state와 persisted deck의 version 정합성이 깨지지 않아야 한다.

### 3. 수동 저장

수동 저장은 patch가 아니라 전체 deck을 `PUT /deck`으로 보낸다.

그 후 추가로 썸네일 렌더링을 수행하고, 렌더된 thumbnail URL이 반영된 deck을 다시 한 번 `PUT /deck`한다.

이 말은 수동 저장 1회가 실제로는 최대 2회의 full deck write가 될 수 있다는 뜻이다.

좋은 점:

- 최종 저장본과 썸네일 상태를 함께 맞출 수 있다.

부담:

- large deck에서는 네트워크 payload와 DB write가 커진다.
- 수동 저장 latency가 길어질 수 있다.

### 4. AI suggestion apply

AI suggestion은 좋은 예다. 이 경로는 `DecksService.appendPatch`를 재사용한다.

즉:

- 제안은 pending 상태로 저장
- apply 시 current deck version 검증
- stale이면 실패
- 성공하면 change record와 snapshot 생성

이 경로는 현재 persistence boundary를 잘 따른다.

코드 기준:

- `apps/api/src/ai-suggestions/ai-suggestions.service.ts`

### 5. AI deck generation

AI deck generation worker는 현재 예외적인 경로다.

Python worker가 생성한 deck을 받은 뒤, worker 프로세스가 `decks` 테이블에 직접 upsert한다.

즉 이 경로는:

- `DecksService.putDeck`를 사용하지 않음
- `deck_snapshots`를 만들지 않음
- `deck_patches`를 만들지 않음
- API 경계에 있는 project/dto normalization을 재사용하지 않음

이건 현재 구조에서 가장 큰 일관성 리스크다.

코드 기준:

- `apps/worker/src/generate-deck.processor.ts`

## 설계 관점에서 좋은 점

### 1. 공통 schema 중심 구조

deck, patch, API envelope이 모두 shared schema로 묶여 있다. 이건 협업 프로젝트에서 매우 큰 장점이다.

### 2. patch와 full save를 분리

자주 일어나는 작은 변경과, 전체 덱 교체를 다른 경로로 분리해 두었다. 편집기 구현과 저장 전략을 설명하기 쉽다.

### 3. version 기반 충돌 방지

`baseVersion` 검증이 있어서 최소한의 optimistic concurrency control이 있다.

### 4. snapshot restore가 단순함

snapshot에 완전한 deck JSON이 있기 때문에 restore 로직이 단순하다.

## 지금 부족한 부분

### 1. 저장 경계가 완전히 통일되지 않음

가장 큰 문제다.

- editor patch 저장: `DecksService` 사용
- AI suggestion apply: `DecksService` 사용
- AI deck generation: direct SQL upsert

즉 "덱을 저장하는 공식 경계가 하나"라고 말하기 어렵다.

영향:

- snapshot 정책 불일치
- 이력 추적 불일치
- 추후 observability 추가 시 계측 위치 분산
- restore 이후 기대 동작이 producer마다 달라질 위험

### 2. 성능 목표가 문서화되어 있지 않음

현재 repo에는 deck persistence에 대한 명시적인 latency budget, payload budget, deck size budget, snapshot budget이 없다.

즉 지금 구조가 작은 demo deck에서는 충분할 수 있지만, 어느 규모까지 허용하는지 기준이 없다.

### 3. full save 비용이 큼

현재 수동 저장은 전체 deck JSON을 최소 1번, 경우에 따라 2번 저장한다. deck이 커질수록 아래 비용이 같이 늘어난다.

- 직렬화 비용
- 네트워크 payload
- DB JSONB write 비용
- snapshot row 크기

### 4. patch lookup이 배열 기반

slide, element, animation 탐색이 배열 순회 기반이라 대형 deck에서 patch apply 비용이 선형으로 증가한다.

작은 deck에서는 단순하고 충분하지만, 수백 개 객체를 가진 deck에서는 병목이 될 수 있다.

### 5. snapshot 운영 정책이 얕다

현재는 "저장 시 snapshot 생성"은 있으나 아래가 확정돼 있지 않다.

- snapshot 보존 개수
- old snapshot 정리 정책
- restore 후 audit snapshot 생성 여부
- snapshot 생성 빈도 제어

기능상 문제는 아니지만 운영 비용과 디버깅 품질에 영향을 준다.

### 6. 협업 모델 확장 준비가 제한적

현재 version 기반 patch 충돌 검사는 단일 사용자 또는 느슨한 충돌 처리에는 적합하다. 하지만 다중 사용자 동시 편집이 본격화되면 아래가 부족하다.

- merge policy
- partial conflict resolution
- server-side rebasing
- per-slide/per-element lock or CRDT

## 보통 어떤 지표로 목표 성능을 잡는가

아래는 일반적인 deck editor / document persistence 관점의 지표다. 이 프로젝트에 아직 명시되어 있지 않아서, 아래 항목은 실무적으로 권장하는 기준이다.

### 1. 편집 반응성

사용자 입력 후 화면이 바뀌는 시간이다.

보는 지표:

- patch local apply latency
- 입력 후 다음 paint까지 걸리는 시간
- drag/resize 중 frame drop

권장 관점:

- 단건 patch local apply는 체감상 즉시여야 한다.
- 일반적으로 16ms~50ms 안쪽이면 부드럽다고 본다.

### 2. 저장 지연

사용자가 저장을 눌렀을 때 완료 피드백이 나오기까지 시간이다.

보는 지표:

- `PUT /deck` p50 / p95 latency
- `POST /deck/patches` p50 / p95 latency
- thumbnail render 포함 전체 save flow latency

권장 관점:

- patch save는 짧아야 한다.
- full save는 더 길어도 되지만, 사용자가 기다리는 시간이 길면 저장 버튼 UX가 나빠진다.

### 3. payload 크기

보는 지표:

- 평균 deck JSON 크기
- 최악 deck JSON 크기
- patch 요청 평균 크기
- snapshot row 평균 크기

중요한 이유:

- 큰 JSON은 저장도 느리고 restore도 느리다.
- editor autosave나 manual save 비용이 커진다.

### 4. DB write amplification

보는 지표:

- 편집 1회당 몇 번의 DB write가 발생하는지
- 수동 저장 1회당 decks/snapshots write 수
- snapshot 생성 비율

현재 구조에서 중요한 이유:

- 수동 저장 한 번에 `decks`와 `deck_snapshots`가 같이 늘어난다.
- 썸네일 저장 후 재저장하면 write 수가 더 늘어난다.

### 5. 충돌률

보는 지표:

- `STALE_BASE_VERSION` 발생 비율
- stale conflict가 어떤 화면/기능에서 주로 발생하는지

이건 협업 전에도 유용하다. 로컬 optimistic queue와 서버 저장이 자주 어긋나는지 파악할 수 있다.

### 6. 복원 신뢰성

보는 지표:

- snapshot restore 성공률
- restore 후 schema validation 실패율
- restore 이후 editor hydrate 오류

### 7. 메모리와 렌더 비용

deck persistence만의 지표는 아니지만 editor에서는 같이 봐야 한다.

- slide 수 증가에 따른 initial load time
- element 수 증가에 따른 editor render time
- undo/redo stack 메모리 사용량

## 이 프로젝트에 권장하는 목표값

아래 수치는 repo에 정의된 공식 SLO가 아니라, 현재 구조를 건강하게 운영하기 위해 추천하는 초기 목표다.

### Editor 반응성

- 일반 patch local apply: p95 50ms 이하
- drag/resize 중 frame budget: 16ms 근처 유지

### 저장 API

- `POST /deck/patches`: p95 300ms 이하
- `PUT /deck`: p95 800ms 이하
- 수동 저장 전체 플로우: p95 2s 이하

### 데이터 크기

- 일반 demo deck JSON: 1MB 이하 유지 권장
- patch payload: 가능한 한 수 KB~수십 KB 수준 유지
- snapshot row size는 deck JSON 크기와 동일 계열이므로 상한 모니터링 필요

### 운영 지표

- stale version conflict: 전체 patch 요청의 1% 미만
- snapshot restore 실패율: 0% 목표

## 지금 바로 계측하면 좋은 항목

### 서버

- `DecksService.getDeck`, `putDeck`, `appendPatch`, `restoreSnapshot` latency
- response size
- stored deck JSON byte size
- snapshot 생성 횟수
- stale conflict 횟수

### Web

- local patch apply duration
- save queue depth
- manual save total duration
- thumbnail render duration

### Worker

- AI deck generation 후 deck write duration
- direct SQL upsert 경로 호출 횟수

## 우선순위가 높은 개선 포인트

### 1. 모든 쓰기 경로를 같은 persistence boundary로 통합

최우선이다.

특히 AI deck generation worker가 `DecksService.putDeck` 또는 같은 정책을 가진 공통 domain service를 재사용하도록 맞추는 것이 중요하다.

### 2. save flow 계측 추가

지금은 성능을 논할 기준치가 없다. 먼저 계측이 있어야 리팩터링 효과를 판단할 수 있다.

### 3. full save 비용 점검

thumbnail 재저장까지 포함한 수동 저장 경로가 예상보다 비싼지 확인해야 한다.

### 4. snapshot 운영 정책 정리

retain 개수, 정리 기준, restore audit 여부를 문서화할 필요가 있다.

### 5. 큰 deck에 대한 성능 시험

아직 repo에는 "몇 개 slide / 몇 개 element까지 안전한가"에 대한 검증이 없다.

권장 시험:

- 50 slides
- slide당 20~50 elements
- animation, keywords, thumbnails 포함

## 결론

현재 ORBIT의 덱 구조는 문서 기반 편집기 아키텍처로서 방향이 좋다.

- 공통 schema가 있다.
- patch 기반 변경 모델이 있다.
- version과 snapshot이 있다.
- editor와 API 저장 흐름도 기본적으로 연결돼 있다.

하지만 리팩터링 관점에서 보면 아직 "잘 돌아가는 구현"과 "일관된 저장 아키텍처" 사이에 간격이 있다. 특히 AI 생성 저장 경로와 성능 계측 부재가 핵심 약점이다.

ORBIT-251의 첫 목표는 기능 추가보다 아래 두 가지를 명확히 만드는 것이다.

1. 덱을 저장하는 공식 경계는 어디인가
2. 그 경계가 성능과 운영 측면에서 얼마나 건강한가
