# PPTX export accuracy baseline

Deck → PPTX export fidelity는 LibreOffice 렌더와 ORBIT `/__deck-render` 렌더를 같은
1920×1080 조건에서 비교한다. 이 기준선은 이미지 평균 하나로 성공을 판정하지 않고,
슬라이드별 SSIM·색상 MAE와 OOXML 구조 assertion을 함께 기록한다.

## 실행

필수 도구 상태만 확인하려면 다음 명령을 사용한다.

```bash
node infra/scripts/run-pptx-export-accuracy.mjs --preflight
```

동일 fixture를 두 번 export/render/score하고 결정성을 확인하는 전체 흐름은 한
명령으로 실행한다.

```bash
node infra/scripts/run-pptx-export-accuracy.mjs
```

기본 실행은 저장소의 승인 baseline
`tools/pptx-accuracy/baselines/export-fidelity-baseline.json`을 적용한다. baseline이
없거나 schema가 잘못되면 자동으로 report-only로 낮추지 않고 실패한다. 새 기준선
후보를 수집할 때만 다음처럼 mode를 명시한다.

```bash
node infra/scripts/run-pptx-export-accuracy.mjs --report-only
```

`--report-only`와 `--baseline`은 함께 사용할 수 없다. runner는 필요한
shared/editor-core build와 매 실행마다 새로 소유하는 전용 Vite dev server를
준비한다. `PLAYWRIGHT_BASE_URL`의 외부 서버는 재사용하지 않으며, 전용 port가 이미
사용 중이면 stale server에 연결하지 않고 실패한다. 필요하면
`PPTX_EXPORT_ACCURACY_PORT`로 비어 있는 전용 port를 지정한다. 모든 PPTX, PDF,
PNG, manifest, JSON/Markdown report와 Playwright output은
`tmp/pptx-export-accuracy/session-*/` 아래에만 생성되며 Git 대상이 아니다.
동시 개발 중이라 다른 작업의 build 오류를 분리 진단해야 할 때만, 기존 build
산출물이 있다는 전제에서 `--skip-build`를 사용할 수 있다. CI와 clean checkout
검증에서는 이 옵션을 사용하지 않는다.

계획서의 단계별 명령도 지원한다.

```bash
cd services/python-worker
uv run python ../../tools/pptx-accuracy/prepare_deck_pptx_export_accuracy.py
cd ../..
PPTX_EXPORT_ACCURACY_MANIFEST=tmp/pptx-export-accuracy/run/manifest.json \
  node infra/scripts/run-playwright-test.mjs tests/e2e/pptx-konva-accuracy.spec.ts \
  --workers=1 --reporter=list \
  --output=tmp/pptx-export-accuracy/run/playwright-output
cd services/python-worker
uv run python ../../tools/pptx-accuracy/score_deck_pptx_export_accuracy.py
```

위 마지막 score 명령도 기본 승인 baseline을 사용한다. 단계별 initial snapshot을
만들 때는 `--report-only`를 명시한다.

## 고정 환경과 결정성

manifest에는 다음 값이 기록된다.

- viewport `1920×1080`, DPR `1`, locale `ko-KR`, timezone `UTC`
- fixture SHA-256
- Browser package font와 LibreOffice가 해석한 font file의 파일명과 SHA-256
- Python, Pillow, python-pptx, PyMuPDF, LibreOffice, browser version
- 환경 계약과 분리된 exporter source SHA-256
- image/font load 뒤 두 번의 `requestAnimationFrame`을 기다리는 capture policy

두 run은 LibreOffice PNG와 Browser PNG 전체의 aggregate checksum, metric payload
checksum, metric 값을 각각 비교한다. 어느 하나라도 다르면
`PPTX_EXPORT_ACCURACY_DETERMINISM.passed`가 `false`가 되고 명령이 실패한다. 이미지
크기가 다르면 resize하지 않고 `ACCURACY_DIMENSION_MISMATCH`로 실패한다.

## pixel metric과 구조 진단

각 slide에 SSIM과 정규화한 RGB color MAE를 기록하고 전체
`average/minimum/p50 SSIM`, `average/maximum color MAE`,
`evaluated/missing/total count`를 집계한다.

Exporter 경고 문자열이나 그 hash에는 판정을 의존하지 않는다. fixture element와
export capability에서 다음 stable code를 만들고, warning 대상 element를 하나씩
격리해 exporter를 실제 호출하는 `isolated-element-probe-v1`으로 관측 code를 만든다.
전체 export의 warning 수는 관측 code 수와 함께 대조하므로, code mapping이 빠졌는데
우연히 총개수만 같은 경우도 통과하지 않는다.

| code                                | disposition          | 의미                                            |
| ----------------------------------- | -------------------- | ----------------------------------------------- |
| `EXPORT_ELEMENT_INTENTIONAL_HIDDEN` | `intentional-hidden` | `visible: false`라 export에서 의도적으로 제외됨 |
| `EXPORT_GROUP_CONTAINER_SKIPPED`    | `skipped`            | group container 의미가 현재 exporter에 없음     |
| `EXPORT_ELEMENT_TYPE_UNSUPPORTED`   | `skipped`            | 현재 exporter가 지원하지 않는 element type      |
| `EXPORT_ARROWHEAD_DEGRADED_TO_LINE` | `degraded`           | arrow가 plain line으로 낮아짐                   |

새 warning이 생기거나 stable code를 probe 결과에 연결하지 못하면 reconciliation에
`missingCodes`, `unexpectedCodes`, `unmappedCount`를 기록하고
`ACCURACY_DIAGNOSTIC_WARNING_MISMATCH`로 실패한다. raw warning과 warning hash는
manifest나 baseline 계약에 넣지 않는다.

static screenshot으로 확인할 수 없는 항목은 PPTX ZIP 내부의 slide XML을 검사한다.

| assertion code                               | 검사 대상                                    |
| -------------------------------------------- | -------------------------------------------- |
| `OOXML_TRANSITION_COUNT`                     | `p:transition`, fixture 기대값 `1`           |
| `OOXML_TRANSITION_DURATION_MS_TOTAL`         | transition duration 합, fixture 기대값 `600` |
| `OOXML_TIMING_SLIDE_COUNT`                   | `p:timing`이 있는 slide 수, fixture 기대값 `1` |
| `OOXML_ANIMATION_EFFECT_COUNT`               | animation effect 수, fixture 기대값 `4`      |
| `OOXML_ANIMATION_DURATION_MS_TOTAL`           | animation duration 합, fixture 기대값 `1650` |
| `OOXML_ANIMATION_ON_SLIDE_ENTER_COUNT`       | on-slide-enter 수, fixture 기대값 `1`        |
| `OOXML_ANIMATION_ON_CLICK_COUNT`             | on-click 수, fixture 기대값 `1`              |
| `OOXML_ANIMATION_WITH_PREVIOUS_COUNT`        | with-previous 수, fixture 기대값 `1`         |
| `OOXML_ANIMATION_AFTER_PREVIOUS_COUNT`       | after-previous 수, fixture 기대값 `1`        |
| `OOXML_IMAGE_CROP_COUNT`                     | `a:srcRect` 수, fixture 기대값 `1`           |
| `OOXML_IMAGE_CROP_LEFT`                      | 유일한 `a:srcRect@l`, fixture 기대값 `20000` |
| `OOXML_IMAGE_CROP_TOP`                       | 유일한 `a:srcRect@t`, fixture 기대값 `10000` |
| `OOXML_IMAGE_CROP_RIGHT`                     | 유일한 `a:srcRect@r`, fixture 기대값 `15000` |
| `OOXML_IMAGE_CROP_BOTTOM`                    | 유일한 `a:srcRect@b`, fixture 기대값 `5000`  |
| `OOXML_CHART_REFERENCE_COUNT`                | `c:chart`, fixture 기대값 `1`                |
| `OOXML_TABLE_COUNT`                          | `a:tbl`, fixture 기대값 `1`                  |

crop은 네 edge의 합이나 평균으로 판정하지 않고 `l`, `t`, `r`, `b`를 각각 비교한다.
따라서 한 edge의 오차를 반대쪽 edge 값으로 보상해도 통과하지 않는다.
`OOXML_IMAGE_CROP_COUNT`가 `1`인지 함께 검사하므로 edge assertion이 가리키는
`a:srcRect`도 모호하지 않다.

fixture의 embedded crop 이미지는 결정성을 위한 1×1 PNG다. 따라서 이 fixture는 crop
영역의 시각적 충실도를 증명하지 않는다. crop 지원 여부와 수치는 OOXML 구조 assertion으로
검증하고, screenshot SSIM은 export 전후의 pixel 비회귀만 감시한다.

semantic assertion 실패는 최초 report-only 결과에 정직하게 남지만 initial baseline
수집 자체를 막지는 않는다. render 누락, dimension mismatch, diagnostic/warning 수
불일치는 harness 오류이므로 report-only에서도 실패한다.

## baseline 승인과 PR gate

후보 수집은 반드시 `--report-only`로 실행한다. 실제 LibreOffice/font/browser
환경에서 두 run의 artifact·score checksum과 metric이 모두 같은 report만 리뷰 후
portable baseline JSON으로 승격한다. 승인 artifact는 `kind`, `schemaVersion`,
`approval`과 metric/environment 계약만 가지며 생성된 PNG, PDF, PPTX 또는 absolute
path는 포함하거나 커밋하지 않는다.

승인 report를 지정하면 평균과 각 slide의 회귀를 모두 검사하는 delta gate가 켜진다.

```bash
node infra/scripts/run-pptx-export-accuracy.mjs \
  --baseline /absolute/path/to/approved-export-fidelity-baseline.json
```

기본 허용 delta는 0이다. fixture/font/tool/browser capture 환경이 baseline과 다르거나,
baseline/current의 slide 이름 집합 또는 semantic code 집합이 완전히 같지 않거나,
평균·slide별 SSIM이 낮아지거나, slide별 color MAE가 증가하거나, semantic assertion과
`skipped`/`degraded` 진단이 악화되면 실패한다. exporter source SHA-256은 provenance로
기록하지만 환경 동등성에는 넣지 않아 exporter 변경 자체가 metric gate를 선점하지
않는다. 환경을 의도적으로 바꾸는 PR은 새 report-only run의 결정성을 먼저 확인하고
baseline을 별도 리뷰한다.

승인 baseline이 없거나 `kind: deck-pptx-export-baseline`, `schemaVersion: 2` 계약을
만족하지 않으면 기본 score와 runner는 fail-closed한다.

## 현재 승인 baseline

2026-07-17에 crop, rich text, table, transition, 4-mode animation과 stable warning
probe가 반영된 fixture로 full runner를 실행했다. 저장소의 portable baseline JSON은
현재 승인 계약이다. 이 revision에 로컬로 남아 있는 primary artifact는 승인 이후
`baseline-delta` mode로 실행한 runner 1회(`runCount=2`)의 검증 결과이며, 두 내부 run은
다음 값을 동일하게 산출해 결정성 검사를 통과했다.

| 항목                         | 값                                                                 |
| ---------------------------- | ------------------------------------------------------------------ |
| fixture SHA-256              | `df187aa733caaa05a7a7bafb7db4749125f2559097df6b6935a05d95791d1416` |
| artifact aggregate SHA-256   | `09c58b8c0636c1cb88e031cd7a9ace3eb2825bab06012a5eff4b693eb5f87460` |
| metric payload SHA-256       | `13d47fd24dacde1c026f91ddd9c6111b21bd67c5b7a0ef0487f73185e44eb2d4` |
| average / minimum / p50 SSIM | `0.903550` / `0.871000` / `0.903550`                               |
| average / maximum color MAE  | `0.019612` / `0.022700`                                            |
| evaluated / missing / total  | `2` / `0` / `2`                                                    |

원래 후보를 수집한 `report-only` artifact는 이 worktree에 보존되어 있지 않다. 따라서
현재 artifact는 metric·결정성·승인 baseline 대비 delta를 증명하지만, 후보 수집에서
승인까지의 독립 provenance는 문서상 **OPEN**이다. 이 누락을 `baseline-delta` 결과로
대체해 승인 수집 mode였다고 주장하지 않는다. transition 1개/600ms, timing slide 1개,
animation 4개/1,650ms, 4가지
start mode 각 1개, crop count와 네 edge, chart, table을 포함한 semantic
assertion 16건이 모두 통과한다. 이후 actual이 baseline보다 멀어지거나 기존
pass가 fail로 바뀌면 delta gate가 실패한다. infrastructure failure, 이미지
누락·크기 불일치, browser capture 환경 불일치, exporter warning reconciliation
불일치는 report-only와 baseline-delta 둘 다 즉시 실패한다.
