# Activity Slides V6 audience mobile evidence

검증일: 2026-07-17

## 검증 결과

- viewport: `390x844`
- 문서 가로 overflow: 없음 (`scrollWidth=390`, `clientWidth=390`)
- rating label touch target: 5개 모두 `48px`
- public session 입장부터 rating·주관식 제출 완료까지 30초 이내
- 제출 후 receipt에서 `응답 수정`을 선택해 revision 2로 저장
- 직접 경로 `/audience/:sessionId/a/:activityId`로 canonical URL 전환 확인
- 새 Activity 활성화 시 미제출 주관식 draft를 유지한 채 `새 참여 장표가 열렸습니다` 배너 표시
- `계속 작성` 선택 뒤에도 draft 원문 유지

브라우저 검증 중 PostgreSQL의 `UPDATE ... RETURNING` 결과 shape와 audience public info join의 모호한 column 참조를 실제 API에서 발견해 회귀 수정했다. 수정 후 run open, response create/update, active activity polling을 같은 로컬 세션에서 다시 확인했다.

## 스크린샷

- `audience-satisfaction-form-390x844.png`
- `audience-satisfaction-receipt-390x844.png`
- `audience-draft-transition-guard-390x844.png`
