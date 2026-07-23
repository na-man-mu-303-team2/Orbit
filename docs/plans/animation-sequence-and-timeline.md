# 애니메이션 순서 편집·대본 트리거 통합 타임라인

## 구현 개요

장표별 `DeckAnimation.order`를 발표의 단일 순서로 사용한다. 대본 위치에 연결된
`keyword-occurrence` 효과는 항상 발표 메모의 occurrence 순서로 계산하고, 수동 효과는
그 사이를 포함한 통합 순서에서만 이동할 수 있다.

## 구현 범위

- `buildSlidePresentationSequence`가 animation timeline, 리허설, 실전 발표에 공통 순서를 제공한다.
- 같은 occurrence의 효과는 하나의 발화 step으로 함께 재생하되, 타임라인에는 효과별 행으로 표시한다.
- 우측 애니메이션 패널의 `발표 순서`에서 수동 step만 드래그할 수 있다. 저장 시 모든 효과의
  `order`를 밀집된 고유 순번으로 다시 쓴다.
- keyword occurrence 효과를 생성하면 occurrence 위치 앞의 keyword step을 찾아 그 위치에 삽입한다.
  동일 occurrence의 추가 효과는 같은 step에 연결한다.
- 대본 순서와 저장된 keyword step 순서가 어긋나면 패널에 검토 상태를 표시한다. 대본 위치가 없는
  legacy `keyword` action은 대본 위치 재연결이 필요한 항목으로 표시한다.
- 미래 keyword occurrence를 먼저 인식하면 재생·소비하지 않고 대기한다. 클릭은 현재 step만 실행하므로
  앞선 수동 step을 먼저 실행하고, 이어지는 클릭에서 대기한 keyword step을 대체 진행한다.
- 리허설과 실전 발표 모두 동일한 재생/소비 state 업데이트를 사용한다.

## 검증 항목

- 대본 뒤쪽 keyword 효과를 먼저 만들었어도 실제 step은 대본 occurrence 순서를 따른다.
- 수동 step을 keyword step 전·사이·후에 옮긴 뒤에도 모든 `order`가 고유하며 reload 후 순서가 유지된다.
- 동일 occurrence의 효과는 한 step으로 실행되고, 타임라인에는 각 효과가 표시된다.
- 미래 keyword 감지 후 클릭 진행은 앞 step부터 한 번씩 실행하며, 이미 클릭으로 실행한 occurrence는
  이후 발화해도 중복 실행하지 않는다.
- legacy keyword, activity slide, timeline 복원, 애니메이션 삭제 체인은 기존 동작을 유지한다.
