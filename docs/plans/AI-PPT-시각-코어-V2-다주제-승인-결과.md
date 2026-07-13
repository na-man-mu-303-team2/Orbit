# AI PPT 시각 생성 코어 V2 다주제 최종 승인 결과

> 기준일: 2026-07-13
> 브랜치: `feature/ai-ppt-visual-core-v2`
> 판정: **최종 승인 완료**

## 1. 결론

`/ai-ppt`의 `program-v2` 생성 경로는 최종 승인 기준을 충족했다.

- 5개 시나리오 모두 요청 장수, `program-v2`, blocking issue 0, 미디어 정책, 품질 Gate 계약 충족
- 제품 공개, 임원 보고, 교육, 제안 발표 4개가 시각 품질 80점 이상
- 리서치 발표 1개는 `BALANCE_WEAK`으로 시각 품질 기준 미달이며 품질 Gate가 발행을 차단
- 발행된 Deck의 Worker validation issue 0
- 브라우저에서 확인 가능한 발행 Deck의 Editor AI 검증 issue 0
- Editor와 PPTX의 슬라이드 수, 텍스트, 이미지 frame 일치
- `recipe-v1`, legacy/template 경로 회귀 없음

최종 상태는 다음과 같다.

```text
AI PPT 시각 생성 코어 V2 구현 완료
다주제 필수 계약 승인 완료
다주제 시각 품질 4/5 승인 완료
research balance와 이미지 의미 적합성 고도화는 후속 backlog
```

## 2. 승인 원칙

- 동일 입력을 반복 생성해 통과 결과를 찾지 않는다.
- 비차단 미학 문제만으로 승인 중 코드를 조정하지 않는다.
- 필수 계약 실패 또는 명확한 기능 회귀만 수정한다.
- 실패 후보는 `jobs.result`에 보존하고 `decks`에는 발행하지 않는다.
- 실제 PPTX 렌더링 결과와 Editor 상태를 함께 확인한다.

최종 승인 중 수정한 필수 계약 결함은 다음과 같다.

1. 리서치 URL citation과 독립 출처 도메인 검증
2. 열거 번호와 발표 근거 수치의 grounding 구분
3. Worker와 Editor의 의도된 다행 label 판정 동기화
4. Vision issue 의미 정규화와 80% advisory Gate
5. 유효한 composition 조합의 과도한 다양성 제약 완화
6. Openverse 공개 이미지의 덱 단위 중복 제외와 전 정책 duplicate Gate
7. 이미지 placeholder 교체 시 animation element 참조 동기화

## 3. 시나리오 결과

| 시나리오 | Project / Job | 결과 | 장수 | 미디어 | 시각 점수 | 판정 |
| --- | --- | --- | ---: | --- | ---: | --- |
| 제품 공개 | `project_7e44405e-7d91-4123-902e-ff3df30cfbc8` / `job_4b6be38d-5811-4a48-9a8b-41663f6f7693` | 성공 | 10 | hybrid 3개 | 84 | 승인 |
| 임원 보고 | `project_0b0d7e5b-4ca7-4cc4-bb75-3f7e6960000c` / `job_430bc268-39c7-4d18-8f42-65b5a0ddc48f` | 성공 | 6 | minimal | 82 | 승인 |
| 교육 발표 | `project_e3d43890-95e5-4f88-81fe-c472470259fd` / `job_1eae5e3e-2000-4123-8003-443ce26f9d93` | 성공 | 6 | AI 이미지 3개 | 85 | 승인 |
| 제안 발표 | `project_59ff77fe-6f1d-45ba-ad12-97c41aa291b3` / `job_324de4ed-6bdf-4305-ad46-ead04eb0d6d6` | 성공 | 6 | 공개 이미지 3개 | 80 | 승인 |
| 리서치 발표 | `project_af847408-e75a-4c38-8c1e-c67f11cae8af` / `job_ef4f7a20-a1b8-4b70-bc49-33b90b8dd27a` | 품질 Gate 실패 | 후보 6 | minimal | 74 | 미달 허용 |

### 3.1 제품 공개

- 요청 10장과 생성·PPTX 10장 일치
- 실제 이미지 3개와 provenance 존재
- 7개 core composition과 light/dark rhythm 확인
- 제품 공개 흐름, 출시 정보, CTA 구성 확인
- Worker validation issue 0, Vision QA 통과
- 현재 테스트 계정은 프로젝트 멤버가 아니어서 최종 브라우저 재진입은 불가했으며, 기존 렌더링과 계약 회귀 테스트로 확인

### 3.2 임원 보고

- 요청 6장과 생성·PPTX 6장 일치
- 결론 우선, 운영 원칙, 위험, 결정 요청 흐름 확인
- 근거 없는 수치 생성 차단 확인
- Worker validation issue 0, Vision QA 1회 통과
- 브라우저에서 6장 모두 Editor AI 검증 issue 0

### 3.3 교육 발표

- 요청 6장과 생성·PPTX 6장 일치
- 개념, 사례, 주의점, 적용, 요약 흐름 확인
- 서로 다른 AI 이미지 3개가 media frame에 배치됨
- Worker validation issue 0, Vision QA 1회 통과
- 브라우저에서 6장 모두 Editor AI 검증 issue 0
- 승인 중 발견한 기존 animation placeholder 참조는 향후 생성 결과에서 asset element로 동기화되도록 수정하고 회귀 테스트로 고정

### 3.4 제안 발표

- 요청 6장과 생성·PPTX 6장 일치
- 문제, 핵심 질문, 운영 구성, 기대 효과, CTA 흐름 확인
- Openverse 공개 이미지 3개의 URL, 저작자, 라이선스 provenance 존재
- 세 이미지의 `sourceAssetUrl`이 모두 다름
- Worker validation issue 0, Vision QA 1회 통과
- 브라우저에서 6장 모두 Editor AI 검증 issue 0

### 3.5 리서치 발표

- 요청 6장과 후보 6장 일치
- `research-first` 1회로 관련 독립 웹 출처 3개 확보
- content, timing, source, blocking validation 계약 충족
- 최종 Vision QA가 3·4·5번 슬라이드에 `BALANCE_WEAK`을 반환
- 최대 2회 bounded repair 후에도 남아 `GENERATE_DECK_VISUAL_QUALITY_GATE_FAILED` 처리
- 후보와 validation은 `jobs.result`에 보존되고 Editor에는 발행되지 않음

이 결과는 필수 계약 실패가 아니라 5개 중 1개에 허용된 시각 품질 미달 사례다.

## 4. 필수 계약 판정

| 계약 | 결과 | 근거 |
| --- | --- | --- |
| 요청 장수 정확성 | 5/5 통과 | 제품 10장, 나머지 후보 6장 |
| `program-v2` 경로 | 5/5 통과 | 모든 승인 payload에 명시 |
| blocking issue 0 | 5/5 통과 | 실패 research도 visual advisory만 존재 |
| unresolved required placeholder 0 | 5/5 통과 | 미디어 사용 Deck은 실제 asset으로 교체 |
| asset provenance | 적용 Deck 3/3 통과 | hybrid, AI 생성, 공개 이미지 ledger 확인 |
| 공개 이미지 exact duplicate 0 | 통과 | provider 제외 목록과 공통 duplicate Gate 적용 |
| quality Gate | 통과 | 성공 4개만 발행, research 후보 비발행 |
| Worker validation | 발행 Deck 4/4 통과 | issue array 0 |
| Editor AI 검증 | 접근 가능 Deck 3/3 통과 | 각 6장 전체 확인 |
| Editor/PPTX 정합성 | 발행 Deck 4/4 통과 | 장수, 텍스트, image frame 렌더링 확인 |
| legacy/template 불변 | 통과 | 전체 Node/Python 회귀 테스트 |
| Saved Design Pack·Brand Kit | 통과 | shared/API/Worker 회귀 테스트 |
| 생성 20장 상한 | 통과 | Web range 회귀 테스트 |
| 21장 이상 편집·export | 통과 | 기존 Python/PPTX 회귀 테스트 |

## 5. 실제 PPTX 검수

검수 파일:

- 제품 공개: `C:\Users\Runner\AppData\Local\Temp\orbit-golden-v2-final-approved-pass-1.pptx`
- 임원 보고: `C:\Users\Public\Documents\ESTsoft\CreatorTemp\orbit-v2-approval\executive.pptx`
- 교육 발표: `C:\Users\Public\Documents\ESTsoft\CreatorTemp\orbit-v2-approval\education.pptx`
- 제안 발표: `C:\Users\Public\Documents\ESTsoft\CreatorTemp\orbit-v2-approval\proposal-final.pptx`

확인 내용:

- 모든 슬라이드 실제 렌더링 성공
- 텍스트 clipping과 canvas overflow 없음
- cover, body, closing의 구조 구분 확인
- 이미지 frame과 crop 유지
- 발표 유형별 narrative와 composition 차이 확인
- PPTX export warning 0

## 6. 자동 검증 결과

- `@orbit/shared`: 197 passed
- `@orbit/ai`: 13 passed
- `@orbit/web`: 628 passed
- `@orbit/api`: 208 passed
- `@orbit/worker`: 63 passed
- Node 합계: 1,109 passed
- Python `ruff check .`: passed
- Python `mypy app`: passed, 19 source files
- Python `pytest --basetemp <isolated>`: 441 passed, 1 dependency deprecation warning
- `pnpm lint`: 17 tasks passed
- Web/API/Worker production build: passed
- `node infra/scripts/check-env.mjs`: passed
- `docker compose config --quiet`: passed
- DB migration: pending migration 0

기본 pytest 임시 폴더는 로컬 공용 경로 권한 문제로 setup error가 발생했으며, 저장소 밖의 격리된 `--basetemp` 경로에서 동일한 441개 전체 테스트가 통과했다.

## 7. 후속 Backlog

### P1

1. research minimal 덱의 좌우 visual balance repair 개선
2. Openverse title·tag relevance를 발표의 구체 대상까지 판정하는 의미 필터 보강
3. 과학관처럼 상위 도메인은 맞지만 세부 주제와 다른 공개 이미지의 Vision 탐지 강화
4. 과거 저장 Deck의 placeholder animation 참조를 정리하는 선택적 repair command
5. 품질 Gate 실패 후보를 읽기 전용으로 비교할 수 있는 운영자 preview

### P2

1. 제안·교육 덱에서 일반적인 명사형 제목을 결론형 제목으로 개선
2. 6장 덱의 closing 문구 구체성 강화
3. 공개 이미지 검색의 동일 저작자·동일 시리즈 편중 완화

## 8. 최종 판정

```text
필수 생성 계약: 5/5 충족
시각 품질 80점 이상: 4/5 충족
발행 Deck Worker issue: 0
접근 가능 발행 Deck Editor AI issue: 0
테스트·lint·build·환경·DB 검증: 통과
원격 push: 미수행
```

따라서 AI PPT 시각 생성 코어 V2의 현재 Goal은 완료로 판정한다.
