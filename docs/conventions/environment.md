# 환경변수 규칙

## 파일

- `.env.example`: 로컬 개발 기본값과 필수 키의 기준
- `.env.local`: 실제 로컬 실행값, git에 커밋하지 않음
- `.env.staging.example`: AWS staging 전환 시 필요한 키의 기준

## driver 값

```txt
STORAGE_DRIVER=minio | s3
JOB_QUEUE_DRIVER=bullmq | sqs
STT_PROVIDER=sherpa | transcribe | openai
OCR_PROVIDER=python | textract
LLM_PROVIDER=openai
```

## Demo ID

1차 스프린트는 인증 없이 아래 값을 사용한다.

```txt
DEMO_USER_ID=user_demo_1
DEMO_WORKSPACE_ID=workspace_demo_1
DEMO_PROJECT_ID=project_demo_1
DEMO_DECK_ID=deck_demo_1
DEMO_SESSION_ID=session_demo_1
```

Demo ID를 바꿔야 하면 `docs/demo-standards.md`, `.env.example`, `packages/shared`를 함께 수정한다.

