# On-device STT 적용 기준

## 목적

브라우저 온디바이스 한국어 STT를 라이브 발표의 실시간 제어 경로에 적용하기 위한 기준을 정리한다.

제품 방향은 하이브리드 STT다.

- 온디바이스 STT: 라이브 발표 중 키워드 체크, 애니메이션 강조, 자동/보조 슬라이드 전환처럼 지연 시간이 중요한 작업에 사용한다.
- OpenAI STT/API: 리허설 녹음 이후 억양, 말 속도, 코칭 리포트 분석에 필요한 데이터를 생성하는 서버 경로에서 사용한다.

현재 온디바이스 구현은 Chrome Web Speech API의 on-device recognition이다. Sherpa ONNX 모델 경로는 legacy 코드로 남아 있지만 기본 실행 경로가 아니다.

## 현재 통합 지점

- Web 리허설 모드는 `LiveSttAdapter.start(stream, callbacks)` 인터페이스로 Live STT를 시작한다.
- 기본 구현은 `WebSpeechLiveSttAdapter`이며 `SpeechRecognition.processLocally = true`로 실행한다.
- 기본 언어는 `ko-KR`, 목적 품질은 `quality = "command"`다.
- 시작 시 `SpeechRecognition.available({ langs: ["ko-KR"], processLocally: true, quality: "command" })`를 확인한다.
- 한국어 온디바이스 언어팩이 `downloadable` 또는 `downloading`이면 `SpeechRecognition.install()`을 자동 시도한 뒤 다시 확인한다.
- `SpeechRecognitionPhrase`와 `recognition.phrases`가 지원되면 slide/keyword/control phrase bias context를 브라우저 로컬 phrase로 전달한다.
- 라이브 발표 중 raw audio를 서버로 업로드하지 않는다.

## 검증 항목

- Chrome desktop에서 Web Speech on-device API 지원 여부
- 한국어 언어팩 availability/install 성공 여부
- 언어팩 미지원, 설치 실패, microphone denied 상태의 UI 오류 처리
- 실시간 transcript latency와 partial/final 이벤트 수신 여부
- 한국어 키워드 인식률과 false trigger 결과
- 네트워크 단절 시 이미 설치된 온디바이스 언어팩으로 라이브 제어 흐름 유지 여부
- browser debug mode 외 transcript text 미로그 여부

## 범위 분리

- 이 문서는 라이브 발표용 온디바이스 STT 적용 기준만 다룬다.
- OpenAI STT/API를 이용한 리허설/코칭 분석 경로는 별도 서버 STT 작업에서 다룬다.
- 라이브 발표 중 raw audio를 서버로 업로드하지 않는다.
- 리허설/코칭 분석 경로에서 업로드된 raw audio는 보고서 생성 후 삭제하고, 전사문 보존 여부는 사용자 선택을 따른다.

## 적용 기준

- `LIVE_STT_PROVIDER=web-speech` 계약이 `.env.example`, `packages/shared`, API/Python config 검증에서 일관되어야 한다.
- Chrome on-device API 미지원 또는 한국어 언어팩 미가용 상태는 `LIVE_STT_MODEL_UNAVAILABLE`로 처리되어야 한다.
- 라이브 제어에 필요한 transcript latency 기준을 만족해야 한다.
- 발표 키워드 fixture에서 keyword recall과 false trigger 결과가 기록되어 있어야 한다.
- 서버 로그, API 로그, Worker 로그, durable storage에 raw audio, transcript 원문, speaker notes가 남지 않아야 한다.
