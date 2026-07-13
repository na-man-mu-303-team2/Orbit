# AI PPT 생성 고도화 기획서

## 1. 배경

현재 서비스는 기존 `.pptx` 템플릿을 가져와 그 위에 내용을 덮어쓰는 방식에 가깝다.

이 방식은 빠르게 결과물을 만들 수 있다는 장점은 있지만, 다음 한계가 있다.

- 템플릿 구조에 생성 품질이 강하게 묶인다.
- 사용자가 입력한 정보만으로 새로운 발표자료를 만들기 어렵다.
- 색상, 폰트, 발표 톤, 레이아웃을 유연하게 바꾸기 어렵다.
- 생성된 PPT를 에디터에서 안정적으로 수정 가능한 구조로 만들기 어렵다.
- 브랜드별/사용자별 일관된 스타일을 재사용하기 어렵다.

따라서 새 AI PPT 생성 기능은 `.pptx`를 먼저 만들거나 기존 템플릿을 반드시 요구하지 않고, 사용자의 입력과 디자인 시스템을 바탕으로 내부 `Deck JSON`을 먼저 생성하는 구조로 전환한다.

단, 기존 `.pptx 템플릿 덮어쓰기` 흐름은 제거하지 않는다. 회사 템플릿 업로드/재사용이 필요한 사용자를 위해 기존 흐름은 별도 경로로 유지한다.

---

## 2. 핵심 방향

### 최종 방향

```text
사용자 입력
+ 저장된 Design Pack
+ 이번 발표 Brief
+ 참고자료/웹자료
→ 내부 Deck JSON 생성
→ 에디터에서 렌더링 및 수정
→ PPTX export
```

### 1차 방향

```text
사용자 설문 입력
+ brandlogy-modern 기본 Design Pack
+ 선택한 색상 팔레트
→ Session Design Pack
→ Deck JSON 생성
→ 에디터 렌더링
→ 기본 PPTX export
```

### 핵심 원칙

1. 새 AI PPT 생성의 기본 단위는 `.pptx 템플릿 파일`이 아니라 `Design Pack`이다.
2. AI가 PPTX를 직접 만드는 것이 아니라, 우리 서비스의 `Deck JSON`을 먼저 생성한다.
3. `Deck JSON`을 기준으로 에디터 렌더링과 PPTX export를 모두 처리한다.
4. 사용자는 매번 모든 디자인 요소를 입력하지 않는다.
5. 기본 스타일은 Design Pack에서 가져오고, 이번 발표에서만 바꾸고 싶은 요소만 override로 받는다.
6. LLM은 기획, 구조화, 추천, 문장 생성에 사용하고, 레이아웃 검증과 렌더링은 코드로 처리한다.
7. 1차에서는 사용자별 Design Pack 저장까지 하지 않고, 설문 결과를 현재 덱 생성에만 쓰는 `Session Design Pack`으로 처리한다.

---

## 3. 주요 개념

### 3.1 Design Pack

디자인 시스템을 구조화한 재사용 단위.

기존 `.pptx 템플릿`을 장기적으로 대체하는 개념이지만, 1차에서는 사용자 계정에 저장되는 객체가 아니다.

### 포함 정보

```text
Design Pack
- 색상 토큰
- 폰트 토큰
- 레이아웃 규칙
- 슬라이드 패턴
- 차트 스타일
- 이미지 사용 정책
- 발표 톤
- 금지 규칙
- QA checklist
- 예시 슬라이드 패턴
```

### 1차 기본 Design Pack

```text
brandlogy-modern
- primaryColor: Brandlogy blue 계열
- accentColor: Brandlogy pink 계열
- font: Pretendard
- slideRatio: 16:9
- canvas: 1920x1080
- layout: fixed header / headline / subtitle / body / footer
- tone: professional, clear, data-first
- visualStyle: white canvas, rounded cards, dense body layout
```

`brandlogy-modern`은 PPTX 템플릿 파일이 아니다.

역할은 다음과 같다.

- 사용자가 디자인 입력을 하지 않았을 때의 기본 프리셋
- 설문 결과가 덮어쓸 base
- preview/export 품질을 검증할 기준 샘플

---

### 3.2 Session Design Pack

1차에서 설문 결과를 기반으로 생성되는 임시 디자인 설정.

사용자가 선택한 색상, 발표 톤, brief, designPrompt를 `brandlogy-modern`에 합쳐 현재 덱 생성 요청에만 사용한다.

```text
brandlogy-modern
+ 설문 답변
+ 선택한 색상 팔레트
+ 발표 톤
→ Session Design Pack
```

1차에서는 Session Design Pack을 사용자 계정에 저장하지 않는다.

3차에서 이 Session Design Pack을 저장 가능한 `Saved Design Pack`으로 전환한다.

---

### 3.3 Deck JSON

AI PPT 생성의 source of truth.

PPTX 파일이나 PPTX XML을 먼저 만들지 않고, 에디터와 export가 모두 이해할 수 있는 내부 JSON 구조를 먼저 만든다.

### 이유

- 에디터에서 수정 가능해야 한다.
- PPTX XML import는 폰트, 그룹, 차트, 그림자, 테이블, 이미지 crop 처리에서 불안정하다.
- JSON-first 구조가 되어야 생성, 수정, 미리보기, export 품질을 통제할 수 있다.
- AI가 표현 가능한 요소를 우리 에디터의 지원 범위 안으로 제한할 수 있다.

### 기본 방향

```text
Deck JSON
→ Web editor render
→ Slide preview render
→ PPTX export
```

---

### 3.4 Brief

이번 발표에만 해당하는 사용자 입력 정보.

### 포함 정보

```text
Presentation Brief
- 발표 주제
- 발표 목적
- 발표 장소/상황
- 청중
- 발표 시간
- 원하는 분위기
- 참고자료 사용 방식
- 이미지 사용 방식
- 색상 요청
- 폰트 요청
```

1차에서는 폰트 추천/이미지 생성/웹서치까지 처리하지 않고, 해당 입력은 추후 확장을 고려해 구조만 보수적으로 둔다.

---

## 4. 1차 목표

### 목표

기존 템플릿 덮어쓰기 방식에서 벗어나기 위한 최소 기반을 만든다.

핵심은 `.pptx 템플릿 없이도` 사용자의 설문 입력과 기본 Design Pack만으로 Deck JSON을 생성하고, 이를 에디터에서 렌더링한 뒤 기본 PPTX로 내보낼 수 있게 하는 것이다.

기존 PPTX 템플릿 기반 생성은 유지한다.

---

## 4.1 1차 범위

### 1. `brandlogy-modern` 기본 Design Pack 추가

첨부된 Brandlogy PPT 프롬프트를 그대로 LLM 프롬프트로만 쓰지 않고, 구조화된 Design Pack으로 변환한다.

### 작업 내용

```text
- 색상 토큰 정의
- 폰트 토큰 정의
- 1920x1080 기준 레이아웃 zone 정의
- 카드/차트/테이블 스타일 정의
- 허용 slide pattern 정의
- 금지 규칙 정의
- QA checklist 정의
```

### 산출물

```text
services/python-worker/app/ai/design_library/style-packs/brandlogy-modern.json
services/python-worker/app/ai/design_library/style-prompts/brandlogy-modern.md
```

`brandlogy-modern.json`은 코드가 읽는 구조화 데이터다.

`brandlogy-modern.md`는 LLM에게 전달하는 자연어 디자인 시스템 문서다.

로고 asset 삽입은 1차에서 하지 않는다. 실제 로고/브랜드 asset 관리는 3차 Brand Kit에서 처리한다.

---

### 2. Deck JSON schema 및 theme 계약 정리

AI가 생성할 수 있는 슬라이드 구조를 제한한다.

초기에는 복잡한 PPT 자유도를 모두 지원하지 않는다.

에디터가 안정적으로 렌더링할 수 있는 요소만 허용한다.

### 1차 지원 요소

```text
- text
- shape
- image
- chart
- table
- card
- line
- arrow
- background
```

`group`, `customShape`, 고급 SVG path는 1차에서 핵심 범위로 두지 않는다.

### 1차 지원 slide pattern

```text
- cover
- section divider
- kpi strip
- two column
- chart focus
- process flow
- quote + evidence
- comparison table
- closing
```

### theme 처리

기존 `Deck JSON`의 `theme`, `slide.style`, `slide.elements`를 source of truth로 사용한다.

1차에서는 `theme.palette` 구조를 불필요하게 확장하지 않는다.

`accent`는 이미 top-level `accentColor`가 있으므로 별도 `theme.palette.accent` 추가는 하지 않는다.

---

### 3. Brief 수집 설문 MVP

사용자에게 모든 것을 묻지 않는다.

1차에서는 PPT 생성 품질에 직접 영향을 주는 최소 질문만 받는다.

### 필수 질문

```text
1. 발표 주제는 무엇인가?
2. 발표 목적은 무엇인가?
3. 청중은 누구인가?
4. 발표 시간은 몇 분인가?
5. 슬라이드 수는 몇 장인가?
6. 참고자료를 어떻게 사용할 것인가?
7. 원하는 발표 톤이나 색감이 있는가?
```

### 참고자료 사용 옵션

```text
A. 사용자가 입력한 내용만 사용
B. 첨부 자료 중심으로 사용
C. 첨부 자료만 사용
```

1차에서는 웹서치 자동화를 제공하지 않는다.

웹 검증/웹 조사 옵션은 2차 이후로 미룬다.

---

### 4. 설문 → Prompt Compiler

사용자가 긴 프롬프트를 직접 쓰게 하지 않는다.

Wizard 설문 답변을 내부적으로 다음 구조로 변환한다.

```text
brief
designPrompt
design.stylePackId
design.paletteOverride
```

### 최종 generate payload 기본값

```text
generationMode = "design-pack"
design.stylePackId = "brandlogy-modern"
design.paletteOverride = selectedPalette
brief = survey answers
designPrompt = survey answers를 요약한 디자인 지시문
```

1차에서는 별도 `designSurvey` public schema를 만들지 않는다.

기존 generate request에 `generationMode`, `brief`, `design.colorIntent`, `design.constraints`, `paletteOverride`를 추가해 처리한다.

---

### 5. 색상 추천 MVP

사용자가 자연어로 원하는 색감을 입력하면 AI가 팔레트 후보 3개를 제안한다.

### 예시 입력

```text
- 휴양지에 어울리는 파란색
- 전문가스러운 보라색
- 발표 주제와 어울리는 차분한 색상
- 흰 색 배경, 사용자에게 신뢰를 줄 수 있는 포인트 색상
- 그라데이션 금지, 파스텔톤 금지
```

### 출력

```text
Color Option 1
- primary color
- secondary color
- accent color
- background color
- text color
- 사용 이유
- 간단한 미니 슬라이드 preview

Color Option 2
...

Color Option 3
...
```

색상 추천은 다음 방식으로 처리한다.

```text
자연어 색상 요청
→ colorIntent / constraints 구조화
→ LLM 추천
→ 실패하거나 key가 없으면 코드 fallback
→ contrast 보정
→ forbiddenStyles 보정
→ 후보 3개 반환
```

Preview는 이미지 생성이 아니라 클라이언트 렌더링으로 만든다.

---

### 6. Web Wizard 추가

새 생성 UI를 기존 홈을 갈아엎지 않고 전용 route로 추가한다.

```text
/ai-ppt
```

### Wizard 단계

```text
1. Brief
   - 주제, 목적, 맥락, 청중, 발표 시간, 슬라이드 수

2. Style
   - 발표 톤, 색감 자연어 입력

3. Color
   - 색상 후보 3개
   - 표지형/본문형 미니 preview
   - palette 선택

4. References
   - 선택적 파일 첨부
   - 1차에서는 첨부자료만 사용

5. Review
   - 생성 요청 요약
   - 프로젝트 생성
   - generate-deck job 시작
```

---

### 7. Deck 생성 파이프라인 MVP

### 기본 파이프라인

```text
Brief 입력
→ brandlogy-modern resolve
→ Session Design Pack 구성
→ Outline 생성
→ Slide plan 생성
→ Design Pack 전용 layout recipe 선택
→ Deck JSON 생성
→ Layout validator
→ Preview render
→ PPTX export
```

### LLM이 담당하는 영역

```text
- 발표 흐름 설계
- 슬라이드별 핵심 메시지 작성
- 슬라이드 패턴 선택
- 색상 후보 추천
- 문장 톤 조정
```

### 코드가 담당하는 영역

```text
- schema validation
- 좌표 계산
- 폰트 크기 제한
- body zone overflow 검증
- contrast 검증
- Design Pack layout recipe 적용
- PPTX export
- preview render
```

---

### 8. 기본 PPTX export

1차에서는 완전한 PPTX 재현이 아니라, 편집 가능한 기본 PPTX export를 목표로 한다.

### 새 export 흐름

```text
POST /api/v1/projects/:projectId/deck/exports
```

### request

```json
{
  "format": "pptx"
}
```

### result

```json
{
  "deckId": "string",
  "fileId": "string",
  "url": "string",
  "format": "pptx",
  "warnings": []
}
```

### 구현 방향

```text
API가 현재 deck snapshot을 worker payload에 포함
→ worker가 patch replay를 직접 하지 않음
→ Python worker가 Deck JSON을 PPTX로 변환
→ 생성된 PPTX를 export-result asset으로 저장
```

### 1차 지원 요소

```text
- text
- rect
- ellipse
- line
- arrow
- image
- 기본 chart
- 기본 table
```

### 1차 미지원 요소

```text
- animation/action
- shadow/blur/gradient 정밀 재현
- customShape/svg 고급 path
- scatter chart
- 픽셀 단위 완전 재현
```

미지원 항목은 가능한 경우 단순화하고, 불가능하면 건너뛰며 `warnings`에 남긴다.

---

## 4.2 1차에서 하지 않을 것

```text
- 사용자별 여러 Design Pack 관리
- Session Design Pack 저장/재사용
- 폰트 DB 연동
- AI 이미지 생성
- 웹 이미지 검색
- 웹서치 기반 자료 조사
- 고급 멀티에이전트 구조
- PPTX import 정교화
- 모든 PPTX XML 요소 지원
- 자유형 레이아웃 생성
- 조직 Brand Kit
```

---

## 4.3 1차 성공 기준

```text
- 사용자가 주제/목적/청중/시간을 입력하면 Deck JSON이 생성된다.
- /ai-ppt 생성 요청은 generationMode = "design-pack"을 명시한다.
- 기존 AI 덱 생성과 PPTX 템플릿 기반 생성은 legacy 기본 동작을 유지한다.
- PPTX 템플릿 없이도 brandlogy-modern 기반 슬라이드가 생성된다.
- 설문 답변이 brief/designPrompt/colorIntent/constraints/paletteOverride로 변환된다.
- 색상 mood 입력 시 팔레트 후보 3개와 preview를 보여준다.
- 선택한 palette가 생성 결과에 반영된다.
- 흰 배경, 그라데이션 금지, 파스텔톤 금지 같은 디자인 제약이 생성 결과에 반영된다.
- 생성된 슬라이드는 에디터에서 렌더링 가능하다.
- 생성된 슬라이드는 기본 PPTX로 export 가능하다.
- 생성된 슬라이드에 텍스트 overflow warning이 없어야 한다.
- 생성 결과가 기존 accent rail + 제목 + 본문 중심의 단순 레거시 레이아웃과 구분되어야 한다.
```

---

## 4.4 현재 구현 상태와 1차 추가 작업

### 현재 확인된 상태

최근 `/ai-ppt` 테스트에서 다음은 정상 동작한다.

```text
- 색상 후보 3개 추천
- 선택한 색상 팔레트 적용
- generationMode = "design-pack" 요청
- 흰 배경 요청 반영
- 신뢰감 있는 블루 포인트 색상 반영
- 그라데이션 금지, 파스텔톤 금지 제약 일부 반영
- Deck JSON 생성
- 에디터 렌더링
- 3분 발표 기준 4장 내외 슬라이드 생성
```

다만 현재 결과물은 1차 기대 품질로 보기 어렵다.

### 현재 문제

```text
- 색상 제약은 적용되지만 슬라이드 구성은 기존 AI 덱 생성 결과와 유사하다.
- Design Pack이 실제 레이아웃 생성 규칙이 아니라 색상/배경 보정값처럼 작동한다.
- 생성 결과가 accent rail + 큰 제목 + 본문 + 키워드 칩/간단 카드 수준에 머문다.
- 표지, 본문, 프로세스, 비교, 요약 슬라이드별 디자인 차이가 약하다.
- 슬라이드 안의 디자인 요소 밀도가 낮아 발표자료라기보다 기본 문서 화면처럼 보인다.
- 텍스트 overflow warning이 남는다.
- 색상 preview에서 본 기대와 실제 Deck JSON layout recipe가 충분히 연결되지 않는다.
```

### 원인 판단

```text
- /ai-ppt는 design-pack 모드로 진입하지만 실제 slide assembly는 기존 assemble_slide 계열을 계속 사용한다.
- enforce_design_pack_constraints는 생성 후 색상/배경을 보정하는 역할에 가깝다.
- brandlogy-modern이 실행 가능한 layout recipe가 아니라 토큰/프롬프트 중심으로만 사용된다.
- 기존 legacy 레이아웃 preset이 design-pack 결과에도 영향을 준다.
```

### 1차 추가 작업 목표

```text
목표:
색상만 바뀐 기존 생성 결과가 아니라, Design Pack layout recipe가 실제 Deck JSON 구조를 결정하게 만든다.

핵심:
- /ai-ppt design-pack 경로와 legacy 생성 경로를 명확히 분리
- brandlogy-modern 전용 layout recipe 추가
- design-pack 모드에서 기존 assemble_slide 의존 최소화
- 텍스트 overflow 없는 품질 기준 추가
- 색상 preview와 실제 생성 layout의 시각 언어 일치
```

### 1차 추가 작업 범위

#### 1. design-pack 전용 slide assembly 분기

```text
기존:
raw_input.generation_mode == "design-pack"이어도 assemble_slide 기반 조립 후 색상만 보정

변경:
raw_input.generation_mode == "design-pack"이면 assemble_design_pack_slide 경로 사용
```

기존 AI 덱 생성은 삭제하지 않는다.

기본값은 계속 `legacy`이고, `/ai-ppt`만 명시적으로 `design-pack`을 사용한다.

#### 2. brandlogy-modern layout recipe 정의

1차에서 자유형 레이아웃 생성까지 가지 않는다.

대신 자주 쓰는 슬라이드 유형별로 실행 가능한 recipe를 고정한다.

```text
필수 recipe:
- cover_trust_signal
- overview_cards
- section_focus
- insight_evidence
- process_steps
- comparison_split
- closing_summary
```

각 recipe는 다음을 포함한다.

```text
- canvas background
- title zone
- body zone
- accent usage
- card/grid geometry
- section label
- footer/source zone
- minimum decoration elements
- typography scale
- overflow fallback
```

#### 3. 슬라이드 유형별 시각 품질 기준 추가

```text
cover:
- 단순 중앙 제목만 허용하지 않음
- 좌측/상단 브랜드 라인, 핵심 메시지 블록, 키워드 요약 영역 포함

overview:
- bullet list만 허용하지 않음
- 3개 카드 또는 2x2 카드 구조 사용

process:
- bullet list만 허용하지 않음
- 단계 번호, 연결선, 단계별 요약 카드 사용

comparison:
- 텍스트 두 덩어리만 허용하지 않음
- 명확한 좌우 분할, 기준 라벨, 핵심 차이 강조

closing:
- 제목과 bullet만 허용하지 않음
- 최종 제안, 다음 행동, 요약 포인트를 분리
```

#### 4. 색상 제약을 layout recipe에 연결

현재는 선택 색상이 대부분 rail, border, text에만 반영된다.

앞으로는 recipe별로 색상 역할을 명확히 나눈다.

```text
primary:
- cover accent block
- section number
- process line
- key metric

secondary:
- supporting card header
- comparison side label
- chart auxiliary color

surface/muted:
- card background
- evidence panel
- footer band

border:
- card boundary
- table line
- divider
```

#### 5. 품질 validator 강화

1차 추가 작업의 최소 QA 기준은 다음이다.

```text
- 텍스트 overflow warning 0개
- 한글 keyword chip 줄바꿈 방지 또는 chip width 자동 보정
- 슬라이드별 최소 element density 충족
- title/body/caption 위계 유지
- 금지 스타일 gradient/pastel 위반 없음
- 흰 배경 요청 시 신규 AI 생성 결과의 slide.style.backgroundColor가 white이며 full canvas background element는 없음
- design-pack 결과가 legacy preset signature만으로 끝나지 않음
```

#### 6. preview와 생성 결과의 일치

색상 선택 preview는 사용자가 보게 될 실제 생성 recipe와 같은 시각 언어를 사용해야 한다.

```text
현재:
색상 preview와 실제 Deck JSON layout이 별개로 보일 수 있음

변경:
preview thumbnail도 brandlogy-modern recipe subset을 사용
```

### 추가 작업 산출물

```text
services/python-worker/app/ai/generate_deck.py
- design-pack assembly 분기
- brandlogy-modern recipe 적용
- overflow fallback 보강

services/python-worker/app/ai/design_library/style-packs/brandlogy-modern.json
- layout recipe metadata 보강

apps/web/src/features/ai-ppt/AiPptMockupPage.tsx
- color preview와 recipe 시각 언어 정렬

services/python-worker/tests
- design-pack mode가 legacy assemble signature로만 생성되지 않는지 검증
- 흰 배경/gradient 금지/pastel 금지/overflow 없음 검증
```

### 1차 추가 작업 완료 기준

```text
- 같은 입력으로 생성한 /ai-ppt 결과가 기존 legacy AI 덱 생성 결과와 시각적으로 구분된다.
- 첫 슬라이드가 단순 제목 화면이 아니라 cover recipe 구조를 가진다.
- 본문 슬라이드가 bullet list만으로 구성되지 않는다.
- 선택한 palette가 rail 색상뿐 아니라 카드, 섹션, 프로세스, 강조 요소에 체계적으로 쓰인다.
- 에디터의 AI validation panel에 텍스트 overflow warning이 표시되지 않는다.
- PPTX export 후에도 기본적인 시각 구조가 유지된다.
```

---

# 5. 2차 목표

## 목표

1차에서 만든 생성 기반 위에 사용자 선택 경험과 자료 활용 품질을 높인다.

2차의 핵심은 “사용자가 디자인과 자료 활용 방식을 더 쉽게 선택하고, AI가 더 근거 있는 발표자료를 만들도록 하는 것”이다.

---

## 5.1 2차 범위

### 1. 폰트 추천 기능

눈누, 공유마당 등 무료 폰트 정보를 직접 실시간 검색하기보다, 먼저 검증된 무료 한글 폰트 카탈로그를 서비스 내부에 구축한다.

### Font Catalog 포함 정보

```text
- font name
- license
- source URL
- supported weights
- Korean support 여부
- PPTX embedding 가능 여부
- mood tags
- preview file
```

### mood tag 예시

```text
- professional
- rounded
- friendly
- editorial
- tech
- formal
- playful
```

### UX

```text
사용자 입력:
"동글동글한 한글 폰트를 원해"

AI 추천:
- 후보 3개
- 추천 이유
- 동일한 미니 슬라이드에 실제 폰트 적용 preview
```

---

### 2. 색상 + 폰트 preview 통합

1차에서는 색상 preview만 제공한다.

2차에서는 색상과 폰트를 조합한 preview를 제공한다.

### 예시

```text
선택한 색상:
- Ocean Blue

추천 폰트:
- Pretendard
- Gmarket Sans
- Gowun Dodum

각 조합별 미니 슬라이드 preview 제공
```

사용자는 컬러 팔레트나 폰트 이름만 보고 고르지 않는다.

실제 표지/본문 예시를 보고 선택한다.

---

### 3. 이미지 사용 정책

이미지는 무조건 AI 생성하지 않는다.

슬라이드별로 이미지가 필요한지 먼저 판단하고, 필요한 경우에만 가져온다.

### 이미지 옵션

```text
A. 내 첨부 이미지만 사용
B. 웹/공개 자료 이미지 사용
C. AI 생성 이미지 사용
D. 이미지 사용 최소화
```

### 기본값

```text
데이터/도표/도형 중심
이미지는 필요한 슬라이드에만 사용
```

### AI가 생성해야 하는 정보

```text
Slide Visual Plan
- slideId
- visualType: chart | diagram | image | table | kpi | none
- imageNeeded: true | false
- imageSourcePolicy
- reason
```

---

### 4. 참고자료 활용 고도화

참고자료를 단순히 첨부하는 것을 넘어, AI가 어떤 방식으로 참고해야 하는지 명시적으로 받는다.

### 참고자료 정책

```text
A. 첨부 자료만 사용
B. 첨부 자료 중심 + 웹으로 사실 검증
C. 웹 조사 중심 + 첨부 자료로 방향성 보정
D. 사용자가 입력한 내용만 사용
```

### Source Ledger 도입

각 주장과 슬라이드가 어떤 자료에서 왔는지 추적한다.

```text
Source Ledger
- claim
- source
- sourceType
- confidence
- usedInSlideId
```

이후 hallucination 검증, 출처 표기, 사용자 신뢰도 개선에 사용한다.

---

### 5. 사이드 AI 채팅

설문 중 사용자가 선택을 어려워할 때 도움을 주는 사이드 채팅을 제공한다.

### 역할

```text
- 색상 선택 도움
- 폰트 선택 도움
- 발표 톤 조정
- 청중에 맞는 구성 추천
- 슬라이드 수/발표 시간 조정
```

### 주의

사이드 채팅이 전체 생성 흐름을 복잡하게 만들면 안 된다.

채팅 결과는 최종 Brief나 Session Design Pack override로 반영되는 구조여야 한다.

---

## 5.2 2차 성공 기준

```text
- 사용자가 색상과 폰트를 preview 기반으로 선택할 수 있다.
- 무료 폰트 후보를 라이선스 정보와 함께 추천할 수 있다.
- 이미지 사용 정책을 사용자가 선택할 수 있다.
- 슬라이드별 visual plan이 생성된다.
- 참고자료 기반 생성 시 source ledger가 남는다.
- 사용자가 설문 중 AI와 대화하며 선택을 보정할 수 있다.
```

---

# 6. 3차 목표

## 목표

AI PPT 생성 기능을 반복 사용 가능한 개인화/조직화 기능으로 확장한다.

3차의 핵심은 “1차에서 현재 덱에만 쓰이던 Session Design Pack을 사용자 계정에 저장하고, 다음 발표에서도 재사용할 수 있게 하는 것”이다.

---

## 6.1 3차 범위

### 1. Session Design Pack 저장 및 재사용

1차에서는 설문 결과가 현재 덱 생성에만 쓰이는 Session Design Pack으로 처리된다.

3차에서는 이 Session Design Pack을 사용자 계정에 저장 가능한 `Saved Design Pack`으로 전환한다.

### 저장 대상

```text
Saved Design Pack
- name
- description
- baseStylePackId
- color palette
- font settings
- presentation tone
- layout preferences
- slide pattern preferences
- image policy
- source/citation policy
- createdByUserId
- updatedAt
```

### UX

```text
- 이 스타일 저장하기
- 저장된 스타일로 새 발표 만들기
- 기존 스타일 수정하기
- 스타일 복제하기
- 스타일 삭제하기
- 기본 스타일로 지정하기
```

### API

```text
GET    /api/v1/design-packs
POST   /api/v1/design-packs
GET    /api/v1/design-packs/:designPackId
PATCH  /api/v1/design-packs/:designPackId
DELETE /api/v1/design-packs/:designPackId
POST   /api/v1/design-packs/:designPackId/duplicate
```

### 생성 연동

```text
새 발표 생성 시:
- 기본값: brandlogy-modern
- 선택 가능: Saved Design Pack
- 이번 발표에서만 바꾸는 값: Session override
```

### 우선순위

```text
schema fallback
< base Design Pack
< Saved Design Pack
< Session override
```

---

### 2. 팀/조직 Brand Kit

회사, 학교, 팀 단위로 공통 브랜드 스타일을 저장한다.

### 포함 정보

```text
- 로고
- 브랜드 컬러
- 공식 폰트
- 금지 색상
- 권장 문체
- 표지 스타일
- footer/source 표기 규칙
```

Brand Kit은 사용자 개인의 Saved Design Pack보다 상위 개념이다.

조직 Brand Kit을 기반으로 개인 Saved Design Pack을 만들 수 있다.

---

### 3. 생성 품질 평가 루프

생성 후 AI가 자체 QA를 수행한다.

### QA 항목

```text
- 발표 목적과 슬라이드 구성이 맞는가?
- 청중 수준에 맞는가?
- 발표 시간에 비해 슬라이드 수가 적절한가?
- body zone overflow가 없는가?
- 텍스트가 너무 많지 않은가?
- 차트/표/도식이 필요한 곳에 들어갔는가?
- 출처가 필요한 주장에 source가 있는가?
- Design Pack 규칙을 위반하지 않았는가?
```

---

### 4. 고급 생성 구조

초기에는 단일 orchestrator로 충분하다.

3차에서 필요해지면 역할을 분리한다.

### 가능한 역할 분리

```text
- Research Agent
- Outline Agent
- Design Agent
- Layout Agent
- QA Agent
```

단, 처음부터 멀티에이전트로 가지 않는다.

품질 병목이 명확해졌을 때만 분리한다.

---

### 5. 스타일 마켓/프리셋 확장

사용자나 서비스가 제공하는 여러 Design Pack을 선택할 수 있게 한다.

### 예시

```text
- Startup Pitch
- Academic Presentation
- Corporate Report
- Sales Proposal
- Education Lecture
- Minimal Data Deck
- Brandlogy Modern
```

---

## 6.2 3차 성공 기준

```text
- 1차에서 생성된 Session Design Pack을 사용자 계정에 저장할 수 있다.
- 저장한 Design Pack을 다음 발표 생성 시 선택할 수 있다.
- 저장한 Design Pack을 수정, 복제, 삭제할 수 있다.
- 사용자가 기본 Design Pack을 지정할 수 있다.
- 팀/조직 단위 Brand Kit을 적용할 수 있다.
- 생성된 Deck을 AI가 자동 QA할 수 있다.
- 반복 생성 시 동일한 톤앤매너가 유지된다.
- Design Pack을 여러 개 관리하고 선택할 수 있다.
```

---

# 7. 기술 설계 방향

## 7.1 MCP / 멀티에이전트 / 프롬프트 / 코드 파이프라인 판단

### 1차 권장 구조

```text
단일 orchestrator
+ 단계별 tool 함수
+ 구조화 출력
+ 코드 기반 validator/exporter
```

처음부터 MCP나 멀티에이전트로 나누지 않는다.

### 이유

```text
- 디버깅이 쉽다.
- 생성 실패 원인을 추적하기 쉽다.
- 비용과 latency를 줄일 수 있다.
- 제품 흐름을 빠르게 검증할 수 있다.
```

---

## 7.2 역할 분리

### LLM 담당

```text
- 사용자 입력 해석
- 발표 구조 설계
- 슬라이드별 메시지 생성
- 색상/폰트 추천
- 이미지 필요성 판단
- 톤 조정
```

### 코드 담당

```text
- Deck JSON schema validation
- layout position 계산
- overflow detection
- contrast check
- Design Pack layout recipe 적용
- PPTX export
- preview rendering
- source ledger 관리
```

---

## 7.3 PPTX와 에디터 연동

### 권장

```text
AI → Deck JSON → Editor → PPTX export
```

### 비권장

```text
AI → PPTX → XML parsing → Konva JSON
```

PPTX를 먼저 만들고 다시 XML로 파싱하는 방식은 import fidelity 문제가 크다.

새 AI 생성 기능은 JSON-first로 가고, 기존 PPTX import는 별도 보조 기능으로 유지한다.

---

# 8. 전체 로드맵 요약

## 1차

```text
목표:
템플릿 덮어쓰기에서 벗어나 Design Pack + Deck JSON 기반 생성 구조 만들기

핵심:
- 기존 PPTX 템플릿 생성 흐름 유지
- brandlogy-modern 기본 Design Pack 추가
- Brief 설문 MVP
- 설문 → Session Design Pack 변환
- 색상 후보 3개 + preview
- /ai-ppt design-pack 생성 모드
- Design Pack 전용 layout recipe
- Deck JSON 생성
- 에디터 렌더링
- 기본 PPTX export
```

### 1차 추가 작업

```text
목표:
색상만 바뀐 기존 생성 결과에서 벗어나 design-pack 전용 레이아웃 품질 만들기

핵심:
- design-pack 전용 slide assembly 분기
- brandlogy-modern recipe 7종 정의
- cover/overview/process/comparison/closing 품질 기준 강화
- 색상 토큰을 실제 구조 요소에 체계적으로 적용
- overflow warning 0개 기준 추가
- preview와 실제 생성 결과의 시각 언어 일치
```

## 2차

```text
목표:
사용자가 디자인과 자료 활용 방식을 더 쉽게 선택하게 만들기

핵심:
- 무료 폰트 카탈로그
- 색상 + 폰트 preview
- 이미지 사용 정책
- 참고자료 활용 정책
- source ledger
- 사이드 AI 채팅
```

## 3차

```text
목표:
반복 사용 가능한 개인화/조직화 PPT 생성 시스템 만들기

핵심:
- Session Design Pack을 사용자 계정에 저장
- Saved Design Pack UI/API
- 저장한 Design Pack 재사용
- 팀/조직 Brand Kit
- 생성 결과 QA
- 필요 시 멀티에이전트 분리
- 스타일 프리셋 확장
```

---

# 9. 가장 먼저 해야 할 일

가장 먼저 할 일은 기능을 많이 붙이는 것이 아니라, 생성의 기준점을 바꾸는 것이다.

```text
기존:
PPTX 템플릿 위에 내용 덮어쓰기

변경:
Design Pack + Brief로 Deck JSON 생성
```

현재는 생성 모드, 색상 후보, 색상 제약, Deck JSON 생성까지는 연결되었지만, 실제 결과물이 기존 레이아웃 조립기에 끌려가는 문제가 남아 있다.

따라서 다음 개발 단위는 아래 순서가 적절하다.

```text
1. design-pack 모드에서 기존 assemble_slide 경로와 분리
2. brandlogy-modern layout recipe를 코드가 실행 가능한 형태로 정의
3. cover/overview/process/comparison/closing recipe 우선 구현
4. paletteOverride와 constraints를 recipe의 실제 구조 요소에 적용
5. 텍스트 overflow와 chip 줄바꿈을 validator/fallback으로 제거
6. 색상 preview를 실제 recipe subset과 맞춤
7. PPTX export 결과에서 recipe 구조가 유지되는지 확인
```

이 기반이 생기면 색상, 폰트, 이미지, 참고자료, 개인화 기능은 그 위에 순차적으로 얹을 수 있다.
