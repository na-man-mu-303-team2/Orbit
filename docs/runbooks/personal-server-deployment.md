# 개인 서버 develop 배포 Runbook

## 범위

이 문서는 `develop` 브랜치를 개인 서버에 배포하는 절차를 다룬다.

이 서버는 staging/demo 환경으로만 사용한다. 공식 production 배포 경로가 아니다. 공식 production 목표는 기존 `docs/deployment.md` 기준대로 AWS ECS Fargate이며, web은 S3/CloudFront, 런타임 서비스는 ECS 기준으로 배포한다.

## 서버 기준

- 앱 경로: `/var/www/orbit`
- 런타임 사용자: `orbit`
- 관리자 사용자: `shawn`
- secret 출처: Doppler `orbit / stg`
- 공개 origin: `<SERVER_ORIGIN>`

## 네트워크 정책

외부 공개 포트:

- `22`
- `80`
- `443`

localhost에만 bind하는 앱 포트:

- `5173`: web
- `3000`: api

외부에 직접 공개하지 않는 포트:

- PostgreSQL `5432`
- Redis `6379`
- Python worker `8000`
- MinIO `9000/9001`

## Doppler

서버는 Doppler `orbit / stg` config에 scoped된 service token을 사용한다.

토큰은 `orbit` 사용자로 앱 디렉터리에서 등록한다.

```bash
sudo -iu orbit
cd /var/www/orbit

read -s -p "Doppler service token: " DOPPLER_SERVICE_TOKEN
echo
printf '%s' "$DOPPLER_SERVICE_TOKEN" | doppler configure set token --scope /var/www/orbit
unset DOPPLER_SERVICE_TOKEN

doppler run -- sh -c 'test -n "$APP_ENV" && echo "doppler ok"'
```

service token은 read 권한만 필요하다.

## 필요한 staging 값

Doppler에는 실제 서버 origin을 기준으로 공개 URL 값을 설정한다.

```bash
WEB_ORIGIN=<SERVER_ORIGIN>
API_BASE_URL=<SERVER_ORIGIN>/api
S3_PUBLIC_ENDPOINT=<SERVER_ORIGIN>/assets
PYTHON_WORKER_URL=http://python-worker:8000
```

예시:

```bash
WEB_ORIGIN=http://example.com
API_BASE_URL=http://example.com/api
S3_PUBLIC_ENDPOINT=http://example.com/assets
PYTHON_WORKER_URL=http://python-worker:8000
```

실제 서버 전용 값은 repository에 커밋하지 않는다.

개인 서버에서는 OCR을 Python worker 경로로 실행한다. AWS Textract는 필요하지 않다.

```bash
OCR_PROVIDER=python
TEXTRACT_ENABLED=false
```

## Nginx

Nginx는 외부 요청을 받는 public entrypoint다.

기대 라우팅:

- `/`: `127.0.0.1:5173`으로 proxy
- `/api/health`: API `/health`로 proxy
- `/api/v1/`: `127.0.0.1:3000/api/v1/`로 proxy
- `/socket.io/`: websocket traffic을 `127.0.0.1:3000/socket.io/`로 proxy

Nginx 설정 변경 후에는 다음 명령으로 문법을 확인하고 재시작한다.

```bash
sudo nginx -t
sudo systemctl restart nginx
```

## 배포

```bash
sudo -iu orbit
cd /var/www/orbit
./infra/scripts/deploy-personal-server.sh
```

## 검증

서버 내부에서 확인한다.

```bash
curl -fsS http://127.0.0.1/api/health
curl -I http://127.0.0.1/
doppler run -- docker compose -f docker-compose.yml -f docker-compose.staging.yml ps
```

외부 브라우저에서는 다음 주소를 확인한다.

```text
<SERVER_ORIGIN>/
<SERVER_ORIGIN>/api/health
```

## 주의 사항

이 배포 경로는 Nginx 또는 앞단 load balancer에서 TLS를 별도로 설정하지 않는 한 HTTP로 동작한다.

MinIO는 기존 named volume과의 호환성을 위해 `docker-compose.yml`의 로컬 개발 root credential을 유지한다. 초기화된 MinIO volume에서 root credential을 바꾸려면 별도 migration 계획이 필요하다.

## Rollback

현재 배포 경로는 source checkout과 Docker Compose rebuild를 사용한다.

수동 rollback이 필요하면 다음 절차를 사용한다.

```bash
sudo -iu orbit
cd /var/www/orbit
git log --oneline --decorate -n 10
git switch develop
git reset --hard <known-good-commit>
doppler run -- docker compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
```

rollback 대상 commit이 확인된 경우에만 실행한다. 의도 없이 공유 브랜치 상태를 되돌리지 않는다.
