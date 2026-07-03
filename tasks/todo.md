# TODO: Web Speech(SODA) 한국어 인식률 개선

상세 수용 기준·검증 명령은 [tasks/plan.md](./plan.md)를 따른다.

## Phase 0: SODA baseline + Chrome Stable 스파이크

- [x] T0: 기본 엔진을 Web Speech on-device로 확정하고 ko-KR 언어팩 옵션(`quality: "command"`) 테스트 보강 (M)
- [ ] T1: Chrome Stable ko-KR Web Speech 실측 → `docs/spikes/web-speech-ko-biasing.md` (S, T0-T15와 병렬 가능)

### Checkpoint 0

- [x] T0 테스트 통과
- [ ] T1 미완료 시 PR 리스크에 Chrome Stable 실측 미완료 명시

## Phase 1: Contextual biasing (phrases)

- [x] T2: `LiveSttBiasPhrase` + 통합 source union + migration-only 유니온 입력 추가, 3개 포트 계약 갱신 (M)
- [x] T3: 생산자 가중치/metadata 전환 - `buildBiasPhrasesForSlide`, `getBiasPhrasesFromContext`, `liveSttHarness` (M, deps: T2)
- [x] T4: `string` 입력 제거, `LiveSttBiasPhrase[]` weighted-only 계약으로 고정 (S, deps: T3)
- [x] T5: `stt/webSpeechPhrases.ts` 신규 - feature detection, `weight -> boost`, apply helper (S, deps: T2)
- [x] T6: `WebSpeechLiveSttPort`에 phrases start/update 연결, `keywordBiasing` capability 갱신 (S, deps: T2, T5)
- [x] T7: `shouldUseLiveSttHotwordBias` 게이트 제거, 전 엔진 bias phrase 항상 전달 (S, deps: T3)

### Checkpoint 1

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 수동 E2E: 리허설 시작 → 슬라이드 전환 → 키워드 발화 → 자막·키워드 감지 정상
- [ ] PR 본문에 sherpa hotword always-on 동작 변화와 Chrome Stable phrases 실측 상태 명시

## Phase 2: 오디오 입력 라우팅

- [ ] T8: `stt/webSpeechAudioTrack.ts` 신규 - live audio track 추출 + `start(track)` 폴백 helper (S)
- [ ] T9: `WebSpeechLiveSttPort`에 `config.audioSource` track routing 연결, `start(audioTrack?)` 타입 확장 (S, deps: T8)

### Checkpoint 2

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 수동 E2E: raw-mic debug on/off 차이가 Web Speech 경로에 반영되는지 확인

## Phase 3: Alternatives reranking

- [ ] T10: 공통 `stt/liveTranscriptText.ts` 추출 - `normalizeLiveTranscriptText` 공유 (S, deps: T4)
- [ ] T11: `stt/koreanTextSimilarity.ts` 신규 - NFD 자모 정규화 + contains/sliding-window score (M, deps: T10)
- [ ] T12: `stt/alternativeReranker.ts` 신규 - `bestScore > originalScore && bestScore >= 0.75` 교체 기준 (S, deps: T11)
- [ ] T13: `LiveSttResult.alternatives` optional 추가 + Web Speech final alternatives 방출, `maxAlternatives=3` (S, deps: T4)
- [ ] T14: `stt/rerankingLiveSttPort.ts` 신규 - final alternatives 데코레이터, 소비자 방출 전 alternatives 제거 (M, deps: T12, T13)
- [ ] T15: registry에서 web-speech 포트를 `RerankingLiveSttPort`로 래핑 (XS, deps: T14)

### Checkpoint 3 - 최종

- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] 수동 E2E: 전체 리허설 플로우 정상
- [ ] 수동 E2E: final alternatives 2개 이상이면 재순위 교정 사례 1건 확인
- [ ] alternatives 1개 환경이면 재순위 no-op과 기존 자막 정상 동작 확인
