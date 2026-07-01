# Spec: Live STT 엔진 sherpa-onnx → Moonshine 한국어 교체

**문서 유형:** Spec + ADR (Architecture Decision Record)
**상태:** Accepted for local/staging validation; production cutover gated by measured quality
**작성일:** 2026-07-01
**Deciders:** 리허설/STT 담당, 웹 리드, 법무/라이선스 승인자
**관련 문서:** [live-stt-keyword-control spec](./live-stt-keyword-control.md) · [on-device-stt spike](../spikes/on-device-stt.md) · [on-device-stt 성능 액션](../spikes/on-device-stt-performance-actions.md) · [migration plan](../plans/moonshine-korean-asr-migration.md)

---

## 1. Context

리허설 라이브 STT는 브라우저 온디바이스 경로다: `getUserMedia → AudioWorklet(PCM) → Web Worker → sherpa-onnx WASM(streaming-zipformer-korean-2024-06-16) → partial/final transcript → 키워드 커버리지 기반 슬라이드 제어`.

현재 모델은 두 가지 문제가 있다.

- **모델 아티팩트 결함(추정).** `sherpa-onnx-streaming-zipformer-korean-2024-06-16`은 업스트림에 "빈 전사 결과" 버그가 보고돼 있다(sherpa-onnx issue #2886: 로드·`isReady()`는 정상인데 `getResult()`가 항상 `""`). 스펙 문서도 *"Korean streaming ASR often emits no useful transcript for arbitrary speech"* 라고 자인하고, 그래서 목표를 받아쓰기에서 키워드 검출로 축소했다.
- **크기/전달 부담.** encoder만 int8로 약 127MB. 매 로드 재다운로드, 단일 스레드.

Moonshine 한국어(`moonshine-tiny-ko`)는 2025년 9월 공개된 27M 파라미터 seq2seq ASR로, ONNX 버전(`onnx-community/moonshine-tiny-ko-ONNX`)이 **Transformers.js + ONNX Runtime Web으로 브라우저에서 100% 로컬 실행**된다(WebGPU 가속, WASM fallback, Web Worker, 브라우저 캐시 내장). 양자화 시 **약 50MB**. 즉 현재 아키텍처(브라우저 온디바이스, 어댑터 추상화)와 정합하면서 모델 크기와 실제 동작 신뢰성을 개선할 여지가 있다.

이 문서는 Live STT ASR 엔진을 sherpa-onnx에서 Moonshine 한국어로 교체하는 결정과 통합 설계를 정의한다.

## 2. Goals / Non-Goals

**Goals**
- 브라우저 온디바이스 원칙(라이브 중 raw audio 서버 미전송)을 유지한 채 ASR 엔진을 Moonshine 한국어로 교체.
- 기존 `LiveSttAdapter` / `LiveSttCallbacks` 계약을 **그대로 유지**해 리허설 제품 로직(키워드 검출·큐·슬라이드 전환)을 건드리지 않음.
- 기능 플래그로 sherpa ↔ Moonshine를 **A/B 전환** 가능하게 하고, 정확도·지연을 실측한 뒤 컷오버.
- 짧은 제어 발화("다음 슬라이드")에 대한 키워드 recall을 현행 이상으로.

**Non-Goals**
- 리허설 사후 리포트용 서버 STT(OpenAI) 경로 변경 — 이번 범위 아님.
- 범용 한국어 받아쓰기 정확도의 SLA 보장.
- ASR 모델 자체 파인튜닝(후속 검토 항목).
- 공개 Deck/Job/WS 계약(`packages/shared`) 변경.

## 3. ADR: 엔진 선택 결정

### Decision

**Moonshine `moonshine-tiny-ko` (ONNX)를 Transformers.js 기반 신규 `MoonshineLiveSttAdapter`로 통합한다.** M0 라이선스 게이트는 사용자 승인 완료(2026-07-01)로 처리한다. Synthetic `Yuna` fixture의 2026-07-01 측정은 품질 게이트를 통과하지 못했으므로 기본 엔진 전환과 프로덕션 롤아웃은 계속 보류한다. sherpa 어댑터는 fallback이자 기본 엔진으로 유지한다.

### 고려한 옵션

#### Option A — Moonshine tiny-ko (Transformers.js, 브라우저) ✅ 권장
| 차원 | 평가 |
|---|---|
| 복잡도 | 중 — seq2seq라 VAD 세그먼트 로직 신규 필요 |
| 모델 크기 | ~50MB(양자화) — 현행 127MB+ 대비 대폭 축소 |
| 정확도 | 실측된 모델(Fleurs CER 8.9). 현행(빈 결과 추정)보다 신뢰 가능 |
| 지연 | 세그먼트 단위(VAD 종료 → 전사). 추론 자체는 저지연/ WebGPU 가속 |
| 팀 친숙도 | 중 — transformers.js 신규 도입 |
| 라이선스 | **비상업(한국어). 상업 사용 시 별도 계약 필요** ← 핵심 리스크 |

**Pros:** 브라우저 실행 검증됨(Moonshine Web 공식 예제), 작은 모델, WebGPU 가속, 브라우저 캐시 내장, 어댑터 계약 유지로 제품 로직 무변경.
**Cons:** hotword bias API 없음(후처리로 이전 필요), 짧은 세그먼트에서 할루시네이션/반복 경향, 프레임 동기 연속 partial이 아님, 한국어 모델 비상업 라이선스.

#### Option B — sherpa 모델만 교정/교체 (엔진 유지)
동일 프레임워크에서 mobile 변형 재시도, 재-export, 또는 `modified_beam_search+hotword` 강제. 오프라인 `zipformer-korean-2024-06-24`는 스트리밍이 아니라 라이브 부적합(리포트 경로용).
**Pros:** 통합 변경 최소, hotword bias 유지, 상업 라이선스 부담 없음(Apache/MIT 계열). **Cons:** 근본 원인이 업스트림 모델이면 해결 불확실, 크기 문제 잔존.

#### Option C — 라이브도 서버 STT로
**Pros:** 최고 정확도(리턴제로 CER 5.9). **Cons:** 온디바이스·프라이버시·저지연 원칙 위배, 라이브 중 raw audio 서버 전송 금지 원칙 위반. **→ 기각.**

#### Option D — Whisper tiny/base ONNX (브라우저, transformers.js)
MIT 라이선스라 상업 안전. **Cons:** 동급 크기에서 한국어 CER이 Moonshine보다 나쁨(Whisper tiny Fleurs 15.83 vs Moonshine 8.9), 동일하게 hotword 없음. **→ 라이선스 게이트 실패 시 대체 후보로 보류.**

### Trade-off 분석

핵심 트레이드오프는 **"실측 가능한 작은 모델 + 브라우저 정합성"(A) vs "스트리밍 방식 변경 + 품질 실측 필요"(A의 대가)**다. 엔진 선택의 기술적 우위는 A가 분명하고 M0 라이선스 게이트는 사용자 승인으로 해소됐다. 남은 조건은 품질·지연 실측이다. 따라서 결정은 "A를 기능 플래그 뒤에 채택하되, 품질 게이트 통과 전에는 기본 엔진을 바꾸지 않는다"로 구성한다.

### Consequences
- **쉬워지는 것:** 모델 전달(캐시·크기), WebGPU 가속, 실제 전사 확보.
- **어려워지는 것:** 연속 partial → 세그먼트 단위로 UX 변경, hotword bias 상실분을 후처리로 보완, 할루시네이션 억제 튜닝.
- **다시 봐야 할 것:** 라이선스 상태, 짧은 발화 정확도, WebGPU 미지원 브라우저의 WASM 성능.

## 4. 통합 아키텍처

### 4.1 어댑터 교체 지점

기존 계약을 그대로 구현하는 신규 어댑터를 추가한다. 제품 로직·스키마는 무변경.

```ts
// apps/web/src/features/rehearsal/moonshineLiveSttAdapter.ts (신규)
export class MoonshineLiveSttAdapter implements LiveSttAdapter {
  start(stream, callbacks, options?): Promise<void>
  updateBiasContext?(biasContext): void
  stop(): void
  dispose(): void
}
```

전환은 이미 존재하는 확장점을 사용한다:
- `window.__orbitCreateLiveSttAdapter`(liveStt.ts) 전역 override — 테스트/실험용.
- `createDefaultLiveSttAdapter`(RehearsalWorkspace.tsx) + `localStorage` 플래그(`orbit.liveStt.engine = "sherpa" | "moonshine"`) — A/B 및 canary용.

### 4.2 데이터 흐름 (변경 후)

```
mic → getUserMedia(16k, mono)
    → AudioWorklet (liveSttPcmCapture.worklet.js, 재사용)
    → Float32 PCM 16k (resampleFloat32Audio 재사용)
    → VAD(RMS 기반 MoonshineRmsVadSegmenter 1차 구현) 로 발화 세그먼트 경계 검출
    → 세그먼트 버퍼 → Moonshine Worker
        → transformers.js pipeline("automatic-speech-recognition",
             "onnx-community/moonshine-tiny-ko-ONNX", { dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, device: "webgpu"→"wasm" fallback })
        → max_length = ceil(seq_len * 13 / 16000)  // 할루시네이션 루프 억제
        → segment transcript
    → onPartialTranscript({ transcript, isFinal }) // 세그먼트 종료=final, 진행 중=partial(옵션)
    → applyLiveTranscriptBias (후처리 키워드 바이어스, 기존 재사용)
    → evaluateLiveTranscript → 키워드/큐/슬라이드 제어 (무변경)
```

캡처 프런트엔드(`liveSttPcmCapture.worklet.js`, `resampleFloat32Audio`)와 오디오 레벨/무음 판정(`calculatePcmAudioLevel`)은 그대로 재사용한다. 신규는 **RMS VAD 세그먼터 + Moonshine 워커** 두 가지다.

### 4.3 스트리밍 전략 (핵심 설계 결정)

Moonshine tiny-ko는 프레임 동기 transducer가 아니라 seq2seq다. 한국어 전용 streaming 변형은 없다(streaming-tiny/medium은 영어). 따라서 **VAD 기반 세그먼트 전사**를 채택한다.

- 1차 구현은 `MoonshineRmsVadSegmenter`의 RMS threshold로 발화 시작/종료를 판정한다.
- 발화 구간 종료 시 해당 세그먼트를 Moonshine에 1회 추론 → `isFinal: true` 전사 방출.
- 선택적으로, 긴 발화는 슬라이딩 윈도우(예: 0.5s마다 누적 구간 재추론)로 진행 중 `isFinal: false` partial을 낼 수 있으나, 비용·할루시네이션을 감안해 **1차 구현은 세그먼트-종료 final 우선**으로 한다.
- 제어 발화("다음 슬라이드")는 짧아 VAD 종료가 빨라 지연이 작다.

### 4.4 키워드 바이어스 이전

Moonshine에는 sherpa의 `hotwordsBuf`/`modified_beam_search` 같은 디코딩 바이어스가 없다. 기존 `hotword`/`combined` bias 모드는 Moonshine에서 **무력화**되고, 이미 구현된 **후처리 바이어스**가 주 경로가 된다:
- `applyLiveTranscriptBias` + `hasFuzzyBiasMatch`(NFD 자모 레벤슈타인) 재사용.
- 슬라이드 키워드/동의어/약어를 후처리 사전으로 사용해 전사 오탈자를 교정.
- `getLiveSttBiasMode`는 Moonshine 엔진일 때 `postprocess`로 강제(또는 엔진별 기본값 분기).

이 변경은 [on-device-stt 성능 액션](../spikes/on-device-stt-performance-actions.md)의 A3(형태소 인지형 키워드 매칭)과 방향이 같아 함께 진행하면 시너지가 있다.

### 4.5 모델 전달 / 오프라인

- 1차 PoC는 HF Hub 자동 다운로드 + transformers.js 브라우저 캐시.
- 프로덕션은 **모델 자산 자가 호스팅**(`apps/web/public/models/live-stt/moonshine-tiny-ko/…`)으로 전환해 HF CDN 의존 제거·오프라인 보장·라이선스 준수(재배포 조건 확인 필요). transformers.js `env.localModelPath`/`env.allowRemoteModels=false`로 로컬 자산을 가리킨다.
- 대형 `.onnx`는 기존 규칙대로 Git LFS 추적.

## 5. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| **한국어 모델 비상업 라이선스** | 상업 배포 차단 가능 | **M0 게이트**: 사용자 승인 완료(2026-07-01). 계약 원문·비용·연락 내역은 저장소 밖에서 관리하고 릴리스 전 최신 상태를 재확인 |
| 짧은 세그먼트 할루시네이션/반복 | 허위 키워드 트리거 | `max_length` 토큰 제한, VAD 정렬, false-trigger 하한을 인수조건에 명시, 최소 세그먼트 길이 게이트 |
| hotword bias 상실 | 도메인 용어 recall 저하 | 후처리 자모 퍼지 바이어스(4.4), 실측 튜닝(A2 하네스) |
| WebGPU 미지원/불안정 브라우저 | 지연 증가 | WASM fallback 경로 필수 테스트, 성능 인수기준을 WASM 기준으로도 명시 |
| 연속 partial 상실 → UX 변화 | 라이브 캡션 체감 저하 | 세그먼트 partial 옵션 설계, 제품팀과 UX 합의 |
| transformers.js/ORT-web 번들 증가 | 초기 로드 | 코드 스플리팅·lazy import, 모델 캐시 |

## 6. 프라이버시 / 보안
- 온디바이스 원칙 유지: 라이브 중 raw audio·전사는 서버·로그로 나가지 않음(기존 원칙 준수).
- 자가 호스팅 시 외부 CDN 호출 제거로 프라이버시·오프라인 강화.
- 전사 디버그 로그는 기존과 동일하게 `orbit.liveStt.debugLatency` 플래그 뒤에만.

## 7. 인수 조건 (개요 — 상세는 plan.md)
- M0 라이선스 상태: 사용자 승인 완료(2026-07-01). 상세 계약 기록은 저장소 밖에서 관리한다.
- `MoonshineLiveSttAdapter`가 기존 `LiveSttAdapter` 계약·테스트를 통과.
- 고정 한국어 fixture에서 키워드 recall ≥ 현행, false-trigger ≤ 현행, CER 측정치 기록. Synthetic TTS baseline은 기록됐지만 no-go다.
- WebGPU/WASM 양 경로에서 세그먼트 전사 지연이 목표 이내. WASM은 짧은 지연을 보였으나 WebGPU는 no-go다.
- 플래그로 sherpa ↔ Moonshine 무중단 전환.
- 기본 엔진 전환은 위 품질·지연 수치가 기록될 때까지 금지.

## 8. 가정 & 열린 질문
- **가정:** ORBIT은 상업 제품이며 라이선스 클리어런스가 필요하다. 현재는 사용자 승인 완료 상태로 구현을 진행한다.
- **가정:** 라이브 제어 목적상 세그먼트 단위 final로 충분하며 연속 캡션은 필수가 아니다.
- **결정:** sherpa 어댑터는 단기 fallback으로 유지한다.
- **열린 질문:** WebGPU 비지원 환경(구형/기업 브라우저) 비중 — 성능 목표에 영향.
- **열린 질문:** 실제 사람 음성 fixture의 WebGPU/WASM 지연·CER·recall 수치 — 기본 엔진 전환 게이트.

## 9. 참고
- Moonshine Web(브라우저 실시간): https://huggingface.co/posts/Xenova/486935205804807
- transformers.js moonshine-web 예제: https://github.com/huggingface/transformers.js-examples/tree/main/moonshine-web
- 한국어 ONNX 모델: https://huggingface.co/onnx-community/moonshine-tiny-ko-ONNX
- 한국어 원본 모델(라이선스): https://huggingface.co/UsefulSensors/moonshine-tiny-ko
- Flavors of Moonshine (논문): https://arxiv.org/abs/2509.02523
- sherpa-onnx 빈 결과 이슈: https://github.com/k2-fsa/sherpa-onnx/issues/2886
