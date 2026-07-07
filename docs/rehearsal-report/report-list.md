# 리허설 리포트 목록 페이지

## 개요

`/reports` 경로에서 접근 가능한 두 패널 레이아웃 페이지.
왼쪽에 프로젝트(PPTX 파일) 목록을, 오른쪽에 선택한 프로젝트의 리허설 run 목록을 보여준다.
run을 클릭하면 기존 리포트 상세 페이지(`/rehearsal/:projectId/report/:runId`)로 이동한다.

## 페이지 흐름

```mermaid
flowchart TD
    A[사이드바 리포트 클릭] --> B[/reports]
    B --> C[프로젝트 목록 패치\nGET /api/v1/workspaces/:id/projects]
    C --> D{프로젝트 선택}
    D -->|클릭| E[URL: /reports?project=:projectId]
    E --> F[Run 목록 패치\nGET /api/v1/projects/:id/rehearsals]
    F --> G{Run 선택}
    G -->|succeeded run 클릭| H[리포트 상세\n/rehearsal/:projectId/report/:runId]
    G -->|failed/processing run| I[클릭 비활성 + 상태 배지]
```

## 결정 사항

### 표시 대상 Run
- **모든 status**의 run을 표시: `succeeded`, `failed`, `created`, `uploading`, `processing`
- 단, **클릭은 `succeeded`만 허용** (나머지는 disabled + status badge)

### Run 정렬 및 개수
- `createdAt DESC` (최신순), **프로젝트당 최대 50개**
- 리허설은 발표 준비 기간 동안만 진행되어 수십 개를 넘지 않음 → 페이지네이션 없이 단순 유지

### Run이 없는 프로젝트
- 프로젝트 목록에는 모두 표시, 오른쪽에 "리허설 기록이 없습니다" 메시지 표시

### 선택 상태 유지 방식
- URL query param `?project=:projectId`
- 새로고침해도 선택 상태 유지, 특정 프로젝트 리포트 목록 공유 가능

### PPTX 파일 표현
- `project.title`로 표시 (실제 original_name은 별도 API 호출 필요 → MVP에서는 단순하게 제목 사용)

### 회차 표시
- 최신순 배열에서 역순으로 번호: 3개 run → 3회차(최신), 2회차, 1회차(oldest)

## API

### 신규 엔드포인트

```
GET /api/v1/projects/:projectId/rehearsals
```

응답:
```json
{ "runs": [ { "runId": "run_xxx", "status": "succeeded", "createdAt": "...", ... } ] }
```

- 접근 권한: `projectsService.getAccessibleProject` (기존 패턴 동일)
- 정렬: `createdAt DESC`, 최대 50개

## 파일 구조

```
apps/
  api/src/rehearsals/
    rehearsals.controller.ts   ← GET /api/v1/projects/:projectId/rehearsals 추가
    rehearsals.service.ts      ← listRuns(projectId) 추가
  web/src/
    features/rehearsal/
      RehearsalReportListPage.tsx   ← 신규 페이지 컴포넌트
    components/
      AppSidebar.tsx               ← 리포트 메뉴 버튼 추가
    App.tsx                        ← route "report-list" 추가, /reports 라우팅
    styles.css                     ← .report-list-* 스타일 추가
```

## 미결 사항

- **검색/필터**: run이 많아질 경우 날짜/status 필터 필요 (현재 MVP: 전체 목록)
- **무한 스크롤**: 현재 50개 고정, 빈번한 리허설 사용자는 추후 필요
- **run 삭제**: 현재 미구현, 실패 run이 쌓이면 UX 문제 가능성
