# AI PPT 생성 고도화 기획서 V12

> 기준일: 2026-07-12
>
>
> 상태: 1차 완료, 2차 완료, 3차 기능 및 생성 품질 최종 승인 완료
>

> [!IMPORTANT]
> 이 문서는 2026-07-12의 생성 품질 승인 근거를 보존하는 이력 문서다. 구현 목표는 후속 확정 계획인 #341 → #339 → #338을 따른다. 이 문서의 legacy/template 생성 유지 결정은 #339 PR6의 GenerateDeck `program-v2` 전용 계약이, web research·Visual QA 실패 정책은 #338이 대체한다. 품질 기준과 승인 fixture는 후속 작업의 회귀 기준으로 계속 사용한다.

---

## V12 품질 승인 보강 기준

3차의 Saved Design Pack, Brand Kit, 실제 AI·공개 이미지 asset과 기본 의미 기반 QA는 연결됐다. 그러나 실제 생성 프로젝트 `project_274746f7-117c-4a32-8b26-b28518c3cbe1`을 시각 검토한 결과 기능 연결 성공만으로 3차 완료를 승인할 수 없다고 판정했다.

확인된 미승인 사유는 다음과 같다.

- Worker는 `validation.passed=true`를 반환했지만 Editor는 같은 Deck에서 text overflow를 경고했다.
- media element가 발표 화면의 근거 이미지가 아니라 작은 썸네일 수준으로 배치됐다.
- process slide의 core content가 중앙에 작게 몰리고 과도한 빈 공간이 남았다.
- closing slide에 의미를 담지 않은 대형 accent block이 사용됐다.
- 설문에 남아 있던 예시 success criteria가 실제 발표 내용에 섞였다.
- 발표 메모가 목표 분량은 충족하지만 같은 설명을 반복했다.

따라서 3차 완료 조건을 다음과 같이 보강한다.

```text
설문 예시 데이터 payload 혼입 0건
Worker와 Editor 최종 issue 0건
일반 body core bbox: safe area 너비 70% 이상, 높이 40% 이상
이미지 slide core bbox: safe area 너비 85% 이상, 높이 55% 이상
필요한 media frame: 최소 686 × 420px
의미 없는 대형 decoration 0건
발표 메모 분량 목표 90~110%, 반복 문장 0건
품질 미달 후보는 decks에 발행하지 않고 jobs.result에만 보관
Editor와 PPTX의 장수·텍스트·이미지 정합성
```

품질 Gate는 `/ai-ppt`의 `design-pack` 경로에만 적용한다. 품질 실패 후보는 Job을 `GENERATE_DECK_QUALITY_GATE_FAILED`로 종료하고 후보 Deck JSON과 validation을 `jobs.result`에 저장한다. 기존 프로젝트 Deck과 legacy/template 생성 경로는 변경하지 않는다.

### V12 최종 재승인 결과

2026-07-12 기준으로 구조화 시각물, 공개 이미지, AI 이미지와 최소 이미지 시나리오를 다시 검증해 3차 생성 품질을 최종 승인했다.

- 구조화 시각물은 공개 이미지 검색에서 제외하고 Deck 도형 recipe로 생성한다. Git 브랜치 전략 덱 `project_1b0bd5d1-12cc-43eb-bd75-2f3dceafeadf`은 5장 모두 Worker와 Editor issue 0건으로 통과했다.
- 공개 이미지 덱 `project_e1975955-73a2-4974-86a3-ab8ac38dc8ae`은 5장 모두 issue 0건으로 통과했다. Openverse 출처, 저작자와 라이선스 provenance를 저장하고 686 x 560px media frame을 유지했다.
- AI 이미지 덱 `project_3a6e66cc-19a9-4088-8e83-66d416ee2118`은 6장 모두 issue 0건으로 통과했다. OpenAI 생성 asset을 저장하고 686 x 560px media frame을 Editor와 PPTX에서 유지했다.
- 최소 이미지 교육 덱 `project_9c841a8e-55fd-4fd1-b695-f75775e341cb`은 6장 모두 issue 0건으로 통과했다.
- 대표 3개 덱의 PPTX export는 각각 원본 Deck과 같은 5장 또는 6장, 같은 발표 메모 수와 이미지 asset 수를 유지했다.
- shared, AI provider, Web, API와 Worker 테스트 1,072건 및 Python 테스트 305건이 통과했고 Web, API와 Worker production build, Ruff와 mypy가 통과했다.

공개 이미지의 실제 픽셀 미학, 정밀 crop과 고급 의미 적합성 평가는 3차 이후 Vision QA 범위로 유지한다.

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

## 2. V12 변경 요약

V11은 V10의 현재 구현 대조 결과를 유지하면서 슬라이드 수 상한의 제품 경계를 확정한다. AI 생성 단계는 LLM 비용, 응답 지연, 장문 plan 불안정과 렌더링·PPTX export 실패 범위를 제한하기 위해 한 번에 최대 20장까지만 생성한다. 에디터의 Deck JSON과 `+ 슬라이드`에는 최대 장수 제한이 없으므로 사용자는 생성 후 슬라이드를 추가해 20장 초과 덱을 저장·편집·내보낼 수 있다. 생성 상한은 영구 규칙이 아니며, 3차 이후 비용·지연·품질 측정 결과에 따라 늘리거나 제거할 수 있다.

### 2.1 추가된 핵심 내용

- 3차 개발 전에 완료해야 하는 발표 품질 규칙 기반을 정의한다.
- 규칙을 Hard Rule, Profile Rule, Preference Rule로 분리한다.
- 발표 유형별 narrative selector를 정의한다.
- 각 규칙에 리서치 문서의 근거 위치를 명시한다.
- 상충하는 10/20/30, 1-6-6, 폰트 크기, 대비, 배색 규칙의 제품 적용 기준을 확정한다.
- 기존 Brief, SlidePlan, Design Pack, repair pass, validation 경로를 재사용한다.
- Saved Design Pack과 Brand Kit에서 변경 가능한 규칙과 변경할 수 없는 규칙을 구분한다.
- 실제 이미지, 차트, 애니메이션, 리허설 최적화 등 3차 이후 항목을 별도로 정리한다.
- 발표 제한 시간 전체를 대본으로 채우지 않고 전환·호흡·강조·상호작용 시간을 예약하는 발화 예산 정책을 추가한다.
- LLM은 문장을 작성하고, 코드 기반 timing planner가 전체·슬라이드별 시간과 글자 수 범위를 결정하도록 역할을 명확히 한다.
- 사용자가 요청한 최소 슬라이드 수 미달을 정상 실패로 끝내지 않고 제한된 재생성 또는 보정으로 충족하도록 완료 기준을 수정한다.
- `slideCountRange.min == slideCountRange.max`인 8장·10장·15장 요청에서도 LLM 출력 부족으로 job이 실패한 실사용 결과를 회귀 기준으로 추가한다.
- `SlidePlan.message`와 `contentItems`가 같은 내용을 담은 상태에서 recipe가 둘을 모두 그려 동일 문구가 반복되는 문제를 기본 생성 결함으로 분류한다.
- 에디터와 PPTX는 Deck JSON을 충실히 소비하므로, 중복 제거 책임을 에디터가 아니라 content plan·recipe·validation 경계에 둔다.
- 고급 의미 기반 QA와 별개로 정규화된 완전 일치·포함 관계처럼 결정론적으로 판정 가능한 중복은 3차 이전에 차단한다.
- 리허설 없이도 기본 밀도를 안정화하는 작업과 리허설 데이터 기반 개인화를 분리한다.
- 사용자가 설문에 장수를 직접 입력하면 목표값 기준 `min=max(1, N-2)`, `max=N+2`를 전송한다.
- shared schema는 최대 20장이지만 Web은 `max=N+2`를 20으로 clamp하지 않아 19장·20장 직접 입력이 유효하지 않은 payload를 만들 수 있다.
- 20장은 생성 요청의 안전 상한이며 Deck JSON, 에디터 편집, 수동 슬라이드 추가의 상한이 아니다.
- 생성된 20장 덱에 에디터에서 슬라이드를 추가해 21장 이상으로 유지할 수 있다.
- 생성 상한 변경은 shared request schema, Python request model, 생성 UI와 회귀 테스트를 함께 수정하는 제품 정책 변경으로 처리한다.
- 사용자가 장수를 비워 두면 발표 시간과 맥락으로 계산한 장수를 exact-count로 전송한다.
- Worker의 `min == max` exact-count와 1회 count repair 계약은 API·회귀 테스트용 하위 계약으로 유지한다.
- 폰트 후보 미리보기의 제목·본문에 실제 font stack을 적용하고 한글 예시 문구로 비교한다.
- recipe 조립은 content item 최소 개수만 hard failure로 처리하고, 상한 초과는 repair와 density QA에서 다룬다.
- `public-assets`와 `ai-generated`는 현재 실제 image asset이 아니라 visual plan과 교체 가능한 placeholder만 생성한다.
- Side AI의 rule-based fallback은 placeholder를 안내하지만 provider 응답은 실제 이미지 삽입을 잘못 약속할 수 있어 capability 문구 보강이 필요하다.

### 2.2 단계별 경계

```
3차 선행 작업
- 공통 발표 품질 규칙
- narrative selector
- 생성 prompt 규칙
- 정량 validator와 repair
- 근거 문서와 규칙 매핑
- 발화 예산과 슬라이드별 대본 밀도 안정화
- 요청 슬라이드 수 충족 보정
- message와 contentItems의 구조적 중복 제거

3차
- Saved Design Pack
- Brand Kit
- 실제 이미지 생성 및 asset 관리
- 기본 의미 기반 QA
- 규칙 저장과 우선순위 적용
- 발표 속도 선택 UI와 시간·밀도 QA

3차 이후
- 실제 이미지 픽셀 품질 평가
- 고급 차트 QA
- 자간과 애니메이션
- 발표용/배포용 동시 생성
- 리허설 데이터 기반 개인화
- 고급 서사 QA와 품질 평가 데이터셋
```

### 2.3 2차 완료 상태와 보강 판정

2차에서 구현한 timingPlan, speakerNotes, fontOverride, 웹 리서치, source ledger, 대비 검증, repair pass, media placeholder, Side AI, PPTX export 정합성과 legacy 경로 분리는 유지한다.

2026-07-10 실사용 검증에서는 시간 배분과 speakerNotes 기능이 존재했지만 다음 품질 문제가 확인됐다.

- 발표 제한 시간 전체를 발화 시간으로 환산해 전환·호흡·강조 시간을 남기지 않는다.
- 발표 유형에 따라 분당 공백 제외 280~440자를 적용해 일반 발표에서 과밀한 대본을 만들 수 있다.
- 슬라이드별 목표 하한 미달을 repair 대상으로 삼아 내용 필요성보다 글자 수 충족을 우선할 수 있다.
- LLM이 요청한 최소 슬라이드 수보다 적게 반환하면 보정 없이 job을 실패시킨다.
- Deck JSON의 `message`가 `contentItems`를 합친 내용과 같아도 cover·overview·insight recipe가 양쪽을 모두 렌더링한다.
- Worker와 에디터의 기존 presentation issue는 overflow·밀도·타이포그래피는 잡지만 화면 내 동일 문구 반복은 잡지 못한다.

이 문제들은 3차 기능보다 먼저 닫는 즉시 보강 범위로 분류했고, exact-count 계약, 제한된 count repair, 구조적 중복 repair와 fallback, 80% 발화 예산, speakerNotes 밀도 검증을 구현했다. 2026-07-11 최종 재승인에서 2차 기본 생성 계약과 3차 선행 규칙을 모두 완료로 판정했다.

### 2.4 2026-07-11 최종 승인 결과

| Profile | 요청/결과 | 실제 발화 시간 비율 | Worker 검증 | Template 사용 | PPTX export |
|---|---:|---:|---|---:|---|
| proposal | 8/8장 | 78.2% | issue 0개 | 0건 | 8장, 전체 메모 보존 |
| product-launch | 10/10장 | 75.9% | issue 0개 | 0건 | 10장, 전체 메모 보존 |
| executive-report | 10/10장 | 75.4% | issue 0개 | 0건 | 10장, 승인 요청과 메모 보존 |
| education | 15/15장 | 77.9% | issue 0개 | 0건 | 15장, 전체 메모 2,806자 보존 |

교육 15장 생성은 서로 다른 두 번의 연속 실행에서 모두 15장, `validation.passed=true`, presentation issue 0개를 충족했다. 두 번째 승인 실행의 실제 발화 시간 비율은 79.9%였다. 교육 15개 슬라이드와 임원 보고 10개 슬라이드를 에디터에서 전수 확인한 결과 Worker와 Editor 모두 경고 0개로 일치했다.

PPTX는 브라우저의 `PPTX 내보내기`로 생성한 실제 파일을 검사했다. 네 profile 모두 Deck JSON과 같은 장수를 유지했고 모든 슬라이드의 speaker notes가 보존됐다. `/ai-ppt` 결과의 `templateSelection=[]`도 함께 확인해 legacy/template 생성 규칙이 대표 결과에 개입하지 않았음을 재승인했다.

위 표는 exact-count를 사용하던 2026-07-11 승인 fixture의 결과다. 이후 사용자 직접 입력 장수는 내용 밀도와 LLM 계획 자유도를 위해 `±2장` 허용 범위로 변경됐다. 따라서 현재 `/ai-ppt`에서 사용자가 8장을 입력하면 payload는 6~10장을 허용하며, 최종 결과는 이 범위 안에서 달라질 수 있다. exact-count 자체는 제거되지 않았고 `slideCountRange.min == slideCountRange.max`인 직접 API 요청과 자동 계산 요청에서 계속 보장된다.

### 2.5 V9 이후 구현 대조 결과

| 항목 | 현재 구현 | V11 판정 |
|---|---|---|
| 사용자 직접 입력 장수 | `N-2 ~ N+2`, 최솟값 1장 | exact-count 설명 수정 |
| 사용자 직접 입력 상한 | 생성 단계 최대 20장, Web `N+2` 미보정 | 정책은 유지하고 19장·20장 입력 경계만 보정 |
| 에디터 Deck 장수 | `slides` 최소 1장, 최대 제한 없음 | 20장 초과 추가·저장 가능 |
| 장수 미입력 | 발표 시간·맥락으로 4~14장 계산 후 exact range 전송 | 구현 반영 |
| Worker exact-count | 동적 JSON schema와 최대 1회 전체 plan count repair | 유지 |
| 범위 요청 | 범위 안의 LLM 결과 허용, 목표 장수보다 적으면 안내 warning 가능 | 구현 반영 |
| 폰트 preview | 제목·본문 font family와 fallback stack 적용, 한글 예시 표시 | 구현 반영 |
| recipe item 상한 | 선택·repair 기준으로 사용하되 조립 단계 hard failure는 제거 | 구현 반영 |
| `public-assets` | 웹 근거 조사와 image placeholder 생성, 실제 이미지 0개 | 3차 전 의도된 한계 |
| `ai-generated` | 이미지 계획·근거·placeholder 생성, 실제 이미지 0개 | 3차 전 의도된 한계 |
| Side AI 이미지 안내 | fallback은 placeholder를 안내하지만 provider 답변에는 capability 제한 누락 | 3차 이미지 capability 연결 작업에 포함 |

실사용 프로젝트 검증에서도 `mediaPolicy=public-assets`, `referencePolicy=research-first`, 웹 출처 4개가 저장됐지만 실제 image element는 0개였고 필요한 3개 슬라이드에 placeholder만 생성됐다. 이는 worker의 현재 설계와 일치하지만, Side AI가 “검색한 이미지를 넣는다”고 답하는 것은 현재 기능과 불일치한다.

### 2.6 생성 장수 상한과 에디터 장수 정책

현재 20장 제한은 AI 생성 요청에만 적용한다. 목적은 한 번의 생성 job에서 LLM 토큰 비용, 응답 지연, 장문 content plan의 구조 불안정, Worker 메모리 사용량과 렌더링·PPTX export 실패 범위를 제한하는 것이다. 사용자가 편집하는 최종 Deck의 제품 상한을 의미하지 않는다.

| 구간 | 현재 상한 | 근거 |
|---|---:|---|
| `GenerateDeckRequest.slideCountRange` | 최대 20장 | shared schema와 Python request model의 생성 안전 상한 |
| `/ai-ppt` 장수 자동 계산 | 최대 14장 | 발표 시간·맥락 기반 초기 추천 범위 |
| `/ai-ppt` 사용자 직접 입력 | 목표 1~20장 | `±2장` 범위를 사용하되 최종 max는 20장으로 제한 |
| 저장된 Deck JSON | 최대 제한 없음 | `slides` 배열은 최소 1장만 검증 |
| 에디터 `+ 슬라이드` | 최대 제한 없음 | 현재 Deck 길이에 새 슬라이드를 계속 추가 |
| 에디터 저장·PPTX export | 최대 제한 없음 | 현재 Deck JSON 전체를 저장·내보내기 대상으로 사용 |

따라서 AI가 최대 20장까지 생성한 뒤 사용자가 에디터에서 21장 이상으로 확장해도 유효한 Deck으로 유지한다. 생성 상한과 편집 상한을 같은 값으로 묶지 않는다.

20장은 현재 운영 안전값이며 영구 제약이 아니다. 다음 지표를 확보한 뒤 생성 상한을 늘리거나 제거할 수 있다.

```text
- 장수별 LLM token 비용과 P95 생성 시간
- 장수별 count repair 및 schema 실패율
- Worker 메모리와 preview 렌더링 시간
- 에디터 로딩·저장 성능
- PPTX export 시간과 오류율
- 긴 덱을 여러 content plan으로 나누는 chunked generation 필요성
```

상한을 변경할 때는 Web만 수정하지 않는다. shared schema, Python request model, 생성 UI validation, advisor 안내, Worker 회귀 fixture와 운영 제한을 함께 변경한다.

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
-> 전체 발화 가능 시간 계산
-> 전환·호흡·강조·상호작용 시간 예약
-> 슬라이드 역할과 난도별 목표 시간 범위
-> 전체 speakerNotes 예산
-> 슬라이드별 메모 허용 범위
-> 과소·과밀 메모 보정
```

현재 구현은 `발표 제한 시간 × 80% × profile별 분당 글자 수`로 전체 대본 분량을 계산한 뒤 cover·summary·data 등 slideType 가중치에 따라 배분한다. 기본 속도는 260자/분, 임원·교육·토의형은 240자/분, 제품 공개·제안·피치는 280자/분, 명시적인 빠른 발표는 300자/분이다. 장표별 메모는 목표의 70~115%를 허용하고, 전체 실제 발화량은 발표 제한 시간의 75~85%를 검증한다.

2026-07-10 실사용 검증에서는 `slideCountRange.min == slideCountRange.max`인 8장·10장·15장 design-pack 요청이 `LLM returned fewer slides than the requested minimum`으로 실패했다. 이 과거 결함은 동적 `minItems/maxItems`와 최대 1회의 전체 content plan count repair로 해결됐다.

Worker는 exact range에서 요청 장수를 결정론적으로 강제하고, 범위 요청에서는 범위 안의 결과를 허용한다. `/ai-ppt`의 사용자 직접 입력은 현재 exact range가 아니라 `±2장` 범위이므로, 화면 입력값은 강제 장수가 아니라 목표 장수로 해석한다.

발표 제한 시간 100%를 대본으로 채우고 분당 280~440자를 적용하던 과거 기준은 제거됐다. 현재 80% 발화 예산은 전환, 호흡, 강조와 청중 반응 시간을 남기기 위한 제품 초기값이며, 향후 실제 리허설 데이터로 보정한다.

현재 제품 기준은 다음과 같다.

```
전체 speakerNotes 예산
= 발표 제한 시간
× 발화 시간 비율
× 발표 속도 기준

초기 발화 시간 비율: 75~85%
초기 발표 속도 기준: 공백 제외 약 260자/분
허용 조정 범위: 발표 맥락에 따라 약 230~300자/분
```

위 수치는 리서치 문서의 직접 인용값이 아니라 제품 초기값이다. 실제 한국어 발표 fixture와 리허설 데이터로 보정하며, `350~440자/분`을 일반 발표 기본값으로 사용하지 않는다.

슬라이드별 시간은 동일 분할하지 않고 다음 역할을 출발점으로 사용한다.

| 슬라이드 역할 | 초기 목표 시간 | 적용 원칙 |
| --- | --- | --- |
| 표지·도입 | 20~30초 | 제목과 발표 목적만 전달 |
| 일반 본문 | 45~60초 | 핵심 주장 1개와 지원 근거 |
| 데이터·비교·데모 | 70~90초 | 해석과 전환 시간을 포함 |
| 요약·CTA | 30~45초 | 결론과 다음 행동에 집중 |

전체 합계가 발화 예산을 넘으면 장표별 대본을 먼저 compact하고, 핵심 메시지를 훼손하지 않는 범위에서 장수 또는 시간 배분을 조정한다. 단순히 목표 글자 수를 채우기 위한 반복 문장과 일반론은 추가하지 않는다.

완료 기준:

- 7분 입력이 4장 내외로 과소 생성되지 않는다.
- `slideCountRange.min == slideCountRange.max`이면 요청한 장수를 결정론적으로 충족한다.
- `/ai-ppt`에서 사용자가 장수를 직접 입력하면 목표값의 `±2장` 범위 안에서 결과를 허용한다.
- `/ai-ppt`에서 장수를 비워 두면 발표 시간·맥락으로 계산한 장수를 exact range로 사용한다.
- LLM이 최소 장수보다 적게 반환하면 즉시 실패하지 않고 제한된 재생성 또는 누락 beat 보정 후 다시 검증한다.
- Worker의 8장·10장·15장 exact-count fixture와 Web의 `±2장` payload fixture를 각각 회귀 검증한다.
- 전체 대본은 발표 제한 시간의 75~85%에 해당하는 발화 예산 안에 들어온다.
- 전체 메모뿐 아니라 슬라이드별 메모가 역할별 허용 범위에 들어온다.
- 짧은 메모를 목표 글자 수까지 무조건 늘리지 않는다.
- 메모가 과밀하면 compact repair를 우선 적용한다.
- 메모 분량 보정이 Deck JSON과 PPTX 발표자 노트에 유지된다.
- 에디터에서 슬라이드별 예상 시간과 전체 예상 시간을 확인할 수 있다.

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

선택한 값은 `paletteOverride`와 `design.fontOverride`에 저장하고 Review 단계에서 최종 payload 요약으로 확인할 수 있다. 현재 미니 슬라이드는 제목과 본문에 후보의 `headingFontFamily`, `bodyFontFamily`, `fallbackFamily`를 실제 CSS font stack으로 적용하며, 영문 고정 예시 대신 `발표 디자인`, `핵심 메시지`, `발표 흐름과 실행안` 등 한글 문구로 비교한다.

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

Recipe의 content item 범위는 selector와 content repair의 품질 기준으로 사용한다. 조립 단계에서는 최소 개수 미달만 생성 실패로 처리하고, 최대 개수 초과만으로 job을 실패시키지 않는다. 초과 밀도는 `CONTENT_CAPACITY`, 렌더링 6줄 기준의 `BODY_CONTENT_DENSE`, overflow 검증과 repair에서 다룬다.

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

현재 2차 완료 상태에서는 실제 AI 이미지 파일이나 공개 이미지 파일을 생성·다운로드하지 않는다.

```
mediaPolicy: ai-generated
-> visualPlan.imageNeeded = true
-> imageSourcePolicy = "ai-generated"
-> visible placeholder 생성
-> 이미지 필요 근거 기록

mediaPolicy: public-assets
-> content용 웹 리서치와 source ledger 생성
-> imageSourcePolicy = "public-assets"
-> 필요한 슬라이드에 visible placeholder 생성
-> 실제 이미지 검색·라이선스 확인·asset 저장은 수행하지 않음
```

`minimal`은 이미지 슬롯을 만들지 않는다. Side AI나 advisor는 사용자가 선택한 `ai-generated` 또는 `public-assets`를 임의로 `minimal`로 되돌리지 않는다. `research-first`의 웹 서치는 발표 내용과 출처 검증용이며 현재 공개 이미지 검색을 의미하지 않는다.

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

현재 rule-based fallback은 이미지 질문에 “교체 가능한 visual placeholder를 계획한다”고 안내한다. 그러나 LLM provider instructions에는 실제 이미지 생성·수집이 아직 지원되지 않는다는 capability 제한이 없어, `public-assets + research-first`에서 “검색한 이미지를 삽입한다”고 잘못 답할 수 있다. 이는 생성 worker 문제가 아니라 Side AI 안내 문제다. 3차 실제 이미지 capability를 연결할 때 구조화 capability 상태를 provider instructions와 fallback에 공통 전달해 실제 지원 범위와 답변을 동기화한다.

```text
ai-generated / public-assets:
- 현재는 실제 이미지 파일을 생성·검색·삽입하지 않음
- 이미지 계획, 근거와 교체 가능한 placeholder만 생성
- 실제 asset 연결은 3차 범위
```

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

### 6.11 2차 기능 연결 승인 fixture와 한계

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

이 결과는 2차 기능 연결과 export 정합성을 확인한 개별 성공 fixture다. 그러나 `3,072자 / 목표 3,500자`, 슬라이드별 최소 메모 충족률 같은 지표는 대본이 자연스럽게 발표 가능한지보다 목표 글자 수를 얼마나 채웠는지를 측정한다. 또한 이후 8장·10장·15장 exact-count 요청이 실제로 실패했으므로 이 fixture는 장수 생성의 결정성을 증명하지 못한다. 실제 이미지와 주제별 고급 아트 디렉션이 없는 점은 2차의 의도된 한계지만, 대본 과밀·요청 장수 미달 실패·화면 내 동일 내용 반복은 의도된 한계가 아니다.

---

### 6.12 2차 성공 기준과 상태

- [x]  색상과 폰트를 preview 기반으로 선택 가능
- [x]  무료 폰트 후보와 라이선스 정보 제공
- [x]  폰트별 text fitting과 PPTX 반영
- [x]  발표 시간 기반 슬라이드 수 계산 경로 구현
- [x]  Worker exact-count 미달 자동 보정과 Web 사용자 입력 장수 허용 범위 적용
- [ ]  사용자 입력 `N+2` 범위를 shared 최대 20장으로 clamp하고 19장·20장 회귀 검증
- [x]  `message`와 `contentItems`의 구조적 중복 제거 및 visible text 중복 회귀 검증
- [x]  발표 시간 기반 speakerNotes 생성 및 보정 경로 구현
- [x]  발화 예산, 전환 시간과 역할별 허용 범위를 반영한 대본 밀도 안정화
- [x]  tone과 발표 맥락의 문체 및 레이아웃 반영
- [x]  AI 이미지 visualPlan과 placeholder 반영
- [x]  실제 AI·공개 이미지 생성과 수집은 2차에서 제외
- [x]  참고자료 및 웹 리서치 출처 ledger 생성
- [x]  핵심 사실의 출처 커버리지 검증
- [x]  Side AI 선택값 적용과 피드백 제공
- [x]  저장 직후 디자인 및 대비 경고 0개에 가까운 결과
- [x]  `validation.passed`와 실제 issue 정합성
- [x]  legacy/template 생성 규칙 영향 차단
- [x]  Deck JSON과 PPTX export 정합성

**판정: 2차 및 3차 착수 전 기본 생성 계약 완료, Web의 19장·20장 범위 상한 보정 필요. Side AI 실제 이미지 안내는 3차 이미지 capability 연결에 포함**

---

### 6.13 발표 시간·대본 밀도 단계별 적용 계획

#### 완료: 3차 기능 착수 전

- 발표 제한 시간의 75~85%만 speakerNotes 발화 예산으로 사용한다.
- 일반 발표의 초기 속도를 공백 제외 약 260자/분으로 낮추고, 맥락별 조정 범위를 약 230~300자/분으로 제한한다.
- slideType과 content complexity에 따라 표지·본문·데이터·마무리의 시간 가중치를 다시 계산한다.
- `slideCountRange`의 최소 장수 미달을 정상 실패로 끝내지 않고 제한된 count repair를 수행한다.
- `message`와 `contentItems`가 동일 내용을 반복하면 content plan repair 또는 recipe projection에서 한 번만 렌더링한다.
- speakerNotes repair는 하한 채우기보다 반복 제거와 과밀 compact를 우선한다.
- 5분·10분·15분 fixture에서 실제 장수, 전체 예상 시간, 장표별 시간, 대본 글자 수를 회귀 검증한다.

이 범위는 Saved Design Pack, Brand Kit 또는 실제 이미지 생성과 무관한 기본 생성 계약이므로 3차로 미루지 않는다.

#### 3차와 함께

- Brief 설문에 `여유롭게 / 보통 / 빠르게` 발표 속도 선택을 추가한다.
- 에디터와 생성 결과 QA에서 슬라이드별 예상 시간, 전체 예상 시간과 과밀 경고를 표시한다.
- 의미 기반 QA가 장표 역할, 메시지 난도와 대본 길이가 맞는지 검토한다.
- Saved Design Pack에는 속도 자체를 강제 저장하지 않고 사용자 기본 선호만 저장하며, 이번 발표 Brief가 우선한다.

#### 3차 이후

- 실제 리허설의 발화 속도와 슬라이드 체류 시간을 수집한다.
- 사용자별 분당 글자 수와 전환 시간을 계산해 다음 생성에 반영한다.
- 초과·미달 슬라이드만 선택적으로 대본을 다시 생성한다.
- 발표 환경, 청중 반응, 데모와 질의응답 시간을 포함한 개인화 timing model을 구축한다.

### 6.14 message와 contentItems 중복 방지

`SlidePlan.message`와 `contentItems`는 서로 다른 역할을 가져야 한다.

```
message
-> 슬라이드가 전달할 단일 결론 또는 핵심 주장

contentItems
-> message를 뒷받침하는 근거, 단계, 비교 항목 또는 실행 항목
```

2026-07-10 확인된 교육형 5장 Deck의 첫 슬라이드는 `message`에 두 문장을 줄바꿈으로 합쳐 저장하고, 같은 두 문장을 `contentItems`에 각각 저장했다. cover recipe는 항목이 둘 이상이면 왼쪽에 `message`를 표시하고 오른쪽 카드에 모든 `contentItems`를 다시 표시하므로 같은 내용이 화면에 두 번 나타났다. 중복은 Deck JSON 단계에 이미 존재하며 에디터 변환 과정에서 생긴 문제가 아니다.

구조적 중복은 고급 의미 기반 QA를 기다리지 않고 다음 순서로 처리한다.

1. content plan prompt에서 `message`를 content item 목록의 단순 결합으로 작성하지 못하게 한다.
2. 생성 후 공백·문장부호·줄바꿈을 정규화하여 `message`와 개별 항목 또는 항목 결합의 완전 일치·포함 관계를 검사한다.
3. 중복이면 content plan repair로 역할을 분리하고, repair가 불가능하면 recipe projection에서 동일 문구를 한 번만 렌더링한다.
4. source of truth인 Deck JSON과 visible text manifest를 함께 검사한다.
5. 에디터나 PPTX exporter에서 임의로 문구를 삭제하지 않는다.

완료 기준:

- cover, overview, insight, closing에서 `contentItems`가 1개·2개·3개 이상인 경우를 모두 회귀 검증한다.
- 동일 문구가 서로 다른 visible text element에 반복되지 않는다.
- `message`가 결론이고 `contentItems`가 근거인 정상 구성은 유지한다.
- 정확히 같은 문구의 반복은 정량 validator로 차단하고, 유사한 의미의 반복 평가는 3차 의미 기반 QA로 남긴다.

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
| R-08 | 발표 시간에 따라 장수와 메모 범위 결정 | slideCountRange와 timingPlan을 사용하되 전체 시간의 75~85%만 발화 예산으로 사용 | 문서 A 2.3 10/20/30; 문서 B 13 발표 시간에 따른 분량 |
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
| R-21 | 발표 메모는 글자 수 채우기가 아니라 역할별 시간 범위에 맞춤 | 장표 역할별 목표 시간과 대본 허용 범위를 적용하고 반복·일반론을 통한 확장 금지 | 문서 A 3.2 1-6-6와 구두 설명 분리; 문서 B 13 발표 시간에 따른 분량, 16 최종 리허설 |
| R-22 | 같은 핵심 내용을 화면에 이중 렌더링하지 않음 | message는 결론, contentItems는 지원 근거로 분리하고 정규화된 완전 일치·단순 결합 중복을 차단 | 문서 A 3.2 1-6-6, 3.3 Presentation Zen; 문서 B 4, 15, 17 핵심 규칙 요약 |

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
- SlidePlan.message는 단일 핵심 주장으로 사용하고 content item 목록을 그대로 합친 문장으로 만들지 않는다.
- contentItems는 핵심 주장을 뒷받침하는 근거 또는 단계로 사용하며 message를 그대로 반복하지 않는다.
- recipe는 같은 문구를 primary message와 supporting item 양쪽에 동시에 렌더링하지 않는다.
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

정규화 후 완전히 같거나 한쪽이 다른 쪽의 단순 결합인 구조적 중복은 현재 validator와 repair에서 처리한다. 서로 다른 표현이 같은 의미를 반복하는지, 한 슬라이드에 복수 주장이 있는지 판단하는 `SLIDE_MESSAGE_MULTIPLE`과 전체 서사 의미를 판단하는 `NARRATIVE_FLOW_WEAK`은 3차 QA에서 평가한다.

**Repair**

```
1. message와 contentItems의 역할 분리 및 구조적 중복 제거
2. 텍스트 박스와 recipe 재배치
3. 중복 문장 및 장문 compact
4. 역할별 최소 크기까지 font 축소
5. 최소 크기에서도 해결되지 않으면 presentation issue 노출
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
- Worker의 8장·10장·15장 exact-count 요청은 LLM 출력이 부족해도 제한된 count repair 후 요청 장수로 생성된다.
- `/ai-ppt` 사용자 직접 입력 장수는 목표값 `±2장` 범위 안에서 생성되고, 장수 미입력 시 자동 계산값을 exact range로 사용한다.
- message와 contentItems가 같은 문구를 화면에 중복 렌더링하지 않는다.
- 전체 speakerNotes 예상 시간이 발표 제한 시간의 75~85% 범위에 들어온다.
- 장표별 메모가 역할별 시간 범위를 벗어나면 과밀 또는 과소 issue로 표시된다.
- 부족한 메모를 반복 문장이나 일반론으로 채우지 않는다.

**현재 판정: 완료. profile·narrative·typography·grid·Worker/Editor 검증, Worker exact-count, Web 허용 범위, 구조적 중복과 발화 예산 회귀가 통과했다. Web의 19장·20장 범위 상한을 보정한 뒤 3차 본 작업을 진행하며 Side AI 안내는 실제 이미지 capability 연결과 함께 갱신한다.**

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
- 전체 발화 예산과 전환·호흡 시간 확보 여부
- 슬라이드 역할·난도 대비 speakerNotes 과밀 여부
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

**상태: 핵심 기능 완료, Web 사용자 장수 범위 상한 보정 필요**

### 2차 즉시 보강: 장수 계약, 내용 중복과 대본 밀도

- 요청 최소 슬라이드 수 충족과 count repair
- message와 contentItems의 구조적 중복 제거
- 발화 시간 비율 75~85% 적용
- 일반 발표 속도 초기값과 허용 범위 하향 조정
- 장표 역할·난도별 시간 및 speakerNotes 범위
- 과밀 compact 우선 repair
- Worker 8장·10장·15장 exact-count, Web 사용자 입력 `±2장`, 5분·10분·15분 timing 회귀 fixture

**상태: 완료**

### 3차 선행: 발표 품질 규칙 기반

- Hard, Profile, Preference Rule 분리
- narrative selector
- action title과 한 슬라이드 한 메시지
- typography, density, grid와 CTA 규칙
- presentationIssues와 repair 보강
- 리서치 근거 매핑

**상태: 완료 및 대표 profile 최종 승인 통과**

### 3차: 재사용과 실제 asset

- Saved Design Pack
- 팀/조직 Brand Kit
- 실제 AI 및 공개 이미지 asset
- 비용과 실패 정책
- 기본 의미 기반 QA
- 스타일 preset 확장

**상태: 기능 구현 및 생성 품질 최종 승인 완료**

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
| 리허설 기반 개인화 | 기본 발화 예산과 대본 밀도는 3차 전에 보장하고, 실제 발화 속도·슬라이드 체류 시간·초과 시간을 사용자별 다음 생성에 반영 | 문서 B 12, 13, 16 최종 리허설; 문서 A 2.3 |
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

3차 기능과 생성 품질이 최종 승인됐으므로 다음 개발은 3차 이후 고급 품질 최적화에서 선택한다.

1. Vision 기반 실제 이미지 의미 적합성, 피사체 위치, crop과 픽셀 대비 평가
2. 고급 chart 유형·축·강조 계열 왜곡 QA
3. 발표용 Deck과 상세 배포본 분리 생성
4. 리허설 발화 속도와 슬라이드 체류 시간을 반영한 timing 개인화
5. 발표 환경과 청중별 접근성 기준 조정
6. 발표 유형별 golden deck과 정량 회귀 평가 체계
7. Deck JSON, Editor와 PPTX의 letter spacing 공통 지원
8. 제한된 animation 정책과 export 정합성

완료된 exact-count, 최대 20장 생성 상한, 구조적 중복, 발화 예산, profile, typography, grid, Worker·Editor 검증, Saved Design Pack, Brand Kit, 실제 이미지 asset과 legacy 분리 회귀 suite는 후속 작업에서도 유지한다.
