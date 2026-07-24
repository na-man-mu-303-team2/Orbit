# ECS single-AZ cutover runbook

## Scope and safety boundary

- ALB requires public subnets in two AZs. Only the public ALB subnet is multi-AZ; NAT, ECS tasks, Redis nodes, and RDS compute stay in `ap-northeast-2a`.
- The existing EC2 path, local Redis volume, CloudFront distribution, and legacy target group stay intact for seven days after ECS reaches 100%.
- No runbook step prints a secret, cookie, Redis value, raw audio, or transcript. Confirm only secret existence and configuration references.
- `infra/aws/main-production-bootstrap.yaml` continues to own the existing EC2/RDS/CloudFront resources. Do not import, replace, or delete them in the new stacks.

## Required approval evidence

1. Record the current application SHA, RDS manual snapshot ID, CloudFront distribution configuration export, and current stack template in the production change record.
2. Run `Plan AWS infrastructure`; inspect the generated change set. It must contain no replacement or deletion of `AWS::RDS::DBInstance`, `AWS::S3::Bucket`, `AWS::CloudFront::Distribution`, or `AWS::EC2::Instance`.
3. Apply a reviewed change set only through `Apply AWS infrastructure`, protected by GitHub environment `production` approval.
4. Deploy `edge-waf-count-mode.yaml` in `us-east-1`, retain Count mode for at least 24 hours, and verify that WAF logging redacts `cookie`, `authorization`, and the origin verification header before a separate Block-mode PR.

## Build and candidate verification

1. Let `Build and push images` copy the exact `main` SHA manifest to ECR and record immutable `@sha256` digests. Supply only those digests to the ECS compute change set.
2. Create the shared-services stack additively: private app subnet A, NAT, S3 gateway endpoint, two TLS Redis nodes, private-audio bucket/KMS, and ECR repositories.
3. Keep `S3_PRIVATE_AUDIO_BUCKET` empty on EC2. After its IAM/KMS policy and bucket are ready, set it only on ECS tasks. New private keys start with `private/`; legacy audio has no prefix and remains readable from the assets bucket.
4. Deploy the ECS compute stack with ALB weights EC2 `100`, ECS `0`. Use a candidate CloudFront distribution for login, Deck save, OOXML sync, export, AI deck, rehearsal audio, legacy audio read, Socket.IO presence, and AI/STT/OCR job smoke tests.
5. Run migrations as one one-off ECS API task from the immutable API digest. Never run migrations from API service startup. During the seven-day rollback window, permit expand-only schema changes; do not automate migration revert.

## Worker handoff and traffic ramp

1. Set `ASYNC_JOB_ADMISSION_MODE=drain` through the approved runtime secret update.
2. Confirm queue and database active counts are zero using read-only operational queries; do not dump values into logs.
3. Replace the ECS Worker task, then resume admission with `accept`. Keep the EC2 Worker in standby until the ECS worker completes smoke verification.
4. Update ALB weights in the reviewed change set: ECS `5%` for 15 minutes, `25%` for 30 minutes, `50%` for 60 minutes, then `100%` for 24 hours. Target-group and target stickiness remain enabled throughout Socket.IO polling.
5. At every stage inspect ALB 5xx, API p95, healthy target count, Job failure/delay, Redis eviction, RDS connections, Socket.IO presence, private audio reads, and legacy audio fallback.

## Abort and rollback

Immediately return ALB weight to EC2 `100` when any of these holds: ALB 5xx is at least 2% for five minutes, ECS healthy target count is zero, new Job failures materially spike, or Redis eviction is observed.

1. ALB rollback: update only target group weights to EC2 `100`, ECS `0`.
2. Worker rollback: drain admission, stop ECS Worker, re-enable EC2 Worker, then resume admission.
3. ALB outage: execute the pre-reviewed CloudFront origin rollback change set to point directly to EC2.
4. Managed Redis outage: only after stopping API writes, copy key/TTL state back to the retained local Redis. Do not delete managed Redis as a recovery action.
5. WAF false positive: detach the WebACL or move the affected rule back to Count mode.

Do not roll back application code before the PR #640 runtime fixes: the safe rollback floor is the fixed version that understands private-audio routing. After seven clean days, remove EC2, local Redis, candidate distribution, and legacy target resources only in a separately approved PR.
