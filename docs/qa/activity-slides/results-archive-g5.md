# Activity Slides Gate G5 evidence

검증일: 2026-07-17

## 검증 환경

- 실제 PostgreSQL의 프로젝트, 발표 세션, Activity run, 응답을 사용했다.
- 독립 결과 경로 `/project/:projectId/presentation-sessions/:sessionId/results`를 직접 열고 reload했다.
- 결과 보관 화면은 `1440x900`, `1024x768` viewport에서 확인했다.
- 기존 PR 4 증적인 `editor-desktop-1487x1058.png`, `editor-tablet-1024x768.png`, `audience-satisfaction-form-390x844.png`를 함께 회귀 검수했다.

## 결과 장표와 archive 검증

- 결과 장표는 `sourceActivityId` 하나와 표시 설정만 Deck patch에 저장하며 response, aggregate, session runtime을 복제하지 않는다.
- 원본 삭제, 복제, source 누락, no-run, waiting, presenter-live, public-hidden, public-results 상태 matrix를 editor-core/web test로 검증했다.
- 청중 결과는 공개 projection만 렌더링하고 공개 전에는 실제 aggregate와 주관식 원문을 전달하지 않는다.
- 발표자 결과는 선택 session의 전체 집계를 사용하고, 현재 run 조회는 read-only라 조회만으로 session/run을 생성하지 않는다.
- 직접 URL reload 뒤 session/activity navigation, 집계, 승인된 주관식 원문이 유지됐다.
- 다른 session의 run이 archive 상세에 섞이지 않는 session isolation test를 통과했다.

## 모더레이션과 영구 삭제

- 결과 페이지에서 사전 질문 응답을 `승인 -> 숨김 -> 승인`으로 변경했고 revision과 상태가 즉시 갱신됐다.
- `Tab` 키 이동 뒤 포커스가 native Activity 선택 button에 도달했다. approve/hide/answered와 delete dialog도 native button/textbox로 노출된다.
- owner에게만 `이 세션 결과 영구 삭제` control이 표시되고 editor에게는 표시되지 않는 role test를 통과했다.
- delete dialog는 정확한 세션 이름을 입력하기 전 `영구 삭제` button을 비활성화했다.
- owner delete 뒤 응답·주관식·snapshot이 제거되고 reload 후에도 `결과가 영구 삭제되었습니다.` 상태와 응답 수 0이 유지됐다. 같은 화면에서 delete control은 다시 나타나지 않았다.
- 삭제 뒤 presenter query는 404, public query는 `activity: null`, archive는 `results-deleted`를 반환하는 API test를 통과했다.

## 디자인·접근성 QA

- `1440x900`: session/activity/detail 3열 anatomy가 유지되고 header action, selected state, moderation action의 위계가 구분된다.
- `1024x768`: session/activity를 위쪽 2열로 유지하고 detail을 아래로 내려 horizontal overflow 없이 읽을 수 있다 (`scrollWidth=1024`, `clientWidth=1024`).
- 공식 ORBIT app header, typography, surface, border, semantic status token을 사용했다. 계획의 prototype anatomy만 참고했고 production code에서 `features/mockups` 또는 prototype asset을 import하지 않았다.
- 16:9 editor, 390px audience, 1440/1024 results, keyboard focus, no-overflow 검수에서 P0/P1/P2 결함이 없었다.

## 자동화 검증

- `pnpm --filter @orbit/editor-core test`: 89 tests 통과
- `pnpm --filter @orbit/shared test`: 41 files, 399 tests 통과
- `pnpm --filter @orbit/api test`: 91 files, 399 tests 통과
- `pnpm --filter @orbit/web test`: 165 files, 1113 tests 통과
- shared/API/web typecheck 통과

## 스크린샷

- `results-archive-owner-1440x900.png`
- `results-archive-1024x768.png`
- `results-deleted-owner-1024x768.png`
