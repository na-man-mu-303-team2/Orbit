# Decision Log

이 문서는 자동 구현 세션에서 생긴 비자명한 정책, 아키텍처, 데이터 보관, 접근제어, 저장 결정의 기록이다.

## ORBIT-90 API project and asset boundary

- Context: ORBIT-90은 프로젝트 생성과 project-scoped asset upload URL/complete API를 구현한다. 저장소 문서는 1차 스프린트가 임시 사용자 기반 프로젝트 생성에서 시작한다고 정의하며, 인증/워크스페이스 초대 흐름은 별도 선행/인접 작업이다.
- Options considered:
  - 실제 인증/멤버십 모델을 새로 만든다.
  - 모든 workspaceId와 projectId를 허용한다.
  - 기존 `DEMO_USER_ID`, `DEMO_WORKSPACE_ID` 기준으로 임시 boundary를 적용한다.
- Final decision: ORBIT-90에서는 `DEMO_WORKSPACE_ID`만 접근 가능한 workspace로 보고, 생성자는 `DEMO_USER_ID`로 저장한다. project asset API는 project가 이 workspace 안에 있을 때만 허용한다.
- Rationale: 현재 문서화된 1차 스프린트 E2E 시작점과 demo ID 기준을 유지하면서, workspace member가 아닌 사용자 접근을 허용하지 않는다.
- Affected files: `apps/api/src/projects/**`, `apps/api/src/files/**`, `packages/shared/src/projects/project.schema.ts`, `docs/contracts.md`.
- Follow-up review notes: 실제 인증/워크스페이스 membership 구현이 들어오면 demo boundary를 세션 사용자와 membership repository 검증으로 교체한다.

## ORBIT-90 asset upload policy

- Context: ORBIT-10/ORBIT-90은 PDF/DOCX/PPTX/image upload complete와 지원하지 않는 mime type 실패를 요구하지만, 저장소에 명시된 파일 크기 정책은 없다.
- Options considered:
  - 파일 형식과 크기를 제한하지 않는다.
  - 모든 image mime type을 허용한다.
  - MVP 시나리오에 필요한 문서 형식과 주요 이미지 형식만 허용하고 보수적인 크기 제한을 둔다.
- Final decision: PDF, PPTX, DOCX, JPEG, PNG, WebP만 허용하고 단일 파일 최대 크기는 50MiB로 제한한다.
- Rationale: 문서의 검증 시나리오를 충족하면서 저장 비용과 예기치 않은 binary upload surface를 제한한다.
- Affected files: `packages/shared/src/files/file.schema.ts`, `apps/api/src/files/**`, `docs/contracts.md`.
- Follow-up review notes: 제품 정책에서 허용 파일 형식, 이미지 범위, 파일 크기 제한이 확정되면 shared schema와 UI 안내 문구를 함께 갱신한다.

## ORBIT-90 pending asset retention

- Context: upload URL 발급 후 complete가 호출되지 않는 실패 케이스가 명시되어 있다.
- Options considered:
  - upload URL 발급 시 metadata를 저장하지 않는다.
  - pending metadata를 저장하고 complete 시 uploaded로 전환한다.
  - complete 요청에서만 metadata를 최초 저장한다.
- Final decision: upload URL 발급 시 `pending` asset metadata를 저장하고, complete 호출 시 `uploaded`로 전환한다.
- Rationale: complete 누락 상태를 API/DB에서 추적할 수 있고 후속 cleanup job을 붙이기 쉽다.
- Affected files: `apps/api/src/files/**`, `apps/api/src/database/migrations/2026062701000-CreateProjectsAndProjectAssets.ts`.
- Follow-up review notes: pending asset TTL, object existence check, cleanup job은 작업큐 또는 storage adapter 기능이 준비된 뒤 별도 결정한다.
