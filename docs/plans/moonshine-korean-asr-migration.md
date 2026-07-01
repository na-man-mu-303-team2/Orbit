# Plan: Live STT 엔진 Moonshine 한국어 교체

**상태:** 로컬/스테이징 검증용 구현 완료, 프로덕션 컷오버는 실측 게이트 대기
**작성일:** 2026-07-01
**짝 문서:** [spec/ADR](../specs/moonshine-korean-asr-migration.md)
**전략:** 신규 `MoonshineLiveSttAdapter`를 기능 플래그 뒤에 추가 → 실측(정확도·지연) → canary → 컷오버 → sherpa 제거. 기존 `LiveSttAdapter` 계약을 유지해 리허설 제품 로직·`packages/shared` 스키마는 변경하지 않는다.

**현재 구현 메모(2026-07-01):** M2~M4와 M5 하네스, M6 엔진 플래그/자가호스팅 옵션·준비 스크립트/디버그 지표는 구현됐다. M0는 사용자 승인 완료로 기록한다. Synthetic macOS `Yuna` fixture로 WebGPU/WASM 측정도 수행했으나 품질 게이트는 실패했다. 실제 사람 음성 fixture, staging canary, 기본 엔진 컷오버는 아직 완료 조건이 충족되지 않았다.

---

## 1. 마일스톤 개요

| # | 마일스톤 | 목적 | 게이트/산출물 | 현재 상태 |
|---|---|---|---|---|
| M0 | 라이선스 클리어런스 | 상업 사용 가부 확정 | 라이선스 결정 문서 (진행/폴백) | 완료(사용자 승인) |
| M1 | 스파이크/PoC | 브라우저에서 한국어 전사 실제 확인 | 통합 경로 + 지연/CER 초기치 | synthetic 실측 완료, 품질 no-go |
| M2 | 어댑터 구현 | 계약 준수 어댑터 + 워커 | `MoonshineLiveSttAdapter` + 단위테스트 | 완료 |
| M3 | VAD 세그먼트 | 라이브 발화 경계 처리 | VAD 세그먼터 + 세그먼트 final | 완료 |
| M4 | 키워드 후처리 패리티 | hotword 상실 보완 | 후처리 바이어스 연결 + 매칭 개선 | 완료 |
| M5 | 평가 하네스 + 튜닝 | recall/CER/지연 측정·튜닝 | CER 하네스 + 튜닝 리포트 | synthetic 리포트 완료, 사람 음성 대기 |
| M6 | 플래그 롤아웃(canary) | 무중단 A/B | 엔진 플래그 + 스테이징 canary | 플래그·디버그 지표 완료, canary 대기 |
| M7 | 컷오버 & 정리 | 기본 엔진 전환 | Moonshine 기본화, sherpa 제거/보존 결정 | 품질 게이트 대기 |

M0는 M6(프로덕션 노출)의 **차단 선행조건**. M1~M5는 M0와 병행 가능(비프로덕션).

---

## 2. 작업 분해 (Work Breakdown)

### M0 — 라이선스 클리어런스 *(차단 게이트)*
- [x] `UsefulSensors/moonshine-tiny-ko` 라이선스 원문 확보 및 상업/재배포 조건 정리. 사용자 승인 완료로 확인(2026-07-01). 계약 원문·비용·연락 내역은 저장소 밖에서 관리한다.
- [x] 상업 사용 필요 시 Moonshine AI에 상업 라이선스 문의(연락·조건·비용). 사용자 승인 완료 상태를 기준으로 구현을 계속한다.
- [x] 자가 호스팅(모델 자산 재배포) 허용 여부 확인. 자가호스팅 경로는 `orbit.liveStt.moonshine.localModelPath=/models/live-stt/`와 `orbit.liveStt.moonshine.allowRemoteModels=0`로 구현했다.
- [x] 결정 기록: A안(Moonshine) 진행. 세부 기록은 `docs/spikes/moonshine-korean-asr.md`의 license gate 메모를 따른다.

### M1 — 스파이크 / PoC
- [x] `transformers.js`(v3+) + `onnxruntime-web` 의존성 추가(`apps/web`), 번들 영향 측정. 현재 Vite build 기준 `moonshineWorker` 약 869 kB, ORT WASM 약 21.6 MB 경고가 기록된다.
- [x] `pipeline("automatic-speech-recognition", "onnx-community/moonshine-tiny-ko-ONNX")` 통합 경로 구현. 격리 페이지 대신 `MoonshineLiveSttAdapter`/worker가 기능 플래그 뒤에서 직접 로드한다.
- [x] WebGPU 경로 + WASM fallback 각각 동작·지연 측정. Synthetic `Yuna` fixture 기준 WebGPU는 WGSL validation 경고와 no-go 품질, WASM은 실행 가능하지만 recall 0.333으로 no-go.
- [x] `dtype`(encoder fp32 / decoder q4 등) 조합별 크기·정확도·속도 비교. Synthetic baseline에서 WASM q4/q8을 비교했고 q8은 CER만 소폭 개선, recall은 동일했다.
- [x] `test_wavs` 및 리허설 대표 발화로 초기 CER/키워드 recall 스냅샷. 현재 기록은 synthetic TTS baseline이며, 사람 음성 fixture는 후속 필수다.
- [x] 산출물: 스파이크 노트(`docs/spikes/moonshine-korean-asr.md`) + go/no-go 판단.

### M2 — 어댑터 구현
- [x] `apps/web/src/features/rehearsal/moonshineLiveSttAdapter.ts` 신규 — `LiveSttAdapter` 구현(`start/stop/dispose/updateBiasContext`).
- [x] `apps/web/src/features/rehearsal/moonshineWorker.ts` 신규 — 워커에서 transformers.js 파이프라인 로드/추론, 인바운드/아웃바운드 메시지 계약 정의(sherpa 워커 메시지 형태 참고).
- [x] 캡처 재사용: `liveSttPcmCapture.worklet.js`, `resampleFloat32Audio`, `calculatePcmAudioLevel` 그대로 연결.
- [x] 아웃바운드 `partial/final`을 `liveSttPartialTranscriptEventSchema`에 맞춰 방출(스키마 무변경).
- [x] `max_length` 토큰 상한(≈ `seq_len * 13/16000`)으로 할루시네이션 루프 억제.
- [x] 오류 코드 매핑: 모델/워커/WebGPU 실패 → 기존 `LIVE_STT_MODEL_UNAVAILABLE` / `LIVE_STT_START_FAILED` 재사용.
- [x] 단위 테스트 `moonshineLiveSttAdapter.test.ts`(워커·파이프라인 목).

### M3 — VAD 세그먼트
- [x] VAD 도입: 1차 구현은 외부 VAD 의존성 대신 `MoonshineRmsVadSegmenter` RMS 게이트를 사용한다.
- [x] 발화 시작/종료 판정 → 세그먼트 버퍼링 → 종료 시 1회 추론 → `isFinal:true` 방출.
- [x] 최소 세그먼트 길이·최대 길이 가드(너무 짧은/긴 구간 처리), 세그먼트 pre-roll/뒤여유(clipping 방지).
- [x] (옵션) 긴 발화 슬라이딩 윈도우 partial — 1차 범위에서는 제외하고 세그먼트 종료 final을 기본으로 확정했다.
- [x] 단위 테스트: 세그먼트 경계, 무음, 짧은 구간, 최대 길이 flush, 세션 stale 메시지 무시.

### M4 — 키워드 후처리 패리티
- [x] Moonshine 엔진일 때 bias 모드를 `postprocess`로 분기(`getLiveSttBiasMode` 엔진별 기본값).
- [x] `applyLiveTranscriptBias` + `hasFuzzyBiasMatch`(NFD 자모 레벤슈타인) 경로를 Moonshine 전사에 연결.
- [x] (성능액션 A3 연계) `evaluateLiveTranscript`에도 자모 퍼지 매칭 재사용 + 조사/숫자 정규화. 숫자 정규화는 1차로 Sino-Korean 0~99와 `프로`/`퍼센트`를 지원한다.
- [x] 단위 테스트: 오탈자 전사 → 키워드 교정, 임의 발화 → false-trigger 없음(`안녕하세요. 다음 슬라이드는.` 케이스 유지).

### M5 — 평가 하네스 + 튜닝
- [x] 리허설형 한국어 발화 fixture(제어 명령 + 슬라이드 키워드 + 임의 발화 + 잡음) 구축.
- [x] CER(문자 단위), 키워드 recall, false-trigger율, 세그먼트 지연 자동 측정 스크립트(Node) 구축.
- [ ] sherpa(가능 시) vs Moonshine 비교표 생성. sherpa 모델 자산이 없어 이번 측정은 Moonshine 단독 synthetic baseline으로 남긴다.
- [x] 튜닝: VAD 임계값, 최소 세그먼트, `max_length`, dtype, 후처리 바이어스 임계값. q4/q8 synthetic baseline 결과 기본 컷오버는 no-go이며, 사람 음성 fixture 전에는 추가 튜닝하지 않는다.
- [x] 산출물: 튜닝 리포트 + 권장 기본 파라미터. `docs/spikes/moonshine-korean-asr.md`와 측정 JSON에 no-go 결론과 fallback 유지 권장을 기록했다.

### M6 — 플래그 롤아웃 (canary)
- [x] 엔진 선택 플래그 `orbit.liveStt.engine`(`localStorage`) + `createDefaultLiveSttAdapter` 분기.
- [x] Moonshine canary 디버그 지표 수집 경로: `orbit.liveStt.debugLatency=1`에서 segment RTF, 전사 지연, 세그먼트 길이, 오디오 크기 통계를 worker debug log로 기록한다.
- [ ] 스테이징 canary: 내부 사용자 대상 Moonshine 활성화, 디버그 지표와 A2 하네스 기반 recall 수집.
- [ ] COOP/COEP 등 서빙 요건 점검(WebGPU/WASM 스레드), 자가 호스팅 자산 배치. Vite dev/preview 헤더는 `viteConfig.test.ts`로 회귀 방지하고 개인 서버 staging 배포 스크립트는 내부 web 헤더를 확인한다. `stt:model:prepare:moonshine`은 Transformers.js self-hosted 경로를 생성한다. 다만 실제 public Nginx/CloudFront 응답과 모델 자산 배치는 환경에서 아직 검증하지 않는다.
- [x] 회귀 없음 확인(제품 로직 단위 테스트, typecheck, build). E2E 스모크는 별도 실행 필요.

### M7 — 컷오버 & 정리
- [ ] 인수 조건 충족 확인 후 기본 엔진을 Moonshine로 전환. 사용자 결정에 따라 실측 전에는 `sherpa` 기본값을 유지한다.
- [x] sherpa 어댑터/워커/매니페스트 보존 or 제거 결정: 단기 fallback 유지.
- [x] `docs/specs/live-stt-keyword-control.md`, `on-device-stt.md` 등 현행 문서 업데이트.

---

## 3. 테스트 계획

**단위 (Vitest)**
- 어댑터 라이프사이클(start/stop/dispose), 세션 id 격리, 오류코드 매핑.
- 워커 메시지 계약, `max_length` 계산, 세그먼트 배치 경계.
- VAD 세그먼터: 무음/발화/연속발화/짧은구간.
- 후처리 바이어스: 자모 퍼지 교정, false-trigger 억제.

**통합**
- 캡처(worklet)→VAD→워커→transcript→`evaluateLiveTranscript` 전체 경로(목 모델).
- 엔진 플래그 분기(sherpa ↔ Moonshine) 시 제품 로직 불변.

**E2E (Playwright)**
- 기존 리허설 스모크(`tests/e2e/`) 회귀 무결.
- 모델 미가용/마이크 거부/워커 실패 UI 상태.
- WebGPU 및 WASM-fallback 두 경로 스모크.

**모델 품질 (오프라인 하네스, M5)**
- 고정 fixture에서 CER, 키워드 recall, false-trigger율 리포트(회귀 감시).
- 임의 한국어 발화가 자동 슬라이드 전환을 유발하지 않음.

**성능**
- 세그먼트 전사 지연(발화 종료→transcript): WebGPU / WASM 각각 목표 이내.
- 모델 로드 시간·번들 크기·메모리, 콜드/캐시 로드 비교.

**크로스브라우저/오프라인**
- Chrome(WebGPU), WebGPU 미지원(WASM) 환경.
- 네트워크 단절 시 캐시/자가호스팅 자산으로 라이브 제어 유지.

---

## 4. 인수 조건 (측정 가능)

**게이트**
- [x] **M0 라이선스 결정이 문서화**되기 전 프로덕션 롤아웃 없음. 사용자 승인 완료로 진행하되, 계약 상세는 저장소 밖에서 관리한다.

**기능**
- [x] `MoonshineLiveSttAdapter`가 `LiveSttAdapter` 계약·기존 어댑터 테스트 스위트를 통과.
- [x] `packages/shared` 스키마·리허설 제품 로직 무변경으로 동작.
- [x] `orbit.liveStt.engine` 플래그로 sherpa ↔ Moonshine 무중단 전환.

**품질(고정 한국어 fixture 기준)**
- [ ] 키워드 recall ≥ 현행 sherpa 경로(또는 절대 목표치 합의값).
- [ ] false-trigger율 ≤ 현행, 임의 발화(`안녕하세요. 다음 슬라이드는.`)가 자동 전환 미유발. 단위 false-trigger 회귀 테스트는 통과했지만 실제 fixture 측정은 남아 있다.
- [x] CER 측정치가 리포트에 기록(회귀 기준선 확립). Synthetic TTS baseline만 기록됐고 품질 게이트는 실패했다.

**지연/성능**
- [ ] 제어 발화(짧은 구간) 발화종료→transcript 지연이 목표 이내(WebGPU 및 WASM 각각 기록). WASM은 약 74~75 ms였으나 WebGPU는 약 6.7 s로 no-go.
- [ ] 캐시 로드 시 모델 준비 시간이 현행 대비 악화되지 않음. 측정값은 기록됐지만 현행 sherpa 기준 비교가 아직 없다.

**복원력**
- [x] 모델 미가용/워커 실패/WebGPU 미지원에서 명확한 오류 상태 + 폴백. WebGPU→WASM fallback과 워커 오류 매핑은 단위 테스트로 검증한다.

---

## 5. 롤백 계획
- 엔진 플래그 기본값을 `sherpa`로 되돌리면 즉시 원복(코드 유지). 이 때문에 M7까지 sherpa 어댑터를 삭제하지 않는다.
- 프로덕션 노출은 canary→점진 확대, 이상 시 플래그 원복.
- 라이선스 이슈 발생 시 Option D(Whisper) 폴백 경로가 동일 어댑터 구조를 재사용.

## 6. 의존성 / 위험
- **외부:** HF 자산 또는 자가호스팅 배포, staging canary 환경, 실제 WebGPU/WASM 측정 장비. M0 라이선스는 사용자 승인 완료 상태로 기록한다.
- **기술:** transformers.js/ORT-web 번들 증가, WebGPU 가용성, seg 방식의 UX 변화.
- **연계:** [성능 액션 문서](../spikes/on-device-stt-performance-actions.md)의 A2(CER 하네스)·A3(형태소 매칭)·A5(VAD)와 작업 공유 — 중복 방지 위해 함께 계획.

## 7. 일정 요약
비프로덕션 구현 트랙(M2~M4, M5 하네스, M6 플래그)과 synthetic baseline 측정은 완료됐다. 남은 임계 경로는 실제 사람 음성 한국어 wav fixture 측정, staging canary, 그리고 그 결과에 따른 M7 기본 엔진 전환 여부 결정이다.

## 8. 참고
spec/ADR의 참고 링크 참조: [moonshine-korean-asr-migration spec](../specs/moonshine-korean-asr-migration.md#9-참고).
