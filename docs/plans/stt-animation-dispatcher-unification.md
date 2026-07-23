# STT 이벤트 기반 애니메이션 Dispatcher 통합

## 요약

STT 결과의 증분 구간을 수신 즉시 공통 dispatcher에 전달해 키워드 occurrence 기반 애니메이션을 판정한다. 발표자 모드, 전체 리허설, 부분 리허설은 같은 순수 dispatcher와 기존 playback resolver를 사용한다.

P3는 대본 추적, 자동 스크롤, 리포트 수집을 계속 담당하지만 애니메이션 실행의 입력 경로는 아니다.

## 구현

- `dispatchKeywordOccurrencePlayback`은 현재 step 매칭, 미래 occurrence 대기열, action 해석, 실행 가능한 playback update를 계산한다.
- `transcriptRevisionState`가 만든 non-stale 증분만 dispatcher로 전달한다. 렌더 이후 최신 transcript를 다시 읽어 판단하지 않는다.
- 실전 발표은 `usePresentationSpeech` callback ref에서, 전체 리허설과 부분 리허설은 기존 STT callback에서 dispatcher를 호출한다.
- 현재 step만 자동 실행하고, 미래 step은 대기 후 클릭 대체 진행에서 순서대로 처리한다. generic keyword/cue 경로는 유지한다.
- `animationDebug=1`은 dispatcher 결과를 세 모드에서 동일하게 표시한다.

## 검증

- 연속 partial/final, 중복 revision, 반복 키워드, 미래 키워드 대기, 다중 효과 occurrence, `go-to-next-slide`를 단위 테스트한다.
- 발표자 모드·전체 리허설·부분 리허설에서 2개 이상 키워드 애니메이션이 각 STT 이벤트마다 순차 실행되는지 브라우저로 확인한다.
- 전체 리허설의 P3 추적·자동 스크롤·리포트 흐름이 유지되는지 확인한다.
