# On-device STT Spike

## 목적

브라우저 안에서 한국어 실시간 STT를 수행할 수 있는지 확인한다. 1차 후보는 sherpa-onnx WebAssembly와 Korean Streaming Zipformer INT8 모델이다.

## 검증 항목

- Chrome desktop에서 모델 로딩 가능 여부
- 모델 크기와 초기 로딩 시간
- 실시간 지연 시간
- 한국어 키워드 인식률
- 네트워크 단절 시 리허설/라이브 발표 흐름 유지 가능성

## 운영 fallback

서버 STT는 Amazon Transcribe를 기준으로 한다. 서버로 오디오를 전송하려면 사용자 동의 flag가 반드시 필요하며, raw audio는 보고서 생성 후 삭제하는 정책을 검증해야 한다.

