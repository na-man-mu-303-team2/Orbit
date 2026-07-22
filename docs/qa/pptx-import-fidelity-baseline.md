# PPTX 가져오기 정합성 기준선

## 목적

이 문서는 발표 자료 가져오기에서 speaker notes와 시각 정합성을 개선하기 전의 재현 기준과 PR0 renderer 결정을 기록한다. 기준 PPTX 원본, 추출된 notes 원문, OOXML 원문, base64 asset은 저장소나 로그에 포함하지 않는다.

## 입력과 재현 fixture

| 입력                         | SHA-256                                                            |             크기 | package inventory                             |
| ---------------------------- | ------------------------------------------------------------------ | ---------------: | --------------------------------------------- |
| 실제 기준 PPTX               | `96f86a7d7a1fe371738d85e943a6c907f47db75f9328af88ab0ed8d4aa6ec835` | 22,405,790 bytes | slide 8, notes 8, slide→notes rel 8, media 27 |
| `import-fidelity-notes.pptx` | `8a8f6ecaecaafa5e550739f65de75c0e5f21235d675ea08cd67fab5ab71c17c0` |     34,783 bytes | slide 1, notes 1, slide→notes rel 1, media 1  |

축소 fixture는 다음 구조를 고정한다.

- title placeholder의 직접 font size를 비워 master title style `44pt` 상속 경로를 재현한다.
- `Pretendard SemiBold`, letter spacing, `wedgeRoundRectCallout`, group/image 조합을 포함한다.
- notes body는 세 문단이며 가운데 빈 문단과 수동 line break를 포함한다.
- notes slide의 non-body placeholder와 notes master decoration을 포함한다.
- zip timestamp를 고정해 생성 결과가 결정적이다.

현재 importer의 알려진 실패를 회귀 assertion으로 고정했다.

- blueprint slide에 `speakerNotes`가 없고 template slide에 `notesPage`가 없어 notes가 유실된다.
- title은 master `44pt`를 상속하지 못하고 `24pt`, `normal`, `Pretendard SemiBold`로 남는다.
- letter spacing과 unsupported callout은 warning/fallback으로만 처리된다.

## LibreOffice notes-only renderer

### 실행 결과

macOS host의 LibreOfficeDev 26.8.0 alpha에서 notes-only PDF를 내보내고 `pdfinfo`와 `pdftoppm`으로 page 수와 PNG 수를 교차 확인했다.

| 입력      | 실행 |     elapsed |    child peak RSS | PDF pages / PNGs |        PDF 크기 |
| --------- | ---- | ----------: | ----------------: | ---------------: | --------------: |
| fixture   | cold | 1,075.24 ms | 142,032,896 bytes |            1 / 1 |    40,932 bytes |
| fixture   | warm |   582.27 ms | 142,475,264 bytes |            1 / 1 |    40,932 bytes |
| 실제 기준 | cold | 2,958.84 ms | 395,427,840 bytes |            8 / 8 | 1,001,800 bytes |
| 실제 기준 | warm | 2,864.44 ms | 397,066,240 bytes |            8 / 8 | 1,001,800 bytes |

production worker image `orbit-python-worker:latest`에서도 같은 실제 기준 파일을 검증했다.

- image 내 LibreOffice 버전은 25.2.3.2이며 현재 Dockerfile이 `libreoffice-writer`, `libreoffice-impress`, `fonts-noto-cjk`를 이미 설치한다.
- `Pretendard`는 image에 없지만 한국어 fallback은 `Noto Sans CJK KR`로 확인됐다.
- notes-only PDF는 8 pages를 생성했고 1, 4, 8 page 육안 검사에서 slide image, notes body, page number와 순서가 확인됐다.
- host는 Korean font fallback이 부족해 글자가 깨졌으므로 host 결과를 production 시각 품질의 근거로 사용하지 않는다.

### 결정

**채택한다.** Production image에 추가 대형 runtime 없이 notes page 8/8과 순서가 증명됐으므로 LibreOffice notes-only renderer를 bounded preview 후보로 사용한다.

다만 이 결정은 pixel-identical 보장이 아니다. 구현은 renderer 미설치, timeout, non-zero exit, PDF 미생성, notes part 수와 page 수 불일치에서 import package를 손상하지 않고 `render-unavailable`로 fail-closed해야 한다. 임시 profile·PDF·PNG는 작업 단위로 정리하고 raw notes를 로그에 남기지 않는다.

## Runtime Konva candidate renderer

### synthetic suite

축소 fixture를 포함한 16개 sample을 동일 Chromium 조건에서 두 번 캡처했다.

- cold: 16.23초, maximum RSS 389,660,672 bytes
- warm: 12.39초, maximum RSS 390,332,416 bytes
- 평균 SSIM: 0.9532
- `0.95` gate: 10/16 통과, 6/16 실패
- 축소 fixture: SSIM 0.9333, fallback object 1

### 실제 기준 PPTX

각 slide를 단일 deck payload로 분리하고, 정확도 harness에서 data URL을 동일 바이트의 임시 `blob:` URL로 바꿔 localStorage 용량이 측정을 왜곡하지 않도록 했다. 정상 Pretendard 제공 환경에서 8/8 캡처에 성공했다.

- elapsed: 9.95초
- maximum RSS: 578,781,184 bytes
- 평균 SSIM: 0.9156
- `0.95` gate: 3/8 통과, 5/8 실패
- slide별 SSIM: `0.9602`, `0.8799`, `0.9209`, `0.9609`, `0.9824`, `0.9037`, `0.8990`, `0.8181`
- importer warning: slide 3 letter spacing 11건, slide 7 `wedgeRoundRectCallout` image fallback 1건

초기 측정에서 전체 8-slide/base64 deck을 각 localStorage payload에 중복한 결과 payload가 약 30MB가 되어 `Deck render payload missing.`으로 8/8 캡처가 실패했다. 단일-slide payload와 `blob:` URL 운반으로 해결했으며, 이는 renderer 품질 문제가 아니라 accuracy harness의 운반 한계였다.

### 결정

**runtime 자동 선택에는 채택하지 않는다.** 실제 기준에서 5/8이 gate를 통과하지 못하고 단일 8-slide 측정도 약 579MB peak RSS를 사용하므로 import latency와 worker memory 경계에 적합하지 않다.

Konva SSIM은 CI-only 회귀 gate로 유지한다. Runtime report는 candidate renderer가 없는 경우 SSIM을 추정하지 않고 `not-evaluated`와 capability 진단을 구분해 기록한다. `appearance-first`의 안전 경로는 source slide snapshot이며 element tree는 계속 보존한다.

## PR0 종료 결정

1. LibreOffice notes-only renderer: production bounded preview 경로에 채택한다.
2. Runtime Konva candidate renderer: 기각하고 SSIM은 CI-only로 유지한다.
3. 두 경로 모두 실패가 import 자체를 실패시키거나 기존 package를 손상시키지 않도록 후속 PR에서 fail-closed 계약과 테스트를 추가한다.
