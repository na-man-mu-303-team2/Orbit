# Activity Slides V7 presenter and audience evidence

검증일: 2026-07-17

## 검증 환경

- 실제 PostgreSQL에 저장된 deck, presentation session, activity run, response를 사용했다.
- 발표자 제어 창과 청중 출력 창을 분리해 동일 세션의 상태 전파를 검증했다.
- 청중 출력은 `1440x810`, 발표자 제어 창은 `1440x900` viewport에서 확인했다.

## 검증 결과

- 발표자 제어 창에서 응답 마감 후 청중 출력 반영: `1635ms`
- 결과 공개 후 청중 출력 반영: `1630ms`
- 결과 숨김 후 청중 출력 반영: `1628ms`
- 세 상태 전환 모두 요구사항인 2초 이내에 반영됐다.
- 발표자 화면은 실시간 응답 수와 평균 평점, canonical 청중 참여 링크를 표시한다.
- 상태별 primary command는 `응답 열기`, `응답 마감`, `결과 공개`, `결과 숨기기` 중 정확히 하나만 노출된다.
- 청중 결과 화면은 공개 projection만 사용하며 응답 수, 평균 평점, 승인된 주관식 결과만 렌더링한다.
- 청중 출력 DOM에서 pending text, private display name, raw field name, 발표자 script sentinel이 모두 검출되지 않았다.
- Activity 현재 슬라이드는 발표자 preview와 청중 출력 모두에서 16:9 비율로 렌더링됐다.

## 자동화 검증

- shared public projection schema와 sentinel privacy test
- API public result endpoint controller test
- presenter command state mapping test
- audience renderer public-result/privacy test
- web, API, shared typecheck/lint/test

## 스크린샷

- `presenter-activity-results-1440x900.png`
- `audience-display-results-1440x810.png`
