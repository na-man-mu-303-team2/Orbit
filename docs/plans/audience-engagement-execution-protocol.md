# Audience Engagement Codex Execution Protocol

## Purpose

This protocol is the durable workflow for implementing Audience Engagement Milestones 1-11 with Codex automation. It keeps long-running work quality stable by making repository files, not chat history, the source of truth.

Codex must follow this file whenever continuing the Audience Engagement goal. If this protocol conflicts with `AGENTS.md`, `AGENTS.md` wins.

## Source Of Truth

Codex must re-read these files at the start of every milestone and after every context compaction:

- `AGENTS.md`
- `docs/plans/audience-engagement-progress.md`
- `docs/plans/audience-engagement-implementation-plan.md`
- `docs/plans/audience-engagement-product-plan.md`
- `docs/contracts.md` when shared contracts, API payloads, jobs, files, or WebSocket payloads are touched
- Relevant `packages/shared` schemas before API, realtime, worker, or web implementation

Conversation history is advisory only. The latest resume checkpoint in `docs/plans/audience-engagement-progress.md` is authoritative for where to continue.

## Automation Goal Prompt

Use this short prompt to start or resume the long-running Codex goal:

```md
Goal: Audience Engagement Milestone 1-11 implementation

Follow `docs/plans/audience-engagement-execution-protocol.md`.
Use `docs/plans/audience-engagement-progress.md` as the source of truth for resume state.

Complete Milestones 1-11 in order. For each milestone, implement, verify, self-review, commit locally, merge locally into `feature/audience`, update the progress file, and continue to the next milestone without a final chat response.

Send the final chat report only after Milestone 11 implementation, final verification, local commits, and the final `feature/audience` local merge are complete.
```

## Automation Loop

Repeat this loop until Milestone 11 is complete.

1. Read Checkpoint
   - Read the latest `## Resume Checkpoint` section in `docs/plans/audience-engagement-progress.md`.
   - Determine the next milestone number.
   - Confirm the current branch and `git status --short --branch`.
   - Do not overwrite unrelated dirty files.

2. Rehydrate Context
   - Read the current milestone section from `audience-engagement-implementation-plan.md`.
   - Read product-plan sections related to the current milestone's UX, privacy, and feature decisions.
   - Read relevant existing code, tests, schemas, migrations, route modules, and UI patterns before editing.
   - For contract changes, read `docs/contracts.md` and the relevant `packages/shared` exports first.

3. Plan Milestone
   - Append a milestone-start entry to the progress file.
   - Include scope, acceptance criteria, likely files, verification commands, and major risks.
   - Split large milestone work into small or medium tasks inside the milestone.

4. Implement
   - Work only inside the current milestone scope.
   - Avoid future milestone implementation except for minimal schemas, stubs, or compatibility hooks required by the current milestone.
   - Keep common contracts ahead of API, realtime, worker, and web implementation.
   - Follow existing repository patterns before adding new abstractions.

5. Verify
   - Run milestone-specific verification from the implementation plan.
   - Run targeted tests for changed shared/API/realtime/web/worker areas.
   - For DB migrations, verify both `pnpm db:migration:run` and `pnpm db:migration:revert`.
   - If a failure is caused by current changes, fix it and rerun the relevant verification.
   - If a failure appears pre-existing, record the evidence in the progress file and still pass targeted verification for the milestone acceptance criteria.

6. Self Review
   - Review `git diff` before committing.
   - Check correctness, security/privacy, contract/schema compatibility, architecture boundary, and missing test risk.
   - Confirm no `.env`, secret, token, cookie, password, credential, build output, cache file, raw audio, transcript, presenter script, file base64, or unrelated user change is staged.

7. Commit And Merge
   - Work from the latest local `feature/audience`.
   - Use a milestone branch such as `feature/audience-m01-contracts`.
   - Create local commits at stable points.
   - Commit messages must follow the commit-convention skill and use `<type>: <한국어 제목>`.
   - After milestone verification and self-review, merge the milestone branch locally into `feature/audience`.
   - Do not fetch, pull, push, create PRs, deploy, or touch remote state without explicit user approval.

8. Write Checkpoint
   - Append the completed milestone report to the progress file.
   - Update the top-level `## Current State` and `## Resume Checkpoint` sections in the progress file.
   - Record branch name, local commit hashes/messages, local merge status, changes, acceptance criteria evidence, verification results, self-review result, remaining risks, and the next resume checkpoint snapshot.
   - Run `pnpm audience:checkpoint` after updating the progress file.

9. Continue
   - Do not send a final response after an intermediate milestone.
   - A short commentary update is allowed so the user can see movement.
   - Immediately start the next milestone from step 1.

## Completion Gate

A milestone is complete only when all of the following are true:

- Each acceptance criterion has implementation evidence and verification evidence in the progress file.
- Relevant schema/API/realtime/UI/DB contracts are validated by tests or targeted verification.
- `git status` and `git diff` were reviewed before commit.
- The milestone branch has a local commit.
- The milestone branch has been locally merged into `feature/audience`.
- `docs/plans/audience-engagement-progress.md` has an updated top-level resume checkpoint for the next milestone.
- `pnpm audience:checkpoint` passes.

The full goal is complete only when Milestones 1-11 are complete, final verification has passed or has documented non-blocking pre-existing failures, all local commits and local merges are done, and the current branch is `feature/audience`.

## Blockers

Stop and ask the user only for actual blockers:

- Remote fetch, pull, push, PR creation, deployment, or external service access is needed.
- A contract, security, privacy, or architecture conflict cannot be resolved from repository documents and code.
- Continuing would overwrite unrelated user changes.
- Required dependency installation or network access is needed and cannot be avoided.
- A verification failure caused by current changes cannot be fixed without changing scope.

When blocked, append a blocked checkpoint to the progress file before asking.

## Final Verification

Milestone 11 must run or explicitly account for:

- `pnpm build`
- `pnpm lint`
- `pnpm test`
- `pnpm test:smoke`
- `docker compose config`
- `cd services/python-worker && uv run pytest`

The final chat response must include the completed milestone range, final branch confirmation, verification results, major local commits/merges, and any non-blocking follow-up.
