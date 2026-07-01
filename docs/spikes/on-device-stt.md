# On-device STT 적용 기준

## 목적

브라우저 온디바이스 한국어 STT를 라이브 발표의 실시간 제어 경로에 적용하기 위한 기준을 정리한다.

제품 방향은 하이브리드 STT다.

- 온디바이스 STT: 라이브 발표 중 키워드 체크, 애니메이션 강조, 자동/보조 슬라이드 전환처럼 지연 시간이 중요한 작업에 사용한다.
- OpenAI STT/API: 리허설 녹음 이후 억양, 말 속도, 코칭 리포트 분석에 필요한 데이터를 생성하는 서버 경로에서 사용한다.

1차 온디바이스 후보는 sherpa-onnx WebAssembly와 Korean Streaming Zipformer INT8 모델이다. Moonshine 한국어는 sherpa 경로 검증 이후의 교체 후보로 `orbit.liveStt.engine=moonshine` 플래그 뒤에 통합한다.

## 현재 통합 지점

- Web 리허설 모드는 `LiveSttAdapter.start(stream, callbacks)` 인터페이스로 Live STT를 시작한다.
- 기본 구현은 sherpa-onnx WebAssembly runtime과 `sherpa-onnx-streaming-zipformer-korean-2024-06-16` manifest를 lazy-load한다.
- 기본 manifest 경로는 `/models/live-stt/sherpa-onnx-streaming-zipformer-korean-2024-06-16/manifest.json`이다.
- Moonshine 한국어 구현은 `MoonshineLiveSttAdapter`와 `moonshineWorker.ts`를 사용하며, localStorage `orbit.liveStt.engine=moonshine`일 때만 선택된다.
- Moonshine 경로는 `transformers.js` + `onnxruntime-web`으로 `onnx-community/moonshine-tiny-ko-ONNX`를 Web Worker에서 로드하고 WebGPU 실패 시 WASM으로 폴백한다.
- 대형 `.onnx`, `.wasm`, `.data` 파일은 git에 커밋하지 않고 `apps/web/public/models/live-stt` 아래에 로컬/배포 asset으로 둔다.
- 로컬 준비 명령은 `pnpm --filter @orbit/web stt:model:prepare -- --source <model-dir> --runtime <wasm-runtime-dir>`를 사용한다.
- Moonshine/sherpa 품질 비교는 `pnpm --filter @orbit/web stt:evaluate -- --predictions <predictions.json>`와 `apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json`을 기준으로 기록한다.

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
- Moonshine 한국어는 상업 라이선스와 모델 자산 재배포 조건이 문서화되기 전 프로덕션 기본 엔진으로 전환하지 않는다.
