# TODO: Web Speech(SODA) 한국어 인식률 개선

상세 수용 기준·검증 명령은 [tasks/plan.md](./plan.md)를 따른다.

## Phase 0: SODA baseline + Chrome Stable 스파이크

- [x] T0: 기본 엔진을 Web Speech on-device로 확정하고 ko-KR 언어팩 옵션(`quality: "command"`) 테스트 보강 (M)
- [x] T1: Chrome Stable ko-KR Web Speech 실측 → `docs/spikes/web-speech-ko-biasing.md` (S, T0-T15와 병렬 가능)

### Checkpoint 0

- [x] T0 테스트 통과
- [x] T1 완료 - Chrome Stable API 표면과 headless fake-audio 결과 문서화

## Phase 1: Contextual biasing (phrases)

- [x] T2: `LiveSttBiasPhrase` + 통합 source union + migration-only 유니온 입력 추가, 3개 포트 계약 갱신 (M)
- [x] T3: 생산자 가중치/metadata 전환 - `buildBiasPhrasesForSlide`, `getBiasPhrasesFromContext`, `liveSttHarness` (M, deps: T2)
- [x] T4: `string` 입력 제거, `LiveSttBiasPhrase[]` weighted-only 계약으로 고정 (S, deps: T3)
- [x] T5: `stt/webSpeechPhrases.ts` 신규 - feature detection, `weight -> boost`, apply helper (S, deps: T2)
- [x] T6: `WebSpeechLiveSttPort`에 phrases start/update 연결, `keywordBiasing` capability 갱신 (S, deps: T2, T5)
- [x] T7: `shouldUseLiveSttHotwordBias` 게이트 제거, 전 엔진 bias phrase 항상 전달 (S, deps: T3)

### Checkpoint 1

- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] 자동 회귀: `RehearsalWorkspace.test.tsx`, `webSpeechLiveSttPort.test.ts`, `speech/p3RehearsalSession.test.ts`에서 리허설 시작, 슬라이드별 bias phrase 전달, 키워드 감지, Web Speech phrases 적용 경로 확인
- [x] 작업 요약에 sherpa hotword always-on 동작 변화와 Chrome Stable phrases 실측 상태 명시

## Phase 2: 오디오 입력 라우팅

- [x] T8: `stt/webSpeechAudioTrack.ts` 신규 - live audio track 추출 + `start(track)` 폴백 helper (S)
- [x] T9: `WebSpeechLiveSttPort`에 `config.audioSource` track routing 연결, `start(audioTrack?)` 타입 확장 (S, deps: T8)

### Checkpoint 2

- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] 자동 회귀: `RehearsalWorkspace.test.tsx`, `webSpeechAudioTrack.test.ts`, `webSpeechLiveSttPort.test.ts`에서 raw-mic debug 제약, live audio track 선택, `recognition.start(audioTrack)` 폴백 경로 확인

## Phase 3: Alternatives reranking

- [x] T10: 공통 `stt/liveTranscriptText.ts` 추출 - `normalizeLiveTranscriptText` 공유 (S, deps: T4)
- [x] T11: `stt/koreanTextSimilarity.ts` 신규 - NFD 자모 정규화 + contains/sliding-window score (M, deps: T10)
- [x] T12: `stt/alternativeReranker.ts` 신규 - `bestScore > originalScore && bestScore >= 0.75` 교체 기준 (S, deps: T11)
- [x] T13: `LiveSttResult.alternatives` optional 추가 + Web Speech final alternatives 방출, `maxAlternatives=3` (S, deps: T4)
- [x] T14: `stt/rerankingLiveSttPort.ts` 신규 - final alternatives 데코레이터, 소비자 방출 전 alternatives 제거 (M, deps: T12, T13)
- [x] T15: registry에서 web-speech 포트를 `RerankingLiveSttPort`로 래핑 (XS, deps: T14)

### Checkpoint 3 - 최종

- [x] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] 자동 전체 회귀: 루트 `pnpm test`에서 web/api/worker/shared/editor-core 관련 테스트 전체 통과
- [x] 재순위 교정 사례: `alternativeReranker.test.ts`, `rerankingLiveSttPort.test.ts`에서 alternatives 2개 이상 교체 기준 확인
- [x] alternatives 1개 환경: `rerankingLiveSttPort.test.ts`와 Chrome Stable headless fake-audio 스파이크에서 no-op/기존 자막 경로가 안전함을 확인
- [x] 실제 Chrome Stable 결과 한계 기록: headless fake-audio에서는 `network` error로 final alternatives를 관측하지 못했으며, 제품 수준 인식률 주장은 non-headless 수동 검증 후에만 가능하다고 `docs/spikes/web-speech-ko-biasing.md`에 명시
