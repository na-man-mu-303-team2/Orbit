# 개인 서버 staging 폐기 기록

## 상태

개인 서버 기반 `develop` staging은 2026-07-27에 폐기됐다. 이 문서는 더 이상 배포 절차가 아니며, 기존 서버나 자격증명을 복구하는 용도로 사용하지 않는다.

폐기 범위:

- GitHub self-hosted runner `orbit-personal-staging`
- GitHub 개인 서버 deploy key와 `personal-staging` Environment
- Doppler `orbit / stg`의 개인 서버 runtime 및 GitHub sync service token
- Doppler에서 GitHub Actions를 호출하던 webhook
- `develop` push의 Doppler sync와 개인 서버 자동 배포
- 개인 서버 설치용 deploy/preflight/wrapper scripts

`.env.staging.example`, `docker-compose.staging.yml`, `infra/env/personal-staging-env-policy.json`은 staging 환경 계약의 정적 검증 자료로만 남는다. 현재 배포 환경, 활성 runner 또는 자격증명이 존재한다는 의미가 아니다.

## 재도입 조건

새 staging 환경이 필요하면 기존 개인 서버 구성이나 폐기한 token을 복원하지 않는다. 다음 항목을 새 decision으로 승인하고 구현한다.

1. 인프라 소유자와 데이터 보존 정책
2. secret store 및 최소 권한 token 수명
3. deploy runner와 실행 권한 경계
4. 배포 승인, 검증, rollback 절차
5. 서버 반납 또는 폐기 시 디스크 초기화 책임

과거 개인 서버의 설치·복구 명령은 Git 이력과 `docs/decision-log.md`의 당시 결정에서만 확인한다.
