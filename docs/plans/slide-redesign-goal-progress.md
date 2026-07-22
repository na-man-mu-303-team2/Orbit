# 슬라이드 리디자인 Goal 진행 기록

최종 갱신: 2026-07-22

## Integration

- branch: `feature/slide-redesign-agent-v2`
- worktree: `/private/tmp/orbit-slide-redesign-agent-v2`
- base: `origin/develop` (`b0f7cc8d`)
- bootstrap commit: `c01b32fd`
- integration HEAD after PR08 merge: `50573a5aad0ac9db984c96432b9ee911a206828d`
- worktree: clean

## Baseline

- baseline HEAD: `c01b32fd57504093847ee92cf5e0715990e0a33d`
- Python design-agent: `UV_CACHE_DIR=/private/tmp/orbit-slide-redesign-uv-cache uv run pytest tests/test_design_agent.py -v` — 42 passed
- shared design-agent schema: `pnpm --filter @orbit/shared test -- src/deck/design-agent.schema.test.ts` — 54 files, 565 tests passed
- API design-agent: `pnpm --filter @orbit/api test -- src/design-agent/design-agent.service.spec.ts src/design-agent/design-image-generation.service.spec.ts` — 대상 18 tests passed; package script가 전체 API suite를 실행하여 환경변수 미설정으로 기존 5 suites failed, 그 외 122 files/563 tests passed, 1 skipped
- typecheck: `pnpm typecheck` — 17 tasks passed
- 기존 실패: API 전체 suite의 `app.module`, `data-source` 계열 및 demo cleanup/reset suite 5개가 필수 환경변수 미설정으로 collection 실패
- 비밀값은 확인하거나 출력하지 않았으며 `.env` 파일을 생성하지 않음

## Milestone 상태

- 완료 milestone: PR00~PR08
- PR08 integration merge: `50573a5aad0ac9db984c96432b9ee911a206828d`
- 현재 milestone: PR09 — 미디어 슬롯과 기존 이미지 재배치
- 활성 child branch/worktree: 없음
- integration merge 후 검증:
  - `uv run ruff check app/ai/slide_redesign tests/test_slide_redesign_*.py app/ai/design_agent.py tests/test_design_agent.py` — 통과
  - `uv run mypy app` — 69 source files 통과
  - 장식·안전·pipeline·design-agent focused — 126 passed
  - `pnpm --filter @orbit/shared test` — 571 passed
  - `pnpm --filter @orbit/api test` — 600 passed, 1 skipped
- 남은 stop gate: 없음
- PR08 child 상태: clean worktree와 local branch 정리 완료
- 다음 milestone: PR09 — 미디어 슬롯과 기존 이미지 재배치

## 완료 Milestone 기록

### PR08 — 장식 도형과 capability v2 발행

- integration merge: `50573a5aad0ac9db984c96432b9ee911a206828d`
- code commit:
  - `d7aeab20` — process badge/connector, statement accent bar, metric ring 생성과 안전 필터
  - `803d5f7a` — Python/shared ellipse·line·polygon 계약과 API capability version `2` 발행
  - `f193d659` — capability별 장식 후처리, delete 후행 유지, 소유 장식 재처리
  - `a95e3cf0` — T7.1~T7.11 겹침·개수·safe area·zIndex·shape schema 회귀
- 검증:
  - `uv run ruff check .` — 통과
  - `uv run mypy app` — 69 source files 통과
  - `uv run pytest` — 982 passed, 1 skipped
  - `pnpm --filter @orbit/shared test` — 571 passed
  - feature flag 기본값을 명시한 `pnpm --filter @orbit/api test` — 600 passed, 1 skipped
  - `pnpm typecheck` — 17/17 tasks 통과
- stop gate: v1 reader 유지, v2 API 발행, shape add-element 검증, 본문 우선 충돌 제거, 최대 12개, safe area와 전 composition smoke 통과
- child 상태: clean worktree와 local branch 정리 완료

### PR07 — capability v2 tolerant reader

- integration merge: `cf15d1bc1d35ba3ccf212597e99ec0f2a85fbe8b`
- code commit:
  - `3dfb8480` — Python/shared capability reader를 version `1 | 2`로 확장하고 기본값 유지
  - `4f597c10` — v1/v2 왕복·미지원 version 거부·API v1 발행 회귀
  - `c631e4da` — reader-first rolling deployment 순서와 v1 제거 범위 기록
- 검증:
  - `uv run ruff check .` — 통과
  - `uv run mypy app` — 68 source files 통과
  - `uv run pytest` — 944 passed, 1 skipped
  - `pnpm --filter @orbit/shared test` — 568 passed
  - feature flag 기본값을 명시한 `pnpm --filter @orbit/api test` — 600 passed, 1 skipped
  - `pnpm typecheck` — 17/17 tasks 통과
- 배포 gate: version `1`, `2` reader 통과; API 발행값 `1`과 기존 addable type/canGenerateImages 유지
- child 상태: clean worktree와 local branch 정리 완료

### PR06 — M1 통합 검증과 출시 gate

- integration merge: `931e42959e9c0cda7372a73c99508f5a6e432df7`
- code commit:
  - `d4a81e1b` — I1~I8 불변식과 M1 골든 fixture 14종
  - `6e8f93b6` — 적용 전 Deck patch 검증과 빈 operation proposal 경계
  - `e609047c` — apply 후 단일 undo 원상 복구 E2E와 반복 실행 고유 사용자
  - `3fc4e9c0` — 자동 gate와 수동 시각 QA 미검증 범위 기록
- child와 integration 검증:
  - `uv run ruff check .` — 통과
  - `uv run mypy app` — 68 source files 통과
  - `uv run pytest` — 941 passed, 1 skipped
  - feature flag 기본값을 명시한 `pnpm --filter @orbit/api test` — 600 passed, 1 skipped
  - `pnpm --filter @orbit/web test` — 1,796 passed
  - `pnpm lint`, `pnpm typecheck` — 각각 17/17 tasks 통과
  - `pnpm test:smoke --grep "slide redesign"` — child에서 연속 2회, integration에서 1회 통과
- stop gate: 골든 fixture·API 적용 경계·단일 undo를 포함한 M1 자동 안전성 gate 통과
- 수동 시각 QA: 미실행이며 출시 승인이나 시각 품질 승인으로 간주하지 않음
- `origin/develop`: fetch 결과 기존 base `b0f7cc8d`와 동일하여 merge 불필요
- child 상태: Compose 종료(볼륨 보존), clean worktree와 local branch 정리 완료

### PR05 — 동기 redesign pipeline 결선

- integration merge: `b815980e0395f82c13ada843a96977ccbf02170e`
- code commit:
  - `595bc3a7` — applicable·fallback-allowed·refused-unsafe 3분기 pipeline
  - `ed403dc2` — animation 다음 design agent 전체 리디자인 hook
  - `2f2d3357` — 민감 원문 없는 구조화 진단 로그와 slide type source
  - `f1885842` — chart 전체 거부·국소 편집 허용·SmartArt/animation 우선 회귀
- 검증:
  - `uv run ruff check .` — 통과
  - `uv run mypy app` — 68 source files 통과
  - `uv run pytest` — 919 passed, 1 skipped
  - `pnpm --filter @orbit/api test` — design-agent 18 tests 포함 122 files/563 tests passed, 1 skipped; baseline과 동일한 필수 환경변수 미설정 5 suites failed
  - `pnpm typecheck` — 17 tasks passed
- stop gate: chart 전체 리디자인 거부와 chart 국소 편집 기존 provider 경로 허용이 동시에 통과
- integration merge 후 `ruff`, `mypy app`, design-agent/pipeline 66 tests 통과
- child 상태: clean worktree와 local branch 정리 완료

### PR04 — provenance 매칭과 Deck patch 생성

- integration merge: `8181370a33008a7530e9404b4a7f9147e2d6d228`
- code commit:
  - `3b10ee9b` — sourceElementId 기준 1:1·1:N·N:1 cardinality와 중복 문구 매칭
  - `385500cb` — 제약·텍스트 보존 기반 후보별 안전성 필터
  - `9a1deb55` — 순서·텍스트 불변·provenance 제거 Deck patch 생성
  - `29189613` — 실제 M1 composition patch 라운드트립
  - `08a97545` — 참조 없는 비가역 매핑 허용 회귀 보강
- 검증:
  - `uv run ruff check app/ai/slide_redesign tests/test_slide_redesign_*.py` — 통과
  - `uv run mypy app` — 67 source files 통과
  - `uv run pytest tests/test_slide_redesign_diff.py -q` — 17 passed
- stop gate: T4.1~T4.17 통과, T4.16 실제 patch 라운드트립과 T4.17 sourceElementId cardinality 통과
- integration merge 후 `ruff`, `mypy app`, diff 17 tests 통과
- child 상태: clean worktree와 local branch 정리 완료

### PR03 — composition 후보와 M1 palette

- integration merge: `9b65efc1c0d4fd2d6d9b7417c8bc77177eba242d`
- code commit:
  - `52bd392d` — 현재 theme 기반 palette role 생성, focal 보존, text 대비 보정
  - `5adf7bb4` — media-free composition 후보 필터와 single-slide program compile
  - `72039fcc` — strict enum 기반 composition 선택과 deterministic fallback
  - `755d9c30` — 전체 media-free M1 composition 경계값 compile smoke
- 검증:
  - `uv run ruff check app/ai/slide_redesign tests/test_slide_redesign_*.py` — 통과
  - `uv run mypy app` — 66 source files 통과
  - `uv run pytest tests/test_slide_redesign_composer.py -q` — 59 passed
- stop gate: T3.1~T3.11 통과, required-media 후보 제외, out-of-list/provider 실패 fallback, 49개 M1 compile 경계 사례 통과
- integration merge 후 `ruff`, `mypy app`, composer 59 tests 통과
- child 상태: clean worktree와 local branch 정리 완료

### PR02 — current slide extractor와 분류 fallback

- integration merge: `9172954595a5bc37fffcdeda7411499db3890219`
- code commit:
  - `a3453592` — visible text role/fontSize hierarchy와 y-band 읽기 순서
  - `84c84973` — 불릿 segment 전역 유일 ID와 별도 provenance map
  - `00322e26` — provider 분류와 deterministic heuristic fallback
  - `1d9a4921` — extractor 골든 fixture 5종
- 검증:
  - `uv run ruff check app/ai/slide_redesign tests/test_slide_redesign_*.py` — 통과
  - `uv run mypy app` — 64 source files 통과
  - `uv run pytest tests/test_slide_redesign_extractor.py -v` — 19 passed
- stop gate: T2.1~T2.12 통과, contentItemId 전역 유일성 및 composition `_items()` 호환 통과
- integration merge 후 `ruff`, `mypy app`, extractor 19 tests 통과
- child 상태: clean worktree와 local branch 정리 완료

### PR01 — Python design-agent 모델 정합화

- integration merge: `82d9c6370ab50792ac7adafb7e23e3863367b288`
- code commit:
  - `58fb6cff` — text/rect role과 문자열·정수 fontWeight 및 strict JSON schema 정합화
  - `5ca87260` — shared layout enum과 backgroundImage slide style patch 정합화
  - `765da27e` — capability version 1과 addable type 회귀 고정
- 검증:
  - `uv sync --locked --offline` — 통과
  - `uv run ruff check .` — 통과
  - `uv run mypy app` — 63 source files 통과
  - `uv run pytest` — 811 passed, 1 skipped
  - `pnpm --filter @orbit/shared test` — 54 files, 565 tests passed
  - `pnpm --filter @orbit/api test` — baseline과 동일한 환경변수 미설정 5 suites failed; design-agent 18 tests 포함 122 files/563 tests passed, 1 skipped
  - `pnpm typecheck` — 17 tasks passed
- stop gate: T1.1~T1.10 통과, capability version `1` 유지, 기존 baseline API 실패 외 새 실패 없음
- integration merge 후 `ruff`, `mypy app`, design-agent 53 tests 통과
- child 상태: clean worktree와 local branch 정리 완료

### PR00 — 요소 보존 정책과 안전성 판정

- integration merge: `211470905b65f620a9cef3d0ad8eead5e902fa76`
- code commit:
  - `422f9fc4` — fail-closed unsafe element type 판정과 shared schema coverage
  - `9b064d22` — animation/action/semantic cue/locked/group/OOXML 제약 수집
  - `bc05febd` — 텍스트 정규화와 병합 허용·축약 거부
- 검증:
  - `uv run ruff check app/ai/slide_redesign tests/test_slide_redesign_*.py` — 통과
  - `uv run mypy app` — 63 source files 통과
  - `uv run pytest tests/test_slide_redesign_safety.py -v` — 19 passed
- stop gate: T0.1~T0.12 및 shared element type coverage 통과
- child worktree: code commit 후 clean
- integration merge 후 검증:
  - `uv run ruff check app/ai/slide_redesign tests/test_slide_redesign_*.py` — 통과
  - `uv run mypy app` — 63 source files 통과
  - `uv run pytest tests/test_slide_redesign_safety.py -v` — 19 passed
- child 상태: clean worktree와 local branch 정리 완료

## 문서와 코드의 불일치

- shared `deckElementTypeSchema`에는 계획의 상수 목록에 없던 `activity-qr`가 존재한다. 완료 조건의 `text`·`rect` 외 전 타입 fail-closed coverage에 따라 PR00에서 unsafe로 포함했다.
- shared `keywords[].requiredOccurrenceIds`는 element ID가 아니라 speaker notes에서 파생된 keyword occurrence ID를 가리킨다. element reference로 수집하지 않고 이를 고정하는 회귀 테스트를 추가했다.
- `slide-redesign-implementation.md`의 과거 PR7 설명은 shape type 추가와 API version `2` 발행을 함께 적지만, Goal의 독립 merge boundary는 PR07을 tolerant reader 전용, PR08을 shape 계약과 v2 발행으로 지정한다. PR07은 Goal 경계를 우선해 reader만 확장했고 발행 상수와 element 목록은 바꾸지 않았다.

## 미검증 항목

- 실제 provider credential이 필요한 수동 검증
- 실사용자 시각 품질 검증
- 운영 지표 수집
