# Audience Engagement Progress

## Purpose

This file is the durable checkpoint log for Audience Engagement Milestones 1-11. Codex must update this file at each milestone start, each milestone completion, and any blocker.

The top-level `## Current State` and `## Resume Checkpoint` sections are the source of truth after context compaction, thread restart, or interruption. Keep one top-level resume checkpoint and update it in place; append detailed milestone logs below.

## Current State

- Last completed milestone: none
- Next milestone: 1
- Integration branch: `feature/audience`
- Current expected branch: `feature/audience`
- Goal status: not started

## Resume Checkpoint

- Current branch: `feature/audience`
- Next milestone: 1
- Resume first checks:
  - Run `git status --short --branch`.
  - Read `docs/plans/audience-engagement-execution-protocol.md`.
  - Read Milestone 1 in `docs/plans/audience-engagement-implementation-plan.md`.
  - Read relevant product-plan sections for contracts, privacy, entry, realtime, storage, and feature rules.
  - Read `docs/contracts.md` and relevant `packages/shared` schemas before editing shared contracts.
- Blocked: no
- Notes: Implementation has not started. Product and implementation plans are present but currently untracked in git.

## Milestone Log

No milestones have been started yet.

## Progress Entry Template

Use this template for each milestone start:

```md
## Milestone N Start - YYYY-MM-DD

- Branch: `feature/audience-mNN-short-name`
- Scope:
- Acceptance criteria:
- Likely files:
- Verification plan:
- Major risks:
- Resume checkpoint snapshot:
  - Current branch:
  - Next milestone:
  - Resume first checks:
```

Use this template for each milestone completion:

```md
## Milestone N Complete - YYYY-MM-DD

- Milestone branch:
- Local commits:
  - `<hash>` `<message>`
- Merged into `feature/audience`: yes/no
- Change summary:
- Acceptance criteria evidence:
- Self-review:
  - Correctness:
  - Security/privacy:
  - Contract/schema compatibility:
  - Architecture boundary:
  - Missing test risk:
- Verification:
  - `<command>`: pass/fail/not run with reason
- Remaining risks or next milestone carryover:
- Resume checkpoint snapshot:
  - Current branch:
  - Next milestone:
  - Resume first checks:
```

Use this template for blockers:

```md
## Blocked - YYYY-MM-DD

- Current branch:
- Current milestone:
- Blocker:
- Evidence:
- Work completed before blocker:
- User decision needed:
- Resume checkpoint snapshot:
  - Current branch:
  - Next milestone:
  - Resume first checks:
```
