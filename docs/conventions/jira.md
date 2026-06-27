# Jira 추적 규칙

이 문서는 ORBIT 저장소의 Jira 이슈, GitHub 브랜치, 커밋, PR 연결 기준을 정의한다.
필수 규칙과 충돌하면 `AGENTS.md`를 우선한다.

## 이슈 키

- Jira 이슈 키는 `PPT-123` 형식을 기본으로 사용한다.
- 다른 Jira 프로젝트 키를 쓰는 경우에도 `ABC-123`처럼 대문자 프로젝트 키와 숫자 ID를 사용한다.
- 브랜치명, PR 제목, 커밋 메시지에는 같은 Jira 이슈 키를 포함한다.

## 브랜치

브랜치 이름은 다음 형식을 사용한다.

```text
feature/PPT-123-slide-control
fix/PPT-124-keyword-detection
docs/PPT-125-api-contract
```

## 커밋

커밋 메시지 제목에는 Jira 이슈 키를 포함한다.

```text
feat: PPT-123 실시간 슬라이드 제어 추가
fix: PPT-124 누락 키워드 중복 알림 수정
docs: PPT-125 발표 컨텍스트 API 명세 정리
```

Smart Commit으로 Jira 상태를 직접 전환하지 않는다. 리뷰와 CI를 거치기 전에 이슈가 완료될 수 있으므로 상태 전환은 Jira Automation에서 처리한다.

## PR

PR 제목은 작업 범위의 최상위 Jira 이슈 키와 제목으로 작성한다.
하위 작업을 처리하는 PR이라도 제목에는 모든 하위 작업 키를 나열하지 않고 부모 또는 최상위 이슈를 사용한다.

```text
[ORBIT-2] 프로젝트 뼈대와 로컬 실행 환경 만들기
```

PR 본문에는 다음 항목을 남긴다.

- 완료한 Jira 이슈
- 변경 요약
- 테스트/검증 내용
- 영향 범위

`완료한 JIRA 이슈` 섹션에는 PR merge 시 완료 전환할 이슈를 `[이슈키] 제목` 형식으로 적는다.
부모 이슈와 하위 작업을 모두 완료해야 하는 경우 모두 명시한다.

```markdown
## 완료한 JIRA 이슈

- [ORBIT-2] 프로젝트 뼈대와 로컬 실행 환경 만들기
- [ORBIT-62] 환경
- [ORBIT-63] 화면
- [ORBIT-64] API
- [ORBIT-65] 작업큐
- [ORBIT-66] Python
- [ORBIT-67] 공유 타입
- [ORBIT-68] 테스트
```

`Jira Link` 워크플로의 `jira-link` 체크는 PR 제목과 source branch에 같은 Jira 이슈 키가 있는지 검증한다.

## Jira와 GitHub 연결

Jira site admin과 GitHub organization owner가 GitHub for Atlassian 앱을 설치하고 ORBIT 저장소를 연결한다.
연결 후 Jira는 브랜치, 커밋, PR 정보를 이슈의 Development 영역에 표시한다.

연결 후 팀은 다음 조건을 지킨다.

- GitHub source branch에 Jira 이슈 키를 포함한다.
- GitHub PR 제목에 같은 Jira 이슈 키를 포함한다.
- 커밋 메시지 제목에 같은 Jira 이슈 키를 포함한다.

## Jira Automation

가능하면 Jira에서 GitHub for Atlassian 앱의 개발 이벤트를 직접 트리거로 사용한다.

```text
Rule name: Complete issue when GitHub PR is merged
Trigger: Pull request merged
Condition: Linked issue exists
Condition: Target branch is main or develop
Condition: Issue status is not Done/완료
Action: Transition issue to Done/완료
```

Jira Data Center에서 `Pull request merged` 트리거가 보이지 않으면 수신 웹후크 방식으로 만든다.

```text
Rule name: ORBIT PR merge 시 완료 전환
Trigger: 수신 웹후크
Trigger option: 웹후크 HTTP POST 본문에서 제공되는 이슈
Action: 이슈를 다음으로 전환
Status: 완료
```

GitHub Actions에는 `JIRA_AUTOMATION_WEBHOOK_URL` repository secret을 추가한다.
`Jira Complete Issue` 워크플로는 PR이 `main` 또는 `develop`에 merge될 때 PR 제목, source branch, PR 본문의 `완료한 JIRA 이슈` 섹션에서 Jira 이슈 키를 찾아 Jira 웹후크에 `{"issues":["ORBIT-123"]}` 형식으로 전달한다.
PR 본문의 다른 섹션에 적힌 Jira 이슈 키는 자동 완료 대상으로 보지 않는다.
웹후크 URL은 저장소 파일에 쓰지 않는다.

프로젝트의 실제 workflow 상태명이 `Done`이 아니라 `완료`, `Resolved`, `Closed` 등인 경우 해당 프로젝트의 완료 상태로 전환한다.
전환에 Resolution 필드가 필요한 workflow라면 action에서 Resolution을 함께 설정한다.

## 상위 Jira 작업 요청 처리

사용자가 `ORBIT-7 환경변수 검증과 예시 파일 정리하기 작업해줘`처럼 상위 Jira 작업 키와 제목을 주면 다음 흐름을 기본으로 진행한다.

1. 상위 Jira 이슈의 설명, 완료 기준, 확인 방법, 하위 작업을 확인한다.
2. 하위 작업 범위까지 포함해 필요한 구현을 진행한다.
3. 완료 기준의 확인 명령을 우선 실행하고, 실패하면 수정 후 재검증한다.
4. 추가로 변경 범위에 맞는 repo 검증 명령을 실행한다.
5. PR 제목은 상위 Jira 이슈 기준으로 `[ORBIT-7] 환경변수 검증과 예시 파일 정리하기` 형식을 사용한다.
6. PR 본문의 `완료한 JIRA 이슈` 섹션에는 상위 이슈와 완료되는 하위 작업을 `[이슈키] 제목` 형식으로 모두 적는다.
7. PR 대상은 `develop`으로 만들고, 필수 checks 통과 후 병합한다.

## GitHub branch protection

`main`과 `develop` 브랜치에는 다음 보호 규칙을 적용한다.

- Require a pull request before merging
- Require status checks to pass before merging
- Required checks:
  - `typescript`
  - `python-worker`
  - `compose-config`
  - `jira-link`
- Do not allow force pushes
- Do not allow deletions

이 설정이 적용되면 Jira 이슈 완료 기준은 단순 push가 아니라 PR 리뷰, 필수 CI 통과, `main` 또는 `develop` 병합이 된다.
