# PPTX 가져오기 정합성 실행 Ledger

## 실행 기준

- 최초 workspace: `/Users/donghyunkim/Documents/Orbit`
- 최초 branch: `develop`
- 최초 HEAD: `b0f7cc8d3554462ec20a546fdeccb585d16c1155`
- 최초 상태: `develop...origin/develop`, tracked 수정 4건과 다수의 untracked 사용자 파일이 있는 dirty worktree
- 계획 문서 최초 상태: untracked
- 최초 `origin/develop`: `b0f7cc8d3554462ec20a546fdeccb585d16c1155`
- `TARGET_BRANCH`: `feature/pptx-import-fidelity-speaker-notes`
- 목표 worktree: `/Users/donghyunkim/Documents/Orbit-pptx-import-fidelity-speaker-notes`
- base SHA: `b0f7cc8d3554462ec20a546fdeccb585d16c1155`
- 계획 문서 SHA-256: `fa42713f04907b4b437932887d151f44313789afc440d5db7e2b94aeb22d1411`
- 기준 PPTX: `/Users/donghyunkim/Downloads/07_21_발표본(기술적_챌린지_수정본).pptx`
- 기준 PPTX SHA-256: `96f86a7d7a1fe371738d85e943a6c907f47db75f9328af88ab0ed8d4aa6ec835`
- 원래 dirty worktree 처리: tracked/untracked 사용자 변경을 수정, stash, commit, reset, 삭제하지 않고 별도 sibling worktree를 생성함
- 원격 작업: 시작 절차의 `git fetch origin develop --prune`만 실행했으며 push, GitHub PR 생성, 배포는 수행하지 않음

## 현재 작업 단계

- 단계: 최종 승인 완료
- target branch: `feature/pptx-import-fidelity-speaker-notes`
- 상태: PR0~PR13과 Checkpoint A/B/C를 모두 `--no-ff` merge하고 기능·시각 품질·계약/보안·운영 최종 검증을 통과함

## 완료된 작업과 Commit

| 작업                         | 일반 commit | task branch                        | merge commit | 검증                                                                                   |
| ---------------------------- | ----------- | ---------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| 초기 실행 기준 확인          | `90082d1e`  | `feature/pptx-import-pr0-baseline` | `f3ca2ab3`   | 저장소 규칙, 공통 계약, 구현 계획, commit convention 전체 확인                         |
| PR0 fixture·renderer harness | `bc8ad700`  | `feature/pptx-import-pr0-baseline` | `f3ca2ab3`   | fixture 회귀 테스트, LibreOffice 위험 측정, synthetic/실제 Konva accuracy harness 추가 |
| PR0 기준선 결정              | `6f545bf3`  | `feature/pptx-import-pr0-baseline` | `f3ca2ab3`   | LibreOffice 채택, runtime Konva 기각 및 CI-only 결정 문서화                            |
| PR1 공통 계약                 | `ae837d6f`  | `feature/pptx-import-pr1-contracts` | `38f0eb3e`   | strict request, optional slide mode, notes sidecar와 bounded diagnostics 검증          |
| PR1 계약 문서                 | `57cbd3e1`  | `feature/pptx-import-pr1-contracts` | `38f0eb3e`   | `docs/contracts.md`, shared README와 실행 근거 정합화                                  |
| PR2 notes body import         | `fa9cd147`  | `feature/pptx-import-pr2-notes-import` | `4d6a3b5f` | slide→notesSlide→notesMaster relationship 추적, body-only text와 locator 추출          |
| PR3 notes page renderer       | `3870eccc`  | `feature/pptx-import-pr3-notes-render` | `3da81176` | notes-only PDF, notesSz bounded PNG, count/order proof와 fail-closed diagnostic         |
| PR4 Worker notes 저장         | `8a3b6b84`  | `feature/pptx-import-pr4-worker-notes-assets` | `926d3721` | Deck speakerNotes 보존, preview file ID sidecar 연결과 저장 실패 bounded warning       |
| Checkpoint A 저장 경계        | `c95d6eea`  | `test/pptx-import-checkpoint-a` | `17a02898` | 실제 8 notes 저장·재조회, preview 유무 경계와 Job/sidecar/log privacy 검증              |
| PR5 notes preview API         | `5aa651d4`  | `feature/pptx-import-pr5-notes-preview-api` | `9db79677` | owner/editor 권한, project asset 검증, strict 상태 응답과 public/audience 비노출       |
| PR6 notes preview UI          | `f8652252`  | `feature/pptx-import-pr6-notes-preview-ui` | `facafec4` | imported-only tab, current slide preview, bounded 상태·접근성·비편집 경계              |
| PR7A notes body sync          | `ae45210b`  | `feature/pptx-import-pr7a-notes-body-sync` | `deddc632` | capability v3 targeted body sync, source-preserving style/관계, preview 재생성          |
| PR7B missing notes page       | `bc2a1599`  | `feature/pptx-import-pr7b-notes-part-creation` | `b36c7bc3` | 검증된 notes master 재사용·최소 구조 생성, bounded locator, export/reimport 왕복       |
| Checkpoint B notes E2E        | `17965f7d`  | `test/pptx-import-checkpoint-b` | `25355090` | 실제 8/8 notes·preview, slide 4 문단 경계, 수정 후 digest exact match와 privacy         |
| PR8 import preference         | `42cfc53d`  | `feature/pptx-import-pr8-preference-dialog` | `182f941b` | 선택 전 무동작, 두 정책 전달, legacy default와 unknown enum 거부                     |
| PR9 slide render mode         | `c39868ee`  | `feature/pptx-import-pr9-render-mode` | `f3decd83` | preference·pixel·capability로 mode 결정, snapshot tree 보존과 전체 renderer 일치       |
| PR10 font normalization       | `49142df4`  | `feature/pptx-import-pr10-font-normalization` | `fe51afae` | 명시적 Pretendard alias, unknown 보존·fallback 진단, 실제 browser weight 검증          |
| PR11 effective text style     | `6eba286b`, `411c22e4` | `feature/pptx-import-pr11-effective-text-style` | `526c145d` | slide/layout/master/theme cascade, direct run 보존, spacing·inset·autofit 왕복         |
| PR12 quality regression gate  | `d0669007`, `98a8bf66` | `feature/pptx-import-pr12-quality-regression-gate` | `3e081ee3` | slide별 진단 panel, 평가 상태 계약, actual pixel/fallback gate 자동화                 |
| Checkpoint C 사용자 시나리오  | `986a72ea` | `test/pptx-import-checkpoint-c` | `45f58e5d` | 실제 두 policy notes digest, preview·round-trip, mode·export·quality 사용자 경계 승인 |
| PR13 asset/security hardening | `fcbcbb79`, `d9d40948` | `feature/pptx-import-pr13-asset-security-hardening` | `0ea9bb9a` | SHA-256 dedupe, bitmap resource limits, ZIP/relationship/active-content 방어             |

## 실행한 검증

| 단계                  | 명령 또는 검사                                                                       | 결과                                                 |
| --------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 초기 상태             | `git status --short --branch`                                                        | 원래 worktree dirty 확인, 신규 worktree clean 확인   |
| 원격 기준             | `git fetch origin develop --prune`                                                   | 성공, `origin/develop` SHA 유지                      |
| 계획 문서             | `shasum -a 256 docs/plans/pptx-import-fidelity-speaker-notes-implementation-plan.md` | 원본과 신규 worktree hash 일치 (`fa4271…1411`)       |
| 기준 PPTX             | `shasum -a 256`                                                                      | SHA-256 기록 완료                                    |
| fixture 회귀          | `pytest tests/test_pptx_ooxml_generation.py -k import_fidelity_fixture`              | 2 passed, 21 deselected                              |
| Python 전체 대상      | `pytest tests/test_pptx_ooxml_generation.py`                                         | 22 passed, 1 skipped                                 |
| Python lint           | `ruff check --no-cache` 대상 테스트·도구 4개                                         | 통과                                                 |
| fixture 결정성        | 생성 전후 `shasum -a 256`                                                            | `8a8f6e…17c0` 동일                                   |
| LibreOffice host      | fixture/실제 기준 cold·warm notes-only export                                        | page 수와 PNG 수 1/1, 8/8 일치                       |
| LibreOffice container | production worker image notes-only export                                            | 8 pages, 1·4·8 page 순서와 한국어 fallback 육안 확인 |
| synthetic Konva       | 계획서 지정 Playwright wrapper + SSIM                                                | 16/16 캡처, 평균 0.9532, gate 10/16                  |
| 실제 기준 Konva       | 8 slides capture + SSIM                                                              | 8/8 캡처, 평균 0.9156, gate 3/8                      |
| merge 후 Python smoke | `pytest tests/test_pptx_ooxml_generation.py -k import_fidelity_fixture`              | 2 passed, 21 deselected                              |
| merge 후 Web smoke    | Playwright wrapper `--grep 16_import_fidelity_notes`                                 | 1 passed                                             |
| PR1 shared test       | `pnpm --filter @orbit/shared test`                                                    | 54 files, 573 tests passed                           |
| PR1 shared build      | `pnpm --filter @orbit/shared build`                                                   | TypeScript build 성공                                |
| PR1 merge smoke       | `pnpm --filter @orbit/shared test`                                                    | 54 files, 573 tests passed                           |
| PR2 RED               | notes body·외부 관계·body 중복 4개 targeted test                                     | 구현 전 4 failed 확인                                |
| PR2 importer test     | `pytest tests/test_pptx_design_importer.py`                                           | 35 passed                                            |
| PR2 generation test   | importer와 OOXML generation 모듈                                                     | 57 passed, 1 skipped                                 |
| PR2 Python 전체       | Python worker 전체 `pytest`                                                          | 789 passed, 1 skipped                                |
| PR2 lint/type         | 변경 Python 파일 `ruff check --no-cache`, importer 2개 `mypy`                        | 모두 통과                                            |
| PR2 실제 notes 비교   | SHA로 식별한 기준 PPTX의 relationship 기반 독립 추출과 importer 결과 비교            | 8/8 exact match, writable 8, warning 0               |
| PR2 merge smoke       | notes 관련 importer·generation test                                                  | 7 passed, 51 deselected                              |
| PR3 RED               | notes rendering 모듈 import와 preview mapping test                                   | 구현 전 collection error 확인                       |
| PR3 generation test   | `pytest tests/test_pptx_ooxml_generation.py`                                         | 29 passed, 1 skipped                                 |
| PR3 generation·sync   | generation과 `test_pptx_ooxml_sync_api.py`                                           | 41 passed                                            |
| PR3 Python 전체       | Python worker 전체 `pytest`                                                          | 797 passed                                           |
| PR3 lint/type         | renderer·generation·test `ruff`, renderer·generation `mypy`                          | 모두 통과                                            |
| PR3 fixture 실렌더    | LibreOffice notes-only export                                                        | 1/1 preview asset 생성                               |
| PR3 실제 실렌더       | 기준 PPTX full generation                                                           | 8/8 rendered, 8/8 asset mapping, package asset 1     |
| PR3 수동 preview      | 기준 파일 notes page 1·4·8                                                          | slide image, body, master 장식, page number 확인     |
| PR3 merge smoke       | generation notes 관련 test                                                          | 8 passed, 22 deselected                              |
| PR4 RED               | Worker notes text 저장과 preview asset 실패 경계 대상 테스트                        | 구현 전 note 공백·Job 실패 확인                     |
| PR4 processor test    | `pnpm exec vitest run src/pptx-ooxml-generation.processor.spec.ts`                  | 9 passed                                             |
| PR4 Worker 전체       | `pnpm --filter @orbit/worker test -- pptx-ooxml-generation.processor.spec.ts`       | 383 passed, 14 skipped                               |
| PR4 Worker lint       | `pnpm --filter @orbit/worker lint`                                                   | TypeScript no-emit 검사 통과                         |
| PR4 Worker build      | `pnpm --filter @orbit/worker... build`                                               | workspace 의존 package와 Worker build 성공          |
| PR4 8-slide mapping   | 8개 synthetic slide의 Deck note와 notes preview file ID 연결                        | body 8/8, preview 8/8, Job result note 원문 0        |
| PR4 merge smoke       | 대상 processor spec                                                                 | 9 passed                                             |
| Checkpoint A 실제 import | 기준 PPTX + Python worker + PostgreSQL opt-in integration                          | 1 passed, 6 skipped                                  |
| Checkpoint A 저장·재조회 | source/imported Deck note를 SHA-256 digest로 비교                                  | 8/8 exact, 원문 출력 0                               |
| Checkpoint A preview  | 정상 asset과 저장 실패 주입 경계                                                     | 정상 8/8 design-asset, 실패 8/8 render-unavailable   |
| Checkpoint A schema   | `deckSchema`, `jobSchema`, `templateBlueprintSchema`, generation result schema      | 모두 통과                                            |
| Checkpoint A privacy  | sidecar·Job result와 Worker lifecycle logger                                        | notes 원문/XML/base64/URL marker 비노출              |
| Checkpoint A 대상     | processor와 Worker lifecycle logger spec                                             | 27 passed                                            |
| Checkpoint A 전체     | Worker 전체 test                                                                     | 384 passed, 15 skipped                               |
| Checkpoint A lint/build | Worker TypeScript lint와 build                                                     | 모두 통과                                            |
| Checkpoint A merge smoke | processor와 Worker lifecycle logger spec                                          | 27 passed                                            |
| PR5 RED                | Shared schema 7개, API service 7개, controller 2개, Web client 2개 대상 test          | 구현 전 의도한 실패 확인                             |
| PR5 Shared 전체        | `pnpm --filter @orbit/shared test`                                                    | 54 files, 580 tests passed                           |
| PR5 API 대상           | controller와 service 직접 Vitest                                                     | 2 files, 66 tests passed                             |
| PR5 public/audience    | community template service와 audience controller 회귀                                | 3 files, 13 tests passed                             |
| PR5 Web 대상           | `deckPersistenceApi.test.ts` 직접 Vitest                                              | 2 tests passed                                       |
| PR5 lint/build         | Shared, API, Web TypeScript lint와 production build                                  | 모두 통과, 기존 Web chunk-size warning만 발생       |
| PR5 merge smoke        | Shared schema, API controller/service, Web API client                                 | 19 + 66 + 2 tests passed                             |
| PR6 RED                | imported tab 2개 실패와 `SpeakerNotesPageTab` 미존재 collection error                 | 구현 전 의도한 실패 확인                             |
| PR6 UI 대상            | `SpeakerNotesPanel`과 `SpeakerNotesPageTab` 직접 Vitest                               | 2 files, 14 tests passed                             |
| PR6 Web 전체           | `pnpm --filter @orbit/web test`                                                       | 289 files, 1,808 tests passed                        |
| PR6 Web lint/build     | TypeScript no-emit과 production Vite build                                            | 통과, 기존 dynamic import·chunk-size warning만 발생 |
| PR6 Chrome 확인        | 임시 local harness의 accessibility tree, image failure, slide switch, console         | focusable tab, stale 전환, 편집 control 0, error/warn 0 |
| PR6 merge smoke        | panel과 notes page view 대상 Vitest                                                   | 14 tests passed                                      |
| PR7A RED                | Python body sync 4개, Shared capability 1개, Worker routing/retry 2개                 | 구현 전 의도한 실패 확인                             |
| PR7A Python 대상        | generation과 sync API pytest                                                          | 46 passed, 기존 deprecation warning만 발생           |
| PR7A Python lint/type   | `ruff check`와 `mypy app`                                                             | 모두 통과                                            |
| PR7A Shared 전체        | `pnpm --filter @orbit/shared test`                                                    | 54 files, 580 tests passed                           |
| PR7A Worker 대상        | `pptx-ooxml-sync.processor.spec.ts`                                                   | 27 passed                                            |
| PR7A Worker 전체        | `pnpm --filter @orbit/worker test`                                                    | 386 passed, 15 skipped                               |
| PR7A Worker lint/build  | TypeScript no-emit과 production Nest build                                            | 모두 통과                                            |
| PR7A integration        | `bash infra/scripts/test-adaptive-coaching-integration.sh`                            | 8 passed, 보호 기준 파일 1 skipped                   |
| PR7A merge smoke        | notes body·style·locator·preview Python 대상                                           | 5 passed                                             |
| PR7B RED                | Python missing notes/master 3개와 API full-save notes diff 1개                        | 구현 전 의도한 실패 확인                             |
| PR7B Python 대상        | OOXML generation과 sync API pytest                                                     | 52 passed, 기존 deprecation warning만 발생           |
| PR7B Python lint/type   | `ruff check`와 `mypy app`                                                              | 모두 통과                                            |
| PR7B Worker 대상        | `pptx-ooxml-sync.processor.spec.ts`                                                    | 30 passed                                            |
| PR7B Worker 전체        | `pnpm --filter @orbit/worker test`                                                     | 389 passed, 15 skipped                               |
| PR7B Worker lint/build  | TypeScript no-emit과 production Nest build                                             | 모두 통과                                            |
| PR7B API 대상           | `decks.service.spec.ts`                                                                | 65 passed                                            |
| PR7B API 전체           | `pnpm --filter @orbit/api test`                                                        | 611 passed, 1 skipped                                |
| PR7B API lint/build     | TypeScript no-emit과 production Nest build                                             | 모두 통과                                            |
| PR7B integration        | `bash infra/scripts/test-adaptive-coaching-integration.sh`                             | 8 passed, 보호 기준 파일 1 skipped                   |
| PR7B LibreOffice open   | 생성 notes page를 notes-only renderer로 재개방                                         | 1/1 notes preview 생성                               |
| PR7B merge smoke        | 생성·master 재사용·unsafe master·LibreOffice Python 대상                               | 4 passed, 36 deselected                              |
| Checkpoint B 기준 hash  | `shasum -a 256`                                                                        | ledger의 `96f86a…c835`와 일치                        |
| Checkpoint B 실제 E2E   | 보호 기준 경로를 주입한 adaptive integration                                            | 9 passed, skip 0                                     |
| Checkpoint B notes      | import·persist·preview·sync·export·reimport                                              | body 8/8, preview 8/8, digest 8/8 exact              |
| Checkpoint B slide 4    | 원본 빈 줄 확인 후 synthetic 편집·reimport                                              | 기존 문단 경계 prefix 보존, 최종 digest exact        |
| Checkpoint B privacy    | Worker audience/log, API·Shared public template 대상                                    | 24 + 10 + 16 = 50 passed                             |
| Checkpoint B lint       | `pnpm --filter @orbit/worker lint`                                                      | TypeScript no-emit 검사 통과                         |
| Checkpoint B merge smoke | import fidelity fixture Python 대상                                                    | 2 passed, 38 deselected                              |
| PR8 RED                | Web 선택 전 무동작과 request body, Worker multipart expectation                      | 구현 전 의도한 2개 실패 확인                        |
| PR8 Web 대상           | hook, dialog, EditorShell, ProjectHub 직접 Vitest                                     | 4 files, 85 tests passed                             |
| PR8 Web 전체           | `pnpm --filter @orbit/web test -- ...`                                                | 290 files, 1,810 tests passed                        |
| PR8 Web lint/build     | TypeScript no-emit과 production Vite build                                            | 통과, 기존 dynamic import·chunk-size warning만 발생 |
| PR8 API 대상           | `pptx-ooxml-generations.service.spec.ts` 직접 Vitest                                  | 11 tests passed                                      |
| PR8 API lint           | TypeScript no-emit                                                                    | 통과                                                 |
| PR8 Job Queue          | `pnpm --filter @orbit/job-queue test`와 build                                         | 29 tests passed, build 통과                          |
| PR8 Worker 전체        | `pnpm --filter @orbit/worker test -- pptx-ooxml-generation.processor.spec.ts`         | 390 passed, 15 skipped                               |
| PR8 Worker lint        | TypeScript no-emit                                                                    | 통과                                                 |
| PR8 Python 대상        | `pytest tests/test_pptx_ooxml_generation.py`                                          | 43 passed, 기존 deprecation warning만 발생           |
| PR8 Python lint/type   | 변경 파일 `ruff check`와 `mypy app`                                                   | 모두 통과                                            |
| PR9 RED                | Worker mode/tree 4개와 Web snapshot/cache/edit policy 3개                              | 구현 전 의도한 7개 실패 확인                         |
| PR9 Worker 대상        | `pptx-ooxml-generation.processor.spec.ts` 직접 Vitest                                  | 15 tests passed                                      |
| PR9 Worker 전체        | `pnpm --filter @orbit/worker test -- pptx-ooxml-generation.processor.spec.ts`          | 394 passed, 15 skipped                               |
| PR9 Web 대상           | read-only, cache, editing policy, rail 직접 Vitest                                     | 5 files, 44 tests passed                             |
| PR9 Web 전체           | `pnpm --filter @orbit/web test -- ReadOnlySlideCanvas.test.tsx slideImageCache.test.ts` | 290 files, 1,817 tests passed                        |
| PR9 lint/build         | Worker/Web TypeScript lint와 production build                                          | 통과, 기존 dynamic import·chunk-size warning만 발생 |
| PR9 accuracy 도구      | preference-pair preparer/scorer `ruff check`                                           | 통과                                                 |
| PR9 preference E2E     | 실제 기준 8 slides × 두 preference Playwright screenshot                              | 16/16 capture passed                                 |
| PR9 appearance 비교    | source render 대비 snapshot SSIM `>= 0.99`                                             | 8/8, slide별 SSIM 모두 1.0                           |
| PR9 editability 비교   | source render 대비 editable/hybrid SSIM `>= 0.95`                                      | 4/8, 기존 CI-only vector fidelity 한계 재확인        |
| PR10 Python 대상       | importer 전체와 import fidelity generation 회귀                                        | 37 passed                                            |
| PR10 Python lint/type  | 변경 Python 파일 `ruff check`, importer `mypy`                                          | 모두 통과                                            |
| PR10 Shared 전체       | `pnpm --filter @orbit/shared test`                                                       | 54 files, 581 tests passed                           |
| PR10 Web 전체          | `pnpm --filter @orbit/web test -- fontAvailability.test.ts fonts.test.ts`               | 291 files, 1,818 tests passed                        |
| PR10 Web lint/build    | TypeScript no-emit과 production Vite build                                              | 통과, 기존 dynamic import·chunk-size warning만 발생 |
| PR10 Chromium          | `document.fonts.load/check` Pretendard 200/500/600/800                                   | 1 passed                                             |
| PR10 실제 기준 font    | 8-slide importer 결과의 family/weight bounded 집계                                      | Pretendard 600 106건, legacy SemiBold alias 0건      |
| PR10 merge smoke       | 명시적 4개 alias와 unknown font 회귀 test                                               | 1 passed                                             |
| PR11 RED               | layout/master style, direct color, autofit과 Web scale·spacing 대상 test                 | 구현 전 의도한 Python 2개, Web 1개 실패 확인        |
| PR11 Shared 전체       | `pnpm --filter @orbit/shared test`와 build                                               | 54 files, 583 tests passed, build 통과               |
| PR11 Python 회귀       | importer, generation, rich text sync, table, motion 7개 모듈                            | 162 passed                                           |
| PR11 Python lint/type  | 변경 Python 파일 `ruff check`, source 3개 `mypy`                                        | 모두 통과                                            |
| PR11 Web 대상          | rich text layout, plain layout, inline overlay, read-only canvas                        | 4 files, 33 tests passed                             |
| PR11 Web 전체          | `pnpm --filter @orbit/web test -- ...`                                                  | 291 files, 1,819 tests passed                        |
| PR11 Web lint/build    | TypeScript no-emit, production build, test-mode screenshot bundle                       | 통과, 기존 dynamic import·chunk-size warning만 발생 |
| PR11 실제 기준 E2E     | 실제 8 slides × 두 preference, bundled Pretendard Chromium screenshot                   | 16/16 capture passed                                 |
| PR11 요청 slide 비교  | slides 1·2·3·6·7 appearance/editability SSIM                                            | appearance 5/5 = 1.0, editable 0.8822~0.9036        |
| PR11 actual style audit | OOXML generation의 원문 없는 bounded metadata                                           | slide 1 title Pretendard bold, size 120, source color, shrink-text |
| PR11 merge smoke       | layout cascade와 direct color 우선순위 targeted test                                    | 1 passed                                             |
| PR12 UI RED            | slide mode/pixel/fallback/font/notes/motion/all warning panel test                       | 구현 전 2 failed, idle 1 passed                      |
| PR12 scorer RED        | pixel/fallback 분리, fallback floor, strict appearance 5개 unit test                     | 구현 전 5 failed                                     |
| PR12 Shared 전체       | `pnpm --filter @orbit/shared test`와 build                                               | 54 files, 584 tests passed, build 통과               |
| PR12 Web 대상          | panel, persisted rehydration, EditorShell                                                | 3 files, 86 tests passed                             |
| PR12 Web 전체          | `pnpm --filter @orbit/web test -- ...`                                                   | 292 files, 1,822 tests passed                        |
| PR12 Web lint/build    | TypeScript no-emit, production build                                                     | 통과, 기존 dynamic import·chunk-size warning만 발생 |
| PR12 Worker 대상       | render mode reconcile processor와 lint                                                   | 15 tests passed, lint 통과                            |
| PR12 Python gate       | scorer unit 5개와 prepare/scorer/test `ruff check`                                       | 5 passed, ruff 통과                                  |
| PR12 실제 기준 E2E     | mode/tree/thumbnail/reason assertion 포함 8 slides × 두 preference                       | 16/16 capture passed                                 |
| PR12 실제 gate         | SSIM threshold와 explicit fallback floor                                                | gate 16/16, pixel 11/16, fallback 5, hard failure 0 |
| PR12 workspace build   | production env를 주입한 `pnpm build`                                                     | 10/10 package build 통과                             |
| PR12 merge smoke       | scorer fallback semantics                                                               | 5 passed                                             |
| Checkpoint C 실제 import | 보호 기준 파일을 `appearance-first`와 `editability-first`로 각각 import               | notes body digest 8/8 동일                           |
| Checkpoint C 실제 E2E  | PostgreSQL·Worker·Python·storage round-trip integration                                   | 2 files, 9 tests passed                              |
| Checkpoint C notes page | 실제 Worker persistence와 sync 후 preview file ID                                         | 최초 8/8, refresh 8/8                                |
| Checkpoint C mode UI   | rail/canvas mode, quality panel, export dialog 대상 Web test                               | 4 files, 18 tests passed                             |
| Checkpoint C export    | imported OOXML PPTX/PNG ZIP export processor test                                          | 11 tests passed                                      |
| PR13 Python 대상       | OOXML generation·importer·sync·package security·resource limit                              | 100 tests passed                                     |
| PR13 Python 전체       | `uv --cache-dir /tmp/orbit-uv-cache run pytest`                                             | 828 passed                                           |
| PR13 Python lint/type  | 전체 `ruff check --no-cache .`, `mypy app`                                                   | 모두 통과, mypy 64 source files                      |
| PR13 Worker 대상       | generation processor content-hash dedupe                                                     | 16 tests passed                                      |
| PR13 Worker 전체       | `pnpm --filter @orbit/worker test`                                                           | 396 passed, 15 skipped                               |
| PR13 Worker lint/build | TypeScript no-emit, dependency와 Worker production build                                    | 모두 통과                                            |
| PR13 실제 성능 전      | PR13 직전 21 MiB 기준 파일 full import                                                       | 14.525s, max RSS 525,926,400 B, asset 50             |
| PR13 실제 성능 후      | PR13 21 MiB 기준 파일 full import                                                            | 14.400s, max RSS 524,173,312 B, asset 45             |
| 최종 workspace build  | `pnpm build`                                                                                  | 10/10 package build 통과                             |
| 최종 workspace lint   | `pnpm lint`                                                                                   | 17/17 task 통과                                      |
| 최종 workspace test   | `pnpm test`                                                                                   | 17/17 task 통과, 기존 opt-in integration만 skip      |
| 최종 환경 계약        | `node infra/scripts/check-env.mjs`                                                            | 통과                                                 |
| 최종 Compose 계약     | `docker compose config --quiet`                                                               | 통과                                                 |
| 최종 Python 전체      | `uv --cache-dir /tmp/orbit-uv-cache run pytest`                                               | 828 passed, 기존 warning 7건                         |
| 최종 Python lint/type | 전체 `ruff check --no-cache .`, `mypy app`                                                    | 모두 통과, mypy 64 source files                      |
| 최종 실제 integration | 보호 기준 파일 + PostgreSQL·Worker·Python·storage 왕복                                       | 2 files, 9 tests passed                              |
| 최종 실제 시각 E2E    | test-mode bundle, 8 slides × 두 preference                                                    | 16/16 capture passed                                 |
| 최종 실제 시각 gate   | source render SSIM와 explicit fallback floor                                                  | gate 16/16, pixel 11/16, fallback 5, hard failure 0 |
| PR13 실제 asset 절감   | generated/storage asset와 decoded bytes                                                      | 50→45, 51,831,177→50,424,674 B                       |

## PR0 Renderer 측정과 결정

### LibreOffice notes-only renderer

- 상태: host fixture 1/1, 실제 기준 8/8, production container 8/8 검증 완료
- 결정: production bounded notes preview 후보로 채택
- 근거: production image에 LibreOffice와 Noto CJK가 이미 있고 실제 기준의 page 수와 순서를 증명함
- 경계: 미설치, timeout, export 실패, page-count mismatch에서 package를 보존하고 `render-unavailable`로 종료

### Runtime Konva candidate renderer

- 상태: synthetic 16개와 실제 기준 8 slides 측정 완료
- 결정: runtime 자동 선택에는 기각, SSIM은 CI-only로 유지
- 근거: 실제 기준 평균 SSIM 0.9156, gate 3/8, 약 10초와 578,781,184 bytes maximum RSS
- 안전 경로: `appearance-first`는 source snapshot, runtime candidate 미평가는 `not-evaluated`로 기록

## 실패 원인과 해결 과정

- 실제 기준 첫 capture는 8-slide/base64 deck을 각 payload에 중복해 약 30MB가 되었고 localStorage 기록 실패로 `Deck render payload missing.`이 발생했다.
- payload를 slide별 단일 deck으로 분리해 1.6~6.6MB로 줄였으나 5MB를 넘는 6~8 slide는 같은 한계가 남았다.
- accuracy E2E 초기화에서 data URL을 동일 바이트 `blob:` URL로 바꿔 localStorage에는 짧은 URL만 저장하도록 보정했다. 이후 8/8 capture가 성공했다.
- sibling worktree의 `node_modules` symlink를 따라간 Pretendard 파일은 Vite serving allow list 밖이라 차단됐다. 앱 코드가 동일한 원본 workspace에서 Vite만 실행해 정상 font 조건으로 측정했다.
- PR1 첫 shared build는 sandbox가 sibling worktree의 `packages/shared/dist` 생성을 막아 `TS5033 EPERM`으로 실패했다. 동일 명령을 승인된 worktree 쓰기 권한으로 재실행해 성공했고 생성한 ignored `dist`와 임시 dependency symlink는 제거한다.
- Target이 없는 notes relationship fixture는 `python-pptx`가 package 로드 단계에서 `InvalidXmlError`로 중단되므로, raw OOXML vector importer 경로에서 fail-closed diagnostic을 검증했다.
- 기준 파일 full generation 첫 실행은 기존 slide renderer가 공유 LibreOffice profile을 사용해 exit 1로 실패했다. slide renderer에도 task별 격리 profile을 적용한 뒤 동일 호출에서 slide와 notes preview가 모두 생성됐다.
- 실제 full generation 중 MuPDF가 PDF structure tree 관련 bounded 경고를 stderr에 냈지만 8 slide·8 notes asset 생성과 package 보존 검증은 통과했다.
- PR4 별도 worktree의 첫 Worker lint는 workspace package의 `dist`가 없어 `Cannot find module '@orbit/shared'` 등으로 실패했다. 원본 worktree 의존성을 임시 연결하고 `pnpm --filter @orbit/worker... build`로 공통 package를 먼저 빌드한 뒤 같은 lint가 통과했다. 임시 링크·복사본·build 산출물은 검증 후 모두 제거했다.
- Checkpoint A Python worker 첫 기동은 필수 ORBIT 환경변수 부재로, 두 번째 기동은 `minio` credential 요구로 startup validation에서 종료됐다. secret을 읽거나 주입하지 않고 공개 example의 비밀 없는 값과 사용하지 않는 `s3` adapter 설정으로 다시 시작해 검증했다.
- Checkpoint A의 첫 PostgreSQL integration은 sandbox가 `127.0.0.1:5432` 연결을 `EPERM`으로 막아 중단됐다. 동일 단일 test를 승인된 로컬 연결 권한으로 재실행해 통과했다.
- Checkpoint A의 첫 Worker 전체 test는 별도 worktree `dist` 쓰기 `EPERM`으로 중단됐다. 동일 명령을 승인된 쓰기 권한으로 재실행해 384 passed, 15 skipped를 확인했다.
- PR5 기존 파일에 실수로 Prettier가 광범위하게 적용됐으나 commit 전 `git diff` hunk를 기준으로 의미 없는 formatting 변경을 모두 되돌리고 기능 변경만 남겼다.
- PR5 API test의 workspace 선행 build는 sibling worktree `dist` 쓰기 `EPERM`으로 처음 중단됐다. 승인된 쓰기 권한으로 재실행해 신규 API test가 통과함을 확인했다.
- 저장소의 `test -- <file>` 스크립트가 file filter를 전달하지 않아 API/Web 전체 suite가 실행됐다. API는 test 전용 필수 환경변수 미설정 5개 suite, Web은 Vite cache unlink `EPERM` 3개 test에서 중단됐지만 신규 대상과 public/audience suite는 직접 Vitest 실행으로 모두 통과시켰다.
- PR5 첫 API lint는 legacy `rendered` sidecar의 `renderAssetFileId`가 optional임을 발견했다. file ID 누락도 `unavailable`로 수렴하는 회귀 test와 guard를 추가한 뒤 lint와 build가 통과했다.
- PR6 첫 Web lint는 임시 dependency 구성에서 `packages/editor-core/node_modules`가 빠져 `@orbit/shared` 해석 실패와 연쇄 implicit-any 오류가 발생했다. editor-core 의존성 링크 하나를 보완한 뒤 동일 lint가 통과했다.
- Chrome DevTools MCP가 구성되지 않아 browser-testing skill의 DevTools 경로를 직접 사용할 수 없었다. 제공된 Chrome control 경로와 commit하지 않는 local harness로 동일 component의 DOM, 접근성, slide 전환, image failure, console을 검증했다.
- PR6 local harness의 Pretendard font는 원본 worktree symlink가 Vite serving allow list 밖이라 server warning이 발생했다. 제품 build와 Web 전체 test에는 영향이 없고 harness DOM geometry와 상태 검증은 통과했다.
- PR7A integration 첫 실행은 sibling worktree에 `.env.local`이 없어 `docker compose exec` readiness probe가 env file 오류를 숨긴 채 재시도했다. 비밀값을 복사하지 않고 설명 주석만 있는 임시 빈 파일로 재실행했으며 검증 직후 삭제했다.
- PR7A integration의 첫 완료 실행은 기존 assertion이 sync capability version 2를 기대해 1개 test가 실패했다. version 3 계약에 맞춰 assertion을 갱신한 뒤 동일 script가 8 passed, 1 skipped로 통과했다.
- PR7A Worker 전체 test의 첫 실행은 integration spec이 참조하는 API package-local workspace link가 없어 `@orbit/shared` 상대 모듈을 찾지 못했다. 원본 설치의 link tree만 임시 복사해 sibling package를 가리키게 한 뒤 통과했고 모든 임시 dependency와 ignored build 산출물을 제거했다.
- PR7B 첫 PostgreSQL integration은 전체 Deck 저장이 `speakerNotes` 변경을 patch log에 만들지 않아 Python 응답이 신규 locator를 반환하지 않았고 sidecar가 `absent`로 남았다. API full-save diff에 `update_speaker_notes`를 추가하고 회귀 test를 만든 뒤 실제 export/reimport가 통과했다.
- PR7B DecksService 전체 test는 PR7A에서 올린 current sync capability 3과 다르게 2를 기대하던 5개 assertion이 남아 실패했다. literal을 공통 capability constant로 교체해 현재 계약과 retry 정책을 정합화했다.
- PR7B API 전체 test 첫 실행은 integration용 임시 빈 `.env.local` 때문에 환경 초기화가 필요한 5개 suite가 시작 전에 실패했다. 실제 credential을 읽거나 복사하지 않고 test-only placeholder 환경을 임시로 제공해 128 suites, 611 tests를 통과시켰다.
- PR7B Worker 응답은 shared notes page schema보다 좁은 생성 locator schema가 필요했다. Python이 반환할 수 있는 source part·master part·body locator·dimension만 허용하고 임의 preview file ID 같은 추가 필드는 persistence 전에 fail-closed하도록 보강했다.
- PR8 첫 Worker 실행은 package-local symlink가 원본 worktree의 오래된 `@orbit/shared` build를 가리켜 legacy schema와 sync capability 2가 로드됐다. 원본 설치의 link tree만 상대 경로를 보존해 복사하여 sibling package build를 가리키게 한 뒤 전체 390개 test가 통과했다.
- PR8의 package script에 파일 인자를 전달한 API 실행은 대상 11개가 통과했지만 전체 suite도 함께 실행되어 test 환경변수가 필요한 기존 5개 suite가 시작 전에 실패했다. test-only placeholder 환경과 직접 Vitest 경로로 대상 suite를 격리해 11/11 통과를 확인했으며 실제 secret은 읽거나 복사하지 않았다.
- PR9 첫 Web RED 실행은 필수 `APP_ENV`, `API_BASE_URL`, `WEB_PORT`가 없어 Vite config 단계에서 중단됐다. 비밀값 없는 test/local 값만 명시해 다시 실행했고 의도한 snapshot 관련 3개 실패를 확인했다.
- PR9 첫 Worker 전체 실행은 integration spec이 가져오는 API package-local link가 없어 `@orbit/shared` 상대 모듈을 찾지 못했다. 원본 설치의 API/realtime link tree만 임시 복사해 현재 sibling package를 가리키게 한 뒤 394 passed, 15 skipped를 확인하고 모두 제거했다.
- PR9 첫 Worker production build는 export한 정책 함수가 거대한 Zod 추론 타입을 declaration에 직렬화하면서 `TS7056`으로 실패했다. 외부 signature를 작은 명시적 render-mode input 타입으로 제한한 뒤 lint와 build가 통과했다.
- PR9 기준 PPTX preference-pair 생성 중 MuPDF structure tree bounded warning이 발생했지만 8 source render와 16 payload 생성, 16/16 browser capture에는 영향이 없었다.
- PR9 sibling worktree의 임시 root dependency link 때문에 Vite가 원본 Pretendard 경로를 serving allow list 밖으로 경고했다. appearance-first는 bitmap source render를 사용해 8/8 SSIM 1.0이었고, editability-first 결과는 runtime 선택에 쓰지 않는 기존 CI-only 한계로 기록했다.
- PR10 첫 Python 검증은 기본 `uv` cache가 sandbox 밖 사용자 cache를 열지 못해 중단됐고, 쓰기 가능한 `/tmp/orbit-uv-cache`를 명시해 동일 lock 환경에서 재실행했다. 첫 `ruff` 실행도 sibling worktree cache 쓰기 제한으로 중단되어 승인된 worktree 쓰기 권한으로 다시 실행한 뒤 통과했다.
- PR10 첫 Web test는 필수 `APP_ENV`, `API_BASE_URL`, `WEB_PORT`가 없어 Vite config 단계에서 중단됐다. 비밀값 없는 test/local 값만 명시해 전체 1,818개 test를 통과시켰다.
- Checkpoint C 첫 두 실행은 경량 `/design/import-pptx` 응답에서 production Worker가 저장하는 notes preview 상태를 assertion해 실패했다. 경량 경로는 두 policy의 notes body digest만 비교하고 preview 8/8은 실제 Worker generation·storage 결과에서 확인하도록 계층을 바로잡았다.
- Checkpoint C Web 대상 test 첫 실행은 package-local `react` link가 없어 collection 단계에서 중단됐다. 원본 설치의 link tree만 임시 복사해 18개 test를 통과시키고 commit 전에 제거했다.
- PR13 Worker 전체 test 첫 실행은 integration spec이 가져오는 API/realtime package-local link가 없어 `@orbit/shared` 하위 모듈을 찾지 못했다. API/realtime의 기존 link tree만 임시 복사해 396 passed, 15 skipped를 확인하고 commit 전에 제거했다.
- 최종 시각 gate 첫 실행은 직전의 production build가 내부 전용 `/__deck-render` route를 의도대로 비활성화해 404 UI에서 중단됐다. 계획된 `vite build --mode test` bundle로 교체한 뒤 첫 slide와 16개 전체 캡처를 순서대로 재실행해 모두 통과했다.

## 계획 대비 변경과 근거

- 기존 synthetic-only accuracy 준비 도구에 실제 multi-slide source mode를 추가했다. 원본은 커밋하지 않고 hash와 bounded count만 manifest에 남긴다.
- accuracy E2E는 대형 data URL을 `blob:` URL로 치환한다. asset byte와 renderer 동작은 유지하면서 localStorage 운반 한계만 제거한다.
- PR1 slide fidelity 진단 다섯 필드는 legacy result에서는 모두 생략할 수 있지만 신규 result에서는 함께 존재하도록 묶었다. 부분 진단과 기존 `status`에 모순되는 `pixelEvaluation`을 계약 단계에서 거부하기 위함이다.
- PR5는 Deck 자체가 아니라 보호 sidecar read model이므로 `deck-api.schema.ts`에 strict notes preview 응답을 추가했다. `available`만 project asset content URL을 허용하고 나머지 상태는 `assetUrl: null`을 강제한다.
- PR5 asset lookup은 같은 project의 `design-asset`, `uploaded`, image MIME만 허용한다. 누락, 삭제, 다른 project, legacy file ID 누락, 저장소 예외는 raw 오류 없이 `unavailable`로 수렴한다.
- PR6 preview query는 tab component 안에서 current `projectId`와 `slideId`별 key로 격리한다. tab이 열릴 때만 조회하고 `sync-pending` 동안만 2초 polling하며 다른 상태에서는 불필요한 polling을 하지 않는다.
- PR6 image는 notes page 고유 비율을 유지하도록 고정 aspect ratio 없이 `object-fit: contain`으로 표시한다. request/image failure에는 raw 오류를 노출하지 않고 bounded 문구와 재시도만 제공한다.
- PR7A는 `update_speaker_notes`를 capability version 3의 targeted operation으로 승격한다. template slide, notes part, body shape locator가 각각 유일하고 `bodyWritable`일 때만 변경하며 누락·중복·비가용 part는 원본 package를 그대로 반환한다.
- PR7A body 갱신은 `bodyPr`, `lstStyle`, geometry, paragraph property, 비본문 shape, notes master와 relationship을 보존한다. 동일 paragraph/run은 deep copy하고 새 text는 대응하는 인접 paragraph/run style을 상속한다.
- PR7A preview asset은 stale `sourceSlideIndex`가 아니라 갱신된 package의 presentation relationship 순서로 page를 매핑한다. renderer 실패는 bounded warning과 `render-unavailable` sidecar로 수렴한다.
- PR7A의 locator 누락·모호함, non-writable body와 notes part 누락은 PR7B 생성 경로로 회복할 수 있어 retryable이다. malformed XML이나 invalid body update는 자동 재시도로 해결되지 않으므로 retryable로 분류하지 않는다.
- PR7B는 기존 notes master가 하나일 때 presentation relationship, content type, master XML, internal theme relationship과 theme part를 모두 검증한 뒤에만 재사용한다. master가 없으면 `python-pptx`가 생성한 검증된 최소 notes package template에서 notes master·theme·notes slide를 분리해 충돌 없는 part와 관계를 만든다.
- PR7B 신규 notes locator는 Python과 Worker 양쪽에서 bounded strict schema로 검증한다. preview file ID는 Python 응답을 신뢰하지 않고 Worker가 실제 저장한 `notes_render_<index>` asset에서만 부여한다.
- 계획의 예상 파일에는 없던 `DecksService` diff를 함께 변경했다. UI의 전체 Deck 저장이 notes 변경을 patch log에 기록하지 않으면 PR7B 생성 operation 자체가 Worker에 도달하지 않는 실제 integration 결함이 확인됐기 때문이다.
- Checkpoint B는 실제 notes 원문 비교 assertion 대신 프로세스 내부 SHA-256 digest 배열을 사용한다. exact match와 slide 4 문단 경계를 증명하면서 실패 output과 Git diff에 보호 원문이 나타나지 않게 하기 위함이다.
- Checkpoint B는 기존 기준 파일 integration을 import-only에서 full-save notes 편집, OOXML sync, preview refresh, PPTX export와 Python reimport까지 확장했다. 별도 fixture 복사 없이 보호 경로 opt-in 조건을 유지한다.
- PR8 dialog는 Editor뿐 아니라 workspace home과 project list의 PPTX 진입점에도 공통 적용했다. 선택 전에는 기존 프로젝트의 upload뿐 아니라 신규 project 생성도 시작하지 않아 “매 import 명시 선택” 계약을 UI 경로 전체에서 유지한다.
- PR8 Python generation 함수는 validated preference를 받되 render mode 결정에는 아직 사용하지 않는다. 전달 경계를 먼저 고정하고 PR9에서 capability inventory와 결합해 slide별 `importRenderMode`를 결정하기 위함이다.
- PR9 Worker는 runtime candidate renderer가 기각된 현재 조건에서 appearance-first의 `not-evaluated`/`failed` slide를 source snapshot으로 선택한다. editability-first는 resolved fallback을 `hybrid`, 안전한 vector tree를 `editable`로 선택하고 unresolved asset, 누락 relationship/fallback, 빈 tree, 미계상 unsupported object를 data-loss risk로 취급한다.
- PR9 snapshot은 element와 animation tree를 Deck에 보존하되 공통 renderable element와 highlight 경계에서 제외한다. canvas editing policy도 snapshot을 거부해 selection과 keyboard mutation이 저장 tree에 도달하지 않도록 한다.
- 계획의 예상 파일 외에 `editorLayout.ts`, highlight helper, rail test와 accuracy harness를 함께 변경했다. main canvas background, rail cache 우선순위, 실제 기준 두 preference screenshot과 source SSIM을 동일 mode 정책으로 증명하기 위해 필요했다.
- 기존 accuracy scorer는 모든 full-slide fallback을 실패로 보았으나 preference-pair의 의도된 appearance-first snapshot은 source SSIM `>= 0.99`를 성공 기준으로 분리했다. 일반 vector candidate와 editability-first의 `0.95` 기준은 유지한다.
- PR10 importer는 이름 유사도 추론 없이 4개 명시적 Pretendard alias만 canonical family와 numeric weight로 바꾼다. unknown family는 원래 이름을 Deck에 유지하고 slide별 중복 없는 bounded fallback diagnostic만 추가한다.
- 계획 예상 파일 외에 Web font availability helper와 Chromium E2E를 추가했다. Python package 진단만으로 실제 browser FontFaceSet 상태를 단정하지 않고, PR12 quality panel이 선언된 font와 `document.fonts.check()` 결과를 함께 표시할 수 있게 하기 위함이다.
- PR11 importer는 master `txStyles`, master/layout placeholder `lstStyle`, slide shape style, paragraph/run direct formatting을 낮은 우선순위부터 합성한다. Deck의 top-level/paragraph에는 effective style을 materialize하고 run에는 direct property만 남겨, 상속값이 source-preserving sync에서 불필요한 direct formatting으로 기록되지 않게 했다.
- `normAutofit`의 `fontScale`과 `lnSpcReduction`, run `spc`를 bounded Deck contract로 추가하고 Web canvas·inline editor 및 targeted/generic export에 연결했다. `fontScale`과 `lineSpaceReduction`은 `autoFit=shrink-text`에서만 허용한다.
- 실제 screenshot은 symlink된 외부 font가 Vite dev allow-list에 막히는 환경 오염을 배제하기 위해 `vite build --mode test`의 bundled Pretendard와 production preview를 사용했다. appearance-first 8/8은 SSIM 1.0을 유지했다.
- PR12 panel은 composite score를 “구조 품질 점수”, `editabilityCoverage`를 “편집 가능한 객체 비율”로 표시하고 시각 품질이 아님을 명시한다. slide별 selected/recommended mode, pixel 상태/SSIM, unsupported/font count, fallback reason과 notes/motion/global warning을 모두 native `details`로 탐색할 수 있다.
- PR12 scorer는 `pixelPassed`와 `gatePassed`를 분리한다. editability SSIM `0.80..0.95`는 `fallback_required`로 기록하고 editable candidate는 snapshot 권장, 기존 hybrid는 hybrid 유지 reason을 부여한다. `0.80` 미만, unresolved asset, 부정확한 full-slide fallback은 hard failure다.
- 실제 기준 최종 PR12 측정은 appearance 8/8 SSIM 1.0, editability pixel 3/8 통과, explicit fallback 5/8이다. 이 수치는 CI report에만 저장되며 runtime quality API에 복사하지 않는다.
- PR13 Python importer는 같은 media bytes를 SHA-256으로 한 번만 응답하고 모든 element가 같은 `asset:` reference를 사용한다. Worker는 asset 종류와 관계없이 content hash별 한 번만 저장하므로 slide render와 notes preview의 bytes가 같아도 동일 `fileId`로 치환된다.
- ZIP traversal·중복 entry·entry/total 해제 크기·compression ratio는 parsing 전에 bounded code로 거부한다. external relationship과 macro/OLE/ActiveX는 원본 source-preserving package에는 유지하되 renderer용 in-memory package에서 관계·part·content type을 제거한다.
- source render는 최대 1920 px, 16 MiB/asset, 256 MiB total, 1,000 pages, 10초 decode이고 notes preview는 최대 1280 px, 8 MiB/asset, 128 MiB total, 1,000 pages, 10초 decode다.

## 알려진 제한 사항

- 기준 PPTX는 저장소에 복사하거나 커밋하지 않는다.
- 원래 worktree의 계획 문서가 untracked였으므로 목표 worktree에는 해당 문서 한 개만 동일 경로로 복사했다.
- LibreOffice notes page preview는 source app과의 pixel identity가 아니라 page completeness와 순서가 확인된 bounded preview다.
- Runtime Konva SSIM은 CI 결과이며 production import report에서 측정값처럼 가장하지 않는다.
- PR2는 notes body와 provenance만 가져오며 전체 notes page preview asset은 PR3에서 추가한다.
- PR3 preview는 `notesSz` 비율의 최대 1280 px bitmap이며 page count가 전체 slide 수와 일치하고 source slide index가 순차적일 때만 매핑한다.
- PR4는 `notes_render_<index>` asset 저장 실패만 선택적으로 허용한다. 이 경우 note text는 Deck에 남고 sidecar는 `render-unavailable`, quality report는 `PPTX_NOTES_PREVIEW_ASSET_FAILED` count로 수렴한다.
- Checkpoint A의 실제 기준 파일 검증은 원본을 저장소에 복사하지 않으며 `PPTX_IMPORT_FIDELITY_REFERENCE_PATH`가 명시된 로컬/보호 CI에서만 실행한다. 일반 Worker suite에서는 이 1개 test가 skip된다.
- PR5 notes preview metadata는 owner/editor에게만 반환하고 audience/public projection에는 route나 URL을 추가하지 않는다. preview bitmap content는 기존 project-auth asset endpoint를 사용한다.
- PR6 시점에는 per-slide imported provenance UI gate가 없으므로 `deck.metadata.sourceType === "import"`에서 tab을 노출한다. 이후 imported Deck에 새로 추가된 authored slide는 API의 `unavailable` 상태를 표시하며 PR9의 slide render mode 적용 시 per-slide gate를 재검토한다.
- PR7B는 notes page가 없는 imported slide의 첫 비어 있지 않은 대본 저장만 생성한다. 빈 문자열 저장은 package를 불필요하게 변경하지 않는 no-op이며 안전한 단일 notes master 구조를 증명할 수 없는 package는 `NOTES_MASTER_CAPABILITY_UNSAFE`로 종료한다.
- 실제 8-slide Checkpoint B test는 기준 파일을 저장소에 포함하지 않으므로 `PPTX_IMPORT_FIDELITY_REFERENCE_PATH`가 없는 일반 suite에서 계속 skip된다. hash가 일치하는 보호 로컬/CI 경로에서는 9/9 integration으로 실행된다.
- PR9의 신규 mode는 새 PPTX import slide에 저장된다. `importRenderMode`가 없는 legacy Deck은 기존 thumbnail/canvas/editing 동작을 그대로 유지한다.
- PR9 실제 기준의 appearance-first는 8/8 source snapshot SSIM 1.0이다. editability-first는 4/8만 기존 `0.95` CI gate를 통과했으며 이 값은 runtime report에 측정값처럼 기록하지 않고 PR10~PR12의 font/style/quality gate 개선 근거로만 사용한다.
- PR10 Python fallback 진단은 현재 slide part의 explicit run property를 대상으로 하며 layout/master/theme에서 상속되는 effective family는 PR11 cascade에서 계산한다. Web helper는 실제 Deck에 materialized된 text/table family를 다시 진단한다.
- Web font availability helper는 PR10에서 계산 경계와 테스트만 제공하며 사용자 노출은 PR12 quality panel에서 연결한다.
- PR11 실제 기준 slides 1·2·3·6·7의 editability-first SSIM은 0.8822~0.9036이며 slide 7만 현재 hybrid reason을 가진다. 이 값을 성공으로 가장하지 않고 PR12에서 slide별 CI measurement와 explicit fallback/recommendation reason으로 노출·gate한다.
- PR12 actual gate에서 낮은 editable slide 1·2·3·6은 snapshot을 권장하고 slide 7은 hybrid를 유지한다. runtime selected mode는 CI 측정으로 사후 변경하지 않으며 UI의 runtime report와 CI artifact를 구분한다.
- Checkpoint C에서 경량 `/design/import-pptx`는 notes preview asset을 생성하지 않으므로 두 policy의 notes body 동일성만 digest로 비교한다. notes preview 8/8과 refresh 8/8은 production과 같은 Worker generation·storage 경로에서 검증한다.
- PR13 실제 기준의 repeated media reference 5개가 Python response에서 제거되어 저장 asset이 50개에서 45개로 감소했다. 시간과 RSS 변화는 단일 로컬 측정값이며 성능 개선을 과장하지 않고 회귀 기준으로만 사용한다.
- 최종 실제 기준 시각 측정은 appearance-first 8/8 SSIM 1.0, editability-first pixel 3/8 통과, explicit fallback 5/8로 PR12 승인 기준을 그대로 유지했다. 전체 평균 SSIM 0.9631은 두 정책을 합친 CI-only 지표다.

## 다음에 시작할 정확한 작업

- 없음. 계획의 PR0~PR13, Checkpoint A/B/C와 최종 승인 검증을 완료했다.

## 사용자 결정이 필요한 Blocker

- 없음.
