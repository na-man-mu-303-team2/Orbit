# 온디바이스 STT 성능 개선 액션 아이템

리허설 라이브 STT 경로(`apps/web/src/features/rehearsal/`, sherpa-onnx WASM)를 분석하고, 유사 한국어 STT 서비스를 벤치마킹해 도출한 개선안이다. 우선순위는 임팩트 대비 난이도 기준이다.

## 2026-07-01 구현 상태

- A1은 Moonshine 한국어 경로를 `orbit.liveStt.engine=moonshine` 플래그 뒤에 추가하는 방향으로 진행했다. sherpa는 기본 엔진 및 fallback으로 유지한다.
- A2는 `apps/web/src/features/rehearsal/fixtures/live-stt-ko-evaluation.json`, `pnpm --filter @orbit/web stt:evaluate -- --predictions <predictions.json>`, `pnpm --filter @orbit/web stt:measure:moonshine` 하네스로 구현했다. Synthetic macOS `Yuna` baseline은 기록됐고 품질 no-go다. 실제 사람 음성 fixture 결과는 남아 있다.
- A3는 `evaluateLiveTranscript`의 자모 퍼지 매칭 재사용과 공용 정규화(`liveSttTextNormalization.ts`)로 구현했다. 숫자 정규화는 1차로 Sino-Korean 0~99와 `프로`/`퍼센트`를 지원한다.
- A5의 VAD는 Moonshine 경로에서 `MoonshineRmsVadSegmenter`로 1차 구현했다. sherpa 경로의 VAD 게이팅과 리샘플러 개선은 별도 후속 과제다.

## 현재 파이프라인 요약

```
mic → getUserMedia(NS/AGC on) → AudioWorklet(512샘플) → 선형 리샘플 16k
    → Web Worker → sherpa-onnx WASM(streaming-zipformer-korean-2024-06-16, int8)
    → partial/final transcript → evaluateLiveTranscript(키워드 커버리지) → 슬라이드 제어
```

핵심 특성: 단일 스레드(`numThreads: 1`), 기본 `greedy_search`(hotword 있을 때만 `modified_beam_search`), 슬라이드 바뀔 때마다 recognizer 전체 재생성, 무음도 매 배치 디코딩, 모델 매 로드마다 재다운로드.

---

## 가장 중요한 발견: 모델 자체를 먼저 의심해야 한다

스펙 문서(`docs/specs/live-stt-keyword-control.md`)가 스스로 인정한다 — *"Korean streaming ASR often emits no useful transcript for arbitrary speech."* 그래서 전체 목표를 "받아쓰기"에서 "키워드 검출"로 축소했다.

그런데 이 증상은 ORBIT 파이프라인 문제가 아닐 가능성이 크다. 지금 쓰는 바로 그 모델(`sherpa-onnx-streaming-zipformer-korean-2024-06-16`)에 **업스트림 버그가 보고돼 있다** (sherpa-onnx issue #2886):

- 모델은 정상 로드되고 `isReady()`도 `true`인데 `getResult()`가 **항상 빈 문자열**을 반환하는 silent failure.
- 표준 버전 encoder에 malformed-ONNX 보안 경고(PAIT-ONNX-200) — export 과정 결함 정황.
- 같은 프레임워크의 중국어/프랑스어 스트리밍 모델은 정상 동작 → 한국어 모델 고유 문제.

즉 "성능이 낮다"의 상당 부분이 파이프라인이 아니라 **모델 아티팩트 결함**일 수 있다. 파이프라인을 튜닝하기 전에 이걸 먼저 확인해야 한다.

---

## A. 정확도 (Accuracy)

**A1. 모델 검증 후 필요 시 교체 — 최우선.**
Node용 sherpa-onnx CLI로 모델에 **동봉된 `test_wavs/`** 를 돌려 전사가 나오는지부터 확인한다(이슈 스레드에서 메인테이너가 요청한 재현 방법). 빈 결과면 파이프라인이 아니라 모델이 원인이다. 교체 후보:
- 같은 모델의 **mobile 변형**(encoder 111MB, FP32 decoder) 재시도.
- `modified_beam_search` + hotword로 강제해 빈 결과가 완화되는지 확인.
- 대안 엔진: **Moonshine 한국어**(언어별 전용 모델, 엣지·스트리밍 최적화, sub-200ms, 오픈소스) — 어댑터 교체 스파이크로 검토. `LiveSttAdapter` 인터페이스가 이미 추상화돼 있어 교체 비용이 낮다.
- 참고: 오프라인 모델 `sherpa-onnx-zipformer-korean-2024-06-24`(KsponSpeech 학습)는 **스트리밍이 아니므로** 라이브용 아님. 리허설 사후 리포트 경로에 활용 여지는 있음.

**A2. 한국어 CER 평가 하네스 구축 — 나머지 튜닝의 전제.**
구현 완료: 리허설 스타일 한국어 발화 + 기대 키워드 fixture와 **키워드 recall, false-trigger율, CER, segment latency** 측정 스크립트를 추가했다. 한국어는 교착어라 WER이 아니라 **CER**로 재야 한다(리턴제로/RTZR 벤치마크 기준). Synthetic TTS baseline은 `docs/spikes/moonshine-korean-asr-measurements*.json`에 기록됐다. 남은 일은 실제 사람 음성 WebGPU/WASM prediction JSON을 기록해 제품 기준선을 만드는 것이다.

**A3. 키워드 매칭을 한국어 형태소 인지형으로.**
구현 완료: `evaluateLiveTranscript`가 **NFD 자모 단위 레벤슈타인 퍼지 매처**(`hasFuzzyBiasMatch`)를 재사용한다. 공용 정규화는 공백 제거, 조사 결합형 부분일치, 숫자/ITN 1차 정규화("삼십"↔"30", "십육 프로"↔"16%")를 처리한다. 별도 형태소 분석기 기반 접미 제거는 아직 도입하지 않았다.

**A4. 기본 디코딩을 `modified_beam_search` + 상시 hotword로.**
지금은 hotword가 있을 때만 beam search이고 기본은 greedy(sherpaOnnxWorker.ts:645). 이 제품의 목적 자체가 키워드 검출이므로 bias는 사실상 항상 켜져 있어야 한다. beam search + hotword가 도메인 용어 recall에 유리하다. `hotwordsScore`(현재 1.5/2.0 휴리스틱, :694)는 A2 하네스로 실측 튜닝.

**A5. 오디오 프런트엔드 개선.**
- **리샘플링**: `resampleFloat32Audio`(sherpaOnnxLiveSttAdapter.ts:812)가 anti-aliasing 없는 선형 보간이다. AudioContext를 16kHz로 "요청"하지만 브라우저가 무시하고 48kHz로 돌면 저역통과 없이 다운샘플 → aliasing으로 정확도 저하. 데시메이션 전 low-pass, 또는 windowed-sinc/OfflineAudioContext 리샘플로 교체.
- **VAD 게이팅 없음**: `isLikelySilence`가 계산은 되지만(liveSttAudioLevel.ts) 미터 표시용일 뿐 디코딩을 막지 않아 무음도 매 128ms 디코딩한다. Silero VAD(sherpa-onnx 내장) 또는 기존 RMS 게이트로 무음 배치 디코딩을 건너뛰면 CPU 절감·허위 partial 감소·엔드포인트 개선.
- **NS/AGC**: getUserMedia가 브라우저 noiseSuppression/AGC를 기본 ON으로 쓴다(RehearsalWorkspace.tsx:139). ASR엔 득실이 갈리므로 이미 있는 raw 토글을 A/B로 실측.

---

## B. 지연 시간 (Latency)

**L1. WASM 멀티스레드 활성화(`numThreads > 1`).**
현재 1스레드다. sherpa-onnx는 pthread WASM 빌드 + `SharedArrayBuffer` + COOP/COEP 교차출처 격리로 멀티스레드가 된다. worker에 격리 assert가 이미 있지만 "vad-asr" 런타임에만 적용된다(sherpaOnnxWorker.ts:600). COOP/COEP 헤더로 서빙 + 스레드 빌드로 encoder 지연을 유의미하게 줄일 수 있다. 디버그 stat `readyAfterLoopCap`(loop cap 64)이 켜지면 RTF>1(실시간 못 따라감)이니 함께 관찰.

**L2. 짧은 명령어에 맞게 엔드포인트/배치 파라미터 튜닝.**
엔드포인트 규칙이 하드코딩(sherpaOnnxWorker.ts:649): `rule1MinTrailingSilence 2.4s`, `rule2 1.2s`, `rule3MinUtteranceLength 20`. "다음 슬라이드" 같은 짧은 제어 발화에 1.2~2.4초 무음 대기는 final까지 지연이 크다. 제어 용도에 맞게 낮춘다. `decodeBatchDurationMs` 기본 128ms도 고정 지연 바닥이므로 CPU와 트레이드오프 튜닝.

**L3. 슬라이드마다 recognizer 전체 재생성 회피.**
`updateSessionBias` → `recreateRecognizer`(sherpaOnnxWorker.ts:474)가 슬라이드/바이어스 변경마다 recognizer를 통째로 재생성하고 모델 config를 다시 읽어 스트림 상태를 버리고 지연 스파이크를 만든다. `biasKey` 변경 감지는 이미 있으니(좋음) 재생성 자체를 디바운스하거나, hotword만 갱신 가능한지(전체 재생성 없이) sherpa-onnx WASM API를 확인한다.

---

## C. 로딩 / 전달 (Delivery)

**D1. 모델을 Cache Storage / IndexedDB에 영속화.**
encoder만 int8로 **약 127MB**다. 지금은 매 로드마다 fetch → WASM FS 기록이고 HTTP 캐시에만 의존한다(sherpaOnnxWorker.ts:723). Cache API/IndexedDB에 version+sha256 키로 저장하고 로드 시 무결성 검증하면 재방문 로딩이 빨라지고 진짜 오프라인이 된다. 첫 로드가 부담이면 mobile 변형(111MB)이나 더 작은 모델로 크기/정확도 트레이드오프를 잡는다.

**D2. manifest 무결성 메타데이터 채우기 + 워밍업.**
예시 manifest의 `files.sha256`/`bytes`가 비어 있다. 채우고 다운로드 시 검증하면 README가 경고한 `<!doctype html>` fallback(자산이 HTML로 잘못 서빙되는) 문제를 잡는다. 로드 직후 짧은 무음 버퍼로 recognizer를 **워밍업**해 ONNX 콜드스타트 비용을 사용자 발화 전에 지불한다.

---

## D. 계측 (Instrumentation)

디버그 인프라는 좋다(지연 로그, PCM 다운로드, worker stat) — 다만 전부 localStorage 플래그 뒤에 있고 집계가 안 된다. Moonshine worker는 `orbit.liveStt.debugLatency=1`에서 세그먼트별 RTF, 전사 지연, 오디오 크기 통계를 남긴다. 남은 일은 dev/staging에서 익명 집계 지표(RTF, 엔드포인트 지연, 키워드 recall)를 수집해 튜닝의 근거로 삼는 것이다. A2 하네스와 자연스럽게 연결된다.

---

## 벤치마킹: 유사 한국어 STT 서비스

RTZR(리턴제로)가 관리하는 공개 벤치마크의 CER(%, 낮을수록 좋음, AI-Hub 테스트셋):

| 서비스 | 평균 CER | 성격 |
| --- | --- | --- |
| 리턴제로(VITO) | **5.91** | 클라우드, 한국어 특화 |
| Naver CLOVA Speech | 7.52 | 클라우드, keyword boosting 제공 |
| ETRI | 10.19 | 클라우드(공공) |
| Azure / AWS | 10.9 / 11.1 | 클라우드 |
| OpenAI Whisper | 11.39 | 범용 |
| Google STT v2 | 11.50 | 클라우드 |

시사점:

1. **하이브리드 구조는 옳다.** 클라우드 한국어 엔진(리턴제로 5.9, CLOVA 7.5 CER)이 어떤 온디바이스 한국어 모델보다 정확하다. 무거운 분석(억양·속도·코칭 리포트)을 서버 OpenAI 경로에 두고, 라이브 저지연 제어만 온디바이스로 둔 ORBIT의 분리는 업계 통념과 일치한다.
2. **키워드 부스팅은 표준 기법.** CLOVA의 "keyword boosting"이 ORBIT의 hotword bias와 같은 개념이다. 방향은 맞고, 측정(A2)과 튜닝(A4)만 남았다.
3. **평가는 CER로.** 한국어는 교착어(조사)라 WER이 부적절하다. KsponSpeech/RTZR 방식이 레퍼런스다 (A2에 반영).
4. **온디바이스 프런티어.** Moonshine이 언어별 한국어 스트리밍 모델을 엣지 최적화로 공개했다(sub-200ms, Whisper Tiny 대비 에러율 ~48%↓). 버그 있는 zipformer의 대안으로 스파이크 가치가 있다(A1).

---

## 권장 실행 순서

1. **A1 모델 검증**(반나절) — test_wavs로 빈 결과 버그 재현 여부 확인. 여기서 방향이 갈린다.
2. **A2 CER 평가 하네스**(완료) — 이후 모든 튜닝의 계측 기반.
3. **A3 키워드 매칭**(완료) + **A4 beam/hotword 상시화**(sherpa 후속) — Moonshine은 디코딩 hotword가 없어 후처리 바이어스를 사용한다.
4. **A5 VAD**(Moonshine RMS 1차 완료) / 리샘플 + L2 엔드포인트 튜닝 — 지연·CPU·허위검출 동시 개선.
5. **D1 모델 캐시 + L1 멀티스레드** — 로딩/지연 인프라. COOP/COEP 서빙 변경 수반.

> 주의: 모델 아티팩트(.onnx/.wasm)가 저장소에 없어(LFS/gitignore) 런타임을 직접 실행하지 못했다. 위 런타임 관련 결론은 코드 + 스펙의 자체 기술 + 업스트림 이슈 대조로 도출한 것이며, A1이 바로 이를 실측으로 확정하는 단계다.

## 참고 자료

- sherpa-onnx issue #2886 (한국어 스트리밍 모델 빈 결과): https://github.com/k2-fsa/sherpa-onnx/issues/2886
- 모델 카드: https://huggingface.co/k2-fsa/sherpa-onnx-streaming-zipformer-korean-2024-06-16
- 오프라인 한국어 모델(KsponSpeech): https://huggingface.co/k2-fsa/sherpa-onnx-zipformer-korean-2024-06-24
- RTZR 한국어 STT 벤치마크(CER): https://github.com/rtzr/Awesome-Korean-Speech-Recognition
- Naver CLOVA Speech(keyword boosting): https://guide.ncloud-docs.com/docs/en/clovaspeech-overview
- Moonshine(온디바이스 다국어 STT): https://github.com/moonshine-ai/moonshine
