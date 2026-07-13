# AI PPT 시각 품질 비교 분석 및 재설계 제안

> 기준일: 2026-07-12
>
> 대상: ORBIT AI PPT 3차 생성 결과와 외부 AI 생성 결과 비교
>
> 결론: 콘텐츠·리서치 기반은 유지하고 시각 생성 코어는 재설계 필요

---

## 1. 분석 목적

동일한 Brandlogy 디자인 지침과 유사한 발표 Brief로 생성된 외부 AI PPT와 현재 ORBIT 결과물을 눈으로 비교하여 다음을 파악한다.

- 시인성, 시각적 위계, 레이아웃, 이미지, 색상과 덱 전체 리듬의 차이
- ORBIT 결과물의 미적 품질이 낮은 구조적 원인
- 다른 AI 결과물 수준의 디자인 품질을 달성하기 위한 생성 구조
- 기존 시스템에서 유지할 부분과 교체할 부분
- 단일 orchestrator, 멀티 에이전트와 MCP의 적절한 역할

---

## 2. 비교 대상

### 2.1 외부 AI 결과물

1. `C:\Users\Runner\Downloads\Splatoon Raiders Announcement.pdf`
2. `C:\Users\Runner\Downloads\splatoon_raiders_brandlogy_10slides.pptx`
3. `C:\Users\Runner\Downloads\스플래툰 레이더스 공개 제안서.pdf`

PPTX metadata에는 작성자가 `OpenAI`로 기록되어 있다. PDF 파일에는 생성 모델을 확정할 수 있는 metadata가 없으므로 이 문서에서는 모델명 대신 파일명으로 구분한다.

### 2.2 ORBIT 결과물

- 프로젝트: `project_c1f8c3fc-5326-4845-bca0-eef0c191098a`
- 제목: 스플래툰 레이더스 소개
- 생성 장수: 8장
- 이미지 정책: `public-assets`
- 테마: 어두운 남색 배경, 네온 노랑·보라·파랑 강조

### 2.3 비교 조건 차이

첨부된 외부 AI용 프롬프트는 `10장`, `ai-generated`를 명시한다. 현재 비교한 ORBIT 프로젝트는 `8장`, `public-assets`로 생성됐다. 따라서 이미지 종류와 장수는 완전히 동일한 조건이 아니다.

다만 레이아웃 문법, 시각적 위계, 화면 점유율, 덱 리듬과 완성도 차이를 판단하기에는 충분하다.

---

## 3. 눈으로 본 결과

### 3.1 전체 인상

현재 ORBIT 결과물은 주제에 맞춰 새롭게 디자인한 발표 자료보다, 하나의 어두운 템플릿에 내용을 배치한 결과에 가깝다.

외부 AI 결과물은 장표마다 다음 중 하나를 명확한 시각적 중심으로 사용한다.

- 큰 이미지
- 대형 KPI 또는 날짜
- 한 문장의 핵심 주장
- 구조도 또는 프로세스
- 대비가 강한 CTA

ORBIT은 제목, 카드, 이미지와 보조 문구가 비슷한 비중으로 배치되어 무엇을 먼저 봐야 하는지가 약하다.

### 3.2 항목별 비교

| 기준 | 현재 ORBIT | 외부 AI 결과물 |
| --- | --- | --- |
| 첫인상 | 어두운 템플릿에 내용을 넣은 느낌 | 발표 주제를 중심으로 새로 디자인한 느낌 |
| 시각적 중심 | 제목, 카드, 이미지의 우선순위가 비슷함 | 이미지, 숫자, 메시지 중 하나가 명확한 주인공 |
| 화면 점유 | 작은 박스 주변에 빈 공간이 많음 | 본문 영역을 적극적으로 사용 |
| 이미지 | 오징어 장난감, 일반 남성, 구형 Nintendo DS 등 문맥 불일치 | 잉크, 게임, 섬, 출시라는 주제를 직접 표현 |
| 색상 | 모든 장표가 같은 다크 배경 | 밝은 장표, 다크 장표와 강조 장표가 교차 |
| 깊이 | 테두리 중심의 평면적 표현 | 크기 대비, 색면, 그림자와 image crop으로 깊이 형성 |
| 덱 리듬 | 동일 chrome과 카드 문법 반복 | 표지, KPI, 이미지, 프로세스, CTA 실루엣이 변화 |
| 신뢰성 | 공식 출처 기반 내용은 상대적으로 우수 | 시각적 완성도는 높지만 일부 사실과 이미지가 부정확 |

### 3.3 ORBIT 장표의 구체적 문제

- 1번 장표는 오징어 캐릭터 장난감 사진을 크게 배치했지만 신작의 세계관이나 발표 핵심을 전달하지 못한다.
- 4번 장표의 일반 남성 사진은 협동 멀티플레이와 의미 관계가 없다.
- 6번 장표의 구형 Nintendo DS 사진은 Nintendo Switch 2 출시 정보와 충돌한다.
- 대부분의 장표에서 콘텐츠가 화면 상단 또는 중앙에 작게 모이고 하단이 비어 있다.
- 동일한 남색 배경, 상단 노란 선, 하단 보라 선과 카드 스타일이 반복된다.
- 짧은 내용도 작은 카드에 넣어 시각적 메시지가 커지지 못한다.
- 페이지 간 밝기, 밀도와 이미지 비중 변화가 없어 발표 흐름이 단조롭다.

### 3.4 외부 AI 결과물의 강점

특히 `splatoon_raiders_brandlogy_10slides.pptx`는 다음 특성이 분명하다.

- 흰색 장표 중심으로 잉크 색상을 강하게 사용한다.
- 표지와 마무리 장표에서 대형 이미지와 다크 배경을 사용한다.
- 제목이 크고 결론형이며 본문보다 먼저 읽힌다.
- 이미지가 단순 첨부물이 아니라 화면 구성의 절반을 담당한다.
- 날짜, 플랫폼과 상품 구성을 대형 정보 단위로 표현한다.
- 장표마다 실루엣은 다르지만 동일한 색상, 폰트와 여백으로 한 덱처럼 보인다.

### 3.5 외부 AI 결과물의 한계

외부 결과물이 모든 측면에서 우수한 것은 아니다.

- `8인 레이드`, `2027 베타`, `30,000,000+` 등 근거가 불확실한 내용이 포함됐다.
- 스매시브라더스 캐릭터 이미지처럼 발표 주제와 직접 관계없는 자료가 사용됐다.
- 공식 발표와 추론 또는 창작 설정의 경계가 불명확하다.
- 일부 PDF는 출처와 실제 주장 간의 연결이 약하다.

즉 ORBIT은 리서치와 출처 정확성이 더 낫고, 외부 AI는 시각 연출이 더 낫다. 목표는 외부 AI의 시각적 장점만 가져오고 ORBIT의 근거 기반 생성은 유지하는 것이다.

---

## 4. ORBIT 품질이 낮은 근본 원인

### 4.1 LLM이 실제 슬라이드를 디자인하지 않음

현재 LLM은 다음과 같은 계획 정보만 생성한다.

- `slideType`
- `visualIntent`
- `mediaIntent`
- 제목, message와 contentItems

LLM prompt는 좌표, 크기, `zIndex`와 최종 Deck JSON을 출력하지 못하게 제한한다.

실제 화면 좌표와 요소는 `services/python-worker/app/ai/generate_deck.py`의 고정 recipe 함수가 만든다.

결과적으로 모델의 디자인 능력은 최종 화면에 직접 반영되지 않고, Python recipe 선택에 간접적으로만 반영된다.

### 4.2 Brandlogy 전문이 생성 계약으로 연결되지 않음

Web은 설문 결과를 다음과 같은 짧은 `designPrompt`로 컴파일한다.

```text
tone=...
colorMood=...
font=...
colorIntent=...
mediaPolicy=...
base=brandlogy-modern
output=Deck JSON first
```

내장된 `brandlogy-modern.md`도 첨부된 Brandlogy 디자인 시스템 전문보다 훨씬 짧다.

더 중요한 문제는 상세 프롬프트를 전달하더라도 최종 geometry는 고정 recipe가 만들기 때문에, 프롬프트의 정교함이 레이아웃 품질로 충분히 이어지지 않는다는 점이다.

### 4.3 제한된 Recipe와 동일한 시각 문법

현재 Design Pack은 다음 recipe를 중심으로 동작한다.

```text
cover_trust_signal
overview_cards
decision_actions
priority_stack
decision_agenda
insight_evidence
process_steps
comparison_split
closing_summary
```

recipe 이름은 다양하지만 공통적으로 다음 요소를 반복한다.

- 같은 위치의 제목
- 상단과 하단의 얇은 색상 선
- 같은 section number와 label
- 비슷한 테두리 카드
- 동일한 footer
- 동일한 background

따라서 `visualType`이 달라도 덱 전체는 같은 레이아웃처럼 보인다.

### 4.4 팔레트를 덱 전체에 문자 그대로 적용

현재 프로젝트의 실제 theme은 다음과 같다.

```text
background: #202040
surface:    #2A2A50
primary:    #FFD700
secondary:  #6A0DAD
accent:     #1E90FF
text:       #FFFFFF
```

`background`가 모든 장표에 적용되고 `surface`도 배경과 명도가 비슷해 카드와 배경의 깊이 차이가 약하다.

현재 구조에는 다음 개념이 부족하다.

- light slide와 dark slide의 순서
- section divider용 inverse palette
- 한 장표 안에서의 60-30-10 색상 역할
- 이미지 장표와 데이터 장표의 서로 다른 background 전략
- featured element 한 개에만 강한 색을 사용하는 규칙

### 4.5 품질 검증이 미학을 평가하지 않음

현재 validator가 잘하는 영역은 다음과 같다.

- text overflow
- 최소 글자 크기
- 대비
- safe area
- grid 정렬
- 요소의 bounding box 점유율
- placeholder 잔존

그러나 다음은 평가하지 못한다.

- 무엇을 먼저 봐야 하는지
- 레이아웃의 무게 중심
- 이미지 crop의 적절성
- 빈 공간이 의도적인지 부족한 내용 때문인지
- 카드가 너무 많아 UI처럼 보이는지
- 장표 간 리듬이 단조로운지
- 전체 덱이 주제에 어울리는지

특히 빈 `highlight` 패널도 core element로 집계될 수 있어, 실제 내용이 적어도 bbox 점유율 기준을 통과할 수 있다.

### 4.6 이미지 관련성 검증이 실제 이미지를 보지 않음

현재 이미지 QA는 실제 픽셀을 분석하지 않는다.

검증 대상은 다음과 같다.

```text
이미지 element의 alt
슬라이드 title
visualPlan.reason
visualPlan.imageAlt
visualPlan.imagePrompt
slide message
```

이미지 element의 alt도 원래 visual plan에서 가져오므로 사실상 LLM이 작성한 계획 문구끼리 비교하는 구조다.

따라서 실제 이미지가 일반 남성이나 구형 Nintendo DS여도 alt 문구만 관련 있어 보이면 통과한다.

Openverse 고유명사 fallback은 asset 미해결 오류를 줄이지만 미적 적합성과 실제 피사체 관련성을 보장하지 않는다.

### 4.7 렌더링 결과를 보는 Art Director가 없음

현재 파이프라인은 Deck JSON을 검증하지만 완성된 슬라이드 이미지와 전체 몽타주를 보고 판단하지 않는다.

필요한 판단은 다음과 같다.

- 이 이미지가 정말 스플래툰 레이더스를 표현하는가
- 제목과 이미지 중 무엇이 중심인가
- 화면이 지나치게 비어 있거나 답답하지 않은가
- 색상 대비가 미적으로 자연스러운가
- 이전과 다음 장표를 함께 봤을 때 리듬이 있는가
- 이 장표를 사람이 만든 결과로 느낄 수 있는가

이 판단은 JSON rule과 token overlap만으로 해결할 수 없고 실제 렌더링을 보는 멀티모달 QA가 필요하다.

### 4.8 Editor는 주된 원인이 아님

현재 PPTX export 결과는 Editor의 Deck JSON과 동일한 낮은 품질을 유지한다. 즉 Editor가 좋은 디자인을 망가뜨린 것이 아니라, Editor로 들어오기 전 Deck JSON 자체가 미적으로 부족하다.

현재 Deck JSON과 Editor는 이미지, 텍스트, 도형, 차트, 그림자와 다양한 geometry를 표현할 수 있다. 시각 생성 코어를 개선하면 기존 Editor를 유지하면서도 품질을 높일 수 있다.

---

## 5. 권장 재설계 방향

### 5.1 전체 서비스를 폐기하지 않음

다음 기능은 유지하는 것이 좋다.

- Brief 설문과 Side AI
- 웹 리서치와 참고자료 정책
- source ledger와 factual grounding
- 발표 시간과 speakerNotes 계약
- Saved Design Pack과 Brand Kit 데이터
- Job, StoragePort와 image asset 저장
- Deck JSON schema
- Konva Editor
- PPTX export
- overflow, contrast, safe area와 source 검증

교체 대상은 다음과 같다.

- 고정 recipe 중심의 Design Pack renderer
- 덱 전체에 동일 배경을 적용하는 palette 전략
- token 기반 이미지 관련성 QA
- 한 번 생성하고 바로 발행하는 시각 생성 흐름

### 5.2 목표 파이프라인

```text
Brief + Research
→ Narrative Plan
→ Deck Art Direction
→ Slide Composition Plan
→ 이미지 검색·생성
→ Deck JSON Compiler
→ PNG 렌더링
→ Vision Art Director 검수
→ Deck JSON Repair
→ Editor 발행
```

### 5.3 Deck Art Direction 단계

콘텐츠 계획과 별도로 덱 전체의 시각적 DNA를 먼저 결정한다.

예시 필드:

```text
visualConcept
backgroundSequence
typeScale
colorRoles
surfaceStyle
imageTreatment
illustrationStyle
slideRhythm
sectionDividerPolicy
cardUsageLimit
dataVisualizationStyle
```

스플래툰 레이더스 덱이라면 다음과 같은 결정이 가능하다.

```text
대부분의 본문은 흰색 배경
표지와 마무리만 다크 배경
네온 노랑은 핵심 숫자와 CTA에만 사용
보라는 이미지와 섹션 강조에 사용
파랑은 정보 구조와 링크에 사용
잉크 splatter 이미지를 시각적 motif로 사용
카드보다 이미지, 대형 숫자와 flat composition 우선
```

### 5.4 Slide Composition Plan 단계

각 슬라이드에는 하나의 시각적 중심과 실제 composition을 지정한다.

```text
slidePurpose
primaryClaim
focalType
compositionId
backgroundMode
visualWeight
imagePlacement
subjectPosition
cropMode
metricEmphasis
supportingElements
```

LLM에게 무제한 좌표를 생성하게 하는 방식보다, 검증된 composition을 선택하고 제한적으로 변형하는 hybrid 방식이 적절하다.

### 5.5 Curated Layout Library

현재 recipe를 단순히 늘리는 것이 아니라 시각적으로 검증된 레이아웃 라이브러리를 구축한다.

필요한 대표 family:

- minimal cover
- image hero cover
- full-bleed image
- editorial split
- metric poster
- KPI strip
- image plus evidence
- feature comparison
- horizontal process
- vertical timeline
- native diagram
- map or ecosystem
- quote and evidence
- product package
- gallery
- dark section divider
- CTA closing

각 layout은 다음을 포함해야 한다.

- 실제 렌더링 preview
- 허용 content item 범위
- title과 body typography budget
- 이미지 frame과 권장 crop
- light/dark variant
- Deck JSON element mapping
- PPTX export fixture

Saved Design Pack에는 palette와 font만 저장하지 않고 선호 layout preview와 composition fingerprint도 저장해야 한다.

### 5.6 이미지 전략

브랜드 게임이나 실제 제품 발표에서 일반 공개 이미지 검색만 사용하는 것은 적절하지 않다.

권장 우선순위:

```text
사용자 제공 공식 asset
→ 공식 사이트·보도자료·트레일러 still
→ 라이선스가 확인된 주제 관련 공개 이미지
→ AI 생성 장식 이미지
→ 네이티브 도형
```

AI 이미지는 사실 근거가 아니라 다음 용도로 사용한다.

- 표지 hero
- 섹션 divider
- 추상적 세계관 이미지
- 분위기와 컬러를 연결하는 장식 visual

출시일, 플랫폼, 캐릭터, 실제 gameplay처럼 사실성이 필요한 내용에는 공식 이미지를 사용한다.

AI 이미지 prompt에는 다음 정보가 포함되어야 한다.

- 덱 전체 image style bible
- 슬라이드의 핵심 메시지
- 필요한 aspect ratio
- 인물이나 피사체 위치
- 텍스트가 놓일 negative space
- 색상 비중
- crop과 focal point
- 이미지 안의 텍스트 금지

비용을 통제하려면 모든 장표에 이미지를 만들지 않고 표지, 주요 전환과 핵심 메시지 장표에 집중한다.

### 5.7 Vision Art Director와 Repair

Deck JSON 생성 후 다음 두 이미지를 모두 평가한다.

1. 개별 슬라이드 full-size PNG
2. 전체 덱 montage

개별 슬라이드 평가:

- hierarchy
- balance
- readability
- image relevance
- crop
- spacing
- color harmony
- content density
- visual polish

전체 덱 평가:

- visual rhythm
- background variation
- layout repetition
- image style consistency
- typography consistency
- narrative progression
- opening과 closing의 대응

Vision QA는 문제를 자연어로만 반환하지 않고 Deck JSON repair action으로 변환한다.

```text
changeComposition
increaseFocalScale
replaceImage
changeCrop
switchBackgroundMode
reduceCards
promoteMetric
shortenCopy
moveSupportingContent
```

비용과 지연을 제한하기 위해 repair는 최대 1~2회로 제한한다.

---

## 6. 단일 LLM, 멀티 에이전트와 MCP 판단

### 6.1 MCP

MCP는 다음 tool을 연결하는 데 유용하다.

- 웹 리서치
- 공식 이미지 검색
- AI 이미지 생성
- asset 저장
- slide 렌더링
- Vision QA
- PPTX export

그러나 MCP 자체는 디자인 품질을 높이지 않는다. MCP는 tool interface이며 Art Direction과 평가 기준은 별도로 설계해야 한다.

### 6.2 멀티 에이전트

완전 자율형 멀티 에이전트를 우선 도입하는 것은 권장하지 않는다.

에이전트가 많아지면 다음 문제가 생길 수 있다.

- 색상과 tone 불일치
- 같은 내용을 여러 agent가 반복
- repair 충돌
- 비용과 latency 증가
- 실패 원인 추적 어려움

### 6.3 권장 구조

단일 orchestrator 아래에서 역할을 분리한다.

```text
Content Architect
Art Director
Asset Producer
Deck Composer
Visual Critic
```

각 역할은 별도 model call로 실행할 수 있고 반드시 서로 다른 모델이나 프로세스일 필요는 없다.

이미지 생성과 공개 이미지 검색만 병렬 처리하고, 최종 Art Direction과 발행 결정은 하나의 orchestrator가 담당하는 구조가 적절하다.

---

## 7. 구현 전환 전략

### 7.1 기존 경로 유지

현재 `design-pack` 경로를 즉시 삭제하지 않는다. 신규 경로를 feature flag로 추가한다.

```text
design-pack-v1: 기존 recipe renderer
design-program-v2: Art Direction + Composition + Vision QA
```

### 7.2 첫 번째 Golden Deck

첫 품질 기준은 이번 스플래툰 레이더스 Brief로 고정한다.

비교 대상:

- 현재 ORBIT 8장
- 외부 AI PPTX 10장
- 외부 AI PDF 2종
- 신규 `design-program-v2` 결과

승인 기준:

- 공식 출처 기반 사실 유지
- 10장 전체의 시각적 흐름
- 장표별 시각적 중심 1개
- 주제와 관련된 이미지
- light/dark 리듬
- 카드 반복 감소
- Editor와 PPTX 정합성
- 사람의 blind comparison에서 기존 ORBIT보다 일관되게 우수

### 7.3 평가 데이터 축적

향후 발표 유형별로 golden set을 확장한다.

- 제품 공개
- 스타트업 피치
- 임원 보고
- 교육 발표
- 기술 발표
- 연구 발표

사용자가 색상·폰트·레이아웃 후보를 선택한 기록과 최종 수정 내역을 다음 생성의 preference 학습 데이터로 활용한다.

---

## 8. 최종 제안

현재 문제는 모델 성능 부족보다 생성 계약의 문제다.

```text
현재:
LLM이 내용을 정함
→ Python이 고정 recipe에 배치
→ JSON rule을 통과하면 발행

권장:
LLM이 내용과 덱 전체 Art Direction을 분리 설계
→ 검증된 composition으로 편집 가능한 Deck JSON 생성
→ 실제 렌더링을 Vision 모델이 검수
→ 제한된 repair 후 발행
```

따라서 전체 서비스와 Editor를 폐기하기보다 다음 원칙으로 진행하는 것이 가장 효율적이다.

1. 리서치, Brief, source ledger, Deck JSON, Editor와 export 유지
2. 고정 recipe 중심 시각 renderer 교체
3. Deck Art Direction과 Slide Composition 계약 추가
4. 실제 이미지 픽셀 기반 관련성 검증 추가
5. 개별 PNG와 montage 기반 Vision Art Director 추가
6. Saved Design Pack에 예시 화면과 composition preference 저장
7. 기존 경로와 신규 경로를 같은 Brief로 A/B 비교 후 전환

핵심 전환은 다음 한 문장으로 정리할 수 있다.

> LLM이 내용을 정하고 Python이 템플릿을 채우는 구조에서, LLM이 덱 전체를 Art Direction하고 컴파일러가 편집 가능한 Deck JSON으로 안전하게 구현하며 Vision 모델이 실제 결과를 보고 수정하는 구조로 전환한다.

---

## 9. 관련 코드와 문서

- 설문 payload 컴파일: `apps/web/src/features/ai-ppt/AiPptMockupPage.tsx`
- AI PPT 생성기: `services/python-worker/app/ai/generate_deck.py`
- Brandlogy style prompt: `services/python-worker/app/ai/design_library/style-prompts/brandlogy-modern.md`
- Brandlogy style pack: `services/python-worker/app/ai/design_library/style-packs/brandlogy-modern.json`
- 의미 기반 QA: `packages/shared/src/deck/semantic-qa.ts`
- 이미지 provider: `packages/ai/src/image-providers.ts`
- Editor validation: `apps/web/src/features/editor/ai/quality/editorValidation.ts`

