# 슬라이드 리디자인 M1 QA 기록

- 검증일: 2026-07-22
- 대상 branch: `feature/slide-redesign-agent-v2-pr06-m1-verification`
- 범위: M1 골든 fixture 14종, 리디자인 proposal 적용 경계, 단일 undo 복구
- 판정: 자동 안전성 gate 통과, 사람 중심 시각 QA 미실행

## 자동 검증 요약

| Gate | 결과 | 판정 |
| --- | --- | --- |
| M1 골든 fixture | 14/14 기대 outcome 범위 충족 | 통과 |
| 불변식 I1~I8 | provenance, cardinality, 안전 후보, 빈 operation, 내부 key, text 보존, delete 순서 | 통과 |
| API proposal 경계 | 적용 전 Deck patch 검증, 빈 operation proposal 미노출 | 통과 |
| Web 단일 undo | apply 1회 후 undo 1회로 원래 element 상태 복구 | 통과 |
| Python worker 전체 | 941 passed, 1 skipped; ruff·mypy 통과 | 통과 |
| API 전체 | 600 passed, 1 skipped | 통과 |
| Web 전체 | 1,796 passed | 통과 |
| Workspace 정적 검증 | lint 17/17, typecheck 17/17 | 통과 |
| Compose health | API liveness·readiness, Python health 응답 확인 | 통과 |
| Chromium smoke | 동일 리디자인 E2E 연속 2회 통과 | 통과 |

자동 검증은 Deck JSON과 operation 계약을 대상으로 한다. 실제 브라우저 렌더링의 overflow, 요소 overlap, 대비, 시선 흐름, 전체 인상은 이 결과만으로 통과 처리하지 않는다.

## 골든 fixture 판정

| Fixture | 기대 outcome | 자동 확인 항목 | 결과 |
| --- | --- | --- | --- |
| `cover-title-subtitle` | `applicable` | 제목·부제 원문 segment 보존 | 통과 |
| `process-three-items` | `applicable` | 3단계 원문 segment 보존 | 통과 |
| `timeline-five-items` | `applicable` | 5개 시점 원문 segment 보존 | 통과 |
| `comparison-two-columns` | `applicable` | 비교 문구 원문 segment 보존 | 통과 |
| `kpi-three-items` | `applicable` | KPI 값과 원문 segment 보존 | 통과 |
| `quote` | `applicable` | 인용문 원문 segment 보존 | 통과 |
| `single-bullet-five-items` | `applicable` | bullet 5개 보존, delete operation 후행 | 통과 |
| `bullet-with-animation` | `refused-unsafe` | animation 참조가 있는 전체 리디자인 거부 | 통과 |
| `long-text` | `applicable` 또는 `fallback-allowed` | 축약·새 사실 생성 없이 원문 보존 가능한 경로 | 통과 |
| `chart-unsafe` | `refused-unsafe` | chart 포함 전체 리디자인 거부, 빈 operations | 통과 |
| `table-unsafe` | `refused-unsafe` | table 포함 전체 리디자인 거부, 빈 operations | 통과 |
| `image-unsafe-m1` | `refused-unsafe` | M1 image 포함 전체 리디자인 거부, 빈 operations | 통과 |
| `locked-element` | `applicable` | `el_locked` 미수정·최종 Deck 유지 | 통과 |
| `canvas-four-three` | `fallback-allowed` | 4:3 canvas 비율 유지 fallback | 통과 |

적용 가능한 fixture에는 공통으로 다음 불변식을 검사했다.

- 원본의 모든 비잠금 text segment가 최종 element text에 존재한다.
- `sourceElementId`, `_contentItemIds` 같은 내부 key가 operation에 노출되지 않는다.
- `update_element_props`가 `props.text`를 변경하지 않는다.
- `delete_element`가 존재하면 모든 delete operation은 목록 끝에 모인다.

## 실행 명령

```bash
cd services/python-worker
uv run pytest tests/test_slide_redesign_invariants.py
uv run ruff check .
uv run mypy app

set -a
source .env.example
set +a
ADAPTIVE_REHEARSAL_COACH_ENABLED=false \
FOCUSED_PRACTICE_ENABLED=false \
CHALLENGE_QNA_ENABLED=false \
SLIDE_PRACTICE_ENABLED=false \
SLIDE_QUESTION_GUIDES_ENABLED=false \
  pnpm --filter @orbit/api test
APP_ENV=test API_BASE_URL=http://127.0.0.1:3000 WEB_PORT=5173 \
  pnpm --filter @orbit/web test
pnpm lint
pnpm typecheck
pnpm test:smoke --grep "slide redesign"
```

`.env.example`의 feature flag 기본값은 runtime-config 단위 테스트의 기본 비활성 가정과 다르다. API 전체 회귀는 비밀값 없이 샘플 환경을 읽고 위 5개 flag를 `false`로 명시해 실행했다.

## 수동 시각 QA 상태

실제 화면 캡처를 기준으로 한 사람 중심 시각 QA는 아직 실행하지 않았다. 따라서 다음 항목은 미검증이며 M1 자동 안전성 gate와 별도다.

- 16:9 및 4:3에서 text overflow와 요소 overlap
- 배경·본문·강조색의 실제 렌더링 대비
- 제목, 핵심 메시지, 본문 사이의 시각적 위계와 시선 흐름
- 14개 시나리오의 전체 인상과 브랜드 일관성
- 브라우저·폰트 렌더링 차이에 따른 줄바꿈

수동 시각 QA를 수행할 때는 fixture별 Before/After 캡처와 `overflow`, `overlap`, `contrast`, `hierarchy`, `overall impression` 판정을 이 문서에 추가한다. 현재 판정은 출시 승인이나 시각 품질 승인으로 해석하지 않는다.
