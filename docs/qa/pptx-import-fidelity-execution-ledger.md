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

- 단계: PR9 slide render mode 조립과 Editor 적용
- task branch: `feature/pptx-import-pr9-render-mode`
- 상태: Worker의 preference/capability 기반 mode 결정, snapshot tree 보존, Web 공통 렌더·선택·thumbnail·PNG 정책, 두 preference Playwright 비교와 target branch `--no-ff` merge 완료

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

## 다음에 시작할 정확한 작업

1. PR9 ledger 갱신 커밋 후 target branch clean 상태를 확인한다.
2. `feature/pptx-import-pr10-font-normalization`을 target branch HEAD에서 생성한다.
3. 명시적 alias table로 Pretendard 4개 variant를 canonical family와 200/500/600/800 numeric weight로 정규화한다.
4. unknown font의 원래 이름을 보존하고 browser fallback과 영향 slide 수만 bounded 진단한다.
5. Shared font catalog, Web CSS 실제 weight 제공과 Chromium `document.fonts.check()` 통합 테스트를 검증한다.

## 사용자 결정이 필요한 Blocker

- 없음.
