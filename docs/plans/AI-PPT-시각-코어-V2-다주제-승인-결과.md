# AI PPT 시각 생성 코어 V2 다주제 최종 승인 결과

> 기준일: 2026-07-13
> 브랜치: `feature/ai-ppt-visual-core-v2`
> 판정: **최종 승인 보류**

## 1. 판정 요약

`program-v2`의 제품 공개형 Golden Deck은 기존 서비스보다 명확하게 개선됐고 실제 PPTX 렌더 기반 Vision QA, asset provenance, 품질 미달 비발행 경로도 동작한다.

다만 다주제 단발 검증에서 다음 필수 계약이 실패했다.

- 임원 보고와 교육 발표가 최종 Vision Gate를 통과하지 못함
- 제안 발표와 리서치 발표가 웹 리서치 품질 검사에서 Deck 생성 전에 실패함
- 성공 Golden의 Worker issue는 0개지만 Editor 4번 슬라이드에 짧은 라벨 줄바꿈 경고가 남음
- 임원 보고 후보에 입력 근거가 없는 수치가 포함됨

따라서 `5개 Deck 모두 필수 계약 100% 충족`과 `5개 중 최소 4개 시각 품질 80% 이상`을 증명하지 못했다.

## 2. 검증 원칙

- Splatoon Golden 성공 결과를 제품 공개 기준선으로 유지함
- 임원·교육·제안·리서치는 각각 한 번만 생성함
- 통과 결과를 찾기 위한 동일 조건 반복 생성을 수행하지 않음
- 비차단 시각 문제를 위한 composition 또는 디자인 코드 수정을 수행하지 않음
- 품질 실패 후보는 `jobs.result`와 임시 로컬 렌더로만 검사하고 `decks`에 발행하지 않음
- 자동 검증 차단 항목인 타입·환경 example 계약만 별도 보정함

## 3. 시나리오 결과

| 시나리오 | Job 결과 | 장수 | Worker/Vision 결과 | 시각 평가 | 발행 |
| --- | --- | ---: | --- | ---: | --- |
| 제품 공개 | 성공 | 10 | Worker issue 0, Vision passed | 8/10 | 발행 |
| 임원 보고 | 실패 | 후보 6 | `BALANCE_WEAK`, repair 2회 후 실패 | 8/10 | 미발행 |
| 교육 발표 | 실패 | 후보 6 | `IMAGE_CONTENT_MISMATCH`, repair 2회 후 실패 | 9/10 | 미발행 |
| 제안 발표 | 실패 | 없음 | 실제 URL citation 없음 | 평가 불가 | 미발행 |
| 리서치 발표 | 실패 | 없음 | 관련 독립 출처 2개 미충족 | 평가 불가 | 미발행 |

### 3.1 제품 공개

- Job: `job_4b6be38d-5811-4a48-9a8b-41663f6f7693`
- Project: `project_7e44405e-7d91-4123-902e-ff3df30cfbc8`
- 요청 10장과 Editor/PPTX 10장이 일치함
- 실제 이미지 3개와 provenance가 존재함
- 7개 core composition과 light/dark 리듬이 확인됨
- PPTX와 Editor의 제목, 이미지, frame이 시각적으로 일치함
- Editor 4번 슬라이드의 `el_4_program_v2_hub`에 짧은 라벨 줄바꿈 경고가 남아 Worker issue 0과 불일치함

### 3.2 임원 보고

- Job: `job_e5c9a36f-39b4-4a85-8e2b-87110e5a85c2`
- Project: `project_7c632ebb-18bd-4bf9-8c19-47347424c4e6`
- 6개 composition과 dark/light 리듬은 형성됨
- 표지 오른쪽의 의미 없는 색상 면과 빈 공간 때문에 `BALANCE_WEAK`이 남음
- 입력에서 외부 수치를 꾸며내지 말라고 명시했지만 20%, 15%, 10% 같은 근거 없는 지표가 생성됨
- 후보는 `jobs.result`에 보존되고 `decks`에는 저장되지 않음

### 3.3 교육 발표

- Job: `job_c4fe869f-54be-4a50-a59f-bfdfbdf4417d`
- Project: `project_d33bdad5-96bb-42b1-9f24-4e33df6188a9`
- Git과 Pull Request에 관련된 AI 이미지 3개가 적합한 frame으로 배치됨
- cover, diagram, editorial, comparison, closing의 화면 흐름과 가독성은 승인 가능한 수준임
- Vision issue code는 `IMAGE_CONTENT_MISMATCH`지만 message는 teal/amber palette와 이미지 색상 차이를 지적해 code와 원인이 일치하지 않음
- 후보는 `jobs.result`에 보존되고 `decks`에는 저장되지 않음

### 3.4 제안 발표

- Job: `job_96e7fb59-4ef8-475a-a15d-b255bd5d3149`
- Project: `project_965a8109-0563-49ba-931f-d0551175dda5`
- `research-first` 결과에 실제 URL citation이 없어 `WEB_RESEARCH_QUALITY_FAILED`로 종료됨
- 공개 이미지 검색과 composition 단계까지 도달하지 못함

### 3.5 리서치 발표

- Job: `job_1c7caaed-3cef-4b18-9593-2240e373c742`
- Project: `project_cf13d006-aaaa-4e37-be4b-1950e5b5d743`
- 관련 독립 출처 2개를 확보하지 못해 `WEB_RESEARCH_QUALITY_FAILED`로 종료됨
- research profile의 narrative와 시각 결과를 평가할 Deck이 생성되지 않음

## 4. 필수 계약 판정

| 계약 | 판정 | 근거 |
| --- | --- | --- |
| 요청 장수 정확히 충족 | 부분 통과 | 생성된 3개 후보는 요청 장수 충족, 2개는 Deck 미생성 |
| blocking issue 0 | 부분 통과 | Golden은 0, 나머지는 Job 실패 |
| text overflow 0 | 부분 통과 | Golden Worker는 0이나 Editor 경고 1개 존재 |
| unresolved placeholder 0 | 통과 | 발행 Golden과 생성 후보에 잔존 placeholder 없음 |
| 필수 asset provenance | 통과 | 이미지 사용 Deck의 asset provenance 존재 |
| Worker/Editor issue 일치 | 실패 | Golden slide 4의 Editor 전용 줄바꿈 경고 |
| Editor/PPTX 정합성 | 부분 통과 | Golden은 일치, 실패 후보는 Editor 미발행 |
| 품질 실패 비발행 | 통과 | 실패 프로젝트 4개에 `decks` row 없음 |
| legacy/template 불변 | 자동 회귀 통과 | Node/Python 전체 테스트 통과 |
| Saved Design Pack·Brand Kit | 자동 회귀 통과 | Shared/API/Worker 테스트 통과 |
| 생성 20장 상한 | 자동 회귀 통과 | Web 19·20장 range 테스트 통과 |
| 21장 이상 편집·export | 자동 회귀 통과 | Python 21장 이상 PPTX export 테스트 통과 |

## 5. 자동 검증 결과

- `@orbit/shared`: 197 passed
- `@orbit/ai`: 12 passed
- `@orbit/web`: 627 passed
- `@orbit/api`: 208 passed
- `@orbit/worker`: 60 passed
- Python `ruff check .`: passed
- Python `mypy app`: passed, 19 source files
- Python `pytest`: 431 passed, 1 deprecation warning
- Web/API/Worker production build: passed
- `node infra/scripts/check-env.mjs`: passed
- `docker compose config --quiet`: passed
- 별도 임시 DB migration `run -> revert -> run`: passed

## 6. 후속 Backlog

### P0

1. `research-first` 검색 결과의 URL citation과 독립 출처 확보 안정화
2. Worker와 Editor의 짧은 라벨 줄바꿈 판정 동기화
3. topic-only 자료의 근거 없는 수치 생성 차단 및 numeric claim grounding
4. Vision issue code와 message의 의미 일치 검증
5. 시각 품질 80% 승인 정책과 Worker의 모든 Vision warning 차단 정책 정합화

### P1

1. minimal 임원 보고 표지의 무의미한 색상 면 제거 또는 no-media cover 전환
2. `BALANCE_WEAK` repair가 동일한 빈 공간을 유지하지 않도록 composition 전환 보강
3. palette 근접 색상 허용 범위와 이미지 style bible 검증 기준 명시
4. 실패 후보를 운영자용 검수 화면에서 비교할 수 있는 read-only preview 제공

## 7. 최종 결론

`program-v2`의 제품 공개형 vertical slice와 안전한 비발행 경로는 구현됐다. 그러나 다주제 생성 안정성, research-first 출처 확보, Worker/Editor 검증 일치가 완료 조건에 미달한다.

현재 상태는 다음과 같이 기록한다.

```text
AI PPT 시각 생성 코어 V2 기능 구현 완료
제품 공개 Golden 기준선 승인
다주제 최종 승인 보류
```

P0 항목을 해결한 뒤 새로운 대표 입력으로 다주제 단발 승인을 다시 수행해야 한다.
