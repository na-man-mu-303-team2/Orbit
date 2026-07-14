# Speaker Notes 품질 우선 생성 계약

> 상태: 구현 완료
>
> 적용 영역: AI PPT `design-pack` 생성 경로
>
> 기준 브랜치: `fix/speaker-notes-final-contract`

## 1. 문서 목적

이 문서는 AI PPT가 슬라이드별 `speakerNotes`를 생성하고 최종 Deck에 저장할 때 지켜야 하는 품질 우선 계약을 정의한다.

기존 구현은 발표 시간에 맞춰 대본의 글자 수를 조정하는 과정에서 문장 중간을 자르거나, 중복 제거 후 부족해진 분량을 일반적인 표현으로 채울 수 있다. 이 방식은 발표 시간은 맞출 수 있어도 실제로 읽기 어려운 대본을 만들 수 있다.

이 계약은 다음 세 가지 결정을 최우선으로 반영한다.

1. `...` 또는 `…`를 포함한 문자 단위 절단을 어떤 경우에도 허용하지 않는다.
2. 모든 슬라이드의 핵심 메시지와 필수 설명을 먼저 만든 뒤, 전체 예산에 여유가 있을 때만 부가 설명을 추가한다.
3. 발표 시간보다 대본의 완결성, 근거, 논리와 자연스러움을 우선한다.

## 2. 기존 문서와의 관계

발표 시간과 대본 밀도에 관한 기존 설명은 다음 문서에 부분적으로 존재한다.

- `docs/plans/AI-PPT-생성-고도화-기획서-V10.md`
- `docs/plans/AI-PPT-생성-고도화-기획서-V11.md`
- `docs/plans/AI-PPT-생성-고도화-기획서-V12.md`
- `docs/contracts.md`
- `packages/shared/src/deck/deck.schema.ts`

V10~V12는 당시 품질 승인 이력을 보존하는 문서이므로 수정하지 않는다. 이 문서는 그 이후 발견된 문장 절단 문제에 대한 후속 계약이다.

충돌하는 경우 `speakerNotes` 생성과 최종 보정에 한해 이 문서를 우선한다. 기존 `timingPlan`, `targetSpeakerNotesChars`, `actualSpeakerNotesChars` 필드는 유지하되, 시간과 글자 수는 강제 절단 기준이 아니라 생성 방향과 경고를 위한 지표로 사용한다.

## 3. 적용 우선순위

대본을 생성하거나 보정할 때 다음 우선순위를 따른다.

1. 문장 완결성
2. 핵심 메시지 보존
3. 근거와 출처 정합성
4. 슬라이드 내부 및 슬라이드 간 논리 흐름
5. 의미 중복 제거
6. 발표 시간과 글자 수

하위 조건을 만족시키기 위해 상위 조건을 훼손하면 안 된다. 예를 들어 발표 시간을 맞추기 위해 핵심 문장을 삭제하거나 문장 중간을 자르는 처리는 금지한다.

## 4. 핵심 용어

### 4.1 필수 문장

슬라이드의 목적을 달성하기 위해 반드시 포함해야 하는 문장이다.

- `core`: 슬라이드의 핵심 메시지
- `evidence`: 핵심 메시지를 뒷받침하는 사실, 원리 또는 출처 기반 근거
- `interpretation`: 근거가 의미하는 바
- `action`: 청중이 기억하거나 실행해야 할 내용

Deck 서사 계획이 없는 legacy 경로에서는 슬라이드 유형에 따라 필요한 역할을 결정한다. `design-pack` 경로에서는 시각적 `slideType`보다 발표상의 `purpose`를 우선하며 `core`는 항상 필수다.

### 4.2 선택 문장

핵심 메시지를 이해하는 데 도움이 되지만 없어도 슬라이드의 목적이 유지되는 문장이다.

- `example`: 구체적인 사례
- `caution`: 예외 또는 주의점
- `detail`: 추가 설명
- `transition`: 다음 내용으로 연결하는 문장. Deck 서사 계획이 있는 두 번째 이후 슬라이드에서는 필수 문장이다.

### 4.3 완결 문장

내용이 문법적으로 완결되고 다음 종결 부호 중 하나로 끝나는 문장이다.

- `.`
- `!`
- `?`
- `。`
- `！`
- `？`

줄바꿈은 문장 경계로 인식하지만, 줄바꿈 앞에 종결 부호가 없는 문자열은 자동으로 완결 문장으로 간주하지 않는다.

### 4.4 시간 예산

발표 시간으로부터 계산한 권장 대본 분량이다. 대본 생성의 방향을 제공하지만 문장을 자르는 상한이 아니다.

공백을 제외한 글자 수를 사용한다.

## 5. 내부 생성 모델

LLM이 긴 `speakerNotes` 문자열 하나를 직접 완성하게 한 뒤 자르는 방식은 사용하지 않는다. 생성 중에는 문장 단위의 내부 구조를 사용하고, 최종 단계에서 문장을 연결해 기존 `speakerNotes: string`으로 저장한다.

권장 내부 모델은 다음과 같다.

```python
class SpeakerNoteUnit:
    role: Literal[
        "core",
        "evidence",
        "interpretation",
        "action",
        "example",
        "caution",
        "detail",
        "transition",
    ]
    required: bool
    text: str
    source_refs: list[str]
```

이 모델은 Python Worker 내부에서만 사용한다. 최종 Deck schema의 `speakerNotes` 형식은 변경하지 않는다.

## 6. 슬라이드 유형별 필수 뼈대

### 6.1 표지

필수:

- 발표 주제
- 발표 목적 또는 청중이 얻게 될 내용

선택:

- 발표 순서
- 간단한 배경

### 6.2 일반 본문

필수:

- 핵심 메시지
- 핵심 메시지를 설명하는 근거 또는 원리
- 근거가 실제로 의미하는 바

선택:

- 구체적인 예시
- 예외 또는 주의점
- 다음 슬라이드로 연결하는 문장

### 6.3 비교·데이터

필수:

- 비교 또는 데이터에서 읽어야 할 결론
- 결론을 뒷받침하는 사실 또는 수치
- 발표자가 제공하는 해석

선택:

- 추가 지표
- 보조 사례
- 상세 배경

### 6.4 마무리

필수:

- 발표 전체의 핵심 결론
- 청중이 기억하거나 실행해야 할 내용

선택:

- 앞 내용 요약
- 감사 인사
- Q&A 전환

## 7. Deck 단위 2단계 생성

슬라이드를 한 장씩 목표 분량까지 채우지 않는다. 모든 슬라이드의 필수 뼈대를 먼저 만든 뒤 Deck 전체의 여유 예산을 선택 문장에 배분한다.

### 7.1 1차: 전체 슬라이드의 필수 뼈대 생성

1. 모든 슬라이드에 `core` 문장을 생성한다.
2. 필요한 `evidence`, `interpretation`, `action` 문장을 생성한다.
3. 필수 역할 누락을 검사한다.
4. 출처가 필요한 사실은 `source_refs`와 연결한다.
5. 필수 문장 간 의미 중복을 검사한다.
6. 필수 문장이 중복되면 삭제하지 않고 해당 슬라이드의 관점에 맞게 다시 작성한다.

이 단계에서는 시간 예산을 채우기 위한 선택 문장을 추가하지 않는다.

### 7.2 2차: 여유 예산에 선택 문장 추가

필수 뼈대가 모든 슬라이드에서 통과한 뒤 Deck 전체 글자 수를 계산한다. 목표 발표 시간까지 여유가 있으면 다음 순서로 선택 문장을 추가한다.

1. 근거에 대한 추가 해석
2. 구체적인 예시
3. 적용 방법 또는 주의점
4. 다음 슬라이드로 이어지는 전환

각 문장을 추가할 때마다 전체 글자 수와 예상 발화 시간을 다시 계산한다.

추가할 근거 있는 문장이 없으면 목표보다 짧더라도 생성을 종료한다. 분량을 맞추기 위한 일반론이나 filler를 생성하지 않는다.

## 8. 금지하는 filler

정보를 추가하지 않고 글자 수만 늘리는 문장은 금지한다.

예시:

```text
이 부분은 매우 중요합니다.
다시 한번 핵심을 살펴보겠습니다.
이 슬라이드에서는 내용을 자세히 설명하겠습니다.
이 내용을 꼭 기억해 주세요.
```

위 문장이 특정 사실, 근거 또는 행동과 연결되지 않으면 선택 문장 후보로 사용할 수 없다.

## 9. 분량이 짧을 때의 처리

필수 뼈대가 권장 분량보다 짧으면 다음 순서로 내용을 추가한다.

1. 기존 근거의 의미를 설명하는 문장
2. 출처가 확인된 추가 사실
3. 청중 수준에 맞는 구체적인 예시
4. 실제 적용 방법 또는 주의점
5. 다음 슬라이드와의 전환

추가 후보는 다음 조건을 모두 만족해야 한다.

- 기존 문장과 의미가 중복되지 않는다.
- 슬라이드 내용 또는 출처로 뒷받침된다.
- 완결된 문장이다.
- 해당 슬라이드의 핵심 메시지를 이해하는 데 도움이 된다.

추가할 가치 있는 내용이 없으면 짧은 대본을 허용하고 `SPEAKER_NOTES_SHORT` 경고를 남긴다. 짧다는 이유만으로 Job을 실패시키지 않는다.

## 10. 분량이 길 때의 처리

대본이 권장 분량을 넘더라도 문자 또는 단어 단위로 자르지 않는다.

다음 순서로 처리한다.

1. `transition`, `detail`, `example` 등 우선순위가 낮은 선택 문장을 제거한다.
2. 의미가 반복되는 선택 문장을 제거한다.
3. 필수 문장을 같은 의미의 더 간결한 완결 문장으로 다시 작성한다.
4. 지나치게 긴 한 문장을 여러 개의 짧은 완결 문장으로 분리한다.
5. 그래도 길면 완결된 대본을 유지하고 시간 초과 경고를 남긴다.

필수 문장은 시간 예산을 맞추기 위해 삭제하지 않는다.

Deck 전체가 목표 글자 수의 150%를 초과하면 선택 문장 제거와 필수 문장 압축
재작성을 한 번 수행한다. 이후에도 150%를 초과하면 완결된 대본을 보존하고
경고를 남긴다. 시간 예산만으로 Job을 실패시키지 않는다.

150%는 초기 운영 안전값이며, 실제 생성·리허설 데이터를 기반으로 조정할 수 있다.

## 11. 절단 금지 계약

최종 `speakerNotes` 생성 과정에서 다음 처리를 금지한다.

- 문자열 길이를 기준으로 한 슬라이싱
- 단어를 뒤에서 하나씩 제거하는 처리
- 잘린 문자열 뒤에 마침표를 붙이는 처리
- `...` 추가
- `…` 추가
- 문장의 앞부분만 남기는 처리

최종 대본에 `...` 또는 `…`가 포함되면 품질 검증 실패로 처리한다. 수사적인 생략 표현도 허용하지 않는다.

긴 문장은 다음 중 하나로만 처리한다.

- 문장 전체를 선택 후보에서 제외한다.
- 의미를 유지한 짧은 완결 문장으로 다시 작성한다.
- 여러 개의 짧은 완결 문장으로 분리한다.
- 완결된 상태로 유지하고 시간 초과 경고를 남긴다.

## 12. 중복 제거 계약

### 12.1 선택 문장 중복

선택 문장이 같은 슬라이드 또는 앞 슬라이드의 문장과 중복되면 제거한다. 별도 보강은 필수가 아니다.

### 12.2 필수 문장 중복

필수 문장이 중복되면 최초 문장은 보존하고 이후 중복 문장을 제거한다. 해당
슬라이드에 고유한 문장이 남으면 그대로 생성에 사용한다. 제거 결과 대본이 비면
슬라이드의 핵심 `message`, 제목 기반 핵심 판단 문장 순서로 완결된 fallback
문장을 넣는다. fallback까지 만들 수 없을 때만 최종 품질 오류로 처리한다.

예시:

```text
앞 슬라이드: 트리는 모든 정점이 연결되고 사이클이 없는 그래프입니다.
뒤 슬라이드: 사이클이 없기 때문에 DFS에서는 부모 정점만 제외하면 재방문을 막을 수 있습니다.
```

앞 슬라이드는 정의를 설명하고 뒤 슬라이드는 구현에 미치는 영향을 설명한다.

### 12.3 전역 중복 상태 갱신

슬라이드의 필수·선택 문장 조립과 재작성이 모두 끝난 뒤 최종 문장만 전역 `seen_sentences`에 등록한다. 제거되거나 재작성되기 전 문장을 전역 상태에 등록하면 안 된다.

## 13. 시간 정책

시간과 글자 수는 품질을 훼손하는 강제 제한이 아니라 생성 방향을 제공하는 권장 예산이다.

초기 운영값은 다음과 같다.

| 구간 | 의미 | 처리 |
|---|---|---|
| 목표의 90~110% | 권장 범위 | 정상 |
| 목표의 80% 미만 | 설명 부족 가능성 | 근거 있는 선택 문장 보강 후 경고 |
| 목표의 120% 초과 | 과밀 가능성 | 선택 문장 제거와 압축 재작성 후 경고 |
| Deck 전체 150% 초과 | 비정상적 시간 요구 이탈 | 1회 재작성 후 완결 대본 보존과 경고 |

목표보다 짧은 결과는 필수 뼈대와 품질 계약을 충족한다면 blocking 오류로 처리하지 않는다.

목표보다 긴 결과도 완결성, 근거와 논리가 정상이라면 blocking 오류로 처리하지
않는다. Deck 전체 150% 초과도 동일하게 경고로 관측한다.

## 14. 품질 검증과 시간 검증 분리

### 14.1 품질 검증: blocking

다음 문제는 안전한 대본을 반환할 수 없으므로 최종 Job을 성공시키면 안 된다.

- 대본이 비어 있다.
- 문장이 중간에서 끝난다.
- `...` 또는 `…`가 포함된다.
- 출처가 필요한 사실에 근거가 없다.
- 최종 문자열과 `actualSpeakerNotesChars`가 일치하지 않는다.

필수 역할 누락, filler, 의미 반복과 메시지 소유권 문제는 한 번 보정하고 결정적
복구를 적용한다. 이후에도 일부가 남지만 완결되고 근거가 안전한 대본이 있으면
Job을 성공시키고 경고를 남긴다.

### 14.2 시간 검증: non-blocking

다음 문제는 경고와 예상 발화 시간으로 사용자에게 알린다.

- 슬라이드별 목표의 90% 미만
- 슬라이드별 목표의 110% 초과
- Deck 예상 발표 시간이 사용자 목표보다 짧거나 김

### 14.3 시간 초과의 처리

Deck 전체가 목표 글자 수의 150%를 초과하고 한 번의 선택 문장 제거와 압축
재작성 후에도 초과하면 완결된 대본을 유지하고 경고를 남긴다.

## 15. 최종 조립 순서

```text
1. 모든 슬라이드의 필수 문장 생성
2. 필수 역할 누락 검사
3. 출처 근거 검사
4. 필수 문장 중복 검사 및 관점 변경 재작성
5. Deck 전체 필수 뼈대 글자 수 계산
6. 남은 권장 예산 계산
7. 근거 해석 문장 추가
8. 예시 문장 추가
9. 적용·주의점 문장 추가
10. 전환 문장 추가
11. 선택 문장 중복 제거
12. 과밀 시 선택 문장부터 제거
13. 필요한 경우 완결 문장 압축 또는 분리
14. 불완전 문장 검사
15. 생략 부호 검사
16. 필수 메시지 보존 검사
17. 출처 없는 사실 검사
18. actualSpeakerNotesChars 계산
19. 예상 발화 시간과 경고 계산
20. 최종 speakerNotes 저장
```

## 16. 예시

주제는 `트리 알고리즘 풀이 팁`이고 슬라이드의 핵심 메시지는 `무방향 트리 탐색에서는 부모 정점으로 돌아가지 않도록 처리해야 한다`고 가정한다.

### 16.1 필수 뼈대

```text
트리는 모든 정점이 연결되고 사이클이 없는 그래프입니다.
무방향 트리에서는 자식에서 부모로 돌아가는 간선도 인접 리스트에 포함됩니다.
따라서 DFS에서는 parent 인자를 사용하거나 visited 배열로 재방문을 막아야 합니다.
```

역할:

- `core`: 트리의 정의
- `evidence`: 무방향 인접 리스트의 특성
- `interpretation`: 구현에 필요한 처리

### 16.2 여유 예산이 있는 경우

```text
예를 들어 1번에서 2번으로 이동한 뒤 다시 1번을 방문하면 재귀가 끝나지 않습니다.
서브트리 크기처럼 부모 관계가 분명한 문제에서는 parent 인자가 가장 간단합니다.
```

예시와 적용 문장을 순서대로 추가한다.

### 16.3 여유 예산이 없는 경우

필수 뼈대만 유지한다. 어떤 문장도 중간에서 자르지 않는다.

## 17. 구현 책임 변경

`services/python-worker/app/ai/generate_deck.py`의 책임을 다음처럼 변경한다.

### `trim_speaker_notes_to_chars()`

- 제거한다.
- 문자 또는 단어 단위 절단 기능을 남기지 않는다.

### `compact_dense_speaker_notes()`

- 선택 문장 제거를 우선한다.
- 필수 문장은 완결 문장 단위로 압축하거나 분리한다.
- 문자열 절단을 수행하지 않는다.

### `enforce_speaker_note_constraints()`

- 문자열 상한 절단 함수가 아니라 최종 품질 검사와 조립 함수로 변경한다.
- 필수 역할 보존, 중복 제거, 생략 부호 금지와 실제 글자 수 기록을 담당한다.

### `validate_slide_timing_plan()`과 `validate_deck_timing_summary()`

- 일반적인 시간 편차는 `blocking=False`로 유지한다.
- Deck 전체 150% 초과도 재작성 후 경고로 처리한다.

## 18. 필수 회귀 테스트

`services/python-worker/tests/test_generate_deck_contract.py`에 다음 계약을 추가한다.

1. 필수 문장이 선택 문장보다 먼저 조립된다.
2. 모든 슬라이드의 필수 뼈대가 만들어진 뒤 선택 문장이 추가된다.
3. 여유 예산이 있을 때만 선택 문장이 추가된다.
4. 상한 초과 시 선택 문장부터 제거된다.
5. 필수 문장은 시간 초과를 이유로 삭제되지 않는다.
6. 어떤 입력에서도 `...`가 생성되지 않는다.
7. 어떤 입력에서도 `…`가 생성되지 않는다.
8. 단일 초장문도 완결 문장으로 재작성되거나 분리된다.
9. 중복된 선택 문장은 제거된다.
10. 중복된 필수 문장은 다른 관점으로 대체된다.
11. 목표보다 짧아도 filler가 추가되지 않는다.
12. 출처가 없는 문장은 보강 후보로 사용되지 않는다.
13. 불완전 문장·생략 부호·출처 위반은 blocking이고 나머지 품질 제약은 복구 후 경고다.
14. Deck 전체 150% 초과 시 1회 재작성한다.
15. 재작성 후에도 Deck 전체 150%를 초과하면 완결 대본을 보존하고 경고한다.
16. `actualSpeakerNotesChars`가 최종 문자열과 일치한다.
17. 최종 확정되지 않은 문장은 `seen_sentences`에 등록되지 않는다.

## 19. 운영 관측

대본 원문은 서버 로그에 남기지 않는다. 다음 수치와 상태만 기록한다.

- `slideOrder`
- `targetChars`
- `actualChars`
- `requiredUnitCount`
- `optionalUnitCount`
- `removedOptionalCount`
- `rewrittenRequiredCount`
- `duplicateRemovedCount`
- `estimatedSeconds`
- `validationCode`

운영 초기에는 다음 지표를 확인한다.

- `SPEAKER_NOTES_SHORT` 발생 비율
- `SPEAKER_NOTES_DENSE` 발생 비율
- 필수 문장 재작성 성공률
- filler 차단 횟수
- Deck 전체 150% 초과율
- 사용자 대본 수동 수정률
- 리허설에서 실제 소요 시간과 예상 시간의 차이

## 20. 구현 범위

최소 구현 범위는 다음 두 파일이다.

- `services/python-worker/app/ai/generate_deck.py`
- `services/python-worker/tests/test_generate_deck_contract.py`

기존 job/queue 파일은 수정하지 않는다. 최종 Deck의 `speakerNotes: string`과 `aiNotes.timingPlan` 형식도 유지하므로 `packages/shared` schema 변경은 필요하지 않다.

추후 내부 `SpeakerNoteUnit`을 외부 API나 저장 계약에 노출하기로 결정하는 경우에만 `packages/shared`와 `docs/contracts.md`를 함께 변경한다.

## 21. MVP 판정

이 계약은 AI 생성 영역의 MVP 필수 품질 기준이다.

발표 대본은 다음 기능의 입력으로 사용된다.

- 에디터의 발표자 메모
- 리허설의 키워드 및 진행 추적
- 실전 발표 화면
- 발표 후 분석과 개선 제안

따라서 문장 절단, 핵심 메시지 누락과 filler 생성은 단순한 시각적 폴리싱 문제가 아니라 후속 기능 전체에 영향을 주는 생성 계약 위반으로 취급한다.

## 22. Deck 서사와 메시지 소유권 계약

### 22.1 생성 순서

`design-pack` 경로의 `NarrativeAgent`는 다음 두 단계를 순서대로 실행한다.

```text
자료·Brief
→ Deck 서사 계획 생성
→ 서사 계획 기반 슬라이드 콘텐츠·대본 생성
→ 전체 대본 검증과 최대 1회 보정
→ 기존 디자인·레이아웃 조립
```

첫 번째 호출은 발표 전체에서 무엇을 어떤 순서로 말할지 정한다. 두 번째 호출은 검증된 서사 계획을 입력으로 받아 슬라이드 콘텐츠와 문장 단위 대본을 만든다. 슬라이드별 대본을 독립적으로 만든 뒤 연결 표현만 덧붙이는 방식은 사용하지 않는다.

### 22.2 의미 초안과 컴파일된 내부 모델

첫 LLM 호출은 ID나 소유권을 포함하지 않는 의미 중심 초안만 반환한다.
초안 모델은 schema에 없는 필드를 허용하지 않는다. 이전 계약의 `message_id`,
`order`, 소유권 필드가 섞여 들어오면 유효한 초안으로 조용히 수용하지 않고
보정 또는 fallback 대상으로 처리한다.

```python
class NarrativeMessageDraft:
    role: Literal["claim", "evidence", "interpretation", "action"]
    text: str
    source_refs: list[str]

class SlideNarrativeBeatDraft:
    purpose_hint: Literal["define", "explain", "demonstrate", "compare", "apply"]
    audience_question: str
    messages: list[NarrativeMessageDraft]
    bridge_intent: str

class DeckNarrativeDraft:
    thesis: str
    opening: str
    closing: str
    beats: list[SlideNarrativeBeatDraft]
```

Python Worker는 이 초안을 다음 실행용 계획으로 컴파일한다.

```python
class NarrativeMessage:
    message_id: str
    role: Literal["claim", "evidence", "interpretation", "action"]
    text: str
    source_refs: list[str]
    introduced_at: int

class SlideNarrativeBeat:
    order: int
    purpose: Literal[
        "introduce",
        "define",
        "explain",
        "demonstrate",
        "compare",
        "apply",
        "conclude",
    ]
    audience_question: str
    owned_message_ids: list[str]
    context_message_ids: list[str]
    bridge_from_previous: str

class DeckNarrativePlan:
    thesis: str
    opening: str
    closing: str
    messages: list[NarrativeMessage]
    beats: list[SlideNarrativeBeat]
```

`GeneratedContentItem`과 `SpeakerNoteUnit`은 내부적으로 `message_refs`를 가진다. 이 값은 해당 문장이나 콘텐츠가 어떤 서사 메시지를 설명하는지 검증하는 용도이며 최종 Deck에는 저장하지 않는다.

### 22.3 초안과 최종 문장의 검증 경계

서사 메시지는 발표의 의미 명세이므로 명사형이나 종결 부호가 없는 표현을 허용한다. 문장 완결성은 최종 `SpeakerNoteUnit`과 `transition`에만 적용한다. 초안 단계에서는 다음을 검사한다.

- 빈 `thesis`, `opening`, `closing`, `audience_question`, 메시지
- `...` 또는 `…`
- 의미가 같은 메시지의 반복
- 확인되지 않은 `source_refs`
- 출처가 없는 `evidence`
- 여러 장인 Deck의 마지막 beat에 포함된 비-`action` 메시지

컴파일된 계획은 다음 불변식을 만족해야 한다.

1. `beats`의 개수와 `order`가 요청된 슬라이드 수와 정확히 일치한다.
2. 여러 장인 Deck의 첫 beat는 `introduce`, 마지막 beat는 `conclude`다.
3. 각 메시지는 `introduced_at`과 같은 한 개의 beat에서만 소유한다.
4. `context_message_ids`는 현재 슬라이드보다 앞에서 소개된 메시지만 참조한다.
5. 첫 beat의 `bridge_from_previous`는 비어 있고, 이후 beat의 연결 문장은 완결된 한 문장이다.
6. 마지막 beat는 앞선 메시지를 문맥으로 회수하며 새 메시지는 `action`만 허용한다.
7. 메시지의 `source_refs`는 확인된 출처 ID의 부분집합이다.
8. 의미가 같은 메시지를 서로 다른 ID로 반복하지 않는다.

### 22.4 Worker 컴파일 규칙과 메시지 소유권

LLM은 `message_id`, `introduced_at`, `order`, `owned_message_ids`, `context_message_ids`를 생성하지 않는다. Worker가 다음 규칙으로 결정한다.

- `order`는 초안 배열 순서로 정한다.
- `message_id`는 전체 순회 순서대로 `m1`, `m2` 형식으로 부여한다.
- 메시지가 포함된 beat가 해당 메시지의 `introduced_at`과 유일한 owner가 된다.
- 여러 장인 Deck의 첫 beat는 `introduce`, 마지막 beat는 `conclude`로 강제한다.
- 한 장짜리 Deck은 `introduce`로 처리한다.
- 중간 beat만 `purpose_hint`를 사용한다.
- 대표 메시지는 `claim → interpretation → evidence → action` 우선순위로 선택한다.
- 일반 beat는 직전 beat의 대표 메시지 하나를 context로 사용한다.
- 마지막 beat는 앞선 모든 beat의 대표 메시지를 context로 사용한다.
- 마지막 beat가 새로 소유하는 메시지는 `action`만 허용한다.

일반 `contentItem`과 대본 문장은 현재 beat의 `owned_message_ids`만 설명한다. 아직 소개되지 않은 미래 슬라이드의 메시지나 다른 슬라이드가 소유한 메시지를 미리 설명하면 안 된다.

`transition`만 이전 beat의 `context_message_ids`와 현재 beat의 `owned_message_ids`를 함께 참조할 수 있다. 마지막 `conclude` beat의 `core`는 앞선 메시지를 요약해야 하므로 문맥 메시지와 현재 행동 메시지를 함께 참조할 수 있다.

`SpeakerNoteUnit.message_refs`는 LLM이 제공하더라도 구조적 메타데이터의 최종
결정권은 Worker에 있다. `transition`과 `conclude core`는 Worker가 각각 필요한
context와 owned 메시지를 다시 계산해 누락된 참조를 보완한다. 일반 unit은 현재
owned 범위 안의 참조만 보존하며, 범위를 벗어난 ID는 제거한다. 대본 본문이 실제
메시지를 설명하는지에 대한 의미 검증은 이 메타데이터 정규화와 별도로 유지한다.

메시지 소유권 위반은 발표 순서가 무너진 구조 오류이므로 한 번 보정하고 Worker가
참조를 다시 계산한다. 이후에도 내부 메타데이터 위반만 남고 최종 대본이 완결되고
근거가 안전하면 대본 생성을 우선해 경고로 반환한다.

### 22.5 purpose별 필수 대본 역할

필수 역할은 다음과 같이 발표 목적을 기준으로 결정한다.

| purpose | 필수 역할 |
|---|---|
| `introduce` | `core`, `interpretation` |
| `define`, `explain`, `demonstrate`, `compare` | `core`, `evidence`, `interpretation` |
| `apply` | `core`, `evidence`, `action` |
| `conclude` | `core`, `action` |

첫 장을 제외한 모든 슬라이드는 위 역할 앞에 필수 `transition`을 둔다. 시간 예산을 초과하더라도 필수 연결 문장을 삭제하거나 자르지 않는다.

첫 장에는 기존 핵심 설명을 보존하면서 필수 `interpretation` 오프닝 문장을 앞에
배치한다. `DeckNarrativePlan.opening`이 다음 조건을 만족하면 문장 단위로 분리해
그대로 사용한다.

- 한두 개의 짧고 완결된 발표 문장이다.
- 첫 문장은 주제와 청중이 얻을 결과를 말한다.
- 다음 문장은 슬라이드 제목을 나열하지 않고 두세 개의 의미 구간을 예고한다.
- `발표 순서는`, `주제로`, `진행 방향`, `이어지는 흐름으로`와 같은 문서체가 없다.
- 서사 메시지의 구체적인 핵심어를 둘 이상 포함한다.

예시는 `오늘은 코딩테스트에서 자주 나오는 트리 탐색을 정리해 보겠습니다. 먼저
트리 문제를 판별하는 기준을 확인하고, DFS와 BFS를 언제 선택해야 하는지 예제와
함께 살펴보겠습니다.`와 같은 형태다.

LLM opening이 이 기준을 만족하지 않으면 추가 호출 없이 Worker가 두 문장으로
대체한다. 첫 문장은 발표 주제를 안내하고, 두 번째 문장은 첫 본문 제목과 마지막
적용 제목만 사용해 범위를 짧게 연결한다. 중간 슬라이드 제목 전체를 이어 붙이지
않는다.

이 오프닝은 미래 메시지의 결론이나 근거를 미리 설명하지 않고 섹션 이름만
예고한다. 따라서 첫 beat의 메시지 소유권은 유지하며, 시간 예산을 이유로 제거하지
않는다. 오프닝 추가로 슬라이드 권장 분량의 120%를 넘더라도 다른 품질 위반이
없으면 LLM 보정을 호출하지 않고 `SPEAKER_NOTES_DENSE` 경고만 남긴다.

### 22.6 transition과 전체 대본 검증

완결되고 구체적인 `bridge_intent`는 컴파일 시 `bridge_from_previous`로 사용한다. 불완전하거나 일반적인 연결 의도는 현재 `audience_question`을 포함한 완결 문장으로 Worker가 대체한다.

최종 `transition`은 `bridge_from_previous`와 문자 그대로 같을 필요가 없다. 다음 조건을 만족하면 자연스러운 재표현을 허용한다.

- 완결된 한 문장이다.
- filler와 생략 부호가 없다.
- `앞서 A를 설명했고 이번에는 B를 살펴보겠습니다`, `이어서`, `앞 슬라이드`처럼
  발표 순서를 해설하지 않는다.
- 이전 개념이 현재 개념의 조건·원인·비교 기준·적용 기준이 되는 관계를 직접
  말하며, 키워드를 따옴표로 나열해 연결 조건만 형식적으로 충족하지 않는다.
- 이전 context 메시지와 현재 owned 메시지를 모두 참조한다.
- `message_refs` 선언뿐 아니라 문장 본문에도 이전·현재 메시지의 구체적인
  핵심어가 각각 포함된다.
- 미래 메시지를 참조하지 않는다.

최종 조립 전에는 기존 문장 완결성, 생략 부호, 출처, filler, 중복과 시간 검증에 더해 다음 항목을 검사한다.

- 모든 슬라이드에 대응하는 narrative beat가 있는가.
- `contentItem`과 대본 문장의 `message_refs`가 소유권 범위 안에 있는가.
- 필수 `transition`이 이전 메시지와 현재 메시지를 실제로 연결하는가.
- 본문 문장이 미래 메시지를 선점하지 않는가.
- 마지막 슬라이드가 새로운 본문 설명을 반복하지 않고 앞선 핵심과 행동을 정리하는가.

문제가 있는 슬라이드는 한 요청으로 묶어 최대 한 번만 보정한다. 최종 대본에
불완전 문장, 생략 부호 또는 출처 위반이 남으면 blocking 오류로 처리한다. 소유권,
순서, 필수 역할과 표현 제약이 남더라도 완결되고 근거가 안전한 대본이 있으면
결과를 유지하고 non-blocking 경고로 관측한다.

### 22.7 1회 보정, 안전 fallback과 blocking 기준

초안의 의미 문제가 있으면 LLM 보정을 최대 한 번 요청한다. 보정 후 남은 구조·형식 문제에는 추가 LLM 호출을 사용하지 않고 다음 fallback을 적용한다.

| 문제 | 처리 |
|---|---|
| 잘못된 목적, 순서, ID, 소유권, context | Worker가 결정적으로 다시 계산 |
| 메시지 종결 부호 누락 | 서사 메시지에서는 허용 |
| 불완전하거나 일반적인 bridge | `audience_question` 기반 완결 transition으로 대체 |
| 의미 중복 | 최초 메시지만 보존 |
| 중복 제거 후 빈 beat | 슬라이드 제목과 사용자 Brief 기반 안전 메시지로 대체 |
| 마지막 beat의 비-`action` 메시지 | `success_criteria` 우선의 closing action으로 대체 |
| provider가 반환한 잘못된 JSON·내부 구조 | 전체 안전 초안으로 대체 |

최종 대본 단위에는 별도의 결정적 구조 복구를 적용한다. 이 복구는 의미나 근거를
새로 만들지 않고 다음 형식 문제만 처리한다.

- 필수 `transition`이 없으면 컴파일된 `bridge_from_previous`를 삽입한다.
- 종결 부호가 없는 `core`, `interpretation`, `action`은 슬라이드 제목과 기존
  문구를 사용해 발표 가능한 완결 문장으로 만든다.
- 누락된 `core`, `interpretation`, `action`은 현재 beat의 소유 메시지 범위에서
  결정적 기본 문장으로 보충한다.
- 불완전한 선택 문장은 제거한다.
- `evidence` 누락과 메시지 소유권 위반은 임의로 사실을 만들지 않고 LLM 보정 후
  경고로 남긴다.
- 출처 위반과 생략 부호는 임의로 복구하지 않고 blocking 검증에 남긴다.

구조 복구는 최초 정규화 뒤와 1회 LLM 보정 뒤에 각각 실행한다. 따라서 보정
응답이 필수 `transition`을 빠뜨리거나 문장 종결 부호를 누락하더라도 근거와
메시지 소유권이 유효하면 추가 provider 호출 없이 완료할 수 있다.

fallback을 사용해도 Job은 성공시키며 기존 `warnings`에 `서사 계획 일부를 안전한 기본 흐름으로 대체해 생성했습니다.`를 한 번 추가한다. 내부에는 fallback 사용 여부와 사유 코드만 저장하고 대본 원문은 로그에 남기지 않는다.

fallback에 사용하는 topic, Brief와 `success_criteria`는 생략 부호와 제어 문자를
제거한 뒤 사용한다. 여러 장의 fallback Deck은 중간 beat를
`define → explain → demonstrate → compare → apply` 흐름에 분산하며, fallback을
이유로 메시지 중복 불변식을 비활성화하지 않는다.

다음 문제만 blocking 처리한다.

| 오류 코드 | 조건 |
|---|---|
| `DECK_NARRATIVE_PROVIDER_FAILED` | provider 예외, 타임아웃 또는 빈 응답 |
| `DECK_NARRATIVE_GROUNDING_FAILED` | 확인되지 않은 `source_refs` 또는 근거 없는 evidence |
| `DECK_NARRATIVE_CONTENT_MISSING` | 사용할 수 있는 핵심 메시지가 없음 |
| `DECK_NARRATIVE_PLAN_FAILED` | 컴파일러가 만든 계획이 내부 불변식을 위반한 프로그램 오류 |
| `SPEAKER_NOTES_QUALITY_FAILED` | 최종 대본에 불완전 문장·생략 부호·출처 위반이 남음 |

필수 역할 누락, filler, 중복, 소유권, 시간 초과만 남으면 Job을 성공시키고
`대본 생성 결과를 우선 보존하고 일부 형식 제약은 안전하게 완화했습니다.` 경고를
한 번 추가한다.

최종 Deck 조립에서도 동일한 정책을 다시 적용한다. 앞 단계에서 놓친 중복은
최종 `speakerNotes`에서 문장 단위로 제거하고, 대본 전체가 비면 슬라이드의 핵심
`message` 또는 제목 기반 완결 문장으로 대체한다. 최종 검증은 중복 자체를 즉시
실패시키지 않고 결정적 복구 후에도 빈 대본이나 불완전 문장이 남을 때만 실패한다.

`DECK_NARRATIVE_PLAN_FAILED`는 복구 가능한 LLM 형식 오류에 사용하지 않는다.

### 22.8 외부 계약 유지

서사 계획, message ID, `message_refs`와 `SpeakerNoteUnit`은 최종 Deck, Job payload, WebSocket payload 또는 외부 API에 노출하지 않는다. 최종 Deck에는 기존과 동일하게 조립된 `speakerNotes: string`만 저장한다.

따라서 이 변경은 Python Worker 내부 AI 생성 방식의 변경이며 다음 계약은 그대로 유지한다.

- `packages/shared`의 Deck schema
- job/queue 구조와 상태값
- 디자인·레이아웃 조립 경로
- legacy 생성 경로의 기존 `speakerNotes` 입력 계약

### 22.9 provider 시간 예산

TypeScript Worker의 `/ai/generate-deck` 요청 상한 300초 안에서 Python Worker가
반드시 응답을 정리할 수 있도록 실제 OpenAI client에는 다음 시간 예산을 적용한다.

- 개별 provider 호출은 최대 60초로 제한한다.
- 하나의 Deck 생성 요청이 공유하는 전체 provider 시간은 최대 240초로 제한한다.
- SDK 자동 재시도는 사용하지 않는다. 의미·구조 보정처럼 계약에 명시된 재호출만
  수행한다.
- provider 타임아웃은 JSON 형식 오류로 간주해 반복하지 않고
  `DECK_PROVIDER_TIMEOUT` 계열의 명시적 오류로 종료한다.
- 남은 60초는 오류 변환, 로그 기록과 HTTP 응답 전달을 위한 여유로 둔다.

이 제한은 주입된 테스트 client와 외부 Deck·Job schema를 변경하지 않는다.

### 22.10 운영 진단 로그

Node Worker의 기존 `pino` Job 로그와 Python Worker의 대본 내부 단계 로그는
`projectId`로 연결한다. Python Worker는 다음 이벤트를 JSON으로 stdout/stderr에
기록한다.

- `ai_deck.speaker_notes.validation`
- `ai_deck.speaker_notes.repair.started`
- `ai_deck.speaker_notes.repair.completed`
- `ai_deck.speaker_notes.repair.failed`
- `ai_deck.speaker_notes.validation.succeeded`
- `ai_deck.speaker_notes.validation.failed`

검증 이벤트의 `stage`는 `normalized`, `deterministic_recovery`,
`post_repair_recovery`, `final_validation` 중 하나다. 슬라이드별로 `order`,
`unitCount`, `requiredRoles`, `presentRequiredRoles`, `incompleteUnitCount`,
`ellipsisUnitCount`, `ungroundedEvidenceCount`, `problemCodes`만 기록한다. 보정
이벤트에는 영향받은 슬라이드 번호와 오류 코드, 응답 슬라이드 번호만 기록한다.

`speakerNotes`, `SpeakerNoteUnit.text`, prompt, provider 응답, 참고자료 본문과 오류
예외의 원문 메시지는 기록하지 않는다. provider 예외는 예외 클래스 이름과
일반화된 오류 문구만 남긴다. 이 규칙은 `docs/conventions/logging.md`의 발표자
script 및 대용량 request/response body 금지 규칙을 따른다.
