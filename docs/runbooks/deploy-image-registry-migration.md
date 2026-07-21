# 배포 속도 개선: CI 이미지 빌드 → 레지스트리 → pull 전환 계획

## 목표

backend 이미지(`api`·`worker`·`python-worker`)를 **CI에서 1회 빌드 → 컨테이너 레지스트리 push → AWS 운영·개인 staging 양쪽이 pull**하도록 전환한다. 배포 시점의 **온박스 빌드를 제거**하여 배포 단계를 "빌드 수 분" → "pull 수십 초"로 단축한다.

`main`(AWS 운영)과 `develop`(개인 staging) 양쪽 배포에 모두 적용한다.

## 현재 상태 (검증된 사실)

| 항목 | 내용 | 근거 |
| --- | --- | --- |
| AWS 배포 빌드 | EC2(t4g.large, 2 vCPU)에서 `docker compose build` | `infra/scripts/deploy-aws-ec2.sh:84` |
| 개인 staging 빌드 | self-hosted 러너 박스에서 `docker compose build` | `infra/scripts/deploy-personal-server.sh:68` |
| AWS 배포 브랜치 | `main` (EC2가 git pull) | `infra/aws/main-production-bootstrap.yaml` (`GitHubDeployBranch: main`) |
| 개인 staging 배포 브랜치 | `develop` 계열 | `.github/workflows/deploy-personal-staging.yml` (self-hosted 러너) |
| 레지스트리 캐시 | 없음 (BuildKit cache mount·cache_from·ECR/GHCR 미사용) | Dockerfile/compose 전체 |
| `api`·`worker`·`python-worker` | **env-agnostic** (런타임 env_file 주입, 빌드시 env ARG 없음) → 이미지 공유 가능 | `infra/docker/{api,worker,python-worker}.Dockerfile` |
| `web` | **env-specific** (빌드시 `ARG APP_ENV/API_BASE_URL`을 구움) → 공유 불가 | `infra/docker/web.Dockerfile:20-26` |
| AWS `web` | 컨테이너 아님, GitHub Actions에서 정적 빌드 → S3/CloudFront (이미 온박스 빌드 아님) | `.github/workflows/deploy-aws-production.yml` (`Build static web`) |
| 개인 staging `web` | 컨테이너로 박스에서 빌드 (staging args 주입) | `docker-compose.staging.yml:131-135` |
| 개인 staging env | Doppler (`doppler run --`) | `infra/scripts/deploy-personal-server.sh` |

## 설계 결정

- **레지스트리: GHCR (GitHub Container Registry)**
  - `api`·`worker`·`python-worker`는 env-agnostic이므로 **1회 빌드로 양쪽 환경이 동일 이미지를 pull**한다.
  - 개인 staging은 GitHub self-hosted 러너이므로 `GITHUB_TOKEN`으로 자연스럽게 GHCR pull.
  - AWS EC2는 GHCR read-only 토큰이 필요하며, **SSM Parameter Store(`/orbit/production/*`)에 저장**한다. EC2 인스턴스 역할에 이미 해당 경로 읽기 권한이 있어 **추가 IAM 변경이 불필요**하다 (`main-production-bootstrap.yaml`의 `ssm:GetParameter` 참고).
- **태그: git SHA** (`${{ github.sha }}`) — 불변 태그로 배포가 정확히 해당 커밋의 이미지를 pull.
- **web 처리**
  - AWS `web`: 현재 방식 유지 (GitHub Actions 정적 빌드 → S3). 온박스 빌드가 아니므로 개선 대상 아님.
  - 개인 staging `web`: env별 이미지라 공유 불가. staging 전용 args로 빌드해 GHCR에 **staging 태그**로 push하거나, 초기에는 web만 온박스 빌드를 유지한다(선택).
- **롤백 안전장치**: 두 deploy 스크립트에 기존 `build` 경로를 플래그/주석으로 남겨, 문제 시 즉시 온박스 빌드로 복귀 가능하게 한다.

## 단계별 계획

### Phase 0 — 준비 (담당: 인프라 관리자)

- [ ] GHCR read-only PAT 발급 (`read:packages`)
- [ ] PAT를 SSM Parameter Store `/orbit/production/GHCR_TOKEN` 에 SecureString으로 저장
- [ ] GHCR 패키지 가시성/권한 확인 (조직 `na-man-mu-303-team2`)

### Phase 1 — CI 빌드·push 잡 추가 (담당: repo)

- [ ] `.github/workflows`에 `build-and-push` 잡 신설: `api`·`worker`·`python-worker` 이미지를 `ghcr.io/na-man-mu-303-team2/orbit-<svc>:${{ github.sha }}` 로 build & push
- [ ] BuildKit **GitHub Actions 캐시**(`cache-from/to: type=gha`) 적용 → 빌드 자체도 단축
- [ ] 워크플로우 `permissions`에 `packages: write` 추가 (현재 `contents: read`, `id-token: write`만 있음)
- [ ] `develop` push 시(개인 staging용)와 `main` push 시(AWS용) 모두 이미지가 생성되도록 트리거 정리
- [ ] (선택) 개인 staging `web` 이미지도 staging args로 build & push

### Phase 2 — compose에 `image:` 지정 (담당: repo)

- [ ] `docker-compose.aws.yml`: `api`·`worker`·`python-worker`에 `image: ghcr.io/.../orbit-<svc>:${IMAGE_TAG}` 추가 (`build:`는 로컬 개발용으로 유지하되 배포는 pull 우선)
- [ ] `docker-compose.staging.yml`: `api`·`worker`·`python-worker` 동일 적용, `web`은 정책에 따라 image 또는 build 유지

### Phase 3 — 배포 스크립트 build → pull (담당: repo)

- [ ] `infra/scripts/deploy-aws-ec2.sh`: `docker compose build`(84행) 제거 → `docker login ghcr`(SSM 토큰) + `docker compose pull` + `IMAGE_TAG` 주입으로 변경
- [ ] `infra/scripts/deploy-personal-server.sh`: `docker compose build`(68행) 제거 → GHCR 로그인 + pull로 변경. 기존 `--no-build` 모드(66행)와 정합화
- [ ] `.github/workflows/deploy-aws-production.yml`: 배포 잡이 Phase 1 build-push **완료 후** 실행되도록 의존성 연결, `IMAGE_TAG=${{ github.sha }}` 전달

### Phase 4 — 롤아웃 (담당: 인프라 관리자 + repo)

- [ ] **개인 staging에서 먼저 전환·검증** (리스크 낮은 환경 우선)
- [ ] 정상 확인 후 **AWS 운영 전환**
- [ ] 각 전환 후 스모크 테스트 (로그인·주요 페이지·AI PPT 흐름)

### Phase 5 — 정리 (담당: repo + 인프라)

- [ ] 온박스 빌드 잔재 정리, 관련 runbook 갱신
- [ ] GHCR 이미지 보존 정책(오래된 SHA 태그 정리) 설정

## 역할 분담

| 작업 | 담당 |
| --- | --- |
| 워크플로우·compose·deploy 스크립트 수정 (Phase 1~3) | repo (PR) |
| PAT 발급·SSM 저장, GHCR 권한, 배포 실행·검증 (Phase 0·4) | 인프라 관리자 (권한 필요) |

## 리스크 & 롤백

- **이미지 없는데 pull 시도 → 배포 실패**: 스크립트 전환 전에 **CI push 성공을 먼저 확인**한다.
- **`IMAGE_TAG` 불일치 → 옛 이미지 배포**: git SHA 고정으로 방지.
- **GHCR 인증 실패**: SSM 토큰/`GITHUB_TOKEN` 권한(`read:packages`) 확인. 실패 시 배포 중단되므로 사전 검증.
- **web env 혼동**: 개인 staging `web`은 반드시 staging `API_BASE_URL`로 빌드. AWS `web`은 기존 CI→S3 경로 유지.
- **롤백**: deploy 스크립트에 기존 `build` 경로를 플래그로 남겨 즉시 온박스 빌드로 복귀 가능하게 한다.

## 진행 원칙

- 모든 repo 변경은 **`develop`에서** 진행(feature 브랜치 → `develop` PR) 후, **sync 브랜치로 `main`에 반영**한다. sync 브랜치에서는 코드를 수정하지 않는다.
- 파이프라인 구조 변경이므로 **시연 등 중요 일정 이후 착수**한다.
