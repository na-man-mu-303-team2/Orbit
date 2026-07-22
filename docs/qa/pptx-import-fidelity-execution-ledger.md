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

- 단계: PR5 권한이 적용된 notes preview 조회 API
- task branch: `feature/pptx-import-pr5-notes-preview-api`
- 상태: owner/editor 전용 조회, fail-closed asset 경계, target branch `--no-ff` merge와 merge smoke 완료

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

## 계획 대비 변경과 근거

- 기존 synthetic-only accuracy 준비 도구에 실제 multi-slide source mode를 추가했다. 원본은 커밋하지 않고 hash와 bounded count만 manifest에 남긴다.
- accuracy E2E는 대형 data URL을 `blob:` URL로 치환한다. asset byte와 renderer 동작은 유지하면서 localStorage 운반 한계만 제거한다.
- PR1 slide fidelity 진단 다섯 필드는 legacy result에서는 모두 생략할 수 있지만 신규 result에서는 함께 존재하도록 묶었다. 부분 진단과 기존 `status`에 모순되는 `pixelEvaluation`을 계약 단계에서 거부하기 위함이다.
- PR5는 Deck 자체가 아니라 보호 sidecar read model이므로 `deck-api.schema.ts`에 strict notes preview 응답을 추가했다. `available`만 project asset content URL을 허용하고 나머지 상태는 `assetUrl: null`을 강제한다.
- PR5 asset lookup은 같은 project의 `design-asset`, `uploaded`, image MIME만 허용한다. 누락, 삭제, 다른 project, legacy file ID 누락, 저장소 예외는 raw 오류 없이 `unavailable`로 수렴한다.

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

## 다음에 시작할 정확한 작업

1. PR5 ledger 갱신 커밋 후 target branch clean 상태를 확인한다.
2. `feature/pptx-import-pr6-notes-preview-ui`를 target branch HEAD에서 생성한다.
3. Speaker Notes panel에 imported slide 전용 `대본`/`노트 페이지` tab과 읽기 전용 preview를 추가한다.
4. slide 전환, loading/absent/sync-pending/stale/render-unavailable/unavailable 상태와 image load 실패를 text로 구분한다.
5. keyboard/focus 접근성과 preview 비편집 경계를 test한 뒤 Web lint/build, 상세 한국어 commit과 `--no-ff` merge를 수행한다.

## 사용자 결정이 필요한 Blocker

- 없음.
