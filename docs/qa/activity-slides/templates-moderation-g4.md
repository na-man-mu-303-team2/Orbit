# Activity Slides Gate G4 evidence

검증일: 2026-07-17

## 검증 결과

- 에디터 split add menu에서 `사전 질문`, `실시간 투표`, `만족도 조사` 세 template을 생성했다.
- 만족도 조사는 rating, single choice, multiple choice, free text 문항과 최대 5개 문항의 추가·삭제·순서 변경을 지원한다.
- 실시간 투표를 canonical direct link로 열어 `390x844`에서 응답을 제출했고 horizontal overflow가 없었다 (`scrollWidth=390`, `clientWidth=390`).
- poll 공개 projection은 `results` 전에는 분포를 렌더링하지 않고 reveal 뒤 count/ratio chart만 제공한다.
- 사전 질문을 canonical direct link로 제출한 직후 presenter/editor count와 pending 원문이 갱신됐다.
- 에디터 moderation에서 승인·숨김·답변 완료 control을 keyboard button으로 제공하고, 승인 뒤 상태가 `공개`로 갱신됐다.
- 50개 text fixture에서 150개 moderation button을 렌더링하는 keyboard 회귀 test를 통과했다.
- viewer는 moderation endpoint에 접근할 수 없고 owner/editor의 write 권한만 허용한다.
- 주관식 수정 시 기존 approval이 `pending`으로 되돌아가는 API 회귀 test를 유지한다.

## 자동화 검증

- `pnpm --filter @orbit/api test`: 91 files, 388 tests 통과
- `pnpm --filter @orbit/web test`: 163 files, 1097 tests 통과
- shared/API/web typecheck와 lint 통과

## 스크린샷

- `poll-mobile-receipt-390x844.png`
- `pre-question-moderation-1440x900.png`
