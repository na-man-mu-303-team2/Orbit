# Editor motion 303 local acceptance report

## 범위

- 실행일: 2026-07-17
- acceptance 입력: `/Users/donghyunkim/Downloads/303_2팀_기획발표_0624.pptx`
- 입력 크기: `22,697,303 bytes`
- SHA-256: `5b0f55d00374c49b897805658d0fae822270ef6b74d74fd28b5cdd16d3a2f912`
- 정책: 입력 PPTX는 read-only로 사용했으며 저장소에 복사하지 않았다. 원문, 발표자 script, shape text는 보고서와 로그에 기록하지 않았다.

## 결론

**PASS.** 계획서의 303 Deck motion oracle과 실제 import 결과가 모두 일치한다.

## Expected vs observed

| 항목                             |                      계획서 oracle |                         관측 | 판정 |
| -------------------------------- | ---------------------------------: | ---------------------------: | ---- |
| Slide                            |                                 14 |                           14 | 통과 |
| Fade transition                  |                                 14 |                           14 | 통과 |
| Transition duration              |                         모두 700ms |              14개 모두 700ms | 통과 |
| Logical entrance effect          |                                 20 |                           20 | 통과 |
| Effect type/duration             |                20개 fade-in, 500ms |          20개 fade-in, 500ms | 통과 |
| Start mode                       |       on-click 18, with-previous 2 | on-click 18, with-previous 2 | 통과 |
| Raw `bldP`                       |                                 15 |                           15 | 통과 |
| Modeled-effect downgrade warning |                                 15 |                           15 | 통과 |
| Slide 8 interactive/media        |                  entrance에서 제외 |                       제외됨 | 통과 |
| Split fill/text target           |                    synthetic group |   3개 synthetic group target | 통과 |
| Unresolved target                | animation 미생성 + bounded warning |                            0 | 통과 |

`p:set`과 `p:animEffect`가 같은 target을 반복해도 logical effect가 중복 생성되지 않았다. `p14:dur=700`이 `spd=med` fallback보다 우선했고, Choice/Fallback pair는 slide당 transition 하나로 복원됐다.

## Coverage와 진단

- `importedMainSequenceCoverage`: `absent=6`, `complete=1`, `partial=7`, `unknown=0`
- 진단 code:
  - `PPTX_MOTION_PARAGRAPH_BUILD_DOWNGRADED=15`
  - `PPTX_MOTION_MEDIA_EXCLUDED=3`
  - `PPTX_MOTION_INTERACTIVE_EXCLUDED=1`
  - `PPTX_MOTION_PRESET_UNSUPPORTED=0`
  - `PPTX_MOTION_TARGET_UNRESOLVED=0`
- Quality panel 집계:
  - `total=19`
  - `unsupported=0`
  - `downgraded=15`
  - `unresolved=0`
  - `excluded=4`
- 진단은 visual quality score를 차감하지 않는 별도 motion 집계로 기록된다.

Slide 8의 제외 branch는 `mediacall` 2개, `tmRoot` 직속 `video` 1개,
`interactiveSeq` 1개다. 내부 media behavior는 wrapper와 중복 집계하지 않으며,
네 outermost branch 모두 entrance effect 파싱 대상에서 제외하고 raw OOXML로 보존한다.

## Package 보존 검증

- import/generation의 `current_package` SHA-256가 원본과 동일하다.
- empty sync(`operations=[]`, `slideMotion=[]`) 결과 SHA-256가 원본과 동일하다.
- empty sync의 applied/unsupported element operation과 slide motion count는 모두 0이다.
- 따라서 변경하지 않은 import→export 경로에서 transition/timing을 포함한 package byte가 보존된다.

## 표준 근거와 구현 판정 기준

- Transition은 destination slide의 `p:transition`으로 취급하고 Office 2010 `p14:dur`을 우선한다: [Open XML SDK Transition](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.transition?view=openxml-3.0.1)
- `p14:dur`은 밀리초 단위이며 AlternateContent Choice/Fallback을 단일 transition으로 해석한다: [Add transitions to a presentation](https://learn.microsoft.com/pl-pl/office/open-xml/presentation/how-to-add-transitions-between-slides-in-a-presentation)
- `clickEffect`, `withEffect`, `afterEffect`, `mainSeq`, `interactiveSeq`는 OOXML time node type에 따라 분리한다: [Open XML SDK TimeNodeValues](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.timenodevalues?view=openxml-3.0.1)

## 제외된 이전 입력 revision

초기에 제공된 `/Users/donghyunkim/Downloads/303_02_AI 발표 어시스턴트.pptx`는 `25,532,272 bytes`, SHA-256 `8bc218b7f0a43dd33a8ee5b0b121ea950b03f7a23bd38dce0dbe3b4ab9e28c18`인 15장 revision이었다. OOXML에 transition 15개, 지원 가능한 fade entrance 37개, raw `bldP` 35개가 있어 계획서 oracle과 다른 fixture로 판정했으며 acceptance 결과에는 포함하지 않았다.

## 재현 정책

실제 fixture는 저장소에 추가하지 않는다. 동일 SHA-256의 로컬 입력이 있을 때 Python worker의 OOXML vector import를 실행하고, 원문 대신 transition/effect/startMode/coverage/diagnostic count만 비교한다. CI에서는 같은 구조를 가진 최소 synthetic OOXML fixture로 parser, serializer, sync의 회귀를 검증한다.
