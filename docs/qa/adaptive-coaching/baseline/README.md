# Adaptive Coaching UI baseline

## 캡처 조건

- 날짜: 2026-07-11
- 브라우저: Codex in-app browser
- viewport: 1440×900
- 기준 URL: `http://localhost:5174`
- 캡처 후 각 파일을 다시 열어 확인했다.

## 명세 route 확인

명세가 요구한 `/mockup/*` route는 현재 `apps/web/src/App.tsx`에 없다. 따라서 해당 URL은 모두 홈 route로 fallback하며 서로 다른 기준 화면으로 사용할 수 없다. `mockup-*.png` 파일은 이 현행 결함을 증명하는 캡처다.

## 실제 비교 기준

| 화면 | 실제 route | 캡처 | 확인 결과 |
| --- | --- | --- | --- |
| 공식 디자인 시스템 | `/design-system` | `design-system-1440x900.png` | Ink 구조, 한 개의 큰 Lilac surface, editorial typography, pill controls |
| 기존 생성 Brief | `/ai-ppt` | `current-ai-ppt-1440x900.jpg` | 단계형 form과 live preview; 공식 coaching Brief는 이 정보 구조를 재사용하되 디자인 token을 통일해야 함 |
| project editor | `/project/project_demo_1` | `current-project-editor-1440x900.jpg` | 권한 확인 오류 상태만 접근 가능; error surface 기준으로 사용 |
| full rehearsal | `/rehearsal/project_demo_1` | `current-rehearsal-1440x900.jpg` | 집중형 전용 chrome, 항상 보이는 timer/action, legacy blue surface |
| report document | `/report_mockup` | `current-report-mockup-1440x900.jpg` | 의미 결과와 AI 총평 순서가 현 명세와 반대; Top 3를 먼저 추가해야 함 |
| report list | `/reports` | `current-reports-1440x900.jpg` | empty state와 app navigation 기준 |
| project report | `/reports/project_demo_1` | `current-report-project-1440x900.jpg` | 전용 back/action chrome과 no-history 기준 |

## 구현에 적용할 시각 기준

- navigation은 기존 sidebar 또는 집중 화면의 전용 back/exit 패턴을 유지한다.
- 화면당 `h1` 하나, Primary action 하나, 큰 Lilac 작업 면 하나를 사용한다.
- Top 3는 같은 카드 3개가 아니라 하나의 editorial list/plan surface로 만든다.
- semantic success/error는 Success/Danger/Warning token과 text/icon으로 표현하고 Lilac이 대신하지 않는다.
- loading/empty/error/stale/permission/processing/flag-off는 같은 layout 뼈대 안에서 전환해 layout jump를 줄인다.
- 모바일에서는 44px target, 한 열, 가로 overflow 없음, 핵심 action이 viewport 밖으로 잘리지 않게 한다.

