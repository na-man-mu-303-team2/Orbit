# 개인 서버 develop 배포 Runbook

## 범위

이 문서는 `develop` 브랜치를 개인 서버에 배포하는 절차를 다룬다.

이 서버는 staging/demo 환경으로만 사용한다. 공식 production 배포 경로가 아니다. 공식 production 목표는 기존 `docs/deployment.md` 기준대로 AWS ECS Fargate이며, web은 S3/CloudFront, 런타임 서비스는 ECS 기준으로 배포한다.

## 서버 기준

- 앱 경로: `/var/www/orbit`
- 런타임 사용자: `orbit`
- 관리자 사용자: `shawn`
- secret 출처: Doppler `orbit / stg`
- 공개 origin: `<SERVER_ORIGIN>` (HTTPS)

## 네트워크 정책

외부 공개 포트:

- `22`
- `80`
- `443`

localhost에만 bind하는 앱 포트:

- `5173`: web
- `3000`: api
- `9000`: MinIO object API. Nginx의 `/assets/` 프록시 upstream으로만 사용한다.

외부에 직접 공개하지 않는 포트:

- PostgreSQL `5432`
- Redis `6379`
- Python worker `8000`
- MinIO console `9001`

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
AUTH_COOKIE_SECURE=
```

HTTPS 예시:

```bash
WEB_ORIGIN=https://example.com
API_BASE_URL=https://example.com/api
S3_PUBLIC_ENDPOINT=https://example.com/assets
PYTHON_WORKER_URL=http://python-worker:8000
AUTH_COOKIE_SECURE=
```

TLS를 붙이기 전의 임시 HTTP demo에서만 다음처럼 `AUTH_COOKIE_SECURE=false`를 둔다. 이 경우 `WEB_ORIGIN`과 `API_BASE_URL`은 모두 `http://`여야 한다.

```bash
WEB_ORIGIN=http://8.230.24.164
API_BASE_URL=http://8.230.24.164/api
S3_PUBLIC_ENDPOINT=http://8.230.24.164/assets
AUTH_COOKIE_SECURE=false
```

실제 서버 전용 값은 repository에 커밋하지 않는다.

개인 서버용 Docker Compose override는 로컬 Redis, MinIO, Python worker를 기준으로 다음 런타임 값을 고정한다.

- storage driver는 MinIO를 사용한다.
- MinIO bucket은 staging local-default validation을 피하기 위해 `orbit-personal-staging`을 사용한다.
- queue driver는 BullMQ를 사용한다.
- Live STT provider는 `sherpa`, browser Live STT engine은 `LIVE_STT_ENGINE`으로 `openai-realtime` 또는 `web-speech`를 선택한다. report STT provider는 Python worker의 현재 지원 범위에 맞춰 `openai`를 사용한다.
- OCR provider는 Python worker 경로를 사용한다.
- AWS Textract는 사용하지 않는다.

Doppler `orbit / stg` 값이 S3, SQS, AWS Transcribe, AWS Textract 기준이어도 개인 서버 override에서 위 값으로 덮어쓴다.

## Nginx

Nginx는 외부 요청을 받는 public entrypoint다.

기대 라우팅:

- `/`: `127.0.0.1:5173`으로 proxy
- `/api/health`: API `/health`로 proxy
- `/api/v1/`: prefix를 유지해 `127.0.0.1:3000`으로 proxy
- `/assets/`: prefix를 제거한 뒤 `127.0.0.1:9000`으로 proxy
- `/socket.io/`: websocket traffic을 `127.0.0.1:3000/socket.io/`로 proxy

`S3_PUBLIC_ENDPOINT=<SERVER_ORIGIN>/assets`를 사용하면 API가 asset URL을 `/assets/<bucket>/<key>` 형태로 반환한다. Nginx는 `/assets/` prefix를 제거해 MinIO의 path-style object URL인 `/<bucket>/<key>`로 전달해야 한다.

예시:

```nginx
location /assets/ {
  rewrite ^/assets/(.*)$ /$1 break;
  proxy_pass http://127.0.0.1:9000;
  proxy_set_header Host $host;
}
```

API는 controller가 `api/v1/...` prefix를 직접 받으므로 `/api/v1/` location의 `proxy_pass`에는 path를 다시 붙이지 않는다.

```nginx
location /api/v1/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
}
```

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

## 자동 배포

`develop`에 merge되면 `.github/workflows/deploy-personal-staging.yml`이 개인 서버 self-hosted runner에서 배포 wrapper를 실행한다.

### GenerateDeck breaking contract cutover

#339 PR 6처럼 Web/API/Worker/Python worker가 공유하는 GenerateDeck request를 호환 shim 없이 축소하는 변경은 일반 자동 배포 대상이 아니다. 현재 배포 script는 queue drain이나 ingress freeze 없이 `docker compose up -d`로 서비스를 교체하므로 mixed-version window를 막지 못한다.

이 변경은 merge 전에 GitHub Environment `personal-staging`에 required reviewer를 임시 설정해 자동 workflow가 승인 대기하도록 만들거나 자동 배포 자체를 중단해야 한다. 둘 다 준비하지 못했다면 PR을 merge하지 않는다.

merge 및 승인 순서는 다음과 같다.

1. PR을 Draft로 유지한다.
2. `personal-staging` required reviewer 또는 자동 deploy workflow 중단을 설정하고 설정 증거를 PR 본문에 남긴다.
3. cutover 담당자·시간·maintenance 전환 방법을 PR 본문에 기록한 뒤 Ready for review로 전환한다.
4. 리뷰와 merge가 끝나면 자동 workflow가 승인 대기 또는 중단 상태인지 확인한다.
5. generate-deck ingress를 maintenance 상태로 전환해 새 요청을 막는다.
6. BullMQ `generate-deck` queue의 `waiting`, `paused`, `delayed`, `prioritized`, `waiting-children`, `active`, `repeat`가 모두 0인지 확인한다.
7. DB에서 `type = 'ai-deck-generation'`이고 `status IN ('queued', 'running')`인 Job이 0인지 확인한다.
8. queue와 DB 증거를 PR 또는 승인 기록에 남긴 뒤 대기 중인 personal staging workflow를 승인해 Web/API/Worker/Python worker를 같은 cutover window에 교체한다.
9. health check를 통과시키고 기존 Web asset/cache를 무효화한 다음 ingress를 재개한다.

production ECS/CloudFront cutover는 이 personal staging runbook으로 대신하지 않는다. production에서도 같은 drain 불변조건을 만족하되 서비스 동시 교체와 cache invalidation은 별도 승인된 배포 계획으로 수행한다.

필수 서버 조건:

- GitHub Actions runner label: `orbit-personal-staging`
- runner 실행 사용자: `orbit-runner`
- 앱 checkout과 Doppler token scope: `/var/www/orbit`
- 배포 wrapper: `/usr/local/sbin/orbit-deploy-personal-staging`
- sudoers 허용 명령: `orbit-runner ALL=(root) NOPASSWD: /usr/local/sbin/orbit-deploy-personal-staging`

배포 wrapper는 다음 형태를 유지한다.

```bash
#!/usr/bin/env bash
set -euo pipefail
exec /usr/bin/sudo -iu orbit /bin/bash -lc 'cd /var/www/orbit && ./infra/scripts/deploy-personal-server.sh'
```

완전 자동 배포가 목표라면 GitHub Environment `personal-staging`에는 required reviewer를 설정하지 않는다. 승인 단계를 두고 싶을 때만 environment protection rule을 추가한다.

## 검증

서버 내부에서 확인한다.

```bash
curl -fsS http://127.0.0.1/api/health
curl -I http://127.0.0.1/
curl -I http://127.0.0.1:9000/minio/health/live
doppler run -- docker compose -f docker-compose.yml -f docker-compose.staging.yml ps
```

외부 브라우저에서는 다음 주소를 확인한다.

```text
<SERVER_ORIGIN>/
<SERVER_ORIGIN>/api/health
<SERVER_ORIGIN>/assets/orbit-personal-staging/
```

## 주의 사항

`APP_ENV=staging`에서는 인증 cookie가 `secure`로 설정된다. 따라서 로그인, 회원가입, 현재 사용자 조회 같은 인증 흐름을 브라우저에서 검증하려면 `<SERVER_ORIGIN>`은 HTTPS여야 한다.

TLS를 붙이기 전의 HTTP endpoint는 기본 health check와 화면 로딩 확인에만 사용한다. HTTP 상태에서 register/login 응답이 성공하더라도 브라우저가 session cookie를 저장하지 않아 이후 인증 요청은 실패할 수 있다.

단, 개인 서버 develop demo에서 HTTPS를 붙이기 전 임시로 인증 흐름을 확인해야 하면 Doppler `orbit / stg`에 `AUTH_COOKIE_SECURE=false`를 둘 수 있다. 이 값은 개인 서버 HTTP demo 전용 예외이며, `WEB_ORIGIN`과 `API_BASE_URL`이 모두 `http://`일 때만 허용된다. production 또는 `https://` staging origin에서는 startup이 실패한다. HTTPS를 적용한 뒤에는 값을 비우거나 `true`로 되돌린다.

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
