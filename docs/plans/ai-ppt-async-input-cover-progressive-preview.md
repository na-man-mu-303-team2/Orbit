# AI PPT 비동기 입력·Cover 우선·Progressive Preview 구현 계획

## 목표

사용자가 한 화면에서 content planning을 기다리는 시간을 Style 선택과 겹치고, Style 확정 직후 서버에서 완성된 표지를 먼저 보여준다. Story Review 개념은 UI, API, shared schema, DB에서 제거한다.

## 최종 흐름

1. 내용 입력 화면에서 발표 주제, 발표 내용, 청중, 발표 톤과 첨부파일을 입력한다.
2. 파일 선택 즉시 임시 project를 만들고 복수 파일을 병렬 업로드한다. 화면에는 파일별 진행·완료·실패 상태와 재시도·제거를 제공한다.
3. 사용자가 **다음 단계**를 클릭하면 업로드 완료 fileId와 입력값으로 generation Job을 만들고 content planning을 시작한 뒤 Style & Color로 이동한다.
4. Style & Color는 추천 폰트/live preview, 기본 팔레트 9개와 AI 커스텀 팔레트를 제공한다.
5. Style 확정 시 `designSelection` gate를 열고 deterministic `cover-slide`를 일반 stage보다 우선 실행한다.
6. 읽기 전용 Progressive Preview는 표지와 이후 완성된 slide를 1번부터 순차 공개한다. 이 결과는 Vision QA 전 변경될 수 있음을 표시한다.
7. semantic QA, rendered Vision QA와 publication이 끝나면 canonical Deck query를 갱신하고 일반 editor로 이동한다.

## 서버 계약

- 기존 single Story LLM 호출과 실제 image-slide shard 구조를 재사용하며 Story를 slide별로 스트리밍하지 않는다.
- `content-planning`과 Style 확정의 race는 Job row lock과 `(pipeline_job_id, stage, shard_key)` UNIQUE checkpoint로 멱등 처리한다. cover가 terminal이 된 뒤에만 `design-planning`을 열어 표지와 일반 1번 slide가 동시에 생성되지 않게 한다.
- `cover-slide`는 별도 LLM, queue, dependency 없이 선택 palette/font와 입력 topic/message/audience로 만든다.
- 성공한 cover는 최종 1번 completed image-slide artifact로 승격해 중복 생성하지 않는다. cover 실패 시 기존 1번 image-slide 경로로 fallback한다.
- Worker 기본 concurrency 5를 유지하고 1이면 시작 로그로 preview 지연 가능성을 경고한다.

## 검증과 전달

- 기능 구현 완료 후 기본 `pnpm build`만 수행한다. 상세 unit/integration/E2E와 수동 UX 검증은 별도로 진행한다.
- 중간 PR은 만들지 않고 전체 구현과 build가 완료된 최종 branch만 `develop` 대상 단일 PR로 올린다.
