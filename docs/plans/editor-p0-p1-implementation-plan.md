# ORBIT Editor P0·P1 구현 계획

작성일: 2026-07-15  
계획 기준: 최신 원격 develop  
계획 작성 시 확인한 원격 SHA: d6e5d1b82c799d6741c030654c2204f77b5888bd  
전달 방식: 기능별 독립 PR, 모든 PR의 base는 develop

## 1. 목표

이 계획은 Google Slides와 ORBIT 비교 감사에서 확정한 P0·P1을 실제로 구현 가능한 vertical slice로 분해한다.

완료 후 ORBIT editor는 다음 조건을 만족해야 한다.

- 보이는 control은 모두 동작하거나 제거되어 있다.
- API 실패 시 demo Deck이 실제 사용자 Deck처럼 나타나지 않는다.
- Viewer는 읽기와 본인 개인 리허설만 가능하고 Deck mutation은 어떤 경로로도 만들 수 없다.
- 개인 리허설 Run, audio, slide snapshot은 생성자에게만 보인다.
- slide 복제·삭제·재정렬이 undo/autosave/persistence와 연결된다.
- 객체 선택 전후 toolbar와 canvas가 움직이지 않는다.
- zoom, nudge, save, slide navigation shortcut이 안정적으로 동작한다.
- AI 경고는 사람이 이해할 수 있는 대상과 recovery action을 제공한다.
- 브리프 → 검사 → 개인 리허설 → 발표 경로가 역할별 capability에 맞게 연결된다.

## 2. 사용자 확정 결정

다음은 구현 중 다시 해석하지 않는 고정 결정이다.

1. 기준 브랜치는 최신 origin/develop이다.
2. 각 기능은 독립적으로 리뷰·rollback 가능한 PR로 전달한다.
3. production에서 동작하지 않는 control은 disabled placeholder로 남기지 않고 숨기거나 제거한다.
4. Viewer는 Deck, 발표자 메모, Brief, History, AI 검사 결과를 읽을 수 있다.
5. Viewer는 Deck·노트·Brief·slide·AI 결과를 수정할 수 없다.
6. Viewer는 전체 개인 리허설을 실행할 수 있다.
7. 리허설 Run·report·comparison·summary는 역할과 관계없이 생성자만 읽고 수정한다.
8. 다른 사용자의 runId/fileId 접근은 존재 여부를 숨기기 위해 404로 처리한다.
9. Viewer의 rehearsal audio와 slide snapshot도 생성자 소유 private asset으로 저장한다.
10. AI 자동수정은 issue === "textOverflow"만 허용한다.
11. overlap과 grid 문제는 click-to-focus, highlight, 수동 조정 안내만 제공한다.
12. slide 삭제는 확인 dialog 없이 즉시 실행하고 Undo toast를 제공한다.
13. 마지막 한 장은 삭제할 수 없다.
14. 복제 slide 제목은 "원본 제목 복사본"으로 만든다.
15. 프로젝트 Viewer는 발표자 메모를 읽을 수 있지만 Audience API에는 메모·script·raw audio를 노출하지 않는다.
16. Deck 404는 Owner/Editor에게 명시적인 "첫 슬라이드 만들기" CTA를 제공하고 자동 생성하지 않는다.

## 3. 최종 권한 행렬

| Capability | Owner | Editor | Viewer | Audience |
| --- | ---: | ---: | ---: | ---: |
| Deck·발표자 메모 읽기 | O | O | O | 공개 slide만 |
| Brief·History 읽기 | O | O | O | X |
| Deck·노트·slide 수정 | O | O | X | X |
| AI 검사 읽기·대상 focus | O | O | O | X |
| AI 요청·자동수정 적용 | O | O | X | X |
| 파일 import/upload/export | O | O | X | X |
| Audience session·QR 생성 | O | O | X | X |
| 개인 리허설 생성 | O | O | O | X |
| 자기 Run·report 읽기/쓰기 | O | O | O | X |
| 다른 사용자 Run 존재 확인 | 404 | 404 | 404 | 404 |
| 자기 private audio/snapshot | O | O | O | X |

프로젝트 공유 관리 권한은 현재 서버 정책을 유지하며 Viewer에는 노출하지 않는다.

## 4. 브랜치와 의존성

| 병합 순서 | 브랜치 | Priority | 범위 | 필수 선행 PR |
| ---: | --- | --- | --- | --- |
| 1 | feature/p0-viewer-rehearsal-ownership | P0 | Run/audio/snapshot 생성자 소유권과 API 격리 | 없음 |
| 2 | fix/p0-editor-trust | P0 | role capability, 실제 Deck load, read-only, 저장·오류, no-op 제거 | 1 |
| 3 | feature/p0-slide-rail | P0 | slide 복제·삭제·재정렬·Undo·keyboard | 2 |
| 4 | fix/p1-toolbar-stability | P1 | 고정 toolbar, selection inspector | P0 뒤 병합 |
| 5 | feature/p1-canvas-productivity | P1 | zoom, nudge, save/slide shortcut | 4 |
| 6 | feature/p1-quality-recovery | P1 | 사람이 읽는 경고, focus, textOverflow fix | 2, 권장 4 |
| 7 | feature/p1-outcome-flow | P1 | Brief→검사→개인 리허설→발표 연결 | 1, 2, 6 |

의존성 흐름:

~~~text
origin/develop
  ├─ P0 viewer rehearsal ownership
  │    └─ P0 editor trust
  │         ├─ P0 slide rail
  │         ├─ P1 toolbar stability
  │         │    └─ P1 canvas productivity
  │         └─ P1 quality recovery
  │                └─ P1 outcome flow
  └──────────────────────────────┘
~~~

모든 PR은 develop을 직접 base로 둔다. 선행 PR이 merge되면 후속 브랜치에는 rebase가 아니라 origin/develop 일반 merge를 사용한다.

## 5. 작업 시작과 Worktree

현재 기본 worktree에는 사용자 소유 .gitignore 변경이 있다. 해당 변경을 stash, commit, discard하지 않는다.

계획 작성 시 로컬 origin/develop은 stale 상태였다. 실제 구현 시작 시 다음을 먼저 실행한다.

~~~bash
git fetch origin develop
git rev-parse origin/develop
~~~

원격 SHA가 이 문서의 SHA보다 앞서 있으면 최신 SHA를 새 기준점으로 기록하고, editor 관련 변경과 migration timestamp 충돌을 다시 확인한다.

Wave A worktree 예시:

~~~bash
git worktree add -b feature/p0-viewer-rehearsal-ownership /private/tmp/orbit-p0-rehearsal-ownership origin/develop
git worktree add -b fix/p0-editor-trust /private/tmp/orbit-p0-editor-trust origin/develop
git worktree add -b feature/p0-slide-rail /private/tmp/orbit-p0-slide-rail origin/develop
git worktree add -b fix/p1-toolbar-stability /private/tmp/orbit-p1-toolbar origin/develop
git worktree add -b feature/p1-quality-recovery /private/tmp/orbit-p1-quality origin/develop
~~~

Canvas와 outcome branch는 선행 PR merge 후 최신 develop에서 만든다.

기존 prunable worktree는 이번 작업에서 prune하지 않는다.

## 6. 5명 배치

| 담당 | 0–14h | 14–20h | 20–24h |
| --- | --- | --- | --- |
| 개발자 1 | P0 viewer rehearsal ownership | migration/API security 회귀 | 통합 권한 감사 |
| 개발자 2 | P0 editor trust | load/save/viewer E2E | 전체 P0 회귀 |
| 개발자 3 | P0 slide rail | persistence/drag E2E | 통합 UX QA |
| 개발자 4 | P1 toolbar stability | P1 canvas productivity | viewport/keyboard QA |
| 개발자 5 | P1 quality recovery | P1 outcome flow | 최종 journey E2E |

각 branch에는 한 명의 merge owner만 둔다. 다른 개발자의 도움이 필요하면 독립적인 test 또는 pure model commit을 전달하되 같은 대형 파일을 동시에 수정하지 않는다.

---

# 7. P0-1: Viewer 개인 리허설 소유권

브랜치: feature/p0-viewer-rehearsal-ownership

## 목표

accepted Owner/Editor/Viewer가 개인 리허설을 생성할 수 있게 하되, Run·report·audio·snapshot을 생성자 단위로 격리한다. 일반 project asset 권한은 완화하지 않는다.

## VR-01. 권한 계약과 Shared schema 고정

예상: 1.5시간, M

설명:

- docs/contracts.md에 creator-only Run 정책, private asset ownership, 404 정책, legacy backfill을 먼저 기록한다.
- RehearsalRun에 required additive field createdByUserId를 추가한다.

Acceptance:

- [ ] createdByUserId가 없는 신규 Run response는 schema parse에 실패한다.
- [ ] owner/editor/viewer 모두 자기 Run만 읽고 수정한다는 계약이 문서화된다.
- [ ] raw audio, transcript, script와 signed URL의 로그 금지 원칙이 유지된다.

파일:

- docs/contracts.md
- packages/shared/src/rehearsals/rehearsal.schema.ts
- packages/shared/src/rehearsals/rehearsal.schema.test.ts
- 관련 shared fixture

검증:

~~~bash
pnpm --filter @orbit/shared test
pnpm --filter @orbit/shared build
~~~

의존성: 없음

## VR-02. Ownership migration과 entity

예상: 2시간, M

설명:

- rehearsal_runs.created_by_user_id를 추가한다.
- project_assets.created_by_user_id를 nullable로 추가하되 rehearsal-audio와 rehearsal-slide-snapshot에는 필수로 만든다.
- 기존 Run과 private asset은 projects.created_by로 backfill한다.

Acceptance:

- [ ] 기존 row가 있는 DB에서 up migration이 성공한다.
- [ ] rehearsal_runs creator는 NOT NULL이며 users.user_id FK를 가진다.
- [ ] private rehearsal asset에는 creator가 반드시 존재한다.
- [ ] down migration이 index, constraint, column을 역순으로 제거한다.

권장 index:

- rehearsal_runs(project_id, created_by_user_id, created_at DESC)
- project_assets(project_id, created_by_user_id, purpose, status)

파일:

- apps/api/src/database/migrations/<next>-AddRehearsalOwnership.ts
- 해당 migration spec
- apps/api/src/rehearsals/rehearsal-run.entity.ts
- apps/api/src/files/project-asset.entity.ts
- migration 등록 파일이 명시적인 경우 data-source

검증:

~~~bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
pnpm db:migration:run
~~~

의존성: VR-01

## VR-03. Asset actor 기록과 private upload guard

예상: 2시간, M

설명:

- FilesService.createUploadUrl에 actorUserId를 필수로 전달한다.
- 일반 asset은 기존 project write 권한을 유지한다.
- Viewer는 본인 pending rehearsal-audio 또는 rehearsal-slide-snapshot에 한해 local proxy PUT을 사용할 수 있다.

Acceptance:

- [ ] Viewer가 일반 image/reference asset upload를 만들 수 없다.
- [ ] Viewer A가 Viewer B의 fileId 또는 upload target을 사용할 수 없다.
- [ ] private asset이 generic list/content API에 나타나지 않는다.

파일:

- apps/api/src/files/files.controller.ts
- apps/api/src/files/files.service.ts
- apps/api/src/files/files.controller.spec.ts
- apps/api/src/files/files.service.spec.ts

검증:

~~~bash
pnpm --filter @orbit/api test -- files.controller.spec.ts
pnpm --filter @orbit/api test -- files.service.spec.ts
~~~

의존성: VR-02

## VR-04. Run 생성자 기록과 canonical ownership guard

예상: 2시간, M

설명:

- Run 생성은 assertCanWriteProject 대신 accepted membership read 권한을 사용한다.
- controller가 actorUserId를 service로 전달한다.
- 사용자 요청 경계에서 getOwnedRun(runId, actorUserId)를 단일 canonical helper로 사용한다.

Acceptance:

- [ ] accepted Viewer가 full/delivery-only Run을 생성할 수 있다.
- [ ] pending/non-member는 생성할 수 없다.
- [ ] 다른 사용자의 runId는 read/write 모두 404다.

적용 endpoint:

- create
- get/report
- cancel/retry/meta
- audio upload-url/complete

파일:

- apps/api/src/rehearsals/rehearsals.controller.ts
- apps/api/src/rehearsals/rehearsals.service.ts
- apps/api/src/rehearsals/rehearsals.controller.spec.ts
- apps/api/src/rehearsals/rehearsals.service.spec.ts

검증:

~~~bash
pnpm --filter @orbit/api test -- rehearsals.controller.spec.ts
pnpm --filter @orbit/api test -- rehearsals.service.spec.ts
~~~

의존성: VR-01, VR-02

## VR-05. List·summary·comparison creator scope

예상: 2시간, M

설명:

- 역할과 관계없이 list, summary, report, comparison은 actor creator scope로 제한한다.
- comparison의 이전 Run도 같은 createdByUserId만 사용한다.

Acceptance:

- [ ] Owner/Editor도 다른 사용자의 Run 존재를 확인할 수 없다.
- [ ] 사용자 A의 summary와 trend에 사용자 B의 측정값이 섞이지 않는다.
- [ ] 본인 이전 Run이 없으면 cross-user baseline을 사용하지 않는다.

파일:

- apps/api/src/rehearsals/rehearsals.service.ts
- apps/api/src/rehearsals/rehearsal-run-comparison.ts
- 관련 service/comparison spec

검증:

~~~bash
pnpm --filter @orbit/api test -- rehearsals.service.spec.ts
pnpm --filter @orbit/api test -- rehearsal-run-comparison.spec.ts
~~~

의존성: VR-04

## VR-06. Viewer audio·snapshot 전체 flow

예상: 2시간, M

설명:

- rehearsal 전용 audio와 slide snapshot을 actor 소유로 발급한다.
- create Run의 slideSnapshots가 같은 project, purpose, actor 소유인지 검증한다.
- generic project upload 권한은 열지 않는다.

Acceptance:

- [ ] Viewer가 본인 snapshot 준비 → Run 생성 → audio upload → complete까지 성공한다.
- [ ] 다른 사용자의 snapshot 또는 audio를 자기 Run에 연결할 수 없다.
- [ ] snapshot 실패가 가짜 성공으로 처리되지 않고 복구 action을 제공한다.

파일:

- apps/api/src/rehearsals/rehearsals.service.ts
- apps/api/src/files/files.service.ts
- apps/web/src/features/rehearsal/RehearsalWorkspace.tsx 또는 rehearsal upload adapter
- 관련 API/Web tests

검증:

~~~bash
pnpm --filter @orbit/api test -- rehearsals.service.spec.ts
pnpm --filter @orbit/web test -- RehearsalWorkspace.test.tsx
~~~

의존성: VR-03, VR-04

## VR-07. Security·migration 통합 gate

예상: 2시간, M

Acceptance:

- [ ] Viewer A full Run 생성, snapshot/audio, report가 성공한다.
- [ ] Owner, Editor, Viewer B가 Viewer A의 Run과 private asset을 404로 받는다.
- [ ] Job payload와 log에 audio URL/key/bytes, transcript, script가 없다.
- [ ] rawAudioDeletedAt과 기존 audio cleanup이 유지된다.

검증:

~~~bash
pnpm test:coaching:migrations
pnpm test:coaching:integration
pnpm --filter @orbit/api typecheck
pnpm --filter @orbit/api test
pnpm --filter @orbit/web test
~~~

의존성: VR-01~VR-06

권장 atomic commit:

1. docs: 개인 리허설 소유권 계약 명시
2. test: Run과 private asset 소유권 회귀 조건 추가
3. feat: 리허설 Run 생성자 migration 추가
4. feat: private asset 생성자와 upload guard 추가
5. fix: Run 조회와 변경을 생성자 범위로 제한
6. test: Viewer 개인 리허설 통합 시나리오 추가

---

# 8. P0-2: Editor 신뢰와 Read-only

브랜치: fix/p0-editor-trust

## ET-01. 역할 capability model

예상: 1시간, S

Acceptance:

- [ ] owner/editor/viewer를 명시적 capability object로 변환한다.
- [ ] 알 수 없는 역할과 미승인 membership은 fail-closed다.
- [ ] Viewer는 canStartPersonalRehearsal만 허용되고 mutation capability는 모두 false다.

파일:

- apps/web/src/features/editor/shell/editorCapabilities.ts
- editorCapabilities.test.ts

검증:

~~~bash
pnpm --filter @orbit/web exec vitest run src/features/editor/shell/editorCapabilities.test.ts
~~~

## ET-02. ProjectAccessGate와 직접 route 보호

예상: 1.5시간, M

Acceptance:

- [ ] Editor, Brief, History, Rehearsal이 동일 membership role을 사용한다.
- [ ] pending/non-member는 URL 직접 접근으로 우회할 수 없다.
- [ ] Viewer에게 presentation session 생성 route/action이 없다.

파일:

- apps/web/src/App.tsx
- 신규 ProjectAccessContext 또는 render-prop model
- App route test

검증:

~~~bash
pnpm --filter @orbit/web test -- App.test.tsx
~~~

의존성: ET-01, VR branch API 계약

## ET-03. Deck query result 분리

예상: 1.5시간, M

Acceptance:

- [ ] 200, 404 missing, 401/403, 500, network error를 구분한다.
- [ ] GET 404만으로 PUT이 발생하지 않는다.
- [ ] non-404 오류를 빈 Deck으로 오인하지 않는다.

파일:

- apps/web/src/features/editor/shell/api 또는 EditorShell query adapter
- EditorShell.test.tsx

## ET-04. 실제 Deck만 mount하는 load boundary

예상: 2시간, M

Acceptance:

- [ ] loading/error/missing에서 demo slide와 Canvas가 렌더링되지 않는다.
- [ ] 오류 상태는 다시 시도와 프로젝트로 돌아가기를 제공한다.
- [ ] 실제 Deck이 없을 때 WebSocket/autosave/mutation hook이 시작되지 않는다.

파일:

- apps/web/src/features/editor/shell/EditorShell.tsx
- components/EditorStateNotice.tsx
- 전용 CSS
- EditorShell.test.tsx

의존성: ET-03

## ET-05. 명시적인 첫 slide 생성

예상: 1.5시간, M

Acceptance:

- [ ] Owner/Editor만 "첫 슬라이드 만들기" CTA를 본다.
- [ ] 클릭 후 생성 요청은 정확히 한 번 발생한다.
- [ ] Viewer는 "아직 발표 자료가 없습니다" read-only empty state만 본다.
- [ ] 동시 생성 충돌은 refetch로 수렴한다.

파일:

- ProjectAssetWorkspace의 초기 Deck factory
- 신규 projectDeckFactory.ts
- EditorShell.tsx
- 관련 tests

의존성: ET-03, ET-04

## ET-06. 중앙 mutation guard

예상: 1.5시간, M

Acceptance:

- [ ] Viewer의 keyboard, drag, hidden callback이 patch를 만들지 않는다.
- [ ] EditorCanvas에 disableInteractions가 연결된다.
- [ ] save, import, AI apply, version restore도 capability guard를 통과한다.

파일:

- EditorShell.tsx
- EditorCanvas 호출부
- EditorShell.test.tsx

의존성: ET-01

## ET-07. Viewer 화면과 발표자 메모

예상: 2시간, M

Acceptance:

- [ ] Viewer 화면에 편집, 공유, export, AI mutation, session 생성 control이 없다.
- [ ] 발표자 메모와 Brief는 읽을 수 있지만 input/PATCH가 없다.
- [ ] History restore action은 없다.
- [ ] read-only 이유가 상단 banner로 보인다.

파일:

- EditorShell.tsx
- AiChatPanel.tsx
- PresentationBriefPage.tsx
- DeckVersionHistoryPage.tsx
- 관련 tests

의존성: ET-01, ET-02, ET-06

## ET-08. Viewer 개인 리허설 진입

예상: 1.5시간, M

Acceptance:

- [ ] Viewer 진입 전 Deck PUT은 발생하지 않는다.
- [ ] snapshot/audio는 VR branch의 creator-owned 경로를 사용한다.
- [ ] Owner/Editor의 기존 save flush 경로는 유지된다.

파일:

- EditorShell.tsx
- RehearsalWorkspace.tsx 또는 navigation adapter
- 관련 tests

의존성: VR branch

## ET-09. No-op과 미지원 control 제거

예상: 1.5시간, M

제거 대상:

- handler 없는 새 프레젠테이션과 이름 변경
- resize/edit mode/quick edit
- PDF/PNG/JSON export
- handler 없는 template
- production presence test modal

Acceptance:

- [ ] handler 없는 interactive element가 없다.
- [ ] production menu에 "준비 중" export가 없다.
- [ ] PPTX import/save/export처럼 실제 지원하는 action만 남는다.

파일:

- EditorShell.tsx
- editorShellUiStore.ts
- shell/store tests

## ET-10. 저장·오류 feedback

예상: 1.5시간, M

Acceptance:

- [ ] 저장 중, 모두 저장됨, 저장 실패, 최근 저장 시각이 항상 읽힌다.
- [ ] 실패 후 retry가 동일 pending 변경을 저장한다.
- [ ] save metadata가 CSS로 숨겨지지 않는다.
- [ ] 오류는 aria-live 또는 role=alert로 전달된다.

파일:

- EditorSaveControl.tsx
- persistence state hook
- editor shell CSS
- tests

## ET-11. Branch E2E

예상: 2시간, M

시나리오:

- pending/500에서 demo 미노출
- 404 Owner CTA와 Viewer empty state
- Viewer mutation request 0회
- Viewer notes/Brief/History read-only
- save fail → retry
- Viewer creator-owned rehearsal 진입

파일:

- tests/e2e/editor-access-trust.spec.ts
- authenticatedProject fixture

권장 atomic commit:

1. test: 편집 권한과 Deck load 실패 회귀 조건 추가
2. fix: 프로젝트 역할을 editor capability로 연결
3. fix: demo fallback을 실제 오류·빈 상태로 교체
4. fix: Viewer mutation 경로를 중앙에서 차단
5. fix: 미지원 editor control 노출 제거
6. fix: 저장 실패와 재시도 상태를 명확히 표시

---

# 9. P0-3: Slide rail 생산성

브랜치: feature/p0-slide-rail

## SR-01. Delete·reorder core patch

예상: 1.5시간, M

Acceptance:

- [ ] 마지막 한 장 삭제를 core에서 거부한다.
- [ ] 삭제/reorder 후 order가 1..N으로 정규화된다.
- [ ] 누락·중복·알 수 없는 slide ID 입력을 거부한다.

파일:

- packages/editor-core/src/patches/slideOperations.ts
- slideOperations.test.ts

## SR-02. Reference-safe duplicate

예상: 2시간, M

Acceptance:

- [ ] 복제본은 원본 바로 다음에 생성된다.
- [ ] slide, element, animation, keyword, action, semantic cue, group 내부 ID와 reference가 remap된다.
- [ ] 복제본 내부가 원본의 local ID를 가리키지 않는다.
- [ ] 적용 결과가 deckSchema를 통과한다.

파일:

- slideOperations.ts
- reference-rich fixture
- slideOperations.test.ts

위험: 단순 JSON deep clone은 action/keyword/semantic reference를 원본에 연결할 수 있다.

## SR-03. SlideRail view model

예상: 1시간, S

Acceptance:

- [ ] selection을 index가 아니라 slideId로 추적한다.
- [ ] 삭제 후 다음 slide, 마지막 삭제 시 이전 slide를 선택한다.
- [ ] list mode title fallback이 "슬라이드 N"으로 안정적이다.

파일:

- slideRailModel.ts
- slideRailModel.test.ts

## SR-04. 접근 가능한 SlideRail component

예상: 2시간, M

Acceptance:

- [ ] slide 선택 button과 menu button이 nested button 없이 분리된다.
- [ ] aria-current/aria-selected, roving tabIndex, focus ring을 제공한다.
- [ ] Viewer에게 add/menu/drag handle이 나타나지 않는다.
- [ ] thumbnail/list mode 모두 slide title을 식별할 수 있다.

파일:

- components/SlideRail.tsx
- SlideRail.test.tsx
- slide-rail.css
- EditorShell rail 삽입부

의존성: SR-03, editor trust capability

## SR-05. 복제·삭제와 Undo toast

예상: 2시간, M

Acceptance:

- [ ] 복제본 제목은 "원본 제목 복사본"이며 즉시 선택된다.
- [ ] 삭제는 confirm 없이 즉시 실행된다.
- [ ] Undo toast의 실행 취소가 기존 undo stack 한 번으로 복구한다.
- [ ] 마지막 한 장의 삭제 action은 disabled다.

파일:

- SlideRail.tsx
- EditorUndoToast.tsx
- 관련 tests/CSS
- EditorShell의 patch adapter

의존성: SR-01, SR-02, SR-04

## SR-06. Keyboard reorder

예상: 1.5시간, M

Acceptance:

- [ ] ArrowUp/Down, Home/End로 탐색한다.
- [ ] menu의 위로/아래로 이동만으로 모든 reorder가 가능하다.
- [ ] 경계에서는 이동 action이 disabled이고 focus가 유지된다.

파일:

- SlideRail.tsx
- SlideRail.test.tsx

## SR-07. Pointer drag reorder

예상: 2시간, M

Acceptance:

- [ ] 위·아래 drag에 삽입 indicator가 나타난다.
- [ ] drop은 reorder patch를 한 번만 commit한다.
- [ ] cancel은 mutation을 만들지 않고 선택 slide를 유지한다.

파일:

- SlideRail.tsx
- slideRailDragModel.ts
- tests/CSS

## SR-08. Notes·thumbnail·autosave integration

예상: 1.5시간, M

Acceptance:

- [ ] reorder 후 speaker notes draft가 다른 slide에 붙지 않는다.
- [ ] 복제본 thumbnail은 무효화되어 다시 생성된다.
- [ ] 복제·삭제·재정렬 결과가 reload 후 동일하다.

파일:

- EditorShell.tsx
- slide action hook
- EditorShell.test.tsx

## SR-09. Persistence E2E

예상: 2시간, M

시나리오:

- 복제 → 제목/위치 → reload
- 삭제 → Undo → reload
- drag reorder → reload
- keyboard reorder → reload
- Viewer rail 탐색만 허용

파일:

- tests/e2e/editor-slide-rail.spec.ts

권장 atomic commit:

1. test: slide 복제 삭제 재정렬 core 조건 추가
2. feat: reference-safe slide patch helper 추가
3. feat: 접근 가능한 SlideRail component 추가
4. feat: slide menu와 Undo 연결
5. feat: drag와 keyboard reorder 추가
6. test: slide rail 저장 지속성 E2E 추가

---

# 10. P1-1: Toolbar 안정화

브랜치: fix/p1-toolbar-stability

## TS-01. Selection inspector model

예상: 1시간, S

Acceptance:

- [ ] 선택 없음, 단일, 다중을 slide/element/multi mode로 반환한다.
- [ ] desktop canvas selection만 Design inspector 자동 전환을 지시한다.
- [ ] compact와 validation-origin selection은 panel을 강제로 열지 않는다.

파일:

- selectionInspectorModel.ts
- selectionInspectorModel.test.ts

## TS-02. SelectionInspector component

예상: 1.5시간, M

Acceptance:

- [ ] 기존 SelectionQuickBar와 MultiSelectionQuickBar를 inspector에서 재사용한다.
- [ ] Viewer는 선택 정보를 읽을 수 있지만 property input을 보지 않는다.
- [ ] 현재 선택에 accessible name을 제공한다.

파일:

- components/SelectionInspector.tsx
- SelectionInspector.test.tsx
- SelectionQuickBar.tsx
- MultiSelectionQuickBar.tsx

## TS-03. Shell wiring

예상: 1.5시간, M

Acceptance:

- [ ] 상단 selection property row를 제거한다.
- [ ] desktop canvas selection은 Design tab을 연다.
- [ ] validation-origin selection은 AI 검사 tab을 유지한다.

파일:

- EditorShell.tsx
- EditorShell.test.tsx

의존성: TS-01, TS-02

## TS-04. 고정 toolbar layout

예상: 1.5시간, M

Acceptance:

- [ ] selection과 무관하게 toolbar와 grid row 높이가 고정된다.
- [ ] 선택 전후 stage Y 좌표 차이가 1px 이하다.
- [ ] slide rail, canvas, inspector 시작선이 일치한다.

파일:

- editor-shell.css
- editor-design-system-boundary.test.ts

## TS-05. Compact inspector action

예상: 1시간, S

Acceptance:

- [ ] 860px 이하에서 selection만으로 panel을 덮어씌우지 않는다.
- [ ] "선택 항목 속성 열기"와 선택 개수를 제공한다.
- [ ] coarse pointer trigger는 최소 44×44px다.

## TS-06. Browser 검증

예상: 2시간, M

검증 viewport:

- 1440×900
- 1024×768
- 768×1024
- 390×844

Acceptance:

- [ ] 선택 전후 layout shift가 없다.
- [ ] keyboard-only inspector 진입과 복귀가 가능하다.
- [ ] axe critical/serious와 horizontal document overflow가 0이다.

파일:

- tests/e2e/editor-toolbar-stability.spec.ts

---

# 11. P1-2: Canvas 생산성

브랜치: feature/p1-canvas-productivity

필수 선행: Toolbar stability

## CP-01. Zoom state model

예상: 1.5시간, M

Acceptance:

- [ ] 기본 mode는 fit이고 manual zoom은 25–200%다.
- [ ] Fit은 viewport 변화에 재계산되며 작은 화면의 기존 최소 scale을 유지한다.
- [ ] project별 manual zoom을 sessionStorage에 저장하고 잘못된 값은 fit으로 복구한다.

파일:

- editorZoom.ts
- editorZoom.test.ts

## CP-02. Zoom control

예상: 1.5시간, M

Acceptance:

- [ ] 축소, 현재 배율, 확대, Fit, 100%를 고정 toolbar에 제공한다.
- [ ] icon control에 accessible name과 boundary disabled state가 있다.
- [ ] coarse pointer에서는 최소 44×44px다.

파일:

- components/EditorZoomControl.tsx
- EditorZoomControl.test.tsx
- 전용 CSS

## CP-03. Stage zoom과 scroll

예상: 1.5시간, M

Acceptance:

- [ ] zoom은 DeckPatch와 autosave를 만들지 않는다.
- [ ] 100–200%에서 canvas 모든 영역에 내부 scroll로 접근한다.
- [ ] Fit 전환 시 canvas가 viewport 중앙으로 복귀한다.

파일:

- EditorShell.tsx
- editor shell CSS
- EditorShell.test.tsx

## CP-04. Selection nudge patch

예상: 2시간, M

Acceptance:

- [ ] 단일·다중 이동이 하나의 patch와 undo entry가 된다.
- [ ] group/child 중복 operation을 만들지 않는다.
- [ ] locked element와 canvas boundary를 안전하게 처리한다.

파일:

- utils/selectionNudge.ts
- selectionNudge.test.ts

## CP-05. Keyboard suppression policy

예상: 1시간, S

Acceptance:

- [ ] input, textarea, select, contenteditable, dialog, menu에서 canvas command가 실행되지 않는다.
- [ ] inline text/custom shape 편집 중 mutation shortcut이 실행되지 않는다.
- [ ] Viewer mutation command가 patch를 만들지 않는다.

파일:

- editorKeyboardCommands.ts
- editorKeyboardCommands.test.ts

## CP-06. Command wiring

예상: 1.5시간, M

Acceptance:

- [ ] Arrow는 1px, Shift+Arrow는 10px 이동한다.
- [ ] Cmd/Ctrl+S는 Owner/Editor save만 실행하고 browser dialog를 막는다.
- [ ] PageUp/PageDown은 역할과 관계없이 slide를 이동한다.

파일:

- EditorShell.tsx
- EditorShell.test.tsx

## CP-07. Browser 검증

예상: 2시간, M

시나리오:

- 100% → 200% → Fit과 내부 scroll
- nudge → undo → redo
- input focus suppression
- PageDown과 Cmd/Ctrl+S
- Viewer zoom/navigation과 mutation 차단

파일:

- tests/e2e/editor-canvas-productivity.spec.ts

---

# 12. P1-3: AI 품질 Recovery

브랜치: feature/p1-quality-recovery

## QR-01. Validation target view model

예상: 1.5시간, M

Acceptance:

- [ ] raw ID 대신 "3번 슬라이드 · 제목 텍스트" 형태의 label을 만든다.
- [ ] overlap의 복수 element label을 만든다.
- [ ] 없는 reference는 crash 없이 "대상을 찾을 수 없음"을 반환한다.

파일:

- validationPresentation.ts
- validationPresentation.test.ts
- editorValidation.ts

## QR-02. Accessible Validation item

예상: 1.5시간, M

Acceptance:

- [ ] 각 경고에 독립적인 target button이 있고 nested button이 없다.
- [ ] hover와 keyboard focus에서 관련 canvas element를 highlight한다.
- [ ] production UI에 raw element ID가 나타나지 않는다.

파일:

- ValidationPanel.tsx
- ValidationPanel.test.tsx
- 전용 CSS

## QR-03. Click-to-focus

예상: 1.5시간, M

Acceptance:

- [ ] 경고 click은 해당 slide와 단일/복수 객체를 선택한다.
- [ ] AI 검사 tab을 유지한다.
- [ ] dirty speaker notes의 기존 discard 정책을 우회하지 않는다.

파일:

- EditorShell.tsx
- EditorShell.test.tsx

## QR-04. textOverflow 전용 safe repair

예상: 2시간, M

Acceptance:

- [ ] 자동수정 allowlist는 issue === "textOverflow" 하나다.
- [ ] role별 최소 font size를 위반하지 않는 후보만 적용한다.
- [ ] 적용 뒤 overflow가 사라지고 새로운 risk가 생기지 않는 후보만 채택한다.
- [ ] 복수 수정은 한 patch와 한 undo entry다.

파일:

- safeTextOverflowRepair.ts
- safeTextOverflowRepair.test.ts
- editorValidation.ts
- patch adapter

## QR-05. Repair feedback와 Undo

예상: 1시간, S

Acceptance:

- [ ] "텍스트 넘침 3개 안전 수정"처럼 대상 수를 표시한다.
- [ ] 적용 결과를 aria-live로 알린다.
- [ ] undo 한 번으로 전체 자동수정 전 상태를 복구한다.
- [ ] Viewer에게 mutation action이 없다.

## QR-06. Overlap·grid 수동 안내

예상: 1시간, S

Acceptance:

- [ ] overlap은 관련 객체를 모두 선택하고 이동/크기 조정 안내를 제공한다.
- [ ] grid는 12열·8px 기준의 구체적 안내를 제공한다.
- [ ] 두 유형은 "모두 적용"에 포함되지 않는다.

## QR-07. Browser 검증

예상: 2시간, M

시나리오:

- overflow/overlap/grid fixture의 label과 focus
- Owner/Editor overflow fix와 undo
- Viewer read-only 검사
- keyboard-only와 네 viewport

파일:

- tests/e2e/editor-quality-recovery.spec.ts

---

# 13. P1-4: Presentation outcome flow

브랜치: feature/p1-outcome-flow

완료율 숫자는 사용하지 않는다. 신뢰할 수 있는 rehearsal completion 공통 상태가 없으므로 action 중심 "발표 준비 경로"를 제공한다.

## OF-01. Journey state model

예상: 1.5시간, M

Acceptance:

- [ ] Brief 상태, 전체 Deck warning/risk 수, save 상태, role capability를 pure view model로 변환한다.
- [ ] Owner/Editor와 Viewer에 다른 action set을 반환한다.
- [ ] Viewer는 개인 리허설만 시작할 수 있고 발표 session mutation은 없다.

파일:

- presentationJourney.ts
- presentationJourney.test.ts

## OF-02. PresentationJourneyPanel

예상: 1.5시간, M

Acceptance:

- [ ] nav aria-label="발표 준비 경로"를 제공한다.
- [ ] Brief, 검사, 리허설, 발표 순서를 text와 status로 표시한다.
- [ ] 304px inspector와 390px compact에서 action이 잘리지 않는다.

파일:

- components/PresentationJourneyPanel.tsx
- PresentationJourneyPanel.test.tsx
- 전용 CSS

## OF-03. Brief role 연결

예상: 2시간, M

Acceptance:

- [ ] 기존 presentation-brief query key를 재사용한다.
- [ ] Owner/Editor는 편집, Viewer는 read-only다.
- [ ] Brief missing/error에서도 journey 전체가 사라지지 않는다.

파일:

- EditorShell.tsx
- PresentationBriefPage.tsx
- presentationBriefApi.ts
- 관련 tests

의존성: Editor trust

## OF-04. 전체 Deck 품질 단계

예상: 1시간, S

Acceptance:

- [ ] deck.version 기준으로 전체 validation count를 계산한다.
- [ ] 검사 action은 AI panel의 검사 영역을 연다.
- [ ] Viewer는 focus만 가능하고 safe repair는 불가능하다.

의존성: Quality recovery

## OF-05. Save flush 후 route 전환

예상: 2시간, M

Acceptance:

- [ ] Owner/Editor는 pending change 저장 뒤 Brief/Rehearsal/Presentation으로 이동한다.
- [ ] save 실패·version conflict에서는 editor에 남고 recovery message를 표시한다.
- [ ] 연속 click이 duplicate save/snapshot/navigation을 만들지 않는다.

파일:

- presentationJourneyNavigation.ts
- presentationJourneyNavigation.test.ts
- EditorShell.tsx

## OF-06. Creator-owned 개인 리허설 연결

예상: 1.5시간, M

Acceptance:

- [ ] Viewer action은 자기 creator ownership이 기록되는 Run 경로를 사용한다.
- [ ] Viewer는 Deck write를 만들지 않는다.
- [ ] audio와 snapshot은 viewer 본인 private asset 경로를 사용한다.
- [ ] Owner/Editor도 자기 Run만 조회한다.

파일:

- EditorShell.tsx
- RehearsalWorkspace.tsx
- rehearsal API client/tests

의존성: Viewer rehearsal ownership, Editor trust

## OF-07. Journey E2E

예상: 2시간, M

시나리오:

- Owner/Editor Brief 저장 → 검사 → 리허설 → 발표
- Viewer Brief read-only → 검사 read-only → 개인 리허설
- Viewer 발표 session action 부재
- 다른 사용자의 Run/report가 journey에 나타나지 않음

파일:

- tests/e2e/editor-outcome-flow.spec.ts
- authenticatedProject fixture

---

# 14. 공통 접근성·Responsive DoD

별도 branch로 분리하지 않고 각 PR의 acceptance에 포함한다.

- [ ] desktop utility control은 공식 compact 크기를 사용한다.
- [ ] coarse pointer action은 44×44px 이상이다.
- [ ] keyboard focus가 모든 menu, rail, inspector, zoom, validation action에서 보인다.
- [ ] menu는 focus 이동, Escape, arrow navigation을 제공한다.
- [ ] role, aria-selected/current/pressed/checked가 실제 상태와 일치한다.
- [ ] 1440×900, 1024×768, 768×1024, 390×844에서 핵심 action이 사라지지 않는다.
- [ ] axe critical/serious 위반과 horizontal document overflow가 0이다.

# 15. EditorShell 충돌 방지

EditorShell.tsx와 editor-shell.css는 모든 branch의 최고 위험 파일이다.

강제 규칙:

1. 공유 파일 전체 포맷팅과 이동을 하지 않는다.
2. 새 UI는 별도 component, pure model, hook, CSS module/전용 stylesheet로 만든다.
3. 각 branch의 EditorShell 수정 구간을 제한한다.
4. shell integration commit은 branch 마지막에 하나만 둔다.
5. editor-shell.css에는 import 또는 필요한 최소 rule만 추가한다.

소유 구간:

| Branch | EditorShell 소유 구간 |
| --- | --- |
| Editor trust | query, permission, file menu, central mutation guard |
| Slide rail | rail JSX와 action adapter |
| Toolbar | stage top controls와 Design inspector |
| Canvas | scale state와 keyboard command wiring |
| Quality | AI validation panel wiring |
| Outcome | journey panel과 navigation adapter |

# 16. PR·Commit 규칙

- PR base는 develop이다.
- PR 제목, 본문, review summary, inline comment는 한국어로 작성한다.
- 이미 push한 공유 branch에는 rebase/force push하지 않는다.
- 선행 PR merge 후 git merge origin/develop을 사용한다.
- 하나의 commit은 하나의 논리 변경만 포함한다.
- behavior change와 formatting/refactor를 섞지 않는다.
- PR이 1,000줄을 넘으면 새로운 기능을 추가하지 않고 slice를 더 줄인다.
- .env, token, cookie, password, raw audio, transcript, presenter script를 diff나 log에 출력하지 않는다.

각 PR 본문:

- 변경 목적과 범위
- 사용자-visible acceptance
- 실행한 테스트와 결과
- 영향 파일과 contract/migration 영향
- 의도적으로 제외한 범위
- UI 변경 전후 캡처
- rollback 위험

# 17. Checkpoint와 병합 Gate

## Gate 1: Viewer ownership

- migration up/down/up
- 자기 Run/audio/snapshot 성공
- cross-user 404
- private asset generic 노출 0

통과 전 Editor trust의 Viewer rehearsal action을 merge하지 않는다.

## Gate 2: Editor trust

- demo fallback 0
- Viewer mutation request 0
- 404 CTA와 save recovery
- Viewer notes/Brief/History read-only

통과 전 Slide rail의 canMutate wiring을 merge하지 않는다.

## Gate 3: Slide rail

- reference ID collision 0
- 마지막 slide 삭제 차단
- undo/autosave/reload
- keyboard와 drag

## Gate 4: Toolbar·Canvas

- selection layout shift 0
- zoom/nudge/shortcut suppression
- Viewer mutation shortcut 0

## Gate 5: Quality

- raw ID 기본 노출 0
- 자동수정은 textOverflow만
- overlap/grid mutation 0
- click-to-focus와 undo

## Gate 6: Outcome

- 역할별 journey
- save flush 실패 시 route 이동 0
- creator-owned rehearsal
- Viewer presentation session action 0

# 18. 검증 명령

Branch-local 빠른 검증:

~~~bash
pnpm --filter @orbit/shared build
pnpm --filter @orbit/shared test
pnpm --filter @orbit/editor-core test
pnpm --filter @orbit/web typecheck
pnpm --filter @orbit/web test
pnpm --filter @orbit/api typecheck
pnpm --filter @orbit/api test
~~~

Migration branch:

~~~bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
pnpm db:migration:run
pnpm test:coaching:migrations
pnpm test:coaching:integration
~~~

PR 전 전체 검증:

~~~bash
pnpm build
pnpm lint
pnpm test
node infra/scripts/check-env.mjs
docker compose config
~~~

기능별 E2E 파일:

- tests/e2e/editor-rehearsal-ownership.spec.ts
- tests/e2e/editor-access-trust.spec.ts
- tests/e2e/editor-slide-rail.spec.ts
- tests/e2e/editor-toolbar-stability.spec.ts
- tests/e2e/editor-canvas-productivity.spec.ts
- tests/e2e/editor-quality-recovery.spec.ts
- tests/e2e/editor-outcome-flow.spec.ts

실행 예:

~~~bash
pnpm test:smoke --grep "rehearsal ownership"
pnpm test:smoke --grep "editor access trust"
pnpm test:smoke --grep "slide rail"
pnpm test:smoke --grep "toolbar stability"
pnpm test:smoke --grep "canvas productivity"
pnpm test:smoke --grep "quality recovery"
pnpm test:smoke --grep "presentation outcome flow"
~~~

# 19. 24시간 운영 Timeline

| 시간 | 작업 | Gate |
| --- | --- | --- |
| 0–1h | fetch, base SHA, migration timestamp, file ownership, acceptance freeze | 착수 승인 |
| 1–8h | 5개 Wave A branch 병렬 구현 | 각 branch unit green |
| 8–12h | ownership security 완성, trust/rail/toolbar/quality integration | Gate 1 |
| 12–16h | ownership→trust→rail 순차 merge, canvas 시작 | Gate 2·3 |
| 16–18h | toolbar→canvas, quality merge 준비, outcome 연결 | Gate 4·5 |
| 18h | Feature freeze | 새 기능 추가 금지 |
| 18–21h | branch별 full CI, role/error/viewport E2E | Release candidate |
| 21–24h | 7개 순차 merge와 detached develop 통합 회귀 | Gate 6 |

CI가 완료되지 않은 PR은 24시간이 지났다는 이유로 merge하지 않는다.

# 20. 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| Legacy Run 실제 생성자 복원 불가 | 기존 Run 귀속 변경 | project creator로 backfill하고 계약/PR에 명시 |
| Viewer upload 권한 과확장 | private data 노출 | private purpose+creator+project+pending 상태를 모두 검사 |
| creator-only 전환 | Owner가 과거 팀 Run을 못 봄 | 사용자 승인 결정으로 문서화하고 cross-user 404 test |
| Duplicate ID 누락 | animation/action 오류 | reference-rich fixture와 deckSchema parse |
| EditorShell merge conflict | 개발 시간 손실 | 별도 component/hook, 소유 구간, shell commit 1개 |
| Zoom과 browser zoom 혼동 | 접근성 저하 | app zoom은 stage 내부, browser 200%도 별도 QA |
| Overlap 자동수정 부작용 | layout 파괴 | 자동수정 금지, focus+수동 안내 |
| Viewer rehearsal snapshot | generic asset 권한 우회 | 전용 private ownership 경로, generic upload 유지 |
| Save flush route race | 변경 유실 | single-flight navigation과 실패 시 현 route 유지 |

# 21. 이번 범위에서 제외

- 실시간 CRDT 공동 편집
- comment/review contract
- 공개 link permission
- Viewer의 PPTX export
- Viewer의 Audience session/QR 생성
- PDF/PNG export
- overlap/grid 자동 재배치
- 완전한 historical visual diff
- Konva/editor-core 재작성
- editor-shell.css 전면 리팩터링

# 22. 최종 Release Definition of Done

- [ ] 7개 PR이 각각 독립적인 acceptance와 rollback 경계를 가진다.
- [ ] 모든 required CI가 green이다.
- [ ] production no-op control이 0개다.
- [ ] loading/error/missing 상태에 demo Deck이 없다.
- [ ] Viewer Deck mutation request가 0개다.
- [ ] 개인 Run/audio/snapshot cross-user 접근이 404다.
- [ ] Audience API에 notes/script/raw audio가 없다.
- [ ] slide CRUD/reorder가 undo/autosave/reload된다.
- [ ] selection layout shift가 없다.
- [ ] zoom/nudge/shortcut이 역할과 focus context를 지킨다.
- [ ] raw validation ID가 기본 UI에 없다.
- [ ] textOverflow만 자동수정된다.
- [ ] 역할별 Brief→검사→리허설→발표 경로가 정확하다.
- [ ] 네 viewport, keyboard, axe critical/serious 0 조건을 통과한다.
- [ ] docs/contracts.md가 실제 권한·ownership 동작과 일치한다.
