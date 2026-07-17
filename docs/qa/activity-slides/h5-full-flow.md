# H5 참여 장표 전체 흐름 검증

- 검증일: 2026-07-17
- 환경: macOS Docker Desktop, 격리 Docker Compose project, Chromium 149
- 명령: `ACTIVITY_E2E_DATABASE_URL=<local test database> pnpm test:activity-slides:e2e`
- 결과: Playwright 1/1 통과, 전용 명령 재실행 24.4초

## 검증 결과

| 영역 | 실제 검증 | 판정 |
| --- | --- | --- |
| create | Activity와 연결 결과 장표 Deck, passcode 세션, run 생성 | 통과 |
| join | 390x844 passcode 입장과 1024x768 public 입장 | 통과 |
| respond | rating, 주관식, 표시 이름 제출과 reload 영수증 복원 | 통과 |
| privacy | 승인 전 audience DOM/JSON 원문·이름 부재, 공개 후 이름 부재 | 통과 |
| moderate/reveal | archive에서 원문 확인·승인, run close/results 전환 | 통과 |
| result slide | 편집기에서 연결 결과 장표 선택, design inspector와 preview 확인 | 통과 |
| archive | 세션 종료 전후 직접 URL, raw 결과와 aggregate-only 상태 확인 | 통과 |
| export | 선택 세션 PPTX Job 성공, 다운로드 파일 `PK` signature 확인 | 통과 |
| isolation | 첫 세션 audience cookie로 두 번째 세션 API 접근 시 401 | 통과 |
| retention | 실제 Worker Job 성공, raw row 0, snapshot 1, 삭제 시각 기록 | 통과 |
| responsive | 390x844 horizontal overflow 없음, 1024x768 public flow | 통과 |

## RED에서 발견해 수정한 결함

실제 PostgreSQL에서 세션 종료 시 동일 timestamp parameter가 interval과 timestamp로 동시에 추론되어 `42P08`이 발생했다. close SQL의 parameter를 `timestamptz`로 명시하고, UPDATE 뒤 canonical session row를 다시 읽어 종료 응답이 완전한 계약을 유지하도록 수정했다. repository 회귀 테스트와 전체 E2E가 수정 경로를 검증한다.

## 보안·데이터 경계

- pending 주관식과 표시 이름은 audience projection과 DOM에 나타나지 않았다.
- 승인된 주관식은 results 상태에서만 public projection에 나타났고 표시 이름은 제거됐다.
- PPTX export는 선택 세션 snapshot을 사용했으며 원본 Deck mutation 없이 완료됐다.
- retention은 snapshot이 존재한 뒤에만 raw response를 삭제했고 archive는 aggregate-only 안내로 전환됐다.
- trace와 실패 screenshot은 테스트 산출물이므로 커밋 대상에서 제외한다.
