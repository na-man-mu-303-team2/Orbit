# 발표 애니메이션 흐름 네비게이터·롤백

## 목적

리허설과 실전 발표에서 좌측 독립 drawer로 장표별 애니메이션 타임라인을 확인하고, 원하는 장표 또는 애니메이션 완료 시점으로 즉시 복구한다.

## 동작 원칙

- 기본으로 닫힌 좌측 `애니메이션 타임라인` drawer를 통해 모든 장표를 목록으로 표시하며, 자동 시작·클릭·키워드 발화 트리거를 구분한다.
- 단계 이동은 전환 효과를 다시 재생하지 않고 목적 상태를 즉시 복원한다.
- 복원 시 `playedAnimationIds`와 소비된 `keyword-occurrence`를 함께 재구성한다.
- Activity/결과 장표는 운영 세션을 건드리지 않고 장표 위치만 이동한다.

## 구현 경계

- `AnimationFlowNavigator`는 `createSlideshowAnimationPlan`으로 표시 모델을 만들고, 리허설과 실전 발표가 같은 좌측 drawer UI를 사용한다.
- `restoreSlidePlaybackAtStep`은 UI와 분리된 순수 helper로 상태 복원을 담당한다.
- 리허설은 기존 `SlideAssetNavigationGate`로 asset 준비를 보장하고, 실전 발표는 STT 발화 버퍼를 초기화해 이전 인식 결과의 재실행을 막는다.

## 검증

- 목표 step의 화면 상태, 재생된 animation ID, 소비된 occurrence ID가 일치해야 한다.
- 복원 뒤 클릭·키워드 발화는 목표 step 다음 단계부터 진행해야 한다.
- Activity 장표의 투표·QR·결과 세션은 네비게이터 이동으로 재시작하거나 변경되지 않아야 한다.
