# Orbit P0·P1 4인 업무분담 및 구현계획

> **Orbit(오빗)**: 이번에 개발하는 발표 연습 서비스의 이름  
> **P0-core(피제로 코어)**: 다른 기능보다 먼저 완성해야 하며, 이것이 없으면 핵심 흐름이 동작하지 않는 최우선 기능 범위  
> **P1(피원)**: P0가 안정적으로 동작한 다음 반드시 이어서 구현하는 분석 정확도·사용 편의성 고도화 범위
> **저장소(Repository)**: 프로젝트의 코드와 코드 변경 기록을 함께 보관하는 공간  
> **검증일**: 2026년 7월 13일  
> **검증 기준**: `origin/develop@93d6e24e`  
> **공통 계약(Common Contract)**: 여러 프로그램이 같은 데이터 이름·형식·상태값을 사용하기로 정한 약속  
> P0와 P1은 모두 완료 대상이다. 현재 계약에 없는 기능은 범위에서 제외하지 않고 Phase 0 또는 Phase 4의 작은 계약 PR에서 Schema·Migration·보관·권한 정책을 먼저 확정한 뒤 구현한다.

## 문서 기준과 충돌 해결 원칙

이 문서는 다음 순서로 사실과 요구사항을 판단한다.

1. `AGENTS.md`, `docs/contracts.md`, `packages/shared`의 현재 공통 계약
2. 제품 범위를 정한 `피드백 반영 버전 원본`
3. 담당자별 착수 전 구체화 문서
4. 현재 코드의 구현 상태

현재 계약과 제품 목표가 다르면 제품 기능을 몰래 P1로 내리거나 삭제하지 않는다. `현재 상태`, `목표 범위`, `필요한 선행 계약`을 분리하고 선행 계약 PR을 작업 순서에 포함한다. 타입·권한·보관 정책은 승인된 계약이 병합되기 전까지 기존 보안 경계를 유지한다.

---

# 먼저 읽는 핵심 용어

## 데이터 전달 용어

| 용어                                          | 쉬운 설명                                                                  |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| Schema(스키마)                                | 데이터에 어떤 항목이 있어야 하고 값이 어떤 모양이어야 하는지 검사하는 규칙 |
| DTO(Data Transfer Object, 전달용 데이터 모양) | 프로그램 사이에서 주고받을 항목과 값의 종류를 정확히 적어 둔 구조          |
| JSON(제이슨)                                  | 프로그램끼리 `이름: 값` 형태로 데이터를 주고받는 글자 형식                 |
| Fixture(픽스처)                               | 누구나 같은 시험을 반복하도록 미리 정해 둔 가짜 입력과 예상 결과           |
| ID(고유 이름표)                               | 사용자·프로젝트·발표처럼 특정 대상을 구별하는 이름                         |
| Database(데이터베이스)                        | 프로그램이 나중에도 사용할 정보를 정리해서 저장하는 곳                     |
| Migration(마이그레이션)                       | 데이터베이스 표와 칸의 구조를 안전하게 변경하고 기록하는 작업              |
| Log(로그)                                     | 프로그램이 무엇을 했고 어떤 오류가 발생했는지 남기는 실행 기록             |

## 기능과 평가 용어

| 용어                                        | 쉬운 설명                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Focused Practice(집중 연습)                 | 전체 발표가 아니라 부족한 한 부분만 반복하는 기능                           |
| Q&A(질문과 답변)                            | 예상 질문을 보여 주고 사용자의 답변을 평가하는 기능                         |
| Deck(발표 자료)                             | 여러 슬라이드를 하나로 묶은 전체 발표 자료                                  |
| Brief(발표 목표 설명)                       | 발표 대상·목적·필수 내용을 정리한 기준 정보                                 |
| PresentationBrief(발표 목표 정보)           | 청중·목적·원하는 결과·필수 내용을 모아 둔 공식 발표 기준 데이터             |
| Lens(평가 관점)                             | 발표에서 특히 중요하게 살펴볼 항목과 우선순위                               |
| Top 3(우선 개선 3개)                        | 발견한 문제 중 가장 먼저 고쳐야 할 세 가지                                  |
| Trend(추세)                                 | 여러 발표 결과를 시간순으로 비교한 변화 흐름                                |
| WPM(Words Per Minute, 분당 낱말 수)         | 발표자가 1분 동안 말한 낱말 수를 나타내는 말하기 속도                       |
| CPM(Characters Per Minute, 분당 글자 수)    | 한국어 발표자가 1분 동안 말한 공백 제외 글자 수로 말하기 속도를 나타내는 값 |
| STT(Speech-to-Text, 음성을 글자로 바꾸기)   | 사람이 말한 음성을 컴퓨터가 글자로 바꾸는 기술                              |
| STT confidence(음성 인식 확실도)            | 음성을 글자로 바꾼 결과가 얼마나 믿을 만한지를 나타내는 값                  |
| Quality Gate(품질 통과 검사)                | 분석 결과를 사용하기 전에 최소 품질을 만족했는지 확인하는 검사              |
| Transcript(음성 변환 원문)                  | 발표 음성을 글자로 바꾼 전체 내용                                           |
| Report(결과 보고서)                         | 발표 분석 결과와 개선할 점을 보여 주는 화면이나 데이터                      |
| PracticeIntent(연습 의도 정보)              | 다음 연습에서 무엇을, 왜, 어느 부분까지 연습할지 정리한 데이터              |
| Revision(수정 번호)                         | 내용이 몇 번째로 바뀌었는지를 알려 주는 번호                                |
| CAS(Compare-And-Swap, 확인 후 바꾸기)       | 다른 사람이 먼저 수정하지 않았을 때만 내 변경을 저장해 충돌을 막는 방법     |
| Run Snapshot(실행 당시 복사본)              | 발표를 시작한 순간의 자료와 설정을 그대로 복사해 둔 기록                    |
| ReportObservation(보고서 관찰 결과)         | 발표에서 발견한 문제나 잘된 점 하나를 보고서용으로 정리한 데이터            |
| Bounded Evidence(필요한 범위만 담은 근거)   | 전체 원문 대신 공통 계약이 허용한 시간 범위·의미 기준·문제 ID만 담은 근거   |
| CTA(Call To Action, 다음 행동 버튼)         | 사용자가 문장 연습·슬라이드 연습처럼 다음 작업을 바로 시작하는 버튼         |
| Criterion(평가 기준)                        | 발표가 목표를 만족했는지 확인하는 항목 하나                                 |
| Evidence(판단 근거)                         | 평가 결과를 왜 그렇게 판단했는지 보여 주는 자료                             |
| Semantic Cue(의미 기준)                     | 슬라이드에서 발표자가 꼭 전달해야 할 핵심 의미                              |
| Issue(문제 기록)                            | 발표에서 발견한 문제 하나를 가리키는 고유 기록                              |
| CoachingAction(코칭 행동 정보)              | 발견한 문제와 다음 행동·연습 범위·성공 조건을 묶은 데이터                   |
| Target(연습 대상)                           | 다시 연습할 문장·슬라이드·시작 부분·마무리 부분                             |
| Rubric(평가 기준표)                         | 무엇을 잘했는지 판단할 항목과 통과 수준을 미리 적은 표                      |
| Adaptive Follow-up(결과 맞춤 후속 질문)     | 앞의 답변이나 결과에 따라 내용이 달라지는 다음 질문                         |
| Evidence Timeline(시간순 근거 목록)         | 발표 중 언제 어떤 문제나 장점이 있었는지 시간순으로 보여 주는 화면          |
| Report-to-Deck(보고서에서 발표 자료로 연결) | 보고서 제안을 확인한 뒤 관련 슬라이드나 발표자 메모로 이동하는 기능         |
| Prompter(발표 도움 화면)                    | 실제 발표 중 다음에 말할 핵심 내용을 짧게 보여 주는 화면                    |
| Speaker Notes(발표자 메모)                  | 청중에게는 보이지 않고 발표자만 참고하는 슬라이드별 메모                    |
| full-script(전체 대본)                      | 발표할 문장을 처음부터 끝까지 모두 적은 글                                  |
| key-sentences(핵심 문장)                    | 반드시 말해야 하는 중요한 문장만 모은 방식                                  |
| keywords(핵심 단어)                         | 발표 내용을 떠올리는 데 필요한 짧은 단어만 보여 주는 방식                   |
| live-cues(실시간 힌트)                      | 실제 발표 중 다음에 말할 내용을 짧게 알려 주는 안내                         |

## 시험과 복구 용어

| 용어                                 | 쉬운 설명                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| E2E(End-to-End, 전체 흐름 시험)      | 사용자 화면에서 시작해 서버·분석·결과 화면까지 실제로 연결되는지 확인하는 시험  |
| Mock(가짜 동작)                      | 실제 서버를 부르지 않고 미리 정한 결과를 돌려주는 시험용 대체 동작              |
| Dispatcher(작업 보내기 장치)         | 데이터베이스의 대기 작업을 실제 작업 대기 줄에 넣는 장치                        |
| Reconciler(상태 복구 장치)           | 오래 멈추거나 서로 맞지 않는 작업 상태를 찾아 정상 상태로 바꾸는 장치           |
| Retry(재시도)                        | 일시적인 오류로 실패한 작업을 다시 실행하는 것                                  |
| Regression Test(기존 기능 확인 시험) | 새 기능 때문에 원래 잘 되던 기능이 망가지지 않았는지 확인하는 시험              |
| Audio Clip(짧은 음성 조각)           | 긴 발표 음성에서 문제와 관련된 부분만 짧게 잘라 낸 소리 조각                    |
| Evidence Player(근거 재생기)         | 평가 이유를 확인하도록 관련된 짧은 음성만 들려주는 재생 도구                    |
| Owner(소유자)                        | 프로젝트를 관리하고 다른 사람의 권한도 정할 수 있는 사람                        |
| Editor(편집자)                       | 프로젝트를 보거나 수정할 수 있도록 허락받은 사람                                |
| Owner-only(소유자만 허용)            | 프로젝트 소유자만 해당 정보나 기능을 사용할 수 있다는 뜻                        |
| Signed URL(서명된 임시 주소)         | 허락받은 사람만 짧은 시간 동안 파일을 열 수 있는 임시 주소                      |
| Fallback(대체 방법)                  | 원래 방법이 실패했을 때 대신 사용하는 두 번째 방법                              |
| Timestamp(발생 시각)                 | 발표가 시작된 뒤 몇 초에 일이 일어났는지 나타내는 시간 위치                     |
| Screen Reader(화면 읽기 프로그램)    | 화면의 글과 버튼을 소리로 읽어 주는 접근성 도구                                 |
| Hash(내용 확인값)                    | 내용이 바뀌었는지 빠르게 확인하도록 만든 짧은 값                                |
| HTTP 409(수정 충돌)                  | 다른 사람이 먼저 내용을 바꿔 현재 변경을 그대로 저장할 수 없다는 서버 결과 번호 |
| v1·v2(규칙 버전)                     | v1은 첫 번째 규칙이고 v2는 나중에 추가하는 두 번째 규칙                         |

---

# 중요 안내

기존 검토문에 적힌 `6d0b45fc`는 현재 최신 커밋이 아니다.

최신 원격 공동 개발 브랜치의 기준은 다음과 같다.

```text
origin/develop@93d6e24e
```

작업 시작 직전에 다음 명령을 실행한다.

```bash
git fetch origin
git rev-parse --short=8 origin/develop
```

명령의 뜻은 다음과 같다.

- `git fetch origin`: GitHub의 최신 변경 기록을 가져온다. 현재 작업 파일을 자동으로 바꾸지는 않는다.
- `git rev-parse --short=8 origin/develop`: 원격 `develop`의 현재 커밋 번호를 8자리로 보여 준다.

각 개발자는 로컬 `develop`이 아니라 최신 `origin/develop`에서 브랜치를 만든다.

## 이번 구현 범위 한눈에 보기

| 구분 | 반드시 구현할 기능 | 구현 시작 조건 |
| --- | --- | --- |
| P0 계약 선행 | 별도 PracticeIntent, CPM·STT Quality Gate·pause v2, 최소 음량·발음 지표, 문장 Target, 12초 Audio Clip·30일 보관·Owner-only Evidence API | Schema·Migration·지표 버전·보관·삭제·권한 정책 PR 승인 |
| P0 핵심 개선 루프 | Brief·사용자 목표, 공통 평가기, 근거 기반 Top 3, 발생 위치 근거, 30~60초 문장·슬라이드 집중 연습, Audio Clip·Evidence Player, 전체 재검증, 5개 추세, 실전 Prompter, 다음 연습 계획, 실제 E2E | P0 선행 계약과 Fixture 병합 후 네 담당 스트림 병렬 시작 |
| P1 계약 선행 | Lens별 Rubric·개선 이력, 언어·고급 음성 분석, Adaptive Q&A, Timeline, Report-to-Deck, Prompter 개인화·대본 단계, Editor의 Clip 접근 | 기능별 additive 계약·권한·Migration·Provider Interface PR 승인 |
| P1 고도화 | P1 계약 선행 행의 모든 기능과 전체 회귀·보안·접근성 시험 | P0 실제 E2E 통과 후 기능별 작은 PR로 진행 |

P1 기능은 아이디어나 선택사항이 아니다. 담당자·입출력·완료조건·시험을 가진 확정 후속 범위이며, P1 통합 검증까지 통과해야 이 문서의 전체 구현이 끝난다.

---

# 0. AI를 이용한 공통 작업 방법

## 0-1. 작업 시작 순서

1. 최신 `origin/develop` 커밋을 확인한다.
2. 담당자별 브랜치를 만든다.
3. AI(인공지능 코드 작업 도우미)에게 다음 내용을 전달한다.
   - 담당 기능
   - 수정할 수 있는 파일
   - 수정하면 안 되는 파일
   - 입력 데이터
   - 출력 데이터
   - 완료조건
   - 실행할 시험 명령
4. AI가 `AGENTS.md`와 `docs` 문서를 먼저 읽게 한다.
5. AI가 구현계획과 수정 예상 파일을 작성하게 한다.
6. 사람이 계획을 확인하고 구현을 승인한다.
7. 구현 후 시험 결과와 남은 위험을 PR에 기록한다.

## 0-2. AI에게 전달할 공통 지시문

```text
AGENTS.md와 docs 문서를 먼저 확인한다.
공통 계약과 데이터베이스 구조는 변경하지 않는다.
담당 파일 밖의 코드는 수정하지 않는다.
작은 단위로 구현하고 각 단계마다 시험한다.
Transcript, 음성 원본, 비밀값을 로그에 남기지 않는다.
실행하지 못한 시험이 있으면 이유를 기록한다.
```

각 문서의 역할은 다음과 같다.

- `AGENTS.md`: AI가 반드시 지켜야 하는 최상위 작업 규칙
- `docs`: 설계, 데이터 약속, 개발 규칙을 모아 둔 문서 폴더

## 0-3. 개발자끼리 데이터를 전달하는 방법

개발자가 분석 결과를 메신저로 복사해 다른 개발자에게 전달하는 방식이 아니다.

다음 세 가지로 전달한다.

1. 공통 Schema: 데이터가 약속한 모양인지 검사한다.
2. Fixture: 아직 다른 담당자의 기능이 완성되지 않았을 때 사용하는 고정 시험 데이터다.
3. 데이터베이스 ID: 저장된 실제 결과를 다시 찾을 때 사용하는 고유 이름표다.

## 0-4. 실제 데이터 전달 흐름

```text
Web(사용자 화면)
→ API(화면과 서버의 연결 통로)
→ Database(정보 저장소)
→ Job Queue(작업 대기 줄)
→ Worker(작업 처리 프로그램)
→ Python Worker(음성·의미 분석 프로그램)
→ 결과 Schema 검사
→ Database 저장
→ 공통 평가기
→ CoachingReportView(결과 화면용 데이터 묶음)
→ Web 표시
```

예를 들어 사용자가 발표 음성을 올리면 다음 순서로 움직인다.

1. 웹 화면이 음성 파일 ID를 API에 보낸다.
2. API가 분석 작업을 데이터베이스에 만든다.
3. 작업이 작업 대기 줄에 들어간다.
4. 작업 처리 프로그램이 대기 작업을 가져간다.
5. 파이썬 분석 프로그램이 음성을 분석한다.
6. 분석 결과가 약속한 데이터 모양인지 검사한다.
7. 검사에 성공한 결과만 데이터베이스에 저장한다.
8. 공통 평가기가 통과·부분 전달·실패를 판단한다.
9. 임재환의 화면 데이터 조립기가 결과 보고서 데이터를 만든다.
10. 웹 화면이 결과를 보여 준다.

## 0-5. TypeScript와 Python 사이의 전달

- TypeScript(타입스크립트): 웹과 서버에서 사용하며 데이터 종류 실수를 미리 찾기 쉽게 만든 언어
- Python(파이썬): 읽기 쉬운 문법을 사용하며 이 프로젝트에서는 음성·의미 분석에 사용하는 언어

두 프로그램은 JSON을 사용해 데이터를 전달한다.

```text
TypeScript 요청 Schema 검사
→ Python 요청 DTO 검사
→ Python 분석
→ Python 응답 DTO 검사
→ TypeScript 응답 Schema 재검사
→ 데이터베이스 저장
```

DTO는 데이터 설명이고, Schema는 실제로 들어온 데이터가 설명과 일치하는지 검사하는 규칙이다.

---

# 1. 착수 전 확정사항

## 결정 1. 기준 커밋

최종 기준은 다음과 같다.

```text
origin/develop@93d6e24e
```

뜻은 다음과 같다.

- `origin`: GitHub에 있는 원격 저장소
- `develop`: 팀의 공동 개발 브랜치
- `93d6e24e`: 검증 당시의 커밋 번호

작업 시작 전에 값이 바뀌었다면 최신 번호를 다시 기록한다.

기존 `6d0b45fc` 이후 변경은 주로 AI PPT(인공지능으로 발표 자료를 만드는 기능) 영역이므로 이번 P0-core 서버 판단은 그대로 사용할 수 있다.

---

## 결정 2. Python 파일 분리

현재 집중 연습과 질문·답변 분석 코드가 `main.py`에 함께 들어 있다.

`main.py`가 계속 커지면 다음 문제가 생긴다.

- 여러 개발자가 동시에 수정해 충돌하기 쉽다.
- 집중 연습 오류가 질문·답변 기능에 영향을 줄 수 있다.
- 필요한 코드와 시험을 찾기 어렵다.

따라서 다음과 같이 분리한다.

```text
services/python-worker/app/focused_practice.py
services/python-worker/app/challenge_qna.py
services/python-worker/app/coaching_contracts.py
```

역할은 다음과 같다.

- `focused_practice.py`: 집중 연습 음성과 목표를 분석한다.
- `challenge_qna.py`: 질문을 만들고 사용자의 답변을 분석한다.
- `coaching_contracts.py`: TypeScript와 Python이 주고받는 데이터 항목과 값의 종류를 정의한다.
- `main.py`: 각 분석 모듈을 연결하는 최소한의 역할만 담당한다.

`main.py`의 최종 수정 담당자는 이창원으로 고정한다. 다른 개발자는 동시에 수정하지 않는다.

---

## 결정 3. 공통 평가 판정표

### 3-1. 기본 판정

| 실제 상황           | 측정 상태                             | 평가 상태                      | 이유 코드                                       |
| ------------------- | ------------------------------------- | ------------------------------ | ----------------------------------------------- |
| 기준 통과           | `measured`(자료가 있어 측정함)        | `passed`(통과함)               | `PASSED`(통과)                                  |
| 의미 일부 전달      | `measured`                            | `partial`(일부만 전달함)       | `PARTIAL`(부분 전달)                            |
| 숫자 기준 초과      | `measured`                            | `failed`(통과하지 못함)        | `THRESHOLD_EXCEEDED`(허용 기준 초과)            |
| 핵심 의미 누락·모순 | `measured`                            | `failed`                       | `CONCEPT_MISSED`(핵심 내용 누락 또는 반대 전달) |
| 측정 자료 없음      | `unmeasured`(자료 부족으로 측정 불가) | `not-evaluated`(평가하지 못함) | `NO_MEASUREMENT`(측정 자료 없음)                |
| 분석 프로그램 실패  | `unmeasured`                          | `not-evaluated`                | `EVALUATION_UNAVAILABLE`(분석 기능 사용 불가)   |
| 적용 대상 아님      | `unmeasured`                          | `not-evaluated`                | `NOT_APPLICABLE`(이 항목에는 적용되지 않음)     |

### 3-2. 측정 불가와 비교 불가의 차이

- `unmeasured`(측정 불가): 같은 기준으로 평가할 수 있지만 필요한 자료가 없다.
- `incomparable`(비교 불가): 두 발표의 자료·목표·평가 기준이 달라 공정하게 비교할 수 없다.

예시는 다음과 같다.

- 음성 시간 정보가 없음 → 측정 불가
- 발표 자료가 다른 버전으로 바뀜 → 비교 불가
- 평가 기준의 버전이 바뀜 → 비교 불가
- 분석 프로그램이 일시적으로 실패함 → 측정 불가

둘 다 실패나 0점으로 바꾸면 안 된다.

### 3-3. 의미 전달 판정

| 분석 결과      | 뜻                          | 공통 평가       |
| -------------- | --------------------------- | --------------- |
| `covered`      | 핵심 의미를 충분히 전달함   | `passed`        |
| `partial`      | 핵심 의미 일부만 전달함     | `partial`       |
| `missed`       | 핵심 의미를 말하지 않음     | `failed`        |
| `contradicted` | 기준과 반대되는 의미로 말함 | `failed`        |
| `unmeasured`   | 분석할 자료가 없음          | `not-evaluated` |

### 3-4. 발표 시간 판정

평가계획에 저장된 최대 허용시간을 그대로 사용한다.

현재 최대 허용시간은 기본 목표시간의 약 120%다.

```text
실제 시간 ≤ 최대 허용시간: 통과
실제 시간 > 최대 허용시간: 실패
시간 자료 없음: 측정 불가
```

시간, 습관어, 긴 멈춤처럼 숫자로 판정하는 항목에는 별도의 부분 통과 구간을 만들지 않는다.

### 3-5. 습관어 판정

파이썬 분석 프로그램의 기존 습관어 목록과 단어 구분 방식을 사용한다.

단순히 전체 글자에서 `"음"`이 몇 번 나오는지만 세면 다음과 같은 문제가 생길 수 있다.

- 다른 단어 안에 들어간 `"음"`까지 잘못 셀 수 있다.
- `"뭐랄까"`, `"you know"`처럼 여러 글자로 된 습관어를 놓칠 수 있다.

현재 기준은 다음과 같다.

```text
0~1회: 통과
2회 이상: 실패
```

### 3-6. 긴 멈춤 판정

음성 분석 결과에는 말하기 구간의 시작·끝 시간이 들어 있다.

바로 앞 음성 구간이 끝난 뒤 다음 구간이 시작하기까지 1초 이상 비어 있으면 긴 멈춤 1회로 계산한다.

```text
0회: 통과
1회 이상: 실패
```

시간 정보 자체가 없다면 0회로 만들지 않고 측정 불가로 처리한다.

### 3-7. 집중 연습 2회 연속 통과

다음 조건을 모두 만족해야 `연습에서 안정화됨`으로 표시한다.

- 같은 연습 목표다.
- 바로 이어진 최근 두 번의 완료된 시도다.
- 두 시도 모두 분석에 성공했다.
- 두 시도 모두 측정할 자료가 있다.
- 두 시도 모두 목표를 통과했다.

예시는 다음과 같다.

```text
실패 → 통과 → 통과: 안정화
통과 → 측정 불가 → 통과: 안정화 아님
통과 → 취소 → 통과: 안정화 아님
```

`resolved`(공식 해결 확인)는 집중 연습 결과만으로 만들지 않는다. 다음 전체 발표에서도 같은 문제가 나타나지 않았을 때만 공식 해결로 판단한다.

---

## 결정 4. 추세 지표 5개

P0-core에서는 다음 다섯 가지 변화만 보여 준다.

| 사용자에게 보이는 지표 | 코드에서 사용하는 값                              | 계산 방법                                                  | 원천 담당     |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ------------- |
| 습관어 수              | `fillerWordCount`                                  | 분석된 습관어의 전체 개수                                  | 김동현        |
| 전체 발표 시간         | `durationSeconds`                                  | 발표 시작부터 종료까지 걸린 초                             | 김동현        |
| 말하기 속도            | `charactersPerMinute`·호환 `wordsPerMinute`       | 한국어 공백 제외 글자 수 ÷ 발표 시간(분), 기존 결과는 WPM | 김동현        |
| 시간 균형              | `timing-balance`                                   | 통과한 시간 기준 수 ÷ 측정된 전체 시간 기준 수             | 최영빈·김동현 |
| 의미 전달률            | `semantic-coverage`                                | 완전히 전달한 의미 기준 수 ÷ 측정된 의미 기준 수           | 최영빈        |

의미 전달률의 분모에는 다음 상태를 포함한다.

- 통과
- 부분 전달
- 실패

측정 불가 항목은 분모에서 제외한다.

부분 전달은 상세 결과에 따로 보여 주지만 완전히 전달한 개수에는 포함하지 않는다.

### 추가 규칙

- 성공한 전체 발표를 최근 최대 5회까지만 사용한다.
- 집중 연습 결과는 장기 추세에 넣지 않는다.
- 발표 시간은 실행 당시 `evaluationPlan`에 저장된 버전별 목표 범위와 최대 허용시간을 그대로 사용한다. 별도의 80% 하한을 새로 만들지 않는다.
- P0 한국어 말하기 속도는 CPM을 공식 단위로 사용하고 목표 범위는 Phase 0 계약과 실행 당시 Snapshot에 고정한다.
- 기존 WPM 결과와 화면 기본값 85~130은 호환 표시만 유지하며 CPM으로 환산하거나 과거 결과를 다시 쓰지 않는다.
- P0에서 신뢰할 수 있는 시간 구간이나 STT 자료가 없으면 `NO_MEASUREMENT`, `EVALUATION_UNAVAILABLE`, 계약에 추가한 `LOW_TRANSCRIPTION_CONFIDENCE` 중 실제 원인으로 측정 불가 처리한다.
- CPM과 STT Quality Gate는 `metricDefinitionVersion`(지표 계산 규칙 번호), Provider, 언어, confidence 미제공 정책을 함께 Snapshot에 고정한다.
- 이 기준은 `docs/decision-log.md`에 기록한다.
- Decision Log(결정 기록)는 어떤 선택을 왜 했는지 나중에 확인하도록 남기는 문서다.
- 목표시간이나 평가 기준이 바뀐 과거 발표는 비교 불가로 표시한다.
- `pause-count`는 긴 멈춤 개수지만 현재 공통 추세 계약에는 없으므로 다섯 추세에 포함하지 않는다.

임재환은 최영빈과 김동현이 만든 값을 모아서 보여 준다. 음성 값이나 평가 결과를 화면에서 다시 계산하지 않는다.

---

## 결정 5. 기존 결과 보고서와 Transcript 정책

기존 결과 보고서 API는 바로 제거하지 않는다.

```text
기존:
GET /api/v1/rehearsals/:runId/report

신규:
GET /api/v1/projects/:projectId/rehearsals/:runId/coaching-report
```

`GET`은 서버에 저장된 정보를 읽어 달라고 요청하는 방식이다.

현재 C0 계약은 이 신규 Route를 아직 허용하지 않는다. 따라서 Phase 0의 선행 계약 PR에서 `docs/contracts.md`, `packages/shared`, API request/response Schema, 필요한 Migration과 Route를 함께 승인·병합하기 전에는 앱 구현 브랜치가 이 Route를 추가하면 안 된다. 선행 계약이 반려되면 기존 Report Route와 승인된 read model을 재사용한다.

신규 API는 평가 결과, 집중 연습, 질문·답변, 추세를 한곳에 모은 코칭 결과를 제공한다.

### 화면 선택 규칙

- `ready`(핵심 계산 완료): 새 코칭 결과 화면을 사용한다.
- `partial`(일부 계산만 완료): 계산된 내용만 새 화면에 표시한다.
- 새 결과 자체가 없음: 과거 사용자를 위해 기존 결과 화면을 보여 준다.

기존 화면을 남기는 이유는 다음과 같다.

- 과거 발표 결과가 갑자기 보이지 않는 문제를 방지한다.
- 새 기능이 완성되는 동안 기존 기능을 유지한다.
- 모든 화면이 새 API로 바뀐 뒤에 기존 API 제거를 따로 검토할 수 있다.

### 개인정보 보호 규칙

```text
transcriptRetained: false
transcript: null
```

값의 뜻은 다음과 같다.

- `false`: 저장하지 않았거나 해당 기능이 꺼져 있다는 뜻
- `null`: 0이나 빈 글자가 아니라 전달할 값 자체가 없다는 뜻

다음 정보는 일반 결과 응답·공개 화면·로그에 포함하지 않는다.

- 음성을 글자로 바꾼 전체 원문
- 발표자 대본
- 발표자 메모
- 음성 원본
- 전체 음성 원본의 저장 주소
- 전체 음성 원본의 파일 ID
- API 키·비밀번호·인증 정보

현재 기존 API는 음성 변환 원문을 `null`로 바꿔서 돌려주는 방어 코드가 있다.

하지만 웹 화면에는 음성 변환 원문을 펼치거나 내려받는 코드가 남아 있다. 정상 응답에서는 보이지 않더라도, 잘못된 시험 데이터가 들어오면 노출될 수 있으므로 임재환이 제거한다.

### P0 음성 원본과 문제 구간 Clip 정책

P0는 전체 음성 원본을 장기 보관하지 않으면서 문제 구간만 제한적으로 재생할 수 있게 한다. Clip 구현 전에 보관·삭제·권한·Schema·Migration을 별도 계약 PR로 먼저 승인받는다.

```text
전체 음성 원본
→ STT와 분석에 사용
→ 분석 성공 또는 실패 처리 후 삭제
→ 삭제 시각과 삭제 상태만 기록
```

- 결과 보고서 공통 read model에는 음성 원본, 저장 주소, 파일 ID, Signed URL을 넣지 않는다.
- 문제 한 건당 최대 12초 Audio Clip을 전체 원본 삭제 전에 생성한다.
- Clip은 생성 시각부터 30일 보관하며 프로젝트 삭제·사용자 삭제 요청·권한 철회 시 조기 삭제한다.
- P0 Evidence API는 매 요청마다 프로젝트 Owner 권한을 다시 확인하고 짧은 만료시간의 Signed URL을 새로 발급한다.
- Signed URL, storage key, audioFileId는 공통 보고서·일반 분석 결과·로그에 넣지 않는다. storage key는 권한이 분리된 Clip 전용 evidence record에만 보관한다.
- Clip 만료·삭제·cleanup 실패는 bounded 상태와 삭제 대기 목록으로 관리하고 재시도한다.
- Evidence Player는 정확한 구간만 재생하고 동시에 하나만 재생한다.
- Clip이 없거나 만료되면 글·시간·수치 근거와 집중 연습 CTA로 Fallback한다.
- 문제 근거는 현재 계약이 허용한 시간 범위·Semantic Cue(의미 기준)·Issue(문제) 참조와 관측값으로 제공한다.
- 자료가 부족하면 존재하지 않는 음성 구간이나 문장을 만들어 내지 않고 근거 사용 불가로 표시한다.

P0 Clip 계약 PR은 다음 결정을 포함한다.

1. 최대 12초와 30일 보관이 필요한 이유와 최소 보관기간
2. P0는 Owner-only로 시작하고 Editor 접근 확대는 P1 권한 PR에서 검토한다는 경계
3. Clip 전용 파일 목적, 저장 위치, 삭제 대기 목록과 조기 삭제 조건
4. 일반 보고서에는 주소를 넣지 않고 권한 확인용 근거 ID만 넣는 방식
5. Signed URL을 매 요청마다 새로 발급하고 저장·로그에 남기지 않는 규칙
6. 공통 Schema, 데이터베이스 Migration, `docs/contracts.md`, `docs/decision-log.md` 변경과 적용·되돌리기 시험

P1에서는 Editor 접근이 승인되면 Owner와 같은 프로젝트 권한 검사를 적용한다. P0와 P1 모두 전체 음성 원본은 분석 직후 삭제하며 Clip 생성 실패가 전체 보고서 실패로 이어지지 않게 한다.

---

## 결정 6. 작업 복구 장치와 전체 흐름 시험

### Dispatcher

Dispatcher(작업 보내기 장치)는 데이터베이스에 `대기 중`으로 저장된 작업을 실제 작업 대기 줄에 넣는다.

필요한 이유는 다음과 같다.

1. API가 데이터베이스에 작업을 만든다.
2. 작업 대기 줄에 넣는 순간 네트워크 오류가 발생할 수 있다.
3. 데이터베이스에는 작업이 있지만 작업 처리 프로그램은 그 사실을 모를 수 있다.
4. Dispatcher가 이런 작업을 다시 찾아 작업 대기 줄로 보낸다.

### Reconciler

Reconciler(상태 복구 장치)는 작업 상태가 오랫동안 멈추거나 서로 다를 때 정상 상태로 맞춘다.

예시는 다음과 같다.

- 데이터베이스에는 처리 중인데 실제 작업은 없음
- 음성 업로드가 시작됐지만 끝나지 않음
- 삭제되어야 할 임시 음성이 남아 있음
- 재시도 횟수를 모두 사용했는데 계속 대기 중임

최종 담당자는 임재환으로 정한다.

### 임재환의 복구 작업

- 작업 등록 실패 재시도
- 중복 작업이 들어와도 결과가 한 번만 만들어지도록 방지
- 오래 멈춘 작업을 제한된 실패 상태로 변경
- 만료된 임시 음성 삭제
- 작업 처리 프로그램의 주기 실행 연결
- 재시도 횟수와 마지막 오류 기록
- Job enqueue·Worker 시작/완료·Provider 사용 불가·Clip 생성/삭제 재시도·사용자 데이터 상태 변경의 업무 이벤트 로그 기록
- 업무 이벤트 로그에는 Transcript, raw audio, 발표자 script, Signed URL, storage key, 인증 정보를 넣지 않음

이창원은 집중 연습과 질문·답변의 상태 변경 규칙을 제공한다. 임재환의 복구 장치가 평가 결과를 새로 계산해서는 안 된다.

### 실제 E2E 시험 데이터

E2E Test(전체 흐름 시험)는 다음 경로가 실제로 이어지는지 확인한다.

```text
사용자 화면
→ API
→ 데이터베이스
→ 작업 대기 줄
→ 작업 처리 프로그램
→ 파이썬 분석 프로그램
→ 결과 저장
→ 결과 화면
```

다음 파일을 만든다.

```text
tests/e2e/adaptive-coaching-live.spec.ts
tests/fixtures/audio/adaptive-coaching.wav
tests/fixtures/adaptive-coaching/coaching-report-view.json
tests/fixtures/adaptive-coaching/live-e2e-manifest.json
```

시험 음성은 Synthetic Audio(인공 음성)를 사용한다. 실제 사용자의 개인정보가 들어가지 않도록 컴퓨터로 만든 안전한 음성이다.

### 대표 시험 흐름

```text
PresentationBrief·PracticeIntent·평가 목표 확인
→ 첫 전체 발표
→ 실제 실패·부분 전달 후보로 우선 개선 최대 3개 생성
→ 허용된 시간 범위·의미 기준·문제 참조와 관측값 확인
→ Owner의 최대 12초 Clip 재생과 만료 Fallback 확인
→ 집중 연습 실패
→ 집중 연습 통과
→ 집중 연습 통과
→ 안정화 표시
→ 다음 전체 발표
→ 해결·반복·측정 불가 확인
→ 다섯 추세 확인
→ 질문·답변 결과 확인
→ 최대 네 단계의 다음 연습 계획 확인
```

시험에서는 `page.route()`를 이용해 API 응답을 가짜로 만들지 않는다.

`page.route()`는 브라우저가 실제 서버를 부르는 대신 미리 정한 결과를 받게 만드는 시험 기능이다. 화면 모양만 확인할 때는 유용하지만 실제 서버·작업 처리 프로그램·분석 프로그램의 연결은 확인할 수 없다.

### 시험 전용 분석 기능의 제한

외부 Provider(음성 인식이나 AI 분석을 제공하는 외부 서비스) 대신 시험 전용 분석 기능을 사용할 수 있다.

다만 다음 조건을 지킨다.

- 로컬 환경이나 시험 환경에서만 실행한다.
- Demo ID(실제 자료와 시험 자료를 구별하는 고정 이름표)를 확인한다.
- Production(실제 사용자가 사용하는 운영 환경)에서는 실행을 거부한다.
- `dataOrigin=fixture`로 기록한다. 이는 실제 사용자 결과가 아니라 고정 시험 자료에서 나온 결과라는 뜻이다.
- 음성 변환 원문과 음성 원본을 시험 보고서에 저장하지 않는다.
- Clip이 있는 Fixture와 생성 실패·만료·삭제 Fixture를 모두 준비한다.
- Signed URL은 시험 결과나 Snapshot에 고정값으로 저장하지 않고 만료·권한 거부 Fallback을 검증한다.

---

## 결정 7. 리허설 전 사용자 목표 설정

### P0 — PresentationBrief와 별도 PracticeIntent 사용

P0는 PresentationBrief를 발표 목표의 원본으로 유지하고, 사용자가 이번 연습에서 집중할 항목은 별도 PracticeIntent로 저장한다. 두 데이터의 역할을 섞지 않는다.

- 청중
- 발표 목적
- 원하는 결과
- 반드시 전달할 내용
- 시작·마무리 조건
- 예상 질문

저장할 때 기존 Revision과 CAS를 사용한다. 화면이 읽은 Revision과 서버의 현재 Revision이 다르면 HTTP 409를 반환해 다른 사람의 변경을 덮어쓰지 않게 한다.

리허설을 시작하면 Brief 전체 원문이 아니라 `briefRef`(Brief ID와 Revision)와 그 Brief로 만든 `evaluationPlan`을 기존 `evaluationSnapshot`에 고정한다. 발표 도중 Brief가 바뀌어도 이미 시작한 발표의 기준은 바뀌지 않는다.

PracticeIntent는 다음 계약을 Phase 0에서 먼저 추가한다.

- `GET/PUT /api/v1/projects/:projectId/rehearsal-focus-profile`
- 사용자가 습관어·시간 균형·핵심 내용·발음·목소리 중 최대 세 개 선택
- `intentId`, Revision, `source=user|recommended`, `selectedFocus`, `appliesFrom` 저장
- 각 Focus에 `measurementAvailability=available|unavailable`과 nullable 측정 불가 이유 저장
- 사용자 지정 습관어와 전문용어 저장
- 리허설 시작 당시 PracticeIntent Revision을 Run Snapshot에 고정
- Provider가 없는 목표는 시작 전에 측정 불가로 안내하고 실패로 저장하지 않음
- Brief와 PracticeIntent가 충돌하면 Brief의 발표 목적·필수 요구사항을 평가 기준으로 유지하고 PracticeIntent는 Top 3 우선순위에만 반영

### P0 — 목표 확인 화면과 자동 Top 3

- 리허설 시작 전 현재 Brief에서 만들어진 평가 목표를 쉬운 문장으로 보여 준다.
- 측정할 자료가 없는 목표는 시작 전에 측정 불가 이유를 보여 준다.
- 사용자가 Brief를 생략하면 시간·속도·습관어 같은 일반 전달력 기준만 사용한다.
- Top 3는 Brief의 필수 내용과 현재 평가 관점을 우선순위에 반영한다.
- 측정 불가 목표는 실패나 Top 3로 만들지 않는다.
- 과거 Top 3를 고쳐 쓰지 않고 새 분석 Revision의 목표 묶음을 발행한다.

### P0 — 사용자 목표와 자동 Top 3 병합

- 실패 또는 부분 전달된 Criterion만 문제 Top 3 후보로 사용한다.
- 사용자 선택 목표와 연결된 후보를 먼저 배치하고 자동 후보가 남은 자리만 채운다.
- 실제 문제 후보가 없으면 가짜 Top 3를 만들지 않고 `topActions=[]`로 반환한다.
- 유지 연습이나 최종 Q&A는 Top 3가 아닌 별도 Next Practice Action으로 제공한다.
- 기존 `fallbackCandidates()`는 문제 Top 3에서 제거하거나 유지 연습 전용 도출기로 분리한다.
- PracticeIntent는 새로운 공식 데이터 원본이므로 공통 Schema, API 계약, 데이터베이스 Migration, Brief와의 우선순위, 중복 제거 기준, Run Snapshot 연결을 같은 선행 PR에서 확정한다.

---

## 결정 8. 한국어 속도·STT 품질·멈춤·위치 근거

### P0 말하기 속도와 STT Quality Gate

- ko-KR의 canonical 말하기 속도는 공백 제외 글자 수를 실제 발화 시간으로 나눈 CPM으로 추가하고 기존 WPM은 호환 출력으로 유지한다.
- CPM과 WPM은 서로 덮어쓰지 않고 `metricDefinitionVersion`과 단위가 같은 결과만 비교한다.
- STT가 제공한 최종 시간 구간과 전체 시간을 사용하며 Transcript 글자 길이만 보고 시간을 추정하지 않는다.
- 시간 구간·언어·전체 시간처럼 계산에 필요한 자료가 없거나 분석 기능을 사용할 수 없으면 측정 불가 처리한다.
- Provider가 confidence(음성 인식 확실도)를 제공하지 않았는데 임의 숫자를 만들어 신뢰할 수 있다고 표시하지 않는다.
- Provider가 confidence를 제공하고 versioned minimum보다 낮으면 `LOW_TRANSCRIPTION_CONFIDENCE`와 `unmeasured`로 처리한다.
- 측정 불가 결과는 실패·0점·Top 3 문제로 바꾸지 않는다.

### P0 pause v2와 위치 근거

- 기존 `pause v1` 결과는 호환 출력으로 유지하고 P0 계약 PR에서 `pause v2`를 additive 버전으로 추가한다.
- `pause v2`는 `intentional`(의도한 멈춤), `blockage`(말막힘), `unknown`(판단 불가)을 구분한다.
- 위치는 `sentence`, `mid-sentence`, `unknown`으로 구분하고 슬라이드 전환 pause를 자동 실패로 만들지 않는다.
- 음성 구간 시간이 없으면 긴 멈춤 0회가 아니라 측정 불가로 처리한다.
- confidence가 부족하면 `unknown` 또는 `unmeasured`로 남기고 임의 분류하지 않는다.
- v1과 v2 결과에는 서로 다른 지표 계산 규칙 번호를 붙여 직접 비교하지 않는다.

### P0 최소 음량·발음 지표

- `SpeechAnalysisProvider` Interface 뒤에서 음량 일관성과 사용자가 지정한 전문용어 발음 confidence를 제공한다.
- Provider를 사용할 수 없거나 confidence 근거가 없으면 실패가 아니라 측정 불가로 처리한다.
- 이 두 지표가 실제로 측정 가능하다고 확인되기 전에는 PracticeIntent에서 음량·발음 목표를 선택 가능한 항목으로 활성화하지 않는다.
- raw 음성 특징값·음성 원본·전문용어 발화 원문을 로그에 남기지 않는다.

### P0 문제별 ReportObservation

측정 가능한 문제 한 건마다 다음 데이터를 만든다.

```text
ReportObservation
├─ observationId: 관찰 결과 고유 이름표
├─ criterionRef: 연결된 평가 기준과 수정 번호
├─ scope: 전체 발표·문장·슬라이드·슬라이드 범위·시작/마무리 중 평가 범위
├─ measurementState: 측정 여부
├─ value: 시간·개수·CPM·호환 WPM·비율·의미·음량·발음 중 실제 관측값
├─ evidenceRefs: 허용된 시간 범위·의미 기준·문제 참조값
└─ observedAt: 관찰한 시각
```

추가 규칙은 다음과 같다.

- 실제 STT 구간으로 위치를 확인할 수 있는 문제만 시작·종료 시각을 만든다.
- 습관어의 정확한 발생 위치를 확인할 수 없으면 임의의 시각을 만들지 않는다.
- 발표 종료 시각을 실제로 수집한 경우 마지막 슬라이드 종료 시각으로 사용한다. 종료 시각이 없으면 추정하지 않고 해당 시간을 측정 불가로 남긴다.
- 전체 Transcript나 짧은 발췌 문장을 ReportObservation에 넣지 않고, 공통 계약이 허용한 ID와 시간 범위 참조만 사용한다.
- Observation에는 파일 주소나 화면 주소를 넣지 않는다.
- 최영빈은 Observation을 공통 CoachingAction(다음 행동 정보)에 연결하고, 임재환은 그 정해진 대상을 CTA로 표시한다.

### P0 계약 확장 — CPM·STT 품질 코드·멈춤 v2·최소 음성 지표

다음 기능은 P0 기능 구현 전에 계약과 지표 버전을 먼저 확장한다.

- 한국어 `charactersPerMinute`를 WPM과 함께 제공하는 CPM 지표
- STT 최소 확실도와 `LOW_TRANSCRIPTION_CONFIDENCE` 이유 코드
- 습관어 발생별 시각과 슬라이드·전환·문장 시작 위치 패턴
- `intentional`(의도한 멈춤), `blockage`(말막힘), `unknown`(판단 불가) 분류
- `sentence`(문장 사이), `mid-sentence`(문장 중간), `unknown` 위치 분류
- 음량 일관성·전문용어 발음 confidence의 단위, Provider capability, 측정 불가 이유

`pause v2`는 기존 1초 규칙을 몰래 바꾸지 않고 새 버전으로 추가한다. v1과 v2 결과는 `METRIC_DEFINITION_CHANGED`(계산 규칙 변경)로 비교 불가 처리한다. CPM도 새 단위와 목표 범위, Fixture, `metricDefinitionVersion`, `docs/decision-log.md`가 확정되기 전에는 공식 추세로 표시하지 않는다.

---

## 결정 9. 보고서의 다음 연습 계획

결과 보고서 마지막에는 AI 총평만 보여 주지 않고 최대 네 단계의 Next Practice Plan(다음 연습 계획)을 제공한다.

```text
1. 가장 중요한 문장 30초 다시 연습
2. 시간이 부족했던 슬라이드 다시 연습
3. 약점과 연결된 질문에 답하기
4. 전체 발표에서 해결 여부 다시 확인
```

각 단계에는 다음 내용을 넣는다.

- 실행 순서
- 연결된 Top 3와 평가 기준
- 연습할 문장·슬라이드·질문
- 예상 연습 시간
- 성공 조건
- 바로 시작하는 CTA
- 이미 끝냈는지, 아직 해야 하는지 나타내는 상태

측정 불가 항목만으로 연습을 강요하지 않는다. 실행할 수 있는 목표가 없으면 유지 연습이나 최종 Q&A를 안내한다.

---

## 결정 10. P1 확정 고도화 범위

P1은 P0 핵심 흐름과 실제 E2E가 통과한 뒤 별도 PR로 진행하는 확정 구현 범위다. 모든 P1 기능에 담당자·입출력·완료조건·시험을 지정하고 P1 통합 검증까지 통과해야 전체 구현이 끝난다.

| P1 기능                  | 쉬운 설명                                                           | 담당          |
| ------------------------ | ------------------------------------------------------------------- | ------------- |
| Lens별 Rubric            | 일반 청중·의사결정자·엄격한 심사자에 따라 평가 기준과 중요도를 바꿈 | 최영빈        |
| Criterion 개선 이력      | 문제를 신규·개선 중·해결·반복·재발·비교 불가로 추적                 | 최영빈        |
| 슬라이드 낭독 감지       | 슬라이드를 그대로 읽은 부분과 풀어서 설명한 부분을 구분             | 김동현        |
| 언어·메시지 구조 분석    | 반복 표현·장황함·약한 표현·늦은 결론·전환 부족을 찾음               | 김동현        |
| 고급 음성·발음 Provider  | 음량·억양·문장 끝 음량·떨림·전문용어 발음을 분석                    | 김동현        |
| Adaptive Follow-up       | 앞 답변에서 빠진 내용을 바탕으로 다음 질문을 바꿈                   | 이창원        |
| 실패 질문 반복           | 통과하지 못한 질문을 세션이 끝나기 전에 다시 답하게 함              | 이창원        |
| Evidence Timeline        | 발표 중 언제 어떤 문제와 장점이 있었는지 시간순으로 표시            | 임재환        |
| Report-to-Deck 문장 교정 | 보고서의 제안을 확인한 뒤 발표자 메모에 반영하고 되돌림             | 임재환        |
| Prompter 개인화 확장     | P0 실전 화면에 Lens·사용자 override·해결 이력 기반 힌트를 추가      | 임재환        |
| 대본 단계 축약           | 전체 대본→핵심 문장→핵심 단어→실시간 힌트 순으로 줄임               | 임재환        |
| Clip Editor 접근 확대    | P0 Owner-only Evidence API를 Editor까지 안전하게 확장               | 김동현·임재환 |

### P1 시작 전 공통 통과조건과 완료조건

- 제품 요구사항과 공식 저장소 문서가 다르면 공식 문서를 먼저 승인된 PR로 변경한다.
- 새 데이터는 공통 Schema와 API 계약을 먼저 정하고 앱별 자체 데이터 모양을 만들지 않는다.
- 저장 구조가 바뀌면 Migration 적용·되돌리기 시험을 함께 작성한다.
- 보관기간·삭제·접근권한이 바뀌면 `docs/decision-log.md`에 이유와 대안을 기록한다.
- 새 지표는 단위·계산식·목표 범위·계산 규칙 번호·비교 불가 조건을 함께 정한다.
- P1에서도 전체 Transcript·음성 원본·Signed URL·발표자 메모 원문을 로그에 남기지 않는다.
- 각 기능의 정상·측정 불가·Provider 실패·권한 거부 Fixture가 있다.
- 기능별 unit/API/component 시험과 실제 P1 E2E 시나리오가 있다.
- P1 기능이 실패해도 P0 보고서·집중 연습·전체 재검증이 계속 동작한다.
- P1 결과가 과거 P0 결과를 새 규칙으로 소급 변경하지 않는다.

---

# 2. Phase 0 — 네 명이 먼저 맞출 기준

Phase(단계)는 큰 작업을 순서대로 진행하기 위해 나눈 구간이다.

Phase 0은 본 기능 구현 전에 시험 데이터, 평가 기준, 데이터 전달 방법을 고정하는 단계다.

Baseline(공통 시작 기준)은 네 명이 같은 코드와 같은 규칙에서 작업하도록 정한 출발점이다.

브랜치:

```text
feature/p0-core-integration-baseline
```

최종 담당자는 임재환이며 네 명 모두 검토한다.

## 담당별 Phase 0 작업

| 담당   | 바로 시작할 작업                                                                    |
| ------ | ----------------------------------------------------------------------------------- |
| 최영빈 | CriterionResult 입출력·semantic 매핑·Top 3·PracticeIntent·CoachingAction 계약과 경계 Fixture 작성 |
| 김동현 | TypeScript→Python DTO, CPM/WPM·STT Quality Gate·filler·pause v2·최소 음량/발음 Provider·Clip 보관/삭제/권한 계약과 HTTP 422 시험 작성 |
| 이창원 | 문장 Target·집중 연습·Q&A 임시 판정 조사, 안정화·전체 재검증 Fixture 작성 |
| 임재환 | 목표 선택 화면, 결과 보고서·Evidence Player·실전 Prompter·다음 연습 계획 Fixture와 실제 전체 흐름 시험 목록 작성 |

HTTP는 웹 프로그램끼리 요청과 응답을 전달할 때 사용하는 통신 규칙이다.

- HTTP 200: 요청이 정상적으로 처리됐다는 결과 번호
- HTTP 422: 데이터는 도착했지만 항목이나 값의 모양이 약속과 달라 처리할 수 없다는 결과 번호

Skeleton(골격)은 세부 기능은 아직 없지만 파일·함수·연결 위치를 먼저 만든 기본 구조다.

## Phase 0 완료조건

- 기존 공통 계약 PR #297을 기준으로 P0에 필요한 PracticeIntent·CPM·STT Quality Gate·pause v2·최소 음량/발음 지표·문장 Target·Audio Clip 확장을 additive Schema로 정의한다.
- 공통 Schema, API 계약, Migration, 보관·삭제·Owner-only 권한 정책, 지표 버전을 기능 구현 전에 작은 선행 PR로 병합한다.
- 모든 Fixture가 선행 계약 PR의 공통 Schema를 통과한다.
- P0는 CPM canonical·WPM 호환·pause v2·최소 음량/발음 Provider·Owner-only Clip·음성 원본 즉시 삭제 정책을 사용한다.
- 통과·부분 전달·실패·측정 불가·비교 불가 사례가 준비되어 있다.
- Brief·PracticeIntent Revision 충돌과 `briefRef`·PracticeIntent Revision·`evaluationPlan` Snapshot 고정 사례가 준비되어 있다.
- 습관어 1회/2회 경계 시험이 있다.
- 긴 멈춤 0회/1회 경계 시험이 있다.
- 시간 근거 있음·없음과 마지막 슬라이드 종료 시각 있음·없음 사례가 있다.
- 실패 → 통과 → 통과 안정화 시험이 있다.
- 보고서 Fixture에 Top 3, 평가 결과, 위치·시간 근거, Clip 있음/없음, 최대 4단계 다음 연습 계획이 있다.
- 실전 Prompter Fixture에 남은 시간, 현재 슬라이드 핵심 단어 최대 3개, 미해결 반복 문제 최대 1개가 있다.
- TypeScript 요청을 Python이 정상적으로 받는다.
- 잘못된 요청은 Python이 HTTP 422로 거부한다.
- 민감한 정보가 Fixture와 로그에 없다.
- 파일별 최종 수정 담당자가 한 명으로 정해져 있다.
- P0 계약 PR에는 shared schema test, Migration 적용·되돌리기 시험, `docs/contracts.md`, `docs/decision-log.md`를 함께 포함한다.
- P1도 기능별 선행 계약 PR이 병합되기 전에는 앱별 자체 enum·payload·저장 구조를 만들지 않는다.

Boundary Value Test(경계값 시험)는 통과와 실패가 갈리는 숫자의 바로 앞·같은 값·바로 뒤를 확인하는 시험이다.

---

# 3. 개발자별 업무분담

## 최영빈 — 발표 목표·공통 평가기·우선 개선 3개

브랜치:

```text
feature/p0-core-evaluator
```

### 담당 파일

```text
apps/worker/src/coaching/criterion-evaluator.ts
apps/worker/src/coaching/criterion-evaluator.spec.ts
apps/worker/src/coaching/coaching-action-derivation.ts
apps/worker/src/coaching/coaching-action-derivation.spec.ts
apps/worker/src/coaching/criterion-comparability.ts
apps/worker/src/coaching/criterion-comparability.spec.ts
apps/worker/src/practice-goal-derivation.ts
apps/worker/src/practice-goal-derivation.spec.ts
apps/api/src/practice-goals/evaluation-plan.ts
apps/api/src/practice-goals/practice-goals.service.ts
apps/api/src/practice-goals/practice-goals.service.spec.ts
```

### 구현 순서

1. 기존 `briefRef`와 `evaluationSnapshot.evaluationPlan`에서 청중·목적·필수 내용·시작·마무리 평가 조건을 읽는다.
2. Brief ID와 Revision, 그 Brief로 만든 평가계획, PracticeIntent Revision이 발표 시작 당시 Snapshot에 고정됐는지 검증한다.
3. Brief의 승인된 필수 내용·시작·마무리는 직접 Criterion으로 만들고, 청중·목적·원하는 결과는 Lens·우선순위·설명 문맥에 사용하며, 예상 질문은 질문·답변 입력으로 분리한다.
4. 측정 담당자가 만든 `ReportObservation`과 Criterion을 공통 평가기로 보내고 전체 발표·집중 연습·질문 답변이 같은 입력이면 같은 결과가 나오게 한다.
5. 측정 자료가 없거나 분석할 수 없는 경우를 기존 이유 코드의 측정 불가로 만들고 실패로 바꾸는 임시 처리를 제거한다.
6. 의미 전달 상태를 아래 고정표대로 변환하고 `missed`와 `partial`을 뒤바꾸지 않는다.
7. 실패 또는 부분 전달 결과만 Top 3 후보로 만든다. 실제 후보가 없으면 `topActions=[]`로 두고 유지 연습이나 질문·답변은 별도 Next Practice Action으로 만든다.
8. Brief 영향도, Lens 우선순위, 문제 심각도, 근거 신뢰도, 반복 여부, 집중 연습 가능성, 슬라이드 순서로 정렬한다.
9. 사용자 목표와 연결된 실패·부분 전달 후보를 먼저 고려하고 남은 자리만 다른 자동 문제로 채운다.
10. 같은 평가 기준과 범위의 중복 문제를 하나로 합치고, 기존 `fallbackCandidates()`는 문제 Top 3에서 제거하거나 유지 연습 전용 도출기로 분리한다.
11. 같은 입력에는 항상 같은 결과가 나오도록 정렬 마지막 기준까지 고정한다.
12. `CoachingAction` 도출기에서 각 Top 3의 관측 사실·청중 영향·바꿀 행동·연습 범위·성공 조건·Observation 참조·CTA Target을 만든다.
13. 과거 결과를 수정하지 않고 새 분석 Revision의 목표 묶음으로 저장한다.
14. 실제로 비교할 수 있는 전체 발표만 사용해 반복 기록을 계산한다.

### 공통 평가기의 입출력과 책임

```text
측정 담당 → ReportObservation
criterion-evaluator → CriterionResult
practice-goal-derivation → PracticeGoal
coaching-action-derivation → CoachingAction·topActions
임재환 Projector → CoachingReportView 조립·Schema 검증
```

- 평가기 입력은 `EvaluationCriterion`, 검증된 `ReportObservation | null`, 측정 불가 이유, `evaluatedAt`이다.
- 평가기 출력은 `CriterionResult` 하나이며 Top 3 정렬, 문구 작성, 화면 조립을 하지 않는다.
- 측정 계층은 `observationId`, `observedAt`, 원천값, `evidenceRefs`를 만든다.
- 평가기는 `evaluationStatus`, `reasonCode`, Criterion·Observation 연결만 결정한다.
- `CoachingAction` 도출기는 `actionId`, 우선순위, 행동·성공 조건·연습 Target을 결정한다.
- 각 `CoachingAction`은 `criterionRef`, `observationIds`, `target`, `availability`, `unavailableReason`, `audienceImpact`, `instruction`, `successCondition`을 공통 Schema대로 채운다.
- 임재환의 Projector는 저장된 결과를 다시 계산하지 않고 조립·검증만 한다.

### 의미 전달 고정 매핑

| 의미 상태       | CriterionResult             | PracticeGoal evidence | 목표 생성 |
| --------------- | --------------------------- | --------------------- | --------- |
| `covered`       | `passed` / `PASSED`         | 생성하지 않음         | 아니요    |
| `partial`       | `partial` / `PARTIAL`       | `not_covered`         | 예        |
| `missed`        | `failed` / `CONCEPT_MISSED` | `missed`              | 예        |
| `contradicted`  | `failed` / `CONCEPT_MISSED` | `contradicted`        | 예        |

### 비교 불가 책임

- 단일 평가기는 한 실행의 통과·부분·실패·측정 불가만 판정한다.
- `criterion-comparability`가 회차 비교 가능 여부와 `incomparable`을 별도로 결정한다.
- 비교 키에는 `deckContentHash`, `briefRef`, Lens ID·Revision, Criterion ID·Revision, Target Scope, 지표 버전을 포함한다.
- 비교 불가 회차는 반복·재발·개선 이력과 추세 분모에 넣지 않는다.

`recent-twice`는 비교 가능한 최근 전체 발표 두 번에서 같은 문제가 이어졌다는 뜻이다.

`persistent`는 여러 전체 발표에서 같은 문제가 계속 반복된다는 뜻이다.

### 최영빈이 전달할 데이터

- `CriterionResult`: 기준 하나의 측정 여부·평가 상태·이유
- `CoachingAction`: 관측·영향·행동·연습 범위·성공 조건·정해진 이동 대상
- `topActions`: 우선순위가 고정된 최대 세 개의 다음 행동
- 의미 전달률 계산에 사용할 회차별 원천 결과

데이터는 공통 Schema를 통과한 데이터베이스 결과와 Fixture로 전달한다. 화면 주소·음성 주소·전체 Transcript는 넣지 않는다.

### 완료조건

- 의미 전달 네 상태의 시험이 통과한다.
- 시간·습관어·긴 멈춤 경계 시험이 통과한다.
- Brief의 필수 내용·시작·마무리 조건이 실제 평가 결과가 된다.
- Brief Revision이 다른 실행 결과를 같은 기준인 것처럼 섞지 않는다.
- 측정 불가 항목이 실패 문제로 들어가지 않는다.
- Top 3마다 실제 Criterion과 Observation 참조가 있다.
- Top 3마다 사용자가 바로 이해할 영향·행동·연습·성공 조건이 있다.
- 실제 실패·부분 전달 후보가 없으면 가짜 문제를 만들지 않고 `topActions=[]`가 된다.
- 사용자 목표는 실패·부분 전달 후보의 우선순위에 반영되지만 통과 항목을 실패 문제로 만들지 않는다.
- 부분 전달이 공식 해결로 잘못 처리되지 않는다.
- 문제 → 정상 → 문제 순서는 연속 두 번 문제로 표시되지 않는다.
- 발표 자료·발표 목표·평가 기준이 다른 기록은 비교 불가로 처리한다.

### 수정하면 안 되는 영역

- 공통 Schema
- 데이터베이스 Migration
- 집중 연습 API
- 질문·답변 API
- 결과 보고서 화면
- Python 음성 분석 코드

### P1 확정 작업

- Lens별 Rubric으로 우선순위뿐 아니라 평가 항목과 성공 조건도 관점별로 바꾼다.
- Criterion 개선 이력을 신규·개선 중·해결·반복·재발·측정 불가·비교 불가로 확장한다.
- P1 계약 PR이 병합되기 전에는 공통 Schema나 Migration을 이 브랜치에서 수정하지 않는다.

---

## 김동현 — 음성 측정과 Python 전달 계약

브랜치:

```text
feature/p0-core-speech-evidence
```

### 담당 파일

```text
apps/worker/src/rehearsal-stt.processor.ts
apps/worker/src/python-worker/coaching-analysis.dto.ts
apps/worker/src/coaching/audio-clip-retention.ts
apps/worker/src/coaching/audio-clip-retention.spec.ts
services/python-worker/app/rehearsal.py
services/python-worker/app/coaching_contracts.py
services/python-worker/tests/
```

### 구현 순서

1. TypeScript 요청·응답 DTO를 기존 공통 Schema와 같은 모양으로 만든다.
2. Python DTO를 같은 모양으로 만들고 Pydantic(파이썬 입력 데이터 검사 도구)으로 검사한다.
3. 약속하지 않은 항목을 거부하고 정상 Fixture는 HTTP 200, 잘못된 Fixture는 HTTP 422가 나오는지 확인한다.
4. STT의 최종 구간·언어·전체 시간처럼 계산에 필요한 자료가 있는지 먼저 확인한다.
5. Provider가 confidence를 주면 Provider·언어별 승인 기준으로 Quality Gate를 적용하고, 기준 미달은 `LOW_TRANSCRIPTION_CONFIDENCE` 측정 불가로 만든다.
6. Provider가 confidence를 주지 않았으면 확실도 숫자를 추측하지 않고 미제공 정책과 Fixture를 적용한다.
7. 자료가 충분할 때 한국어 공백 제외 글자 수와 실제 발표 시간으로 공식 `charactersPerMinute`를 계산한다. 기존 `wordsPerMinute`는 호환용으로 유지하되 서로 환산하거나 과거 결과를 다시 쓰지 않는다.
8. 기존 습관어 목록과 단어·여러 낱말 표현 구분 방식을 사용해 단순 글자 포함 검사 없이 습관어를 계산하고 확인 가능한 발생 위치를 Evidence 원천값으로 만든다.
9. 기존 1초 이상 빈 구간인 `pause v1`을 유지하면서 `pause v2`에서 의도한 멈춤·말막힘·판단 불가와 문장 위치를 분류한다. v1과 v2는 지표 버전이 다르면 비교하지 않는다.
10. `SpeechAnalysisProvider` 뒤에서 음량 일관성과 지정 전문용어 발음 confidence를 계산하고 Provider를 사용할 수 없으면 측정 불가로 만든다.
11. 시간 근거가 없을 때 나온 호환용 숫자 0은 측정값으로 사용하지 않고 필요한 근거 존재 여부를 함께 전달한다.
12. 슬라이드 이동 기록으로 목표시간과 실제시간을 계산한다.
13. 실제 발표 종료 시각을 받은 경우에만 마지막 슬라이드 종료 시각으로 사용하고, 없으면 추정하지 않는다.
14. 신뢰할 수 있는 실제 구간이 있는 문제만 `scope`, 관측값, `time-range` Evidence 참조의 원천값을 만든다.
15. 전체 음성을 분석한 뒤 삭제하기 전에 실패·부분 전달 문제별 최대 12초 Clip만 생성한다. Clip 생성 실패는 보고서 전체 실패로 바꾸지 않는다.
16. Clip은 프로젝트 Owner 전용으로 30일 보관하고 조기 삭제·만료·저장 실패·삭제 재시도를 지원한다. 저장 URL이나 Signed URL은 결과·로그에 넣지 않는다.
17. 음성 변환 원문은 분석 중 Memory에서만 사용하고 결과·로그·작업 데이터에 넣지 않는다.

Memory(메모리)는 프로그램 실행 중에만 데이터를 잠시 보관하며, 프로그램이 종료되면 사라지는 공간이다.

### 김동현이 전달할 결과

- `fillerWordCount`: 습관어 전체 개수
- `fillerWordDetails`: 확인 가능한 습관어 표현별 정보
- `pauseCount`와 `pauseDetails`: pause v1 호환 결과와 실제 구간
- `pauseV2Details`: 의도한 멈춤·말막힘·판단 불가, 문장 위치, 지표 버전
- `durationSeconds`: 전체 발표 시간
- `charactersPerMinute`: P0 공식 한국어 말하기 속도
- `wordsPerMinute`: 기존 결과 호환용 말하기 속도
- `slideTimings`: 슬라이드별 목표시간과 실제시간
- `volumeConsistency`와 `termPronunciationConfidence`: P0 최소 음량·발음 결과 또는 측정 불가 이유
- 위치를 확인할 수 있는 문제의 평가 범위·시작/종료 시간 참조·관측값
- 평가기가 측정 가능 여부를 판단하는 데 필요한 시간 근거·STT Quality Gate 결과
- 최대 12초 Clip의 저장 참조·시작/종료 범위·만료시각·삭제 상태. 저장 URL과 Signed URL은 제외한다.

이 결과는 메신저가 아니라 공통 Schema를 통과한 데이터베이스 결과와 Fixture로 전달한다.

### 완료조건

- TypeScript와 Python의 데이터 모양이 일치한다.
- 정상 요청에서 HTTP 422가 발생하지 않는다.
- 습관어를 단순 글자 개수로 세지 않는다.
- 음성 시간 정보가 없을 때 호환용 숫자 0을 실제 측정 결과나 실패로 사용하지 않는다.
- STT confidence가 없을 때 임의의 확실도 숫자를 만들지 않고 승인된 미제공 정책을 적용한다.
- 위치를 확인할 수 없는 문제에 가짜 Timestamp(발생 시각)를 만들지 않는다.
- 마지막 슬라이드 종료 시각이 없을 때 시간을 추정하지 않는다.
- CPM·WPM 호환·습관어·pause v1·pause v2·시간·Quality Gate 결과마다 같은 규칙의 Fixture가 있다.
- 음량·발음 Provider를 사용할 수 없을 때 실패가 아니라 측정 불가이며 선택 화면도 측정 가능하다고 속이지 않는다.
- Clip은 12초를 넘지 않고 30일 만료·조기 삭제·삭제 재시도 시험이 통과한다.
- Clip 생성이나 재생 자료가 없어도 글·시간·수치 근거로 보고서가 완성된다.
- 음성 변환 원문, 음성 주소, 음성 원본이 로그에 없다.

### 수정하면 안 되는 영역

- 집중 연습 결과 판정
- 질문·답변 결과 판정
- 우선 개선 3개 정렬
- 결과 보고서 화면
- 공통 Schema

### P1 확정 작업

- 언어 구조·슬라이드 낭독·고급 음성·발음 분석은 Provider Interface(기능 연결 약속) 뒤에서 별도 PR로 구현한다.
- 반복 표현·장황함·약한 표현·늦은 결론·전환 부족을 Criterion과 Observation으로 저장한다.
- 음량·억양·문장 끝 음량·떨림·전문용어 발음은 Provider가 실제로 제공한 값만 사용한다.
- Owner-only Clip API의 Editor 확대는 권한 계약·감사 로그·회귀 시험이 병합된 뒤 임재환과 함께 구현한다.

---

## 이창원 — 집중 연습·질문 답변·다음 발표 검증

브랜치:

```text
feature/p0-core-focused-verification
```

### 담당 파일

```text
services/python-worker/app/focused_practice.py
services/python-worker/app/challenge_qna.py
services/python-worker/app/main.py
apps/api/src/focused-practice/
apps/api/src/challenge-qna/
apps/worker/src/focused-practice-analysis.processor.ts
apps/worker/src/challenge-qna-generation.processor.ts
apps/worker/src/challenge-qna-answer.processor.ts
apps/worker/src/coaching/practice-verification.ts
```

### 구현 순서

1. `main.py`의 집중 연습 코드를 별도 파일로 옮긴다.
2. 질문·답변 코드를 별도 파일로 옮긴다.
3. `main.py`에는 새 모듈을 연결하는 코드만 남긴다.
4. P0에서는 `sentence`, `slide`, `slide-range`, `opening`, `closing` Target(연습 대상)을 지원한다.
5. 문장 Target에는 `slideId`, `sentenceIndex`, `textSnapshotHash`, `scopeId`를 저장하고 문장 내용이 달라지면 오래된 Target으로 처리한다.
6. 각 집중 연습은 30~60초 범위로 안내하고 Target 종류별 권장 시간을 Fixture와 화면 문구에 고정한다.
7. 각 연습에 원래 전체 발표 ID, 목표 묶음 Revision, Criterion Revision, Target 범위를 고정한다.
8. 발표 자료가 바뀌어 Target과 현재 자료가 맞지 않으면 오래된 연습으로 표시하고 자동 실행하지 않는다.
9. 발화 글자 수나 `"음"` 개수로 평가하는 임시 규칙을 제거한다.
10. 최영빈의 공통 평가기와 김동현이 제공한 실제 측정값을 사용한다.
11. 원래 전체 발표의 값, 현재 시도의 값, 변화량, 통과 기준, 상태, 다음 행동 하나를 같은 단위로 만든다.
12. 측정 가능한 같은 목표의 인접한 두 시도가 모두 통과했을 때만 안정화로 표시한다.
13. 집중 연습 통과는 `전체 발표 검증 대기`로 저장하고 공식 해결로 바꾸지 않는다.
14. 다음 전체 발표에서 같은 Criterion을 다시 평가해 해결·반복·측정 불가·비교 불가를 확정한다.
15. 기존 질문의 출처와 관련 슬라이드를 유지한 채 답변 결과를 공통 CriterionResult로 변환한다.
16. 질문 답변 원문은 분석 중에만 사용하고 공통 보고서·로그에는 넣지 않는다.

`CriterionResult`는 하나의 평가 기준에 대해 측정 여부, 통과 여부, 이유를 모아 둔 공통 결과 데이터다.

### 범위 제한

이번 P0-core에서는 다음 작업을 제외한다.

- 새로운 Adaptive 질문 생성 방식
- 외부 자료를 이용한 복잡한 질문
- 질문 품질 자동 점수
- 새로운 평가 상태값

기존 질문·답변 결과를 공통 평가기와 결과 보고서에 연결하는 데 집중한다.

### 이창원이 전달할 데이터

- 원래 전체 발표 기준값과 각 집중 연습 시도의 비교 결과
- 두 번 연속 통과 여부와 전체 발표 검증 대기 상태
- 다음 전체 발표의 해결·반복·측정 불가·비교 불가 결과
- 질문 출처·관련 슬라이드·CriterionResult
- Top 3에서 다시 연습할 수 있는 정해진 Target
- 문장 Target의 `slideId`, `sentenceIndex`, `textSnapshotHash`, `scopeId`와 오래된 상태

### 완료조건

- 실패 → 통과 → 통과는 안정화로 표시한다.
- 통과 → 측정 불가 → 통과는 안정화로 표시하지 않는다.
- 통과 → 취소 → 통과는 안정화로 표시하지 않는다.
- 집중 연습 성공을 즉시 공식 해결로 만들지 않는다.
- 다음 전체 발표에서만 공식 해결을 판단한다.
- 서로 다른 단위·Target·Criterion Revision의 결과를 비교하지 않는다.
- 오래된 Target을 현재 발표 자료에서 자동 실행하지 않는다.
- 문장 내용이 바뀌면 기존 문장 Target을 자동 실행하지 않는다.
- 문장과 범위 Target의 30~60초 안내와 CTA가 같은 CoachingAction을 가리킨다.
- 집중 연습 결과를 전체 발표의 5개 추세에 섞지 않는다.
- 질문·답변도 측정 자료가 부족하면 실패가 아니라 측정 불가로 처리한다.
- Python 응답에 음성 변환 원문과 답변 원문이 없다.

### 수정하면 안 되는 영역

- 전체 발표 음성 분석 계산식
- 결과 보고서 조립
- 결과 보고서 화면
- 추세 최종 조립
- 공통 Schema

### P1 확정 작업

- 약점 기반 질문 생성은 누락·부분 전달 Criterion, 근거가 약한 주장, Brief 예상 질문, Lens, 반복 목표를 우선순위로 사용한다.
- 앞 답변의 누락 개념을 묻는 Adaptive Follow-up과 실패 질문 재답변을 추가한다.
- 질문은 여러 슬라이드와 승인된 참고자료에 근거해야 하며 근거가 없으면 내용을 만들어 내지 않는다.

---

## 임재환 — 목표 확인 화면·결과 보고서·복구 장치·전체 흐름 통합

브랜치:

```text
feature/p0-core-report-integration
```

### 담당 파일

```text
apps/api/src/coaching-reports/
apps/api/src/rehearsal-focus-profile/
apps/api/src/coaching-evidence/
apps/api/src/app.module.ts
apps/worker/src/coaching-job-dispatcher.ts
apps/worker/src/coaching-attempt-reconciler.ts
apps/worker/src/worker.service.ts
apps/web/src/features/coaching/
apps/web/src/features/rehearsal/RehearsalReportDocument.tsx
apps/web/src/features/rehearsal/rehearsalReportViewModel.ts
apps/web/src/features/rehearsal/RehearsalSemanticCoverage.tsx
apps/web/src/features/rehearsal/RehearsalSlideAnalysisOverview.tsx
apps/web/src/features/rehearsal/ReportProgressCharts.tsx
apps/web/src/features/rehearsal/RehearsalWorkspace.tsx
apps/web/src/features/rehearsal/presenter/presenterAidPolicy.ts
apps/web/src/features/rehearsal/presenter/PresenterRemoteWindow.tsx
apps/web/src/features/rehearsal/panel/RehearsalPanel.tsx
apps/api/src/scripts/reset-coaching-demo.ts
tests/e2e/adaptive-coaching-live.spec.ts
tests/fixtures/adaptive-coaching/
```

### 구현 순서

1. 리허설 시작 전에 기존 PresentationBrief와 별도 PracticeIntent의 사용자 목표 최대 세 개를 확인·수정하는 화면을 만든다.
2. `GET/PUT /api/v1/projects/:projectId/rehearsal-focus-profile`을 연결하고 수정 시 Revision과 CAS를 사용하며 HTTP 409 충돌을 사용자가 이해할 문장으로 보여 준다.
3. 신규 코칭 결과 보고서 API를 만들고 최영빈·김동현·이창원이 저장한 결과를 조회한다.
4. Repository 계층(데이터베이스 읽기와 저장만 맡는 코드)을 만든다.
5. Projector(여러 결과를 화면용 데이터 하나로 조립하는 코드)를 만들고 도메인 계산을 다시 하지 않는다.
6. 조립한 결과가 공통 `CoachingReportView` Schema와 일치하는지 검사한다.
7. 보고서를 `현재 준비 상태 → Top 3 → 평가 기준 결과판 → 문제 근거 → 이전 회차 비교 → 다음 연습 계획` 순서로 표시한다.
8. `passed`, `partial`, `failed`, `unmeasured`, `incomparable`의 문구·색상·아이콘을 한 곳에서 관리한다.
9. Top 3 카드에는 관측·영향·행동·연습·성공 조건·CTA를 같은 순서로 표시한다.
10. 문제 근거에는 현재 계약이 허용한 평가 범위·시간 범위·의미 기준·문제 참조·관측값만 표시하고 목표값은 연결된 Criterion에서 읽는다.
11. Owner 권한을 매 요청마다 확인하는 Evidence API와 최대 12초 Clip 전용 Evidence Player를 만든다. API는 짧게 만료되는 Signed URL을 응답할 수 있지만 데이터베이스·로그에는 저장하지 않는다.
12. Player는 지정 구간만 재생하고 동시에 하나만 재생하며 만료·삭제·권한 거부·생성 실패 시 글·시간·수치 근거로 돌아간다.
13. 다섯 추세를 최근 최대 5회의 전체 발표로 조립하고 P0 말하기 속도는 CPM을 기본으로, 기존 결과는 WPM 호환 단위로 명확히 구분해 표시한다.
14. 측정 불가와 비교 불가를 0으로 그리지 않고 집중 연습 시도를 장기 추세에서 제외한다.
15. P0 실전 Prompter에서 전체 대본을 기본 숨기고 남은 시간·현재 슬라이드 핵심 단어 최대 세 개·미해결 반복 문제 최대 한 개만 표시한다. 같은 슬라이드 진입에서 같은 문제를 중복 표시하지 않는다.
16. 보고서 마지막에 최대 네 단계의 다음 연습 계획과 바로 시작하는 CTA를 표시한다.
17. 기존 결과 보고서에서 음성 변환 원문 펼치기·내려받기 코드를 제거한다.
18. 일부 데이터만 있으면 있는 부분을 표시하고, 새 결과가 없는 과거 기록은 기존 결과 보고서로 보여 준다.
19. 작업 보내기 장치와 상태 복구 장치를 구현한다.
20. 가짜 API 응답을 사용하지 않는 실제 전체 흐름 시험을 작성한다.

`parse()`는 들어온 데이터가 정한 모양과 맞는지 검사한 뒤 프로그램에서 사용할 값으로 읽는 과정이다.

### 완료조건

- 기존 결과 보고서 API가 계속 동작한다.
- 신규 결과의 준비 완료와 일부 완료 상태를 지원한다.
- 목표 확인·수정·Revision 충돌·실행 당시 `briefRef`, PracticeIntent Revision, 평가계획 Snapshot 고정 흐름이 동작한다.
- Top 3·평가 결과판·문제 근거·이전 회차 비교·다음 연습 계획이 같은 화면에 표시된다.
- Top 3 카드에서 기존 Target의 집중 연습으로 바로 이동할 수 있다.
- 다음 연습 계획은 최대 네 단계이며 각 단계에 성공 조건과 CTA가 있다.
- 측정 불가를 실패 색상으로 표시하지 않는다.
- 키보드만으로 주요 CTA를 사용할 수 있고 Screen Reader(화면 읽기 프로그램)가 상태를 읽을 수 있다.
- 작은 화면과 큰 화면에서 내용이 잘리거나 겹치지 않는다.
- 음성 변환 원문과 민감한 정보가 API 응답에 없다.
- 민감한 정보가 화면에도 없다.
- Owner는 문제별 최대 12초 Clip을 재생할 수 있고 Editor·Viewer·다른 프로젝트 사용자는 거부된다.
- 만료·삭제·권한 거부·생성 실패 시에도 보고서가 깨지지 않고 글·시간·수치 근거를 표시한다.
- Signed URL은 짧게 만료되고 데이터베이스·로그·장기 화면 상태에 남지 않는다.
- 실전 Prompter는 전체 대본 대신 남은 시간·핵심 단어 최대 세 개·미해결 반복 문제 최대 한 개만 표시한다.
- 사용자 선택 목표와 반복·재발 이력이 Prompter 문제 선택에 반영되고 같은 슬라이드에서 같은 문제를 중복 표시하지 않는다.
- 작업 등록 실패가 자동으로 복구된다.
- 같은 작업이 두 번 등록되어도 결과는 한 번만 만들어진다.
- 사용자 화면부터 파이썬 분석까지 실제로 연결된다.
- 시험 실패 원인이 평가 계산이면 해당 계산 담당자에게 돌려보낸다.

### 수정하면 안 되는 영역

- 공통 평가 계산식
- 음성 지표 계산식
- 집중 연습 통과 계산식
- 질문·답변 평가 계산식
- 공통 Schema

### 결과 보고서 UI 단일 소유권

- `RehearsalReportDocument.tsx`, `rehearsalReportViewModel.ts`, `RehearsalSemanticCoverage.tsx`, `RehearsalSlideAnalysisOverview.tsx`, `ReportProgressCharts.tsx`와 보고서 CSS·표시 정책은 임재환만 수정한다.
- 최영빈·김동현·이창원은 보고서 UI를 직접 수정하지 않고 공통 Schema를 통과한 저장 결과와 Fixture를 전달한다.
- Projector는 `CoachingAction`이나 평가 상태를 다시 계산하지 않고 정렬된 결과를 조립·검증한다.

### P1 확정 작업

- 권한 계약과 감사 로그가 승인되면 P0 Owner-only Evidence API를 Editor까지 확대하고 Viewer·다른 프로젝트 사용자는 계속 거부한다.
- Evidence Timeline에서 의미 누락·과속·습관어·멈춤·전환·낭독·잘 전달한 내용을 시간순으로 보여 준다.
- Report-to-Deck은 원문·제안 Preview와 승인·거절 상태를 저장하고, 승인한 뒤에만 `baseVersion` 충돌을 확인해 발표자 메모에 반영하며 되돌리기를 제공한다.
- Prompter 개인화 확장은 Lens·사용자 override·해결 이력에 따라 핵심 단어와 실시간 힌트를 고르되 P0의 전체 대본 기본 숨김 정책을 유지한다.
- 대본 축약은 전체 대본→핵심 문장→핵심 단어→실시간 힌트 순으로 제안하되 사용자 승인 없이 자동 변경하지 않는다.

---

# 4. 병렬 작업과 병합 순서

## Phase 0 — 공통 기준 고정

P0 계약 PR에서 PracticeIntent, CPM·WPM 호환, STT Quality Gate, pause v2, 최소 음량/발음 지표, 문장 Target, 최대 12초 Clip·30일 보관·Owner-only 접근을 먼저 고정한다.

네 명은 동시에 Fixture와 전달 규칙을 준비하되 계약 PR이 병합되기 전에는 앱 내부에 임시 Schema나 독자적인 평가식을 만들면 안 된다.

## Phase 1 — P0 네 명 병렬 작업

- 최영빈: Brief·PracticeIntent 기반 목표, 공통 평가기, 비교 불가 판정, 실제 문제 Top 3와 CoachingAction
- 김동현: CPM·WPM 호환, STT Quality Gate, 습관어, pause v1·v2, 최소 음량/발음 지표, 위치·시간 근거, 최대 12초 Clip과 DTO
- 이창원: Python 파일 분리, 문장 포함 Focused Practice, 질문 답변, 안정화·전체 재검증
- 임재환: 목표 확인 화면, 결과 보고서 API·화면, Owner-only Evidence API·Player, 실전 Prompter, 다음 연습 계획과 복구 장치

이창원과 임재환은 Fixture를 사용해 먼저 구현할 수 있다. 따라서 최영빈과 김동현이 끝날 때까지 기다릴 필요가 없다.

## Phase 2 — P0 실제 결과 연결

1. 최영빈과 김동현의 PR을 검토하고 병합한다.
2. 이창원이 최신 `develop` 변경을 자신의 브랜치에 병합한다.
3. 이창원이 공통 평가기와 실제 음성 결과를 연결한다.
4. 이창원의 PR을 검토하고 병합한다.
5. 임재환이 최신 `develop` 변경을 자신의 브랜치에 병합한다.
6. 임재환이 최영빈·김동현·이창원의 실제 저장 결과를 연결한다.
7. 임재환의 PR을 검토하고 병합한다.
8. 전체 흐름 시험과 기존 기능 확인 시험을 실행한다.

## Phase 3 — P0 실제 검증

- 목표 확인 → 첫 전체 발표 → Top 3 → 집중 연습 → 두 번 안정화 → 두 번째 전체 발표 → 5개 추세 → 다음 연습 계획을 실제 환경에서 확인한다.
- API Mock 없이 실제 API·PostgreSQL·Redis·Private Evidence Redis·MinIO·Worker·Python Worker를 사용한다.
- 접근성·작은 화면·일부 결과·측정 불가·비교 불가·기존 보고서 Fallback을 함께 확인한다.
- 실패가 계산 문제면 최영빈·김동현·이창원에게, 화면·조립·이동 문제면 임재환에게 되돌린다.

## Phase 4 — P1 계약 고정

1. 기능별 사용자 필요성과 개인정보 위험을 검토한다.
2. 공통 계약·보관 정책·지표 버전·Migration을 별도 PR로 승인받는다.
3. Lens·개선 이력, 언어·고급 음성, Adaptive Q&A, Timeline, Report-to-Deck, Prompter·대본 축약, Editor Clip 접근의 계약과 Fixture를 고정한다.
4. 기능별 권한·보관·실패 시 P0 Fallback·비교 불가 조건을 결정 기록에 남긴다.

## Phase 5 — P1 담당별 병렬 구현

- 최영빈: Lens별 Rubric과 Criterion 개선 이력
- 김동현: 슬라이드 낭독·언어 구조·고급 음성·발음 Provider
- 이창원: 약점 기반 질문·Adaptive Follow-up·재답변
- 임재환: Evidence Timeline·Report-to-Deck·Prompter 개인화 확장·대본 축약
- 김동현·임재환: Owner-only Clip 접근의 Editor 확대

P1은 선택 아이디어가 아니라 이 문서의 확정 구현 범위다. 각 기능은 작은 PR로 나누되 담당별 완료조건과 통합 시험까지 끝내야 한다.

## Phase 6 — P1 통합·회귀·보안 검증

1. P1 결과가 기존 P0 결과를 소급 변경하지 않는지 확인한다.
2. Provider 실패·Clip 만료·권한 거부·자료 변경·Revision 충돌에서도 P0 보고서와 연습 흐름이 유지되는지 확인한다.
3. Owner·Editor·Viewer·다른 프로젝트 사용자 권한과 감사 로그를 검증한다.
4. 키보드·화면 읽기·작은 화면·큰 화면 회귀 시험을 실행한다.
5. 전체 Transcript·raw audio·Signed URL·발표자 script·비밀값이 API·로그·화면에 남지 않는지 확인한다.

공유 브랜치에서는 Rebase와 Force Push를 사용하지 않는다. 이미 팀원과 공유한 코드 기록이 바뀌면 다른 사람의 작업과 충돌할 수 있기 때문이다.

---

# 5. 최종 검증

## 5-1. 기본 검증 명령

```bash
pnpm build
pnpm lint
pnpm typecheck
pnpm test
node infra/scripts/check-env.mjs
docker compose config
```

각 명령의 뜻은 다음과 같다.

| 명령                    | 확인하는 내용                                                          |
| ----------------------- | ---------------------------------------------------------------------- |
| `pnpm`                  | TypeScript·JavaScript 도구와 시험 명령을 실행하는 관리 프로그램        |
| `build`                 | 작성한 코드를 실제 실행 가능한 형태로 만들 수 있는지 확인              |
| `lint`                  | 잘못된 문법과 팀 코드 작성 규칙 위반을 검사                            |
| `typecheck`             | 숫자·글자·객체 같은 값의 종류가 코드 약속과 맞는지 검사                |
| `test`                  | 자동 시험 전체를 실행                                                  |
| `check-env.mjs`         | 필요한 환경변수 이름이 준비됐는지 검사하며 비밀값 자체는 출력하지 않음 |
| `docker compose config` | 여러 프로그램을 함께 실행하는 설정이 올바른지 검사                     |

Docker Compose(도커 컴포즈)는 웹·API·데이터베이스·작업 처리 프로그램을 한꺼번에 실행하도록 묶어 주는 도구다.

## 5-2. P0-core 전용 검증

```bash
pnpm test:coaching:migrations
pnpm test:coaching:integration
pnpm test:coaching:python
pnpm test:coaching:e2e
```

| 명령                        | 확인하는 내용                                                       |
| --------------------------- | ------------------------------------------------------------------- |
| `test:coaching:migrations`  | 데이터베이스 구조 변경 기록이 정상적으로 적용되고 되돌아가는지 확인 |
| `test:coaching:integration` | API·데이터베이스·작업 처리 프로그램이 연결되는지 확인               |
| `test:coaching:python`      | Python 코드 규칙, 자료형, 자동 시험을 확인                          |
| `test:coaching:e2e`         | 사용자 화면부터 결과 화면까지 전체 흐름을 확인                      |

Integration Test(연결 시험)는 여러 기능을 붙였을 때 함께 동작하는지 확인하는 시험이다.

## 5-3. 실제 실행 검증

```bash
docker compose up --build
pnpm demo:coaching:reset
```

- `docker compose up --build`: 필요한 프로그램을 새로 만들고 함께 실행한다.
- `demo:coaching:reset`: 시험용 코칭 데이터를 처음 상태로 되돌린다.

다음 흐름을 직접 확인한다.

- 리허설 전에 기존 Brief와 별도 PracticeIntent의 사용자 목표 최대 세 개를 확인하고 수정할 수 있다.
- Revision 충돌이 발생하면 다른 사람의 변경을 덮어쓰지 않는다.
- 실행 당시 `briefRef`, PracticeIntent Revision, 그 Brief로 만든 평가계획이 Snapshot에 고정된다.
- 첫 전체 발표가 완료된다.
- 실제 실패·부분 전달 후보로 만든 우선 개선 최대 3개에 관측·영향·행동·연습·성공 조건이 표시된다.
- 실제 문제 후보가 없으면 가짜 Top 3를 만들지 않고 유지 연습·질문 답변을 별도 다음 행동으로 표시한다.
- 문제에 확인 가능한 평가 범위·시간 범위·의미 기준 또는 문제 참조·관측값이 표시된다.
- 근거가 없으면 가짜 시각이나 문장을 만들지 않는다.
- 문장·슬라이드·슬라이드 범위·시작·마무리 집중 연습을 여러 번 실행할 수 있다.
- 문장 내용이나 발표 자료가 바뀌면 오래된 Target을 자동 실행하지 않는다.
- 원래 값·현재 값·변화량·통과 기준이 같은 단위로 표시된다.
- 두 번 연속 통과하면 안정화가 표시된다.
- 다음 전체 발표에서 해결·반복 여부를 다시 판단한다.
- 측정 불가와 비교 불가가 실패나 0점으로 표시되지 않는다.
- CPM을 기본으로 하고 기존 WPM을 호환 단위로 구분한 P0 다섯 추세가 최근 최대 5회로 표시된다.
- STT Quality Gate 미달은 `LOW_TRANSCRIPTION_CONFIDENCE` 측정 불가로 표시되고 임의 confidence를 만들지 않는다.
- pause v1과 pause v2는 지표 버전을 구분하고 의도한 멈춤·말막힘·판단 불가를 확인할 수 있다.
- 음량 일관성과 지정 전문용어 발음 confidence는 Provider 근거가 있을 때만 표시되고 Provider를 사용할 수 없으면 측정 불가다.
- 질문·답변 결과가 표시된다.
- 최대 네 단계의 다음 연습 계획과 CTA가 표시된다.
- 키보드와 화면 읽기 프로그램으로 주요 결과와 CTA를 사용할 수 있다.
- 작은 화면과 큰 화면에서 내용이 겹치거나 잘리지 않는다.
- Owner는 문제별 최대 12초 Clip을 재생할 수 있고 Editor·Viewer·다른 프로젝트 사용자는 거부된다.
- Clip이 만료·삭제됐거나 생성에 실패해도 글·시간·수치 근거를 표시한다.
- Clip은 30일 뒤 삭제되고 조기 삭제·삭제 재시도가 동작하며 전체 raw audio는 분석 뒤 삭제된다.
- 음성 변환 원문·전체 음성 원본·장기 Signed URL이 API·화면·로그에 노출되지 않는다.
- 실전 Prompter는 전체 대본을 기본 숨기고 남은 시간·핵심 단어 최대 세 개·미해결 반복 문제 최대 한 개만 표시한다.
- 기존 결과 보고서와 기존 리허설 기능이 계속 동작한다.

## 5-4. P1 계약 및 완료 검사

다음 질문에 모두 `예`라고 답한 뒤 해당 P1 기능을 구현하고, 마지막 여덟 개 기능 시험까지 통과해야 P1이 완료된다.

- 공식 계약과 요구사항이 같은 내용을 말하는가?
- 개인정보 보관기간과 삭제 조건이 결정 기록에 있는가?
- Owner와 Editor의 접근 범위가 명확한가?
- 새 Schema와 Migration에 적용·되돌리기 시험이 있는가?
- 새 지표의 단위·계산식·목표 범위·버전·비교 불가 조건이 있는가?
- P1 기능이 실패해도 기존 P0 보고서와 연습 흐름이 계속 동작하는가?
- 전체 Transcript·음성 원본·Signed URL·발표자 메모·비밀값이 로그에 없는가?
- Lens별 Rubric과 Criterion 개선 이력이 Revision·비교 불가 규칙을 지키는가?
- 슬라이드 낭독·언어 구조·고급 음성·발음 결과가 Provider의 실제 근거와 공통 Schema를 통과하는가?
- Adaptive Q&A가 승인된 자료에만 근거하고 근거가 없으면 내용을 만들어 내지 않는가?
- Evidence Timeline이 여러 근거를 시간순으로 표시하고 Clip이 없어도 동작하는가?
- Report-to-Deck이 사용자 승인·`baseVersion` 충돌·되돌리기를 지원하는가?
- Prompter 개인화 확장과 대본 축약이 사용자 승인 없이 script나 단계를 바꾸지 않는가?
- Editor Clip 접근 확대 뒤에도 Viewer·다른 프로젝트 사용자는 거부되는가?
- P1 전체 회귀·보안·접근성 시험이 통과하는가?

---

# 6. 저장소 검증 결과

최신 `origin/develop@93d6e24e`를 Static Inspection(정적 확인: 프로그램을 실행하지 않고 코드와 설정을 읽어 확인하는 방식)으로 검토한 결과는 다음과 같다.

- 공통 코칭 Schema는 이미 존재한다.
- 데이터베이스 Migration도 이미 존재한다.
- `focused_practice.py`와 `challenge_qna.py`는 아직 없다.
- 집중 연습과 질문·답변 Python 코드는 현재 `main.py`에 들어 있다.
- 기존 결과 보고서 API는 음성 변환 원문을 `null`로 바꿔서 반환한다.
- 웹에는 음성 변환 원문을 펼치거나 내려받는 코드가 남아 있다.
- 현재 `adaptive-coaching.spec.ts`는 Mock API를 사용하는 화면 중심 시험이다.
- 실제 전체 흐름을 확인하는 `adaptive-coaching-live.spec.ts`는 없다.
- 작업 재전송에 필요한 데이터베이스 칸은 있지만 전용 Dispatcher는 없다.
- 분당 낱말 수의 현재 화면 기준은 85~130이다.
- 현재 공식 말하기 속도와 추세 단위는 WPM이며 CPM 계약은 없다.
- 현재 멈춤 판정은 음성 구간 사이 1초 이상을 세는 v1 규칙이다.
- 현재 전체 리허설 음성 원본은 분석 뒤 삭제하며 12초 Clip을 30일 보관하는 계약은 없다.
- 현재 음성 근거 접근 정책은 Owner-only이며 Editor 접근 확대는 확정되지 않았다.
- 별도 PracticeIntent 계약은 없고 기존 PresentationBrief Revision을 가리키는 `briefRef`와 실행 당시 평가계획 Snapshot을 사용한다.
- 기존 공통 코칭 계약에는 제한된 시간 범위·의미 기준·문제 참조, 정해진 연습 이동 대상, 최대 네 단계의 다음 연습 계획을 담을 수 있다.
- 기존 반복 기록 계산은 실제로 비교 가능한 전체 발표만 정확히 골라내지 못한다.

따라서 Phase 0에서 P0 계약 확장과 Migration·결정 기록을 먼저 병합한 뒤 네 명이 Fixture를 이용해 P0를 병렬 구현한다. P0에는 별도 PracticeIntent, CPM·STT Quality Gate·pause v2, 최소 음량/발음 Provider, 문장 Target, 최대 12초 Clip·30일 보관·Owner-only Evidence Player, 전체 대본을 숨기는 실전 Prompter가 포함된다. P0 완료 뒤에는 Lens·개선 이력·언어/고급 음성·Adaptive Q&A·Timeline·Report-to-Deck·Prompter 개인화 확장·대본 축약·Editor Clip 접근까지 P1 확정 범위를 계약 PR과 기능 PR로 모두 구현한다.

이번 검토에서는 소스 코드를 수정하거나 자동 시험을 실행하지 않았다.
