# 임시 사용자/데모 프로젝트 기준

## 목적

1차 스프린트에서는 ORBIT-9 초대 흐름을 제외한다. ORBIT-8 인증 기능이 추가되었지만, 기존 기능은 고정 임시 사용자, 고정 워크스페이스, 고정 데모 프로젝트 기준으로 계속 연결한다.

## 고정 Demo ID

| 구분 | 값 |
| --- | --- |
| 임시 사용자 ID | `user_demo_1` |
| 임시 워크스페이스 ID | `workspace_demo_1` |
| 임시 프로젝트 ID | `project_demo_1` |
| 임시 덱 ID | `deck_demo_1` |
| 발표 세션 ID | `session_demo_1` |

## 적용 범위

- 프로젝트 생성, 파일 업로드, 덱 편집, AI 생성, 협업, 발표, 리허설, 보고서 기능은 위 Demo ID를 기본값으로 사용한다.
- API 요청/응답, WebSocket 이벤트, Job, Deck JSON에는 필요한 Demo ID를 명시적으로 포함한다.
- 초대 플로우가 없어도 전체 E2E 흐름이 연결되어야 한다.
- 인증 기능과 Demo ID 기반 기능은 분리해 관리하고, Demo ID 제거가 쉽도록 상수 또는 fixture 형태를 유지한다.

## 기본 연결 규칙

```json
{
  "userId": "user_demo_1",
  "workspaceId": "workspace_demo_1",
  "projectId": "project_demo_1",
  "deckId": "deck_demo_1",
  "sessionId": "session_demo_1"
}
```

## 주의 사항

- Demo ID 기반 E2E 시작점은 임시 사용자 기반 프로젝트 생성이다.
- Demo ID 값이 바뀌면 프론트, 백엔드, WebSocket, AI 생성, 리허설/보고서 담당자에게 즉시 공유한다.
- Demo ID는 개발 편의를 위한 임시 계약이며, 실제 권한 모델이나 DB 스키마 확정으로 해석하지 않는다.
