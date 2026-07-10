# AI PPT 생성 고도화 기획서 V7

> 기준일: 2026-07-10
> 
> 
> 상태: 1차 완료, 2차 완료, 3차 선행 규칙 기반 설계 확정, 3차 기획 확정
> 

---

## 1. 배경

현재 서비스의 AI PPT 생성 기능은 기존 `.pptx` 템플릿을 가져와 내용을 덮어쓰는 방식에서 출발했다. 이 방식은 빠르게 결과물을 만들 수 있지만 다음 한계가 있다.

- 템플릿 구조에 결과물이 강하게 묶인다.
- 사용자가 입력한 정보만으로 새로운 톤의 발표자료를 만들기 어렵다.
- 색상, 폰트, 발표 톤, 레이아웃을 자연스럽게 바꾸기 어렵다.
- 생성된 PPT를 에디터에서 안정적으로 수정 가능한 구조로 유지하기 어렵다.
- 사용자별, 브랜드별 스타일을 반복 사용하기 어렵다.

AI PPT 생성 기능은 기존 PPTX를 먼저 만드는 방식이 아니라, 사용자의 입력과 디자인 시스템을 바탕으로 내부 `Deck JSON`을 먼저 생성하는 구조로 전환한다.

기존 PPTX 템플릿 생성 기능은 삭제하지 않는다. 회사 템플릿 업로드나 기존 PPT 재사용이 필요한 사용자를 위해 legacy/template 경로로 유지한다. `/ai-ppt`만 명시적으로 `generationMode: "design-pack"` 경로를 사용한다.

---

## 2. V7 변경 요약

V7은 V6의 1차·2차 완료 상태와 3차 방향을 유지하면서, 두 개의 발표 구성 및 디자인 리서치 문서를 제품 규칙으로 정규화한 결과를 반영한다.

### 2.1 추가된 핵심 내용

- 3차 개발 전에 완료해야 하는 발표 품질 규칙 기반을 정의한다.
- 규칙을 Hard Rule, Profile Rule, Preference Rule로 분리한다.
- 발표 유형별 narrative selector를 정의한다.
- 각 규칙에 리서치 문서의 근거 위치를 명시한다.
- 상충하는 10/20/30, 1-6-6, 폰트 크기, 대비, 배색 규칙의 제품 적용 기준을 확정한다.
- 기존 Brief, SlidePlan, Design Pack, repair pass, validation 경로를 재사용한다.
- Saved Design Pack과 Brand Kit에서 변경 가능한 규칙과 변경할 수 없는 규칙을 구분한다.
- 실제 이미지, 차트, 애니메이션, 리허설 최적화 등 3차 이후 항목을 별도로 정리한다.

### 2.2 단계별 경계

```
3차 선행 작업
- 공통 발표 품질 규칙
- narrative selector
- 생성 prompt 규칙
- 정량 validator와 repair
- 근거 문서와 규칙 매핑

3차
- Saved Design Pack
- Brand Kit
- 실제 이미지 생성 및 asset 관리
- 기본 의미 기반 QA
- 규칙 저장과 우선순위 적용

3차 이후
- 실제 이미지 픽셀 품질 평가
- 고급 차트 QA
- 자간과 애니메이션
- 발표용/배포용 동시 생성
- 리허설 데이터 기반 개인화
- 고급 서사 QA와 품질 평가 데이터셋
```

### 2.3 2차 완료 상태 유지

2차에서 완료한 시간 배분, speakerNotes, fontOverride, 웹 리서치, source ledger, 대비 검증, repair pass, media placeholder, Side AI, PPTX export 정합성과 legacy 경로 분리는 V7에서도 회귀 기준으로 유지한다.

## 3. 최종 제품 방향

```
사용자 입력
+ 저장된 Design Pack
+ 이번 발표 Brief
+ 참고자료/웹 리서치
-> Deck JSON 생성
-> 검증 및 자동 보정
-> 에디터 렌더링과 수정
-> PPTX export
```

### 핵심 원칙

1. AI PPT 생성의 기본 단위는 PPTX 템플릿이 아니라 `Design Pack`이다.
2. AI는 PPTX를 직접 만들지 않고 서비스의 `Deck JSON`을 먼저 생성한다.
3. 에디터와 PPTX export는 동일한 Deck JSON을 source of truth로 사용한다.
4. LLM은 리서치, 발표 구조, 메시지, 문장과 시각 의도 판단을 담당한다.
5. 코드는 schema validation, 좌표 계산, overflow, contrast, repair와 export를 통제한다.
6. 기본 스타일은 Design Pack에서 가져오고 이번 발표의 변경값은 Session override로 적용한다.
7. 기존 legacy/template 생성은 유지하고 `/ai-ppt`와 계약 및 테스트로 분리한다.
8. 3차에서 Session Design Pack을 저장 가능한 `Saved Design Pack`으로 확장한다.

---

## 4. 주요 개념

### 4.1 Design Pack

PPTX 파일이 아니라 코드가 적용할 수 있도록 디자인 시스템을 구조화한 재사용 단위다.

```
Design Pack
- 색상 토큰
- 폰트 토큰
- 레이아웃 규칙과 variant
- 슬라이드 패턴
- 차트/테이블 스타일
- 이미지 정책
- 발표 톤
- 금지 규칙
- QA 규칙
```

### 4.2 brandlogy-modern

현재 기본 Design Pack이다.

```
brandlogy-modern
- slideRatio: 16:9
- canvas: 1920x1080
- baseFont: Pretendard
- visualStyle: structured, clean, data-first
- tone: professional, clear
- paletteOverride 지원
- layoutDiversity 지원
```

### 4.3 Session Design Pack

이번 발표에만 적용되는 임시 디자인 설정이다.

```
base Design Pack
+ 선택한 팔레트
+ 선택한 폰트
+ 발표 tone
+ 레이아웃 밀도와 다양성
+ 이미지 정책
+ 참고자료 정책
+ 금지 스타일
-> Session Design Pack
```

### 4.4 Deck JSON

AI PPT 생성 결과의 source of truth다.

```
Deck JSON
-> Web editor
-> Slide preview
-> PPTX export
```

PPTX를 먼저 생성한 뒤 XML을 다시 Konva JSON으로 변환하지 않는다. 기존 PPTX import는 별도 보조 기능으로 유지한다.

### 4.5 Presentation Brief

이번 발표에만 해당하는 사용자 입력이다.

```
- 발표 주제와 목적
- 발표 상황
- 청중
- 발표 유형
- 성공 기준
- 발표 시간
- tone
- 색상과 폰트 요청
- 이미지 정책
- 참고자료 정책
```

---

## 5. 1차 목표와 완료 상태

### 목표

기존 템플릿 덮어쓰기에서 벗어나 Design Pack과 Deck JSON 기반 생성 구조를 만든다.

### 완료 범위

- `brandlogy-modern` 기본 Design Pack
- Deck JSON schema
- Brief 설문 MVP
- 설문 입력의 Session Design Pack 변환
- 색상 후보 3개와 preview
- `/ai-ppt`의 명시적 `design-pack` 생성 모드
- Design Pack 전용 slide assembly
- cover, overview, process, comparison, insight, closing recipe
- paletteOverride의 구조 요소 반영
- 의미 기반 레이아웃 선택과 recipe variant
- 에디터 렌더링
- Deck JSON 기반 PPTX export
- legacy/template 생성 경로 유지

### 완료 기준

- PPTX 템플릿 없이 Deck JSON을 생성한다.
- `/ai-ppt` 요청은 `generationMode: "design-pack"`을 명시한다.
- 기존 생성 기능의 기본값과 동작은 유지한다.
- 사용자의 색상 요청이 `colorIntent`, `constraints`, `paletteOverride`로 변환된다.
- 선택 팔레트가 rail, card, section, process, emphasis 등에 반영된다.
- preview와 실제 생성물이 같은 시각 언어를 사용한다.
- 생성 Deck을 에디터와 PPTX export에서 공통으로 사용한다.

---

## 6. 2차 목표

### 목표

사용자가 선택한 발표 시간, tone, 색상, 폰트, 이미지 정책과 참고자료 정책이 단순 payload에 머물지 않고 실제 결과물의 내용과 품질을 결정하도록 만든다.

### 완료 범위 요약

```
- 발표 시간 기반 슬라이드 수 및 메모 분량 제어
- 폰트 catalog와 fontOverride
- 색상/폰트 preview
- tone과 발표 맥락 기반 문체 및 레이아웃
- 의미 기반 layout recipe 선택
- Design Pack repair pass
- 실제 배경 기준 contrast 검증
- AI 이미지 visual plan과 placeholder
- 참고자료 추출 및 웹 리서치
- 출처 품질 및 핵심 사실 커버리지 게이트
- source ledger와 인용 중복 제거
- Side AI 의사결정 지원
- 생성 진단 요약
- 에디터 검증과 PPTX export 정합성
- legacy/template 경로 영향 차단
```

---

### 6.1 발표 시간 기반 분량 제어

발표 시간은 metadata가 아니라 생성 제약으로 사용한다.

```
발표 시간
-> slideCountRange
-> 슬라이드별 목표 발화 시간
-> 전체 speakerNotes 목표 분량
-> 슬라이드별 메모 배분
-> 부족한 메모 자동 보정
```

고정 글자 수만 사용하지 않고 tone과 발표 유형에 따른 발화 밀도를 적용한다. 공백 제거 기준과 최소 슬라이드별 충족률을 함께 검사해 형식적인 분량 채우기를 방지한다.

완료 기준:

- 7분 입력이 4장 내외로 과소 생성되지 않는다.
- 10분 입력은 기본적으로 10장 흐름을 구성할 수 있다.
- 전체 메모뿐 아니라 슬라이드별 메모가 목표 하한을 충족한다.
- 메모 분량 보정이 Deck JSON과 PPTX 발표자 노트에 유지된다.

---

### 6.2 폰트 추천과 레이아웃 안정성

무료 한글 폰트 catalog는 다음 정보를 가진다.

```
- font name / fontId
- license / source URL
- supported weights
- Korean support
- PPTX embedding 가능 여부
- mood tags
- recommended title/body size
- lineHeight / widthFactor
- overflowRisk
```

선택한 폰트는 제목과 본문 글꼴만 바꾸지 않고 font size, line height, box fitting과 overflow repair에 반영한다. PPTX export에서도 동일한 폰트 family와 줄바꿈을 유지한다.

---

### 6.3 색상과 폰트 preview

사용자는 팔레트와 폰트 이름만 보고 결과를 판단하기 어렵다. 따라서 후보를 실제 recipe와 유사한 미니 슬라이드로 보여준다.

```
- 표지
- 본문 카드
- 강조 문구
- 배경과 본문 대비
```

선택한 값은 `paletteOverride`와 `design.fontOverride`에 저장하고 Review 단계에서 최종 payload 요약으로 확인할 수 있다.

---

### 6.4 Tone과 의미 기반 레이아웃

Tone은 문체와 레이아웃 모두에 반영한다.

```
professional
- 근거 중심 구성
- 명확한 제목과 차분한 밀도

friendly
- 짧고 직접적인 문장
- 질문, 토의, 합의 흐름

funny / easy read
- 긴 문단 최소화
- 키워드와 여백 중심
- 쉬운 표현
```

레이아웃 selector는 `presentationType`, `audienceText`, `slideType`, `visualIntent`, `densityTarget`, `mediaPolicy`를 사용한다. 덱 전체가 동일한 카드 구조를 반복하지 않도록 overview, process, comparison, insight, evidence, closing variant를 섞는다.

---

### 6.5 Design Pack repair와 검증

저장 전에 Design Pack 전용 repair pass를 실행한다.

```
- text overflow 감지
- font size와 lineHeight 조정
- 텍스트 박스 확장과 재배치
- 문장 compact 처리
- safe-area 보정
- titleWrap 및 chrome 텍스트 처리
- 실제 배경색 기준 contrast 검사
- 반복 레이아웃 완화
```

검증 정책:

- schema 또는 필수 품질 게이트 실패는 생성 실패로 처리한다.
- repair 가능한 디자인 문제는 저장 전에 보정한다.
- `validation.passed`는 실제 issue가 0개일 때만 `true`다.
- 남은 issue는 `warnings`와 `validation.designIssues`에서 추적한다.
- 예상된 media placeholder는 이미지 누락 경고로 처리하지 않는다.

---

### 6.6 이미지 정책

2차에서는 실제 AI 이미지 파일을 생성하지 않는다.

```
mediaPolicy: ai-generated
-> visualPlan.imageNeeded = true
-> imageSourcePolicy = "ai-generated"
-> visible placeholder 생성
-> 이미지 필요 근거 기록
```

`minimal`은 이미지 슬롯을 만들지 않는다. Side AI나 advisor는 사용자가 선택한 `ai-generated`를 임의로 `minimal`로 되돌리지 않는다.

실제 AI 이미지 생성, 공개 이미지 다운로드, 저작권 확인과 asset 저장은 3차 범위다.

---

### 6.7 참고자료와 웹 리서치

지원 정책:

```
- references-only: 첨부 자료만 사용
- references-first: 첨부 자료 중심, 필요 시 웹 검증
- research-first: 웹 리서치 중심, 첨부 자료로 방향 보정
- prompt-only: 사용자 입력만 사용
```

`research-first`는 단순히 URL 두 개를 채우는 것으로 통과하지 않는다.

```
- 발표 주제와 검색 질의 분리
- 비영문 고유명사의 영문 별칭 우선 검색
- 공식 출처와 독립 출처 구분
- 최소 출처 수 검증
- 핵심 사실별 citation coverage 검증
- 출시일 등 필수 사실 누락 시 재검색
- 검색 실패 진단에 기존 URL 활용
- 반복 claim과 중복 citation 병합
- 무관한 URL 제거
- 출처 기반 발표 메모 보정
```

출처는 Deck JSON의 `sourceLedger`와 슬라이드별 사용 관계로 보존한다.

```
Source Ledger
- claim
- source URL
- sourceType
- confidence
- usedInSlideId
```

---

### 6.8 Side AI Chat

Side AI는 설문 중 사용자의 결정을 돕되 별도 생성 파이프라인으로 동작하지 않는다.

```
- 색상과 폰트 선택 지원
- 발표 tone과 청중 적합성 제안
- 발표 시간과 슬라이드 수 조정
- 이미지 및 참고자료 정책 안내
```

응답은 구조화 schema로 검증하고, 사용자가 적용한 값만 Brief 또는 Session Design Pack override에 반영한다. 적용이 끝난 선택지는 적용 완료 상태로 전환해 중복 적용 여부가 모호하지 않게 한다.

---

### 6.9 입력값과 진단 추적

생성 입력의 기준은 `jobs.payload.request`다.

```
- generationMode
- topic / prompt / designPrompt
- brief
- targetDurationMinutes / slideCountRange
- design.stylePackId
- design.paletteOverride
- design.fontOverride
- design.mediaPolicy
- visualPlanPolicy
- referencePolicy / referenceFileIds
```

생성 결과에는 슬라이드 수, 시간 배분, 메모 목표와 충족률, 검증 결과, media placeholder, 출처 수와 품질 진단을 요약한다. 서버 로그에는 사용자 원문, 발표 메모 전체, credential을 출력하지 않는다.

---

### 6.10 기존 생성 기능과의 경계

- `GenerateDeckRequest`의 legacy 기본 동작을 유지한다.
- `/ai-ppt`만 `generationMode: "design-pack"`을 명시한다.
- `templateSelection`과 `ai-template-deck-generation` 결과를 design-pack 생성에 섞지 않는다.
- 기존 기능을 삭제하거나 전역 동작을 변경하지 않는다.
- 계약과 회귀 테스트로 두 경로의 분리를 보장한다.

---

### 6.11 2차 최종 승인 결과

최종 승인 fixture는 10분, 10장, `professional`, Pretendard, `ai-generated`, `research-first` 조건으로 검증했다.

| 검증 항목 | 승인 결과 |
| --- | --- |
| 생성 모드 | `design-pack` |
| 목표 발표 시간 | 10분 |
| 생성 슬라이드 | 10장 |
| 전체 발표 메모 | 3,072자 / 목표 3,500자 |
| 슬라이드별 최소 메모 충족률 | 83.08% |
| Worker design issue | 0개 |
| 에디터 검증 경고 | 10장 전체 0개 |
| AI 이미지 placeholder | 3개 |
| 실제 생성 이미지 asset | 0개 |
| 서로 다른 출처 URL | 3개 |
| 공식 출처 | 2개 |
| 독립 출처 | 1개 |
| 중복 source ledger | 0개 |
| 무관한 URL | 0개 |
| legacy template 영향 | 없음 |
| PPTX export | 10장, XML 오류 없음 |

이 결과는 2차 목표의 완료 수준이다. 실제 이미지와 주제별 고급 아트 디렉션이 없는 점은 2차의 의도된 한계다.

---

### 6.12 2차 성공 기준과 상태

- [x]  색상과 폰트를 preview 기반으로 선택 가능
- [x]  무료 폰트 후보와 라이선스 정보 제공
- [x]  폰트별 text fitting과 PPTX 반영
- [x]  발표 시간 기반 슬라이드 수 계산
- [x]  발표 시간 기반 speakerNotes 생성 및 보정
- [x]  tone과 발표 맥락의 문체 및 레이아웃 반영
- [x]  AI 이미지 visualPlan과 placeholder 반영
- [x]  실제 AI 이미지 생성은 2차에서 제외
- [x]  참고자료 및 웹 리서치 출처 ledger 생성
- [x]  핵심 사실의 출처 커버리지 검증
- [x]  Side AI 선택값 적용과 피드백 제공
- [x]  저장 직후 디자인 및 대비 경고 0개에 가까운 결과
- [x]  `validation.passed`와 실제 issue 정합성
- [x]  legacy/template 생성 규칙 영향 차단
- [x]  Deck JSON과 PPTX export 정합성

**판정: 2차 완료**

---

## 7. 3차 선행 발표 품질 규칙 기반

### 7.1 목적

3차의 Saved Design Pack, Brand Kit, 실제 이미지 생성과 QA가 같은 품질 기준을 사용하도록 공통 규칙을 먼저 확정한다.

리서치 전문을 생성 prompt에 매번 전달하지 않는다. 제품 규칙으로 정규화한 뒤, 현재 발표에 필요한 규칙만 선택하여 LLM과 코드 validator에 전달한다.

### 7.2 근거 문서

- **문서 A:** 성공적이고 전달력 높은 발표를 위한 프레젠테이션 내용 구성 및 시각적 최적화 설계 분석 보고서
- **문서 B:** PPT 발표 구성 및 디자인 가이드

### 7.3 규칙 분류

**Hard Rule**

가독성, 접근성, 사실 정확성과 편집 안정성에 직접 영향을 주는 규칙이다. 사용자, Saved Design Pack, Brand Kit이 해제할 수 없다.

```
- 근거 없는 사실과 수치 생성 금지
- text overflow 금지
- safe area 준수
- 일반 텍스트 대비 4.5:1 이상
- 본문 최소 18pt
- font family 최대 2종
- 출처가 필요한 주장에 source ledger 연결
```

**Profile Rule**

발표 목적과 유형에 따라 선택되는 규칙이다.

```
- 서사 구조
- 결론 우선 여부
- 문제와 해결의 비중
- 근거, 사례, 데모의 배치
- CTA 또는 의사결정 요청
- 문체와 정보 밀도
```

**Preference Rule**

품질 하한을 침해하지 않는 범위에서 Design Pack과 사용자 선택으로 조정할 수 있다.

```
- 팔레트와 색상 역할
- typography scale
- 레이아웃 밀도와 다양성
- 이미지 밀도
- 카드, editorial, technical 등의 시각 스타일
- QA 경고 민감도
```

### 7.4 규칙과 근거 매핑

| ID | 제품 규칙 | 적용 방식 | 리서치 근거 |
| --- | --- | --- | --- |
| R-01 | 발표 목적·청중·성공 기준 우선 해석 | Brief를 기준으로 narrative profile 선택 | 문서 A 2.1 SCQA, 2.2 Sparkline; 문서 B 1 발표용 PPT의 목적, 2 전체 발표 구조 |
| R-02 | 발표 유형별 서사 구조 사용 | narrative selector를 content plan 생성에 적용 | 문서 A 2.1, 2.2; 문서 B 2, 3 반드시 들어가야 할 요소 |
| R-03 | 슬라이드당 핵심 메시지 1개 | SlidePlan.message를 하나의 주장으로 제한 | 문서 A 3.1 1슬라이드 1메시지; 문서 B 4 슬라이드 콘텐츠 규칙, 15 AI PPT 생성 |
| R-04 | 본문 제목은 결론형 action title | 생성 prompt에 적용, 40자 초과 시 warning | 문서 A 3.1; 문서 B 4 제목은 주제가 아니라 결론으로 쓴다 |
| R-05 | 본문은 3~5개 항목, 최대 6줄 권장 | content item과 실제 렌더링 line count 검사 | 문서 A 3.2 1-6-6; 문서 B 4, 15, 17 핵심 규칙 요약 |
| R-06 | 세부 설명은 발표자 메모로 분리 | 화면은 키워드, 맥락과 근거는 speakerNotes에 배치 | 문서 A 3.2; 문서 B 1, 4, 12 발표 전달력, 14 발표용과 배포용 구분 |
| R-07 | 근거 없는 사실·수치 생성 금지 | source coverage gate와 sourceLedger를 Hard Rule로 유지 | 문서 B 3 근거와 결과, 9 표와 차트, 15, 16 실무 체크리스트 |
| R-08 | 발표 시간에 따라 장수와 메모 결정 | slideCountRange와 timingPlan 사용 | 문서 A 2.3 10/20/30; 문서 B 13 발표 시간에 따른 분량 |
| R-09 | 폰트 기본 1종, 최대 2종 | 덱 전체 font family 개수 검증 | 문서 A 4.1 폰트 패밀리; 문서 B 6 폰트 패밀리, 15, 17 |
| R-10 | 역할별 최소 글자 크기 유지 | 표지 44pt 이상, 본문 제목 32~44pt, 본문 목표 20~24pt·최소 18pt, 캡션 14~18pt | 문서 A 4.2; 문서 B 6 요소별 폰트 크기, 15, 17 |
| R-11 | 본문 행간 1.2~1.3 권장 | recipe와 fontOverride에 적용, 이탈 시 warning | 문서 A 4.3 자간 및 행간; 문서 B 6 타이포그래피 규칙 |
| R-12 | 배경·보조·강조색 역할 분리 | dominant, secondary, accent 역할을 recipe에 적용 | 문서 A 5.1 60-30-10; 문서 B 7 색상 구성, 15 |
| R-13 | 실제 배경 기준 텍스트 대비 확보 | 일반 텍스트 4.5:1 이상 Hard Rule | 문서 A 5.2 명도 대비율; 문서 B 7 대비와 접근성, 16 |
| R-14 | 색만으로 의미를 전달하지 않음 | 상태와 범주에 label 또는 icon 병행 | 문서 B 7 대비와 접근성, 16 레이아웃과 색상 |
| R-15 | 16:9, 안전 여백, 공통 grid 유지 | 기존 canvas와 safe area 위에 12열 grid 기준 적용 | 문서 A 5.3 12단 grid; 문서 B 8 레이아웃과 시인성 |
| R-16 | 정렬과 간격 체계 유지 | 12열, 24px gutter, 8px spacing 단위 | 문서 A 5.3; 문서 B 8 grid와 간격 |
| R-17 | 슬라이드마다 시각적 중심 요소 1개 | title, metric, image, chart, process 중 primary visual 선택 | 문서 A 3.3 Presentation Zen, 5.3; 문서 B 8 시각적 위계, 15 |
| R-18 | 이미지는 적고 크게, 메시지 근거로 사용 | 3차 전에는 visualPlan과 placeholder 선택 기준으로 사용 | 문서 A 3.3, 5.3; 문서 B 9 이미지, 15 |
| R-19 | 차트 하나에는 결론 하나만 표시 | 불필요한 축·격자·범례 제거, 핵심 계열만 강조 | 문서 A 3.3; 문서 B 9 차트, 10 시각화 패턴 |
| R-20 | 마지막에 요약 또는 행동 요청 제공 | 설득·기획·제품 공개 profile에서 CTA 필수 | 문서 A 2.2 STAR와 CTA; 문서 B 2, 3 요약과 행동 요청, 16 |

### 7.5 Narrative Selector

기존 brief.presentationType, metadata.purpose, design.profile을 입력으로 사용한다.

| 발표 유형 | 기본 서사 |
| --- | --- |
| 기획·제안·영업·스타트업 피치 | 상황 → 문제 → 핵심 질문 → 해결책 → 근거 → 실행 → CTA |
| 임원·성과 보고 | 결론 → 핵심 근거 → 영향 → 위험 → 의사결정 요청 |
| 제품·신상품 공개 | 기대 형성 → 차별점 → 사용 경험 → 근거 → 출시 정보 → CTA |
| 교육·강의 | 목표 → 핵심 개념 → 예시 → 적용 → 요약 → 질문 |
| 기술 발표 | 문제 → 원리 → 구조 → 작동 흐름 → trade-off → 결과 |
| 연구 발표 | 연구 질문 → 방법 → 결과 → 해석 → 한계 → 결론 |
| 일반 정보 전달 | 맥락 → 핵심 내용 → 근거 → 의미 → 요약 |

명시적 design.profile이 있으면 우선하고, 없으면 presentationType과 purpose로 선택한다.

### 7.6 상충 규칙의 제품 적용 기준

- 10/20/30은 전체 발표의 Hard Rule이 아니라 startup-pitch 압축 지침으로만 사용한다.
- 본문 30pt 이상과 20~24pt 권장이 충돌하므로 기본 목표는 20~24pt, Hard Floor는 18pt로 한다. 저밀도 피치는 30pt 이상을 권장한다.
- 영어 중심 1-6-6의 단어 수는 한국어에 직접 적용하지 않고 실제 렌더링 줄 수와 content item 수를 검사한다.
- 60-30-10은 정확한 픽셀 면적이 아니라 색상 역할과 강조색 남용 방지 원칙으로 적용한다.
- 15:1 대비는 권장 예시로 취급하고 제품 필수 기준은 4.5:1로 유지한다.
- 12열 grid는 recipe 생성과 정렬 기준으로 사용하며 모든 슬라이드를 동일 구조로 만들지 않는다.
- 자간은 Deck JSON, 에디터, PPTX export가 공통 지원한 뒤 적용한다.

### 7.7 생성·검증·repair 적용

**생성**

- 현재 발표에 선택된 규칙만 compact prompt로 전달한다.
- SlidePlan.message는 단일 핵심 주장으로 사용한다.
- contentItems는 핵심 주장을 뒷받침하는 근거 또는 단계로 사용한다.
- cover, chart, Q&A, source appendix에는 본문 항목 수 규칙을 강제하지 않는다.

**검증**

기존 validation.presentationIssues에 다음 code를 사용한다.

```
ACTION_TITLE_WEAK
BODY_CONTENT_DENSE
FONT_SIZE_BELOW_MINIMUM
FONT_FAMILY_OVERUSED
LINE_HEIGHT_OUT_OF_RANGE
VISUAL_HIERARCHY_WEAK
CTA_MISSING
GRID_ALIGNMENT_INCONSISTENT
```

SLIDE_MESSAGE_MULTIPLE과 NARRATIVE_FLOW_WEAK처럼 의미 판단이 필요한 항목은 3차 QA에서 평가한다.

**Repair**

```
1. 텍스트 박스와 recipe 재배치
2. 중복 문장 및 장문 compact
3. 역할별 최소 크기까지 font 축소
4. 최소 크기에서도 해결되지 않으면 presentation issue 노출
```

본문을 12pt까지 줄여 overflow만 없애는 방식은 사용하지 않는다.

### 7.8 3차 선행 완료 기준

- 발표 유형에 따라 narrative 흐름이 달라진다.
- 슬라이드 본문은 하나의 message와 이를 지원하는 content item으로 구성된다.
- 본문 18pt 미만, 폰트 3종 이상, 낮은 대비, overflow가 정상 결과로 승인되지 않는다.
- Worker와 에디터가 동일한 발표 품질 위반을 표시한다.
- 리서치 전문은 prompt에 포함되지 않고 선택된 규칙만 전달된다.
- legacy/template 생성 결과는 새 규칙의 영향을 받지 않는다.
- 5분 피치, 10분 제품 공개, 20분 보고, 30분 교육 fixture가 회귀 테스트를 통과한다.

---

## 8. 3차 목표

### 목표

2차에서 완성한 단일 발표 생성 품질을 반복 사용 가능한 개인 및 조직 단위 시스템으로 확장하고, 실제 이미지 asset 파이프라인을 연결한다.

### 8.1 Saved Design Pack

```
- 이름과 설명
- baseStylePackId
- palette와 font settings
- tone과 layout preferences
- image policy
- source/citation policy
- QA policy
- owner와 timestamps
```

사용자는 저장, 선택, 수정, 복제, 삭제와 기본값 지정을 할 수 있어야 한다.

### 8.2 팀/조직 Brand Kit

```
- 로고
- 브랜드 컬러와 금지 색상
- 공식 폰트
- 권장 문체
- 표지와 footer 규칙
- 승인된 이미지/아이콘 asset
```

Brand Kit은 Saved Design Pack보다 상위 정책으로 적용한다.

### 8.3 실제 이미지 생성 및 수집

```
- AI image provider 연동
- 공개 이미지 검색과 출처/라이선스 확인
- 생성/수집 이미지 asset 저장
- 이미지와 슬라이드 slot 연결
- 실패, timeout, 재시도와 대체 placeholder
- 사용자 및 조직별 비용 제한
- 생성 근거와 교체 UI
```

### 8.4 생성 결과 QA 루프

- 발표 목적과 구성의 일치
- 청중 수준과 문체
- 시간 대비 슬라이드와 메모
- overflow와 contrast
- 이미지, 표와 차트의 적합성
- 출처가 필요한 주장과 citation coverage
- Design Pack 및 Brand Kit 위반

### 8.5 고급 생성 구조

기본은 현재의 단일 orchestrator를 유지한다. 측정된 병목이 있을 때만 Research, Outline, Design, Layout, QA 역할을 분리한다. MCP나 멀티 에이전트 도입 자체를 목표로 삼지 않는다.

### 8.6 스타일 프리셋 확장

```
- Startup Pitch
- Academic Presentation
- Corporate Report
- Sales Proposal
- Education Lecture
- Minimal Data Deck
- Brandlogy Modern
```

---

### 8.7 규칙 기반과 3차 기능 연동

Saved Design Pack에는 Preference Rule만 저장한다.

```
- densityTarget
- typography scale
- title style
- image density
- layout preference
- palette role
- QA strictness
```

다음 Hard Rule은 Saved Design Pack, Session override, Brand Kit에서 해제할 수 없다.

```
- 사실과 출처 정확성
- contrast
- overflow
- safe area
- 본문 최소 글자 크기
- font family 최대 개수
```

적용 우선순위:

```
schema fallback
< base Design Pack
< Saved Design Pack
< Session override
< Brand Kit locked fields
< platform Hard Rules
```

실제 이미지 생성은 R-17~R-19를 image prompt, crop, alt text, 출처와 slot 배치에 적용한다. 3차 기본 QA는 SLIDE_MESSAGE_MULTIPLE, ACTION_TITLE_WEAK, NARRATIVE_FLOW_WEAK, EVIDENCE_MISMATCH, CTA_MISSING을 의미 기반으로 평가한다.

### 8.8 3차 성공 기준

- Saved Design Pack을 저장하고 다음 발표에서 재사용할 수 있다.
- Saved Design Pack을 수정, 복제, 삭제하고 기본값으로 지정할 수 있다.
- 팀/조직 Brand Kit을 적용할 수 있다.
- 실제 AI 생성 이미지 또는 허용된 공개 이미지가 슬라이드 asset으로 저장된다.
- 이미지 생성 비용, 실패와 재시도 정책이 적용된다.
- 생성 결과를 QA 루프가 자동 검토한다.
- 반복 생성 시 같은 Design Pack의 톤앤매너가 유지된다.
- 여러 Design Pack과 프리셋을 관리하고 선택할 수 있다.

---

## 9. 기술 설계 방향

### 9.1 Orchestrator

현재는 단일 orchestrator, 단계별 함수, 구조화된 LLM 출력과 코드 기반 validator/exporter를 유지한다.

- 디버깅과 실패 추적이 쉽다.
- 비용과 latency를 통제할 수 있다.
- shared schema와 Job 계약을 유지하기 쉽다.
- 필요가 확인되기 전까지 MCP 또는 멀티 에이전트 분리는 하지 않는다.

### 9.2 역할 분리

LLM 담당:

- 사용자 입력 해석
- 웹 리서치와 발표 구조
- 슬라이드 메시지와 발표 메모
- tone과 시각 의도 판단
- 이미지 필요성 판단

코드 담당:

- Deck JSON schema validation
- Design Pack recipe와 좌표 계산
- overflow와 contrast 검사
- repair pass
- source ledger 및 품질 게이트
- preview와 PPTX export

### 9.3 에디터와 PPTX

```
권장: AI -> Deck JSON -> Editor -> PPTX export
비권장: AI -> PPTX -> XML parsing -> Konva JSON
```

에디터 기능은 생성 품질을 제한하는 별도 템플릿이 아니라 Deck JSON의 모든 지원 요소를 렌더링하고 수정하는 소비자다. 새 시각 요소를 추가할 때는 shared schema, editor renderer와 PPTX exporter의 지원 여부를 함께 검증한다.

---

## 10. 전체 로드맵

### 1차: 생성 기반 전환

- Design Pack과 Deck JSON
- Brief 설문과 색상 preview
- design-pack 전용 recipe
- 에디터 렌더링과 PPTX export
- legacy/template 경로 유지

**상태: 완료**

### 2차: 입력 반영과 품질 안정화

- 시간, tone, 폰트와 레이아웃 제어
- 이미지 정책 placeholder
- 참고자료와 웹 리서치 품질 gate
- Side AI 지원
- repair, validation, contrast와 export 정합성
- legacy 영향 차단

**상태: 완료**

### 3차 선행: 발표 품질 규칙 기반

- Hard, Profile, Preference Rule 분리
- narrative selector
- action title과 한 슬라이드 한 메시지
- typography, density, grid와 CTA 규칙
- presentationIssues와 repair 보강
- 리서치 근거 매핑

**상태: 설계 확정, 구현 필요**

### 3차: 재사용과 실제 asset

- Saved Design Pack
- 팀/조직 Brand Kit
- 실제 AI 및 공개 이미지 asset
- 비용과 실패 정책
- 기본 의미 기반 QA
- 스타일 preset 확장

**상태: 다음 구현 범위**

### 3차 이후: 고급 품질 최적화

- 실제 이미지 픽셀 평가
- 고급 chart QA
- letter spacing과 animation
- 발표용·배포용 분리
- rehearsal 기반 개인화
- 고급 narrative QA와 golden dataset

**상태: 후속 범위**

---

## 11. 3차 이후 적용 계획

3차 이후에는 저장과 실제 asset 연결만으로 해결되지 않는 고급 품질 최적화를 진행한다.

| 항목 | 적용 내용 | 리서치 근거 |
| --- | --- | --- |
| 실제 이미지 품질 평가 | 핵심 메시지 관련성, 피사체 위치, crop, 해상도와 감정적 효과 평가 | 문서 A 3.3, 5.3; 문서 B 9 이미지 |
| 이미지 위 텍스트 대비 | 실제 픽셀 분석, overlay 자동 적용, 불확실 시 텍스트 영역 이동 | 문서 A 5.2; 문서 B 7 대비와 접근성 |
| 고급 차트 QA | 데이터와 차트 유형 적합성, 축 왜곡, 강조 계열과 결론 일치 검사 | 문서 A 3.3; 문서 B 9 차트, 10 시각화 패턴 |
| 자간 지원 | Deck JSON, Konva, PPTX export에 letter spacing을 공통 지원한 뒤 폰트별 규칙 적용 | 문서 A 4.3 |
| 애니메이션 정책 | Appear/Fade 중심, 단계 설명에만 순차 animation 적용 | 문서 B 11 애니메이션과 전환 |
| 발표용·배포용 분리 | 같은 리서치에서 발표용 Deck과 상세 부록 또는 배포본을 별도 생성 | 문서 B 14 발표용과 배포용 자료 구분 |
| 리허설 기반 보정 | 실제 발화 속도, 슬라이드 체류 시간과 초과 시간을 다음 생성에 반영 | 문서 B 12, 13, 16 최종 리허설; 문서 A 2.3 |
| 청중·환경별 접근성 | 발표 장소, 프로젝터, 원격 회의, 고령 청중에 따라 글자와 대비 기준 상향 | 문서 A 5.2; 문서 B 6, 7, 16 |
| 고급 서사 QA | SCQA, Sparkline, STAR의 긴장·해소와 메시지 반복 효과 평가 | 문서 A 2.1, 2.2; 문서 B 2, 12 |
| 품질 평가 데이터셋 | 발표 유형별 golden deck과 체크리스트 점수를 축적하여 회귀 평가 | 문서 B 16 실무 체크리스트, 17 핵심 규칙 요약 |

### 11.1 3차 이후 성공 기준

- 실제 이미지의 의미 적합성과 픽셀 대비를 자동 검증한다.
- 차트가 데이터의 결론을 왜곡하지 않는지 평가한다.
- 발표용 Deck과 상세 배포본을 별도 생성할 수 있다.
- 실제 리허설 결과가 다음 생성의 slide timing과 speakerNotes에 반영된다.
- 발표 환경과 청중에 따라 접근성 기준을 조정할 수 있다.
- 발표 유형별 golden deck을 이용해 생성 품질 회귀를 정량 평가한다.

---

## 12. 다음 작업 우선순위

3차 기능 구현보다 발표 품질 규칙 기반을 먼저 닫는다.

1. 본 문서의 R-01~R-20을 코드 기준과 테스트 fixture로 변환
2. narrative selector와 compact prompt 적용
3. presentationIssues와 역할별 typography validator 구현
4. repair pass의 본문 최소 18pt 정책 적용
5. Worker·에디터 검증 기준 동기화
6. 발표 유형별 회귀 fixture와 렌더링 승인
7. Saved Design Pack schema와 규칙 저장 범위 확정
8. Saved Design Pack CRUD와 선택 UX
9. 이미지 asset schema와 provider 정책 확정
10. 실제 이미지 생성, Brand Kit과 기본 QA 구현

3차 선행 규칙 기반이 통과하기 전에는 Saved Design Pack에 임의의 QA 필드나 해제 가능한 품질 옵션을 추가하지 않는다. 2차 회귀 suite는 모든 후속 단계에서 유지하며 design-pack과 legacy/template 생성의 분리를 계속 보장한다.

