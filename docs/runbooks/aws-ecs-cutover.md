# AWS ECS production cutover

## Safety boundary

`orbit-main-production` remains the source of the existing VPC, EC2, RDS,
assets/static S3 buckets, and primary CloudFront distribution. Because that
stack is drifted, this migration does not update it while traffic depends on
it.

`infra/aws/main-production-ecs.yaml` creates the additive
`orbit-main-production-ecs` stack. Its initial values are:

- `CandidateServicesEnabled=false`
- blue EC2 `100`, green ECS `0`
- WAF managed rules `COUNT`

Existing stateful resources are parameters, not imports. The initial change set
therefore provisions candidate infrastructure without moving primary traffic
or starting application tasks.

The preparation change set is `foundation-20260724-final-v3`. It was
`CREATE_COMPLETE / AVAILABLE` with 64 `Add` actions and no `Remove` or
`Replacement`. It has not been executed. If the template changes, delete the
stale change set and recreate it from the merged `main` commit:

```powershell
pwsh -File infra/scripts/create-aws-ecs-foundation-change-set.ps1
```

## Preconditions

1. Merge the runtime compatibility PR into `develop`, promote it to `main`,
   and verify the EC2 deployment.
2. Create a manual RDS snapshot. Record its identifier without printing
   credentials.
3. Confirm RDS/S3 retention and enable termination protection on both stacks.
4. Confirm the four `/orbit/production/*` SecureString names exist. Check
   existence only.
5. Re-run baseline drift detection. Stop if a proposed action against existing
   VPC, EC2, RDS, S3, or CloudFront is `Remove` or `Replacement`.
6. Verify quotas for NAT/EIP, Fargate, ALB, ECR, ElastiCache, and ACM.

## Foundation and candidate

After separate execution approval:

1. Execute only the reviewed foundation change set and wait for
   `CREATE_COMPLETE`.
2. Confirm primary CloudFront and listener weights have not changed.
3. Set GitHub production variables from `GitHubEcsDeployRoleArn` and set
   `AWS_ECS_PRODUCTION_STACK_NAME=orbit-main-production-ecs`.
4. Verify private audio uses KMS, Block Public Access, no versioning, and a
   14-day expiration rule. Verify queue Redis is Multi-AZ/no-eviction and
   evidence Redis has no persistence or snapshots.
5. Run `Deploy AWS ECS candidate` from `main` in `plan` mode. Review the
   unexecuted task-definition change set.
6. Rerun it in `activate` mode. The workflow pins all three ARM64 images to the
   same SHA while desired counts remain zero, runs expand-contract migrations,
   activates API `2`, Worker `1`, Python Worker `2`, and verifies health and
   Socket.IO through `candidate.tryorbit.site`.

The ALB accepts HTTPS only from the CloudFront origin-facing prefix list.
`origin-api.tryorbit.site` uses the Seoul certificate; the candidate
distribution reuses the us-east-1 viewer certificate.

## Queue and storage cutover

Before green receives production traffic:

1. Set EC2 `ASYNC_JOB_ADMISSION_MODE=drain` and redeploy. Marked async creation
   endpoints must return `503 ASYNC_JOB_ADMISSION_DRAINING`; reads remain live.
2. Wait 5–15 minutes for BullMQ and PostgreSQL stage claims to drain.
3. Point EC2 at the new queue/evidence Redis TLS endpoints and set
   `S3_ASSETS_BUCKET` plus `S3_PRIVATE_AUDIO_BUCKET`. Keep the existing SSM
   secrets and never print their values.
4. Re-enable admission and verify EC2/ECS share queues and storage.
5. Verify a new private audio write lands in the private bucket and a legacy
   audio object still reads from the assets fallback.

## Traffic gates and rollback

Run `Shift AWS ECS production traffic` at `5`, `25`, `50`, and `100`. Set
`route_primary_cloudfront=true` only on the first shift. It preserves the
distribution behaviors, cookies, aliases, certificate, and static origin while
routing the API origin through the blue/green ALB.

Each shift has a 30-minute health/alarm gate. Failure restores the preceding
listener weights. Inspect ALB 5xx/target health, ECS CPU/memory, queue
depth/age, latency, Socket.IO reconnects, migration errors, and private-audio
access at every gate.

- If the ALB path fails, restore the primary CloudFront API origin to its
  recorded EC2 domain.
- Restore the preceding weights before changing queue/storage settings.
- Migrations remain expand-contract through the rollback window.
- Keep WAF in `COUNT` until sampled requests are reviewed, then use a separate
  change set for `WafMode=BLOCK`.

After 48 hours at 100% green, create a baseline-only change set for RDS
`MultiAZ=true`; stop if it proposes replacement. Keep EC2 warm for seven days
at blue weight `0`, then stop it. Deletion is a separate decision.
