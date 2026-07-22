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

- 단계: PR0 기준선 fixture와 renderer 위험 검증
- task branch: `feature/pptx-import-pr0-baseline`
- 상태: target branch `--no-ff` merge와 merge 후 smoke test 완료

## 완료된 작업과 Commit

| 작업                         | 일반 commit | task branch                        | merge commit | 검증                                                                                   |
| ---------------------------- | ----------- | ---------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| 초기 실행 기준 확인          | `90082d1e`  | `feature/pptx-import-pr0-baseline` | `f3ca2ab3`   | 저장소 규칙, 공통 계약, 구현 계획, commit convention 전체 확인                         |
| PR0 fixture·renderer harness | `bc8ad700`  | `feature/pptx-import-pr0-baseline` | `f3ca2ab3`   | fixture 회귀 테스트, LibreOffice 위험 측정, synthetic/실제 Konva accuracy harness 추가 |
| PR0 기준선 결정              | `6f545bf3`  | `feature/pptx-import-pr0-baseline` | `f3ca2ab3`   | LibreOffice 채택, runtime Konva 기각 및 CI-only 결정 문서화                            |

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

## 계획 대비 변경과 근거

- 기존 synthetic-only accuracy 준비 도구에 실제 multi-slide source mode를 추가했다. 원본은 커밋하지 않고 hash와 bounded count만 manifest에 남긴다.
- accuracy E2E는 대형 data URL을 `blob:` URL로 치환한다. asset byte와 renderer 동작은 유지하면서 localStorage 운반 한계만 제거한다.

## 알려진 제한 사항

- 기준 PPTX는 저장소에 복사하거나 커밋하지 않는다.
- 원래 worktree의 계획 문서가 untracked였으므로 목표 worktree에는 해당 문서 한 개만 동일 경로로 복사했다.
- LibreOffice notes page preview는 source app과의 pixel identity가 아니라 page completeness와 순서가 확인된 bounded preview다.
- Runtime Konva SSIM은 CI 결과이며 production import report에서 측정값처럼 가장하지 않는다.

## 다음에 시작할 정확한 작업

1. target branch의 clean 상태와 PR0 ledger commit을 확인한다.
2. `feature/pptx-import-pr1-contracts` task branch를 target branch HEAD에서 생성한다.
3. `packages/shared`의 import preference, render mode, notes locator/preview metadata, bounded quality diagnostics를 optional/default 호환으로 확장한다.
4. `docs/contracts.md`와 shared schema test를 함께 갱신하고 raw notes/XML/base64 field 거부를 검증한다.

## 사용자 결정이 필요한 Blocker

- 없음.
