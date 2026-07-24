import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("./assert-cfn-change-set-safe.mjs", import.meta.url),
);

function runChangeSet(
  resourceChange,
  { roleArn, expectedRoleArn } = {},
) {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "orbit-cfn-safe-"));
  const fixturePath = join(fixtureDirectory, "change-set.json");
  writeFileSync(
    fixturePath,
    JSON.stringify({
      RoleARN: roleArn,
      Changes: [{ ResourceChange: resourceChange }],
    }),
  );

  try {
    const arguments_ = [scriptPath, fixturePath];
    if (expectedRoleArn !== undefined) {
      arguments_.push(expectedRoleArn);
    }

    return spawnSync(process.execPath, arguments_, {
      encoding: "utf8",
    });
  } finally {
    rmSync(fixtureDirectory, { force: true, recursive: true });
  }
}

test("rejects protected resource removal", () => {
  const result = runChangeSet({
    Action: "Remove",
    LogicalResourceId: "Database",
    ResourceType: "AWS::RDS::DBInstance",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Database: Remove/);
});

for (const replacement of ["True", "Conditional"]) {
  test(`rejects protected Modify with Replacement=${replacement}`, () => {
    const result = runChangeSet({
      Action: "Modify",
      LogicalResourceId: "Assets",
      Replacement: replacement,
      ResourceType: "AWS::S3::Bucket",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Replacement: ${replacement}`));
  });
}

test("allows protected Modify only when replacement is explicitly false", () => {
  const result = runChangeSet({
    Action: "Modify",
    LogicalResourceId: "Distribution",
    Replacement: "False",
    ResourceType: "AWS::CloudFront::Distribution",
  });

  assert.equal(result.status, 0);
});

test("allows a newly added protected resource", () => {
  const result = runChangeSet({
    Action: "Add",
    LogicalResourceId: "NewBucket",
    ResourceType: "AWS::S3::Bucket",
  });

  assert.equal(result.status, 0);
});

test("rejects a change set without the approved execution role", () => {
  const result = runChangeSet(
    {
      Action: "Add",
      LogicalResourceId: "Cluster",
      ResourceType: "AWS::ECS::Cluster",
    },
    {
      expectedRoleArn:
        "arn:aws:iam::123456789012:role/orbit-cloudformation-execution",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /execution role does not match/);
});

test("rejects an empty expected execution role", () => {
  const result = runChangeSet(
    {
      Action: "Add",
      LogicalResourceId: "Cluster",
      ResourceType: "AWS::ECS::Cluster",
    },
    { expectedRoleArn: "   " },
  );

  assert.equal(result.status, 2);
  assert.match(result.stderr, /must not be empty/);
});

test("rejects a change set using a different execution role", () => {
  const result = runChangeSet(
    {
      Action: "Add",
      LogicalResourceId: "Cluster",
      ResourceType: "AWS::ECS::Cluster",
    },
    {
      roleArn: "arn:aws:iam::123456789012:role/unapproved",
      expectedRoleArn:
        "arn:aws:iam::123456789012:role/orbit-cloudformation-execution",
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /execution role does not match/);
});

test("allows a safe change set using the approved execution role", () => {
  const roleArn =
    "arn:aws:iam::123456789012:role/orbit-cloudformation-execution";
  const result = runChangeSet(
    {
      Action: "Add",
      LogicalResourceId: "Cluster",
      ResourceType: "AWS::ECS::Cluster",
    },
    { roleArn, expectedRoleArn: roleArn },
  );

  assert.equal(result.status, 0);
});

test("workflows require and verify the CloudFormation execution role", () => {
  const planWorkflow = readFileSync(
    ".github/workflows/aws-infrastructure-plan.yml",
    "utf8",
  );
  const applyWorkflow = readFileSync(
    ".github/workflows/aws-infrastructure-apply.yml",
    "utf8",
  );

  assert.match(
    planWorkflow,
    /AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN: \$\{\{ vars\.AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN \}\}/,
  );
  assert.match(
    planWorkflow,
    /--role-arn "\$AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN"/,
  );
  assert.match(
    planWorkflow,
    /assert-cfn-change-set-safe\.mjs change-set\.json "\$AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN"/,
  );
  assert.match(
    applyWorkflow,
    /AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN: \$\{\{ vars\.AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN \}\}/,
  );
  assert.match(
    applyWorkflow,
    /assert-cfn-change-set-safe\.mjs approved-change-set\.json "\$AWS_CLOUDFORMATION_EXECUTION_ROLE_ARN"/,
  );
});
