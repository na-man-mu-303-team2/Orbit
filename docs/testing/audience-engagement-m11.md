# Audience Engagement M11 Verification

## Scope

Milestone 11 is the final hardening checkpoint for the audience engagement feature. It verifies the feature across shared contracts, API authorization, realtime payloads, web accessibility, Playwright smoke coverage, Python worker Q&A support, and release-readiness commands.

## Automated Coverage

- Shared contracts:
  - `packages/shared/src/audience/audience.schema.test.ts`
  - `packages/shared/src/interactions/interaction.schema.test.ts`
  - `packages/shared/src/realtime/websocket.schema.test.ts`
- API:
  - `apps/api/src/presentation-sessions/presentation-sessions.service.spec.ts`
  - `apps/api/src/presentation-sessions/presentation-sessions.controller.spec.ts`
  - `apps/api/src/presentation-sessions/audience-sessions.controller.spec.ts`
  - `apps/api/src/realtime/audience-realtime.gateway.spec.ts`
  - audience DB migration specs under `apps/api/src/database/migrations`
- Web:
  - `apps/web/src/features/audience/AudienceEntrance.test.tsx`
  - `apps/web/src/features/audience/AudiencePresenterPanel.test.tsx`
  - `apps/web/src/features/audience/audienceApi.test.ts`
  - `apps/web/src/features/audience/audienceRealtime.test.ts`
  - `apps/web/src/features/audience/audiencePresenterRealtime.test.ts`
  - `apps/web/src/features/editor/audience-link/audienceLinkApi.test.ts`
- Playwright smoke:
  - `tests/e2e/audience-engagement.spec.ts`
  - `tests/e2e/audience-features.spec.ts`
- Python worker:
  - `services/python-worker/tests/test_qna.py`

## Security Regression Checklist

Audience-facing schemas, REST responses, websocket payloads, and aggregate report payloads must reject or omit these fields:

- `speakerNotes`
- `rawTranscript`
- `rawAudio`
- `presenterScript`
- `apiKey`
- `cookie`
- `password`
- `token`
- `secret`
- `fileBase64`

Presenter-only result endpoints remain under `/api/v1/projects/:projectId/presentation-sessions/:sessionId/*` and require authenticated project access. Audience endpoints remain under `/api/v1/presentation-sessions/:sessionId/audience/*` and do not expose presenter results or survey CSV.

## Accessibility Checklist

- Join screen has labelled join-code and nickname inputs.
- Audience current-slide region has a heading and status text.
- Active Q&A, poll, quiz, reaction, and survey controls use labels, legends, or accessible button names.
- Presenter overlay/control page exposes QR, entry controls, feature toggles, survey setup, reaction strip, and result summaries with readable text labels.
- Error and success states use `role="alert"` or `role="status"` where appropriate.

## Manual Or Environment-Gated Checks

Run these when the local environment has Docker, `uv`, and a browser/dev server available:

```bash
docker compose up -d postgres
pnpm db:migration:run
pnpm db:migration:revert
cd services/python-worker && uv run pytest
pnpm test:smoke
```

If Docker daemon or `uv` is unavailable, record the exact command failure in `docs/plans/audience-engagement-progress.md` and rely on targeted migration/unit coverage until the environment is restored.
