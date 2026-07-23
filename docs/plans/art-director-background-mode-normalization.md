# Art Director 배경 모드 정규화 계획

**작성일**: 2026-07-14

**상태**: 완료

**실행 이슈**: [#341 Art Director 배경 모드 불일치로 Design Pack Deck 생성 실패](https://github.com/na-man-mu-303-team2/Orbit/issues/341)

**후속 이슈**: [#339 활성 경로 정리와 stage 분리](https://github.com/na-man-mu-303-team2/Orbit/issues/339), [#338 stage Job·staged BullMQ 전환](https://github.com/na-man-mu-303-team2/Orbit/issues/338)

> 이 문서는 확정된 #341 실행 계약이다. GitHub에서는 이 문서 전문을 최신 기준 댓글로 사용하며 기존 댓글은 기준으로 사용하지 않는다.

## 목표

Art Director 응답의 `slides[].backgroundMode`를 canonical source로 고정한다. 중복 표현인 `backgroundSequence`가 달라도 서버가 결정론적으로 다시 만들고, 복구 가능한 불일치만으로 Deck 생성 Job을 실패시키지 않는다.

## 구현 결정

1. `create_design_program()`은 provider의 `output_text`를 `json.loads()`로 파싱한다.
2. payload가 object이고 `slides`가 배열인지 확인한 뒤 다음 값을 덮어쓴다.

   ```python
   payload["backgroundSequence"] = [
       slide["backgroundMode"] for slide in payload["slides"]
   ]
   ```

3. 정규화된 payload를 `DeckDesignProgram.model_validate()`로 검증한다.
4. 기존 model validator는 유지해 slide count, enum, contiguous order와 최종 배경 불변식을 계속 검증한다.
5. 배경 중복 필드 불일치는 provider 재호출 없이 첫 응답에서 복구한다.
6. 잘못된 enum, slide count, order, JSON 구조는 기존처럼 한 번의 bounded provider 재시도 후 `DesignProgramError`로 실패한다.
7. 최종 오류에는 Pydantic payload, provider 원문, 발표 내용이 아니라 재시도 가능한 안전한 사용자 메시지만 포함한다.
8. 같은 PR에서 `docs/contracts.md`에 `slides[].backgroundMode`가 canonical source이고 `backgroundSequence`는 파생값이라는 규칙을 추가한다.

LLM response schema와 `metadata.designProgramSnapshot.backgroundSequence`는 호환성을 위해 유지한다. `backgroundSequence`는 검증된 `slides[].backgroundMode`에서 파생된 값만 downstream으로 전달한다.

## #339·#338 인계 계약

- #341은 #339의 characterization test보다 먼저 완료한다.
- #339는 정규화 로직과 회귀 테스트를 `design_planning.py`로 함께 이동하고 `DesignPlan` 불변조건으로 유지한다.
- #338의 `design-planning` Job은 정규화·검증된 `DesignPlan`을 별도 stage artifact persistence에 저장하고 checkpoint에는 338-2가 정의한 strict locator만 저장한다. 338-0 checkpoint reference allowlist는 빈 객체만 허용한다.
- 배경 중복 필드 불일치는 #338에서 retryable 또는 terminal stage failure로 집계하지 않는다.
- 복구 불가능한 Art Director 응답은 #338에서 `failedStage = "design-planning"`, 안전한 `ART_DIRECTOR_INVALID_RESPONSE` 코드로 기록한다.

## 테스트와 완료 조건

### Python worker

- 서로 다른 `backgroundSequence`와 `slides[].backgroundMode`를 넣으면 첫 provider 호출에서 정상 생성된다.
- 불일치 응답을 연속 fixture로 제공해도 첫 응답에서 복구되어 두 번째 provider 응답을 사용하지 않는다.
- `apply_art_director_context()`, `normalize_design_program()`, `design_program_snapshot()` 이후에도 두 표현이 일치한다.
- 잘못된 enum, slide count, 비연속 order는 계속 거부된다.
- `DeckGenerationOrchestrator`가 mismatch fixture로 최종 Deck을 만들고 snapshot과 모든 slide의 `compositionPlan.backgroundMode`가 일치한다.
- 복구 불가능한 응답 오류에 `validation error`, `input_value`, raw LLM output이 포함되지 않는다.

### Worker와 Web

- Worker contract test는 정규화된 Python 응답을 받아 Job을 `succeeded`로 저장하고 Deck을 한 번만 발행하는지 확인한다.
- `/createdeck` Web test는 성공 Job polling 후 오류를 표시하지 않고 `/project/:projectId`로 이동하는지 확인한다.
- 복구 불가능한 오류는 Web에 내부 Pydantic 문자열이 아니라 안전한 재시도 안내로 표시한다.

### 검증 명령

```bash
cd services/python-worker
uv run ruff check .
uv run mypy app
uv run pytest tests/test_design_program.py tests/test_generate_deck_contract.py
cd ../..
pnpm --filter @orbit/worker test
pnpm --filter @orbit/web test
```

## 변경하지 않는 범위

- `variant`와 `backgroundMode`의 별도 의미
- 공개 GenerateDeck request/response와 Deck schema
- Worker/Web production 처리 흐름
- #339의 레거시 제거와 #338의 queue/checkpoint 구현
