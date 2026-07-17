# Editor V1/V2/V3 local acceptance report

## 범위와 판정

- 실행일: 2026-07-17
- 브랜치: `feature/editor-experience-implementation-plan`
- 자동 acceptance 소스: `634391b8f30495593da6ae7eff681a2ea0a16ebf`
- 기준: `editor-experience-overhaul-2-week-implementation-plan.md`의 V1~V3와 B4 release gate
- 판정: **AUTOMATED EVIDENCE PASS / SPECIFIED MANUAL GATES WAIVED — ACCEPTED**
- 사용자 면제: 2026-07-17에 macOS/Windows 실제 Korean IME, 50/100/200% V1 수동 조작 matrix, LibreOffice GUI transition/motion playback을 명시적으로 건너뛰기로 결정

자동 회귀, 실제 Chromium 상호작용, H1 정적 LibreOffice 렌더, OOXML 구조와 303
read-only acceptance는 통과했다. 실제 macOS/Windows Korean IME, V1 수동 interaction
matrix, LibreOffice GUI slideshow의 transition/motion 재생은 수행하지 않았으며,
사용자가 2026-07-17에 이 네 항목을 완료 조건에서 명시적으로 면제했다. 면제는 실제
호환성 검증 통과를 뜻하지 않는다.

## V1 자동 상호작용 증거

다음 실제 Chromium 묶음을 단일 worker로 실행해 15개 시나리오가 모두 통과했다.

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 \
node infra/scripts/run-playwright-test.mjs \
  tests/e2e/editor-canvas-productivity.spec.ts \
  tests/e2e/editor-rich-text-editing.spec.ts \
  tests/e2e/editor.spec.ts \
  tests/e2e/editor-toolbar-stability.spec.ts \
  tests/e2e/editor-zoom-rotation-acceptance.spec.ts \
  --project=chromium --workers=1
```

| 영역               | 자동 관측                                                                                                  | 판정              |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| Zoom               | 50%, 100%, 200%에서 stage 크기와 `data-zoom-percent` 일치                                                  | 통과              |
| Rotated element    | text `-12°`, image `14°`, table `-8°`를 각 zoom에서 hit-select하고 normalized rotation 확인                | 통과              |
| Canvas gesture     | selection, drag, resize, rotate, slide background 복귀                                                     | 통과              |
| Toolbar/layout     | 1440×900, 1024×768, 768×1024, 390×844에서 overflow, panel 정렬, compact trigger와 44px target 확인         | 통과              |
| Focus/Escape       | selection inspector, file/presentation menu, panel collapse/expand의 focus 복귀                            | 통과              |
| Save shortcut      | owner와 viewer 모두 브라우저 Save Page를 막고, owner inline draft는 조합 종료 후 commit→Deck save 실행     | 통과              |
| Read-only          | 실제 viewer role에서 zoom/navigation은 허용하고 mutation shortcut과 Deck request는 차단                    | 통과(자동)        |
| Korean composition | 합성 `compositionstart/update`, non-cancelable `beforeinput`, DOM `input`, `compositionend` 동안 patch 0건 | 통과(합성 이벤트) |
| Edit session       | format과 한글을 operation 1개/patch 1회로 저장하고 Escape는 version 불변                                   | 통과              |
| Undo               | session 전체를 PUT 1회로 복원하고 Undo disabled/Redo enabled 및 저장 Deck 원문 확인                        | 통과              |

Zoom acceptance는 raw Konva canvas를 다음 크기로 캡처한다.

| Zoom |  PNG 크기 | SHA-256                                                            | 자동 확인                                |
| ---: | --------: | ------------------------------------------------------------------ | ---------------------------------------- |
|  50% |   960×540 | `8998ba358f0e00445c241e61627b2b5b55d48e2b5a345144477abcff9c3b73ec` | text/image/table 선택과 rotation 값 일치 |
| 100% | 1920×1080 | `9ba022b44561b4dc823c876a4b26cdabb2bfefca84e9ddd97229755bc0336cb7` | text/image/table 선택과 rotation 값 일치 |
| 200% | 3840×2160 | `7adc4cbeeff1826e04596293dba1743173579a184ebfd01c94ceaf9c1c3d9fc2` | text/image/table 선택과 rotation 값 일치 |

PNG는 `test-results/editor-zoom-rotation-acceptance-*/`에 test artifact로만 생성하며
commit하지 않는다. 캡처 대상은 raw Konva layer라 투명 slide background가 image viewer에서
검게 보일 수 있다. 이는 slide background color의 렌더 실패를 뜻하지 않는다. 이 자동
click/PNG는 실제 사람이 drag, resize, marquee와 toolbar clipping을 확인한 수동 sign-off를
대체하지 않는다.

Korean composition 시나리오는 Chromium DOM에 합성한 `CompositionEvent`와 `InputEvent`다.
`isTrusted=false`인 결정적 회귀 test이므로 실제 macOS 또는 Windows OS IME의 입력 증거로
해석하지 않는다.

## V2 저장·PPTX round-trip 증거

Generic/preserved OOXML 경로의 focused test와 전체 suite 외에 H1 runner를 같은 fixture로
1회 호출했고 내부 `runCount=2`로 실행했다. primary evidence는
`tmp/pptx-export-accuracy/session-1784276493844-39054/`이며 생성 artifact는 commit하지
않는다.

| 항목                            | 관측                                                               | 판정          |
| ------------------------------- | ------------------------------------------------------------------ | ------------- |
| 결정성                          | runner 1회 내부 `runCount=2`, artifact checksum과 metric checksum 동일 | 통과       |
| Artifact aggregate SHA-256      | `09c58b8c0636c1cb88e031cd7a9ace3eb2825bab06012a5eff4b693eb5f87460` | 동일          |
| Metric checksum                 | `13d47fd24dacde1c026f91ddd9c6111b21bd67c5b7a0ef0487f73185e44eb2d4` | 동일          |
| SSIM average/minimum/p50        | `0.903550 / 0.871000 / 0.903550`                                   | gate 통과     |
| Color MAE average/maximum       | `0.019612 / 0.022700`                                              | gate 통과     |
| Evaluated/missing/total         | `2 / 0 / 2`                                                        | 누락 없음     |
| Semantic assertions             | transition, timing, 4-mode animation, crop, chart, table 총 16건   | 모두 통과     |
| Diagnostics                     | degraded 1, intentional-hidden 1, skipped 2                        | baseline 일치 |
| Exporter warning reconciliation | expected/actual 3/3, missing·unexpected·unmapped 0                 | 통과          |

Slide별 SSIM은 text fixture `0.936100`, media fixture `0.871000`이다. H1은 isolated
LibreOffice profile에서 `--headless --convert-to pdf`를 실행한 뒤 PNG를 비교한다. 따라서
PPTX의 정적 LibreOffice 렌더 호환성은 증명하지만 GUI slideshow와 transition/motion live
playback은 증명하지 않는다. Browser의 WOFF2와 LibreOffice가 resolve한 OTF도 서로 다른
font file이므로 동일 font byte를 사용했다고 주장하지 않는다.

저장소의 portable baseline JSON은 현재 승인 계약이며 위 primary artifact는 승인 이후
`baseline-delta` 검증이다. 원래 `report-only` 후보 artifact는 이 worktree에 남아 있지
않으므로 후보 수집에서 승인까지의 독립 provenance는 **OPEN** 문서 gap으로 유지한다.
자동 acceptance 소스 commit은 editor shell과 E2E만 변경하며 exporter, H1 fixture,
scoring harness와 portable baseline 계약은 변경하지 않는다.

## 303 동적 콘텐츠 real-file sub-gate

상세 결과는 `editor-motion-303-acceptance-report.md`를 따른다.

| 항목                      | 관측                                                                                         | 판정           |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------------- |
| Input                     | 22,697,303 bytes, SHA-256 `5b0f55d00374c49b897805658d0fae822270ef6b74d74fd28b5cdd16d3a2f912` | read-only 사용 |
| Slide/transition          | 14장, fade 14개, 모두 700ms                                                                  | 통과           |
| Entrance                  | fade-in 20개, 모두 500ms                                                                     | 통과           |
| Start mode                | on-click 18, with-previous 2                                                                 | 통과           |
| Raw build/synthetic group | `bldP` 15, synthetic group target 3                                                          | 통과           |
| Coverage                  | absent 6, complete 1, partial 7, unknown 0                                                   | 일치           |
| Diagnostics               | downgraded 15, media excluded 3, interactive excluded 1, total 19                            | 일치           |
| Package preservation      | import/generation/empty-sync SHA 동일, empty-sync 적용 count 0                               | 통과           |

이 sub-gate는 parser count와 unchanged package byte preservation을 증명한다. 실제 ORBIT
UI 편집 후 sync와 LibreOffice live playback의 수동 증거는 아니다.

## 수동 release gate 결정

사용자가 건너뛰기로 지정한 네 항목은 `면제`로 기록하고 자동 증거를 실제 수동 검증으로
대체하지 않는다. read-only와 Escape ownership은 위 Chromium acceptance가 계약을 직접
검증하므로 자동 gate 통과로 기록한다.

| Gate                          | 필요한 직접 확인                                                                                                | 현재 상태                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| V1 zoom/rotation matrix       | 50/100/200%에서 rotated text/image/table의 render, click, marquee, drag, resize, snap, table hit, toolbar clamp | **면제 — 사용자 결정 2026-07-17**            |
| macOS Chrome Korean IME       | text/table cell의 실제 조합, no loss/dup/mid-commit, format, Cmd+Enter/blur 1회 commit, Escape, Undo, reload    | **면제 — 사용자 결정 2026-07-17**            |
| Windows Chrome Korean IME     | macOS와 같은 시나리오 및 Ctrl variant                                                                           | **면제 — 사용자 결정 2026-07-17**            |
| Read-only collaborator/viewer | 실제 role로 zoom/select 가능, mutation/drop/paste/crop/table 차단, version 불변                                 | **통과 — Chromium 자동 acceptance**          |
| Escape ownership              | modal/menu → crop/custom/text edit → insert tool → selection 순서에서 한 layer만 닫힘                           | **통과 — Chromium 자동 acceptance**          |
| LibreOffice GUI               | exported fixture의 정적 화면과 slideshow transition, 4-mode order/trigger live playback                         | **면제 — 사용자 결정 2026-07-17**            |

## V3 command ledger

기능 소스 commit `634391b8f30495593da6ae7eff681a2ea0a16ebf`와 동일한 staged
content checkpoint에서 아래 전체 명령을 실행한 뒤 해당 commit을 만들었다.

| 명령                                                                                             | 결과                                                         |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| `pnpm --filter @orbit/shared test`                                                               | 통과 — 37 files, 412 tests                                   |
| `pnpm --filter @orbit/editor-core test`                                                          | 통과 — 17 files, 142 tests                                   |
| `pnpm --filter @orbit/web test`                                                                  | 통과 — 205 files, 1,441 tests                                |
| `pnpm --filter @orbit/worker test`                                                               | 통과 — 43 files/329 tests, integration 4 files/10 tests skip |
| `pnpm lint`                                                                                      | 통과 — 17 tasks                                              |
| `pnpm test`                                                                                      | 통과 — 17 tasks; API 416 tests/1 skip 포함                   |
| `pnpm build`                                                                                     | 통과 — 10 tasks                                              |
| `cd services/python-worker && uv --cache-dir /tmp/orbit-python-worker-uv-cache run ruff check .` | 통과                                                         |
| `cd services/python-worker && uv --cache-dir /tmp/orbit-python-worker-uv-cache run mypy app`     | 통과 — 51 source files                                       |
| `cd services/python-worker && uv --cache-dir /tmp/orbit-python-worker-uv-cache run pytest`       | 통과 — 667 tests                                             |
| `node infra/scripts/check-env.mjs`                                                               | 통과                                                         |
| `docker compose config --quiet`                                                                  | 통과                                                         |
| H1 full runner 1회 (`runCount=2`)                                                                | 통과 — 위 primary evidence 참조                              |

## 종료 조건

자동 V1/V2/V3는 모두 green이며 지정된 수동 gate는 사용자 결정으로 면제됐다. 따라서 이
acceptance 범위는 완료로 판정한다. 실제 파일, 실제 IME, GUI playback을 실행한 것은 아니며,
합성 event, XML count, headless PNG를 해당 환경의 호환성 통과 증거로 해석하지 않는다.
