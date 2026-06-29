# Project Membership

## 목적

프로젝트 목록 노출 기준을 `projects.created_by`만으로 판단하지 않고, `project_members` 멤버십 기준으로 판단한다.

이 구조를 사용하면 현재는 생성자가 자기 프로젝트를 볼 수 있고, 이후 초대 기능이 붙었을 때는 초대받은 사용자도 같은 프로젝트를 볼 수 있다.

## 테이블

```sql
CREATE TABLE project_members (
  project_id text NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
```

## 컬럼

| 컬럼 | 의미 |
| --- | --- |
| `project_id` | 접근 가능한 프로젝트 ID |
| `user_id` | 프로젝트에 접근 가능한 사용자 ID |
| `role` | 권한 수준. `owner`, `editor`, `viewer` 중 하나 |
| `status` | 권한 상태. `accepted`만 실제 접근 가능 |
| `created_at` | 멤버십 생성 시각 |

## 현재 동작

- 프로젝트 생성 시 생성자를 `project_members`에 `owner`로 추가한다.
- 프로젝트 생성자의 `status`는 `accepted`로 저장한다.
- 프로젝트 목록 조회는 현재 세션 사용자의 `project_members.status = accepted` row가 있는 프로젝트만 반환한다.
- 기존 프로젝트는 마이그레이션 시 `projects.created_by`를 기준으로 `owner / accepted` 멤버십을 보강한다.
- 권한이 없는 사용자가 접근 권한을 요청하면 `pending` row를 저장한다.

## 이후 확장

초대 기능은 초대받은 사용자에 대한 `project_members` row를 추가하는 방식으로 구현할 수 있다.

최소 초대 동작은 다음과 같다.

```sql
INSERT INTO project_members (project_id, user_id, role, status)
VALUES (:projectId, :userId, 'editor', 'pending');
```

승인하면 `status`를 `accepted`로 변경하고, 거절하면 `rejected`로 변경한다.

```sql
UPDATE project_members
SET status = 'accepted'
WHERE project_id = :projectId
  AND user_id = :userId;
```

초대 이력, 요청자/승인자 감사 로그, 만료 시간 같은 기능이 필요해지면 그때 별도 invitation 테이블을 추가한다.
