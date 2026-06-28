# 환경변수 규칙

## 파일

- `.env.example`: 로컬 개발 기본값과 필수 키의 기준
- `.env.local`: 실제 로컬 실행값, git에 커밋하지 않음
- `.env.staging.example`: AWS staging 전환 시 필요한 키의 기준
- `.env.production.example`: 운영 배포 시 필요한 키의 기준

로컬 실행 전에는 다음 명령으로 `.env.local`을 만든다.

```bash
cp .env.example .env.local
```

API, worker, web, Python worker는 시작 시 환경변수를 검증한다.
필수 값이 없거나 빈 문자열이면 startup이 실패해야 하며 오류 메시지에는 누락된 env key가 포함되어야 한다.
`APP_ENV=staging` 또는 `APP_ENV=production`에서는 localhost, 로컬 DB/Redis, 로컬 secret placeholder를 그대로 사용하지 않는다.

## driver 값

```txt
STORAGE_DRIVER=minio | s3
JOB_QUEUE_DRIVER=bullmq | sqs
STT_PROVIDER=sherpa | transcribe | openai
OCR_PROVIDER=python | textract
LLM_PROVIDER=openai
```

## OpenAI 기본 모델

OpenAI 모델은 코드 상수가 아니라 env로 결정한다.

```txt
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-transcribe
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

로컬과 테스트에서는 `OPENAI_API_KEY`를 비워둘 수 있지만, staging/production에서는 반드시 secret store에 설정한다.

## Demo ID

Demo ID 기반 기능은 아래 값을 사용한다.

```txt
DEMO_USER_ID=user_demo_1
DEMO_WORKSPACE_ID=workspace_demo_1
DEMO_PROJECT_ID=project_demo_1
DEMO_DECK_ID=deck_demo_1
DEMO_SESSION_ID=session_demo_1
```

Demo ID를 바꿔야 하면 `docs/demo-standards.md`, `.env.example`, `packages/shared`를 함께 수정한다.
