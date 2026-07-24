import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(
  new URL("./assert-cfn-change-set-safe.mjs", import.meta.url),
);

function runChangeSet(resourceChange) {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "orbit-cfn-safe-"));
  const fixturePath = join(fixtureDirectory, "change-set.json");
  writeFileSync(
    fixturePath,
    JSON.stringify({ Changes: [{ ResourceChange: resourceChange }] }),
  );

  try {
    return spawnSync(process.execPath, [scriptPath, fixturePath], {
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
