# On-device STT 적용 기준

## 목적

브라우저 온디바이스 한국어 STT를 라이브 발표의 실시간 제어 경로에 적용하기 위한 기준을 정리한다.

제품 방향은 하이브리드 STT다.

- 온디바이스 STT: 라이브 발표 중 키워드 체크, 애니메이션 강조, 자동/보조 슬라이드 전환처럼 지연 시간이 중요한 작업에 사용한다.
- OpenAI STT/API: 리허설 녹음 이후 억양, 말 속도, 코칭 리포트 분석에 필요한 데이터를 생성하는 서버 경로에서 사용한다.

1차 온디바이스 후보는 sherpa-onnx WebAssembly와 Korean Streaming Zipformer INT8 모델이다.

## 검증 항목

- Chrome desktop에서 모델 로딩 가능 여부
- 모델 크기와 초기 로딩 시간
- 실시간 지연 시간
- 한국어 키워드 인식률
- 네트워크 단절 시 라이브 키워드 체크, 강조, 슬라이드 전환 흐름 유지 여부
- 키워드 기반 hotword/glossary 적용 가능성
- 브라우저 마이크 입력 전처리 적용 여부

## 범위 분리

- 이 문서는 라이브 발표용 온디바이스 STT 적용 기준만 다룬다.
- OpenAI STT/API를 이용한 리허설/코칭 분석 경로는 별도 서버 STT 작업에서 다룬다.
- 라이브 발표 중 raw audio를 서버로 업로드하지 않는다.
- 리허설/코칭 분석 경로에서 업로드된 raw audio는 보고서 생성 후 삭제하고, 전사문 보존 여부는 사용자 선택을 따른다.

## 적용 기준

- 온디바이스 모델 artifact URL/version이 기록되어 있어야 한다.
- 초기 다운로드 크기와 모델 load time이 기록되어 있어야 한다.
- 라이브 제어에 필요한 transcript latency 기준을 만족해야 한다.
- 발표 키워드 fixture에서 keyword recall과 false trigger 결과가 기록되어 있어야 한다.
- local model unavailable, microphone denied, WASM load failure 상태를 UI와 테스트에서 다룰 수 있어야 한다.
