# Audience Engagement Codex Workflow

## What This Provides

This workflow lets Codex continue a long Audience Engagement implementation without requiring a human to paste a full instruction block after every milestone.

The workflow is made of:

- `docs/plans/audience-engagement-execution-protocol.md`: the durable execution rules Codex must follow.
- `docs/plans/audience-engagement-progress.md`: the persistent state store and resume checkpoint.
- `pnpm audience:checkpoint`: a local checkpoint validator.
- The short goal prompt in the execution protocol.

## How To Start

Start Codex with the short prompt from `audience-engagement-execution-protocol.md`.

Codex should then:

1. Read the execution protocol.
2. Read the latest resume checkpoint.
3. Start the next milestone.
4. Write milestone progress to `audience-engagement-progress.md`.
5. Continue until Milestone 11 is complete.

## How To Resume After Compaction

Use a short resume prompt:

```md
Continue the Audience Engagement goal.
Follow `docs/plans/audience-engagement-execution-protocol.md`.
Resume from the latest checkpoint in `docs/plans/audience-engagement-progress.md`.
```

Codex must not depend on old chat context. The progress file and repository state are authoritative.

## Checkpoint Validation

Run:

```bash
pnpm audience:checkpoint
```

The validator checks that:

- Required workflow files exist.
- The implementation plan still contains Milestones 1-11.
- The progress file has a current top-level resume checkpoint.
- The next milestone is valid.
- The checkpoint branch matches the current git branch when a concrete branch is recorded.
- Commit hashes recorded in the progress file exist locally.

This command does not contact remotes, deploy, read secrets, or modify files.

## When To Use Codex App Automation

Use Codex app automation only when you want this work to resume on a schedule or as a later thread heartbeat. For normal long-running implementation, prefer the goal prompt plus this repository workflow.

If a scheduled automation is created later, its prompt should be the short resume prompt above. The schedule should be chosen by the user, and the automation should still follow the execution protocol and progress checkpoint.
