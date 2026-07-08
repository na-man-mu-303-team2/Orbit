# AI template PPTX evaluation notes

이 문서는 GitHub 이슈 #145, #147, #154, #175의 완료 여부를 같은 기준으로 판단하기 위한 평가 기록이다.

## 평가 기준

| 영역 | 통과 기준 | 실패로 보는 신호 |
| --- | --- | --- |
| Render/thumbnail | 최종 Deck의 `metadata.thumbnailSource`가 `import-render`이고, 생성 슬라이드 수만큼 render asset이 존재한다. `pptx-ooxml-sync` warning이 없다. | `canvas` thumbnail 유지, `Rendered slide asset missing`, `OOXML source missing for ...` warning |
| Template selection | 참조 PPTX가 충분한 슬라이드를 제공하면 `selected source unique / generated slides >= 0.8`, `layout unique / generated slides >= 0.4`를 만족한다. 같은 source/layout이 연속 반복되지 않는다. | `10/11/10/11...`처럼 소수 source 반복, `image/image/...` 같은 layout 반복 |
| Slot semantics | 본문형 발표 자료는 `body` 또는 body-like slot이 충분히 존재하고, 긴 본문이 `title`, `metric`, `caption`에 과도하게 배치되지 않는다. | `slot_body = 0`, text 대부분이 `caption`, fallback body 생성 |
| Visual fit | 저장 좌표 기준 `overlap_pairs = 0`, 브라우저 validation의 overflow/contrast warning이 0에 가깝다. | title/body/caption 박스 겹침, text overflow, contrast warning |
| Issue closure | 85점 이상이면 완료 처리 가능, 70-84점은 조건부, 70점 미만은 완료 처리하지 않는다. | 정량 지표가 기준 미달이거나 재현 케이스가 남아 있음 |

## 현재 확인한 케이스

로컬 DB 기준 `sourceType = "ai"` Deck은 60개다. 최근 8개 AI template PPTX 생성 결과를 같은 쿼리로 비교했다.

| project tail | slides | selected sources | layouts | source unique | layout unique | text body | text caption | slot body | slot caption | overlap pairs | thumbnail |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| b7056753 | 4 | 7/9/3/4 | metric/metric/title/title | 4 | 2 | 4 | 16 | 0 | 2 | 8 | canvas |
| 5ba5a316 | 10 | 1/10/11/4/3/6/2/8/12/9 | title/image/image/toc/toc/toc/toc/toc/toc/toc | 10 | 3 | 13 | 68 | 8 | 5 | 2 | import-render |
| d141912f | 10 | 1/10/11/10/11/10/11/10/11/10 | title/image/image/image/image/image/image/image/image/image | 3 | 2 | 40 | 147 | 39 | 10 | 5 |  |
| 6c960392 | 8 | 1/10/11/10/11/10/11/1 | title/image/image/image/image/image/image/title | 3 | 2 | 26 | 102 | 24 | 8 | 5 |  |
| 6250742e | 10 | 1/10/11/10/11/10/11/10/11/1 | title/image/image/image/image/image/image/image/image/title | 3 | 2 | 34 | 134 | 32 | 10 | 6 |  |
| 45b56c0d | 7 | 10/11/10/11/10/1/11 | image/image/image/image/image/title/image | 3 | 2 | 25 | 99 | 24 | 7 | 4 |  |
| 1f61361a | 8 | 1/10/11/10/11/10/11/1 | title/image/image/image/image/image/image/title | 3 | 2 | 26 | 102 | 24 | 8 | 5 |  |
| df75bbfd | 6 | 1/10/11/1/1/10 | title/image/image/title/title/image | 3 | 2 | 18 | 57 | 15 | 6 | 4 |  |

## 현재 프로젝트 평가

대상: `project_61716430-f7e1-4961-bb6b-4d94b7056753`

- 생성 슬라이드는 4장이고 참조 source는 `7/9/3/4`로 선택되어 있다. 즉, 참조 PPTX 선택 로직이 완전히 미동작인 상태는 아니다.
- layout은 `metric/metric/title/title`로 2종류뿐이다. 본문/발표 흐름에 맞는 레이아웃 선택은 부족하다.
- template content slot은 `title=19`, `body=0`, `caption=2`, `metric=4`다. 본문이 들어갈 슬롯이 없어서 생성 Deck에는 fallback body가 생긴다.
- 저장 Deck 텍스트는 `body=4`, `caption=16`이다. 본문성 텍스트가 caption 계열에 많이 들어간다.
- 저장 좌표 기준 text overlap은 8쌍, 3개 슬라이드에서 발생한다.
- 브라우저 validation에서는 13개 AI warning, 7개 contrast warning, 4개 overflow warning을 확인했다.
- `metadata.thumbnailSource`는 `canvas`다. 현재 계약은 최종 AI template deck thumbnail이 render asset에서 와야 하며 `import-render`를 저장해야 한다.
- `pptx-ooxml-sync` job은 성공하지만 `OOXML source missing for el_1_body_fallback`, 이미지, 일부 text element warning이 반복된다.

## 이슈별 결론

| issue | 점수 | 완료 처리 | 근거 |
| --- | ---: | --- | --- |
| #175 caption slot 처리 기준 통일 | 85 | 조건부 가능 | Python 경로는 caption을 body-like slot으로 처리하고 테스트가 있다. Worker 쪽 직접 caption-only 회귀 테스트를 추가하면 더 명확하다. |
| #154 발표 분량에 맞는 reference PPTX slide 선택 | 45 | 불가 | 일부 케이스는 source를 고르지만 최근 8개 중 다수가 `10/11` 반복이다. layout 다양성, content capacity, 인접 반복 방지 기준이 부족하다. |
| #147 의미 추론 삽입 타이밍/생성 시간 최적화 결정 | 35 | 불가 | role inference와 selection 결과가 품질 gate로 연결되지 않는다. benchmark/결정 문서와 fallback 비용/타이밍 기준도 부족하다. |
| #145 원본 PPTX 의미 추론 및 발표 콘텐츠 슬롯 매핑 | 40 | 불가 | slot role이 title/caption/metric에 치우치고 `slot_body=0` 케이스가 발생한다. fallback body는 OOXML source가 없어 sync warning과 시각 겹침을 만든다. |

## 문제 범위

1. 참조 슬라이드 선택은 실행되지만, source/layout 반복을 막는 점수 항목이 약하다.
2. template slot role 추론이 본문형 텍스트를 `body`로 충분히 분류하지 못한다.
3. 생성 Deck 보정 단계에서 fallback body를 만들지만, 이 요소는 원본 OOXML source와 연결되지 않아 PPTX sync warning을 만든다.
4. validation warning이 생성 실패/재시도 조건으로 쓰이지 않아 겹침과 overflow가 그대로 저장된다.
5. 과거 또는 일부 생성 결과는 render asset이 있어도 Deck metadata thumbnail source가 `canvas`로 남는다.

## 다음 테스트 계획

| 케이스 | 목적 | 기대 결과 |
| --- | --- | --- |
| Caption-only template slot | #175 회귀 방지 | Python/Worker 모두 caption slot에 본문 메시지를 안정적으로 배치 |
| 10장 참조 PPTX -> 10장 생성 | #154 반복 방지 | source unique >= 8, layout unique >= 4, 같은 source 3회 이상 반복 없음 |
| 10장 참조 PPTX -> 4장 생성 | #154 분량 선택 | cover/body/summary 성격이 섞이고, metric/title만 선택되지 않음 |
| body slot이 없는 PPTX | #145 fallback 검증 | fallback을 만들기 전에 가장 가까운 content slot을 body-like로 승격하거나, OOXML-backed slot만 사용 |
| render asset missing 재현 fixture | thumbnail 계약 검증 | slide 수와 render asset 수가 일치하고 `thumbnailSource = "import-render"` |
| browser validation smoke | visual fit gate | overlap/overflow/contrast warning이 기준 초과 시 완료 처리하지 않음 |
