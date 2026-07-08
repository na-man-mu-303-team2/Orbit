import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  protocol: "docs/plans/audience-engagement-execution-protocol.md",
  progress: "docs/plans/audience-engagement-progress.md",
  workflow: "docs/plans/audience-engagement-codex-workflow.md",
  implementationPlan: "docs/plans/audience-engagement-implementation-plan.md",
  productPlan: "docs/plans/audience-engagement-product-plan.md",
};

const failures = [];

function readRequired(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function latestResumeCheckpoint(progress) {
  const marker = "## Resume Checkpoint";
  const index = progress.lastIndexOf(marker);
  if (index === -1) {
    return "";
  }

  return progress.slice(index);
}

function parseBacktickValue(section, label) {
  const pattern = new RegExp(`- ${label}:\\s+\`([^\\n\`]+)\``);
  return section.match(pattern)?.[1]?.trim() ?? null;
}

function parsePlainValue(section, label) {
  const pattern = new RegExp(`- ${label}:\\s+([^\\n]+)`);
  return section.match(pattern)?.[1]?.trim() ?? null;
}

function currentBranch() {
  try {
    return execFileSync("git", ["branch", "--show-current"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch (error) {
    failures.push(`Unable to read current git branch: ${error.message}`);
    return "";
  }
}

function commitExists(hash) {
  try {
    execFileSync("git", ["cat-file", "-e", `${hash}^{commit}`], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const protocol = readRequired(files.protocol);
const progress = readRequired(files.progress);
readRequired(files.workflow);
const implementationPlan = readRequired(files.implementationPlan);
readRequired(files.productPlan);

for (let milestone = 1; milestone <= 11; milestone += 1) {
  if (!implementationPlan.includes(`### Milestone ${milestone}:`)) {
    failures.push(`Implementation plan is missing Milestone ${milestone}`);
  }
}

for (const heading of [
  "## Source Of Truth",
  "## Automation Goal Prompt",
  "## Automation Loop",
  "## Completion Gate",
  "## Blockers",
  "## Final Verification",
]) {
  if (!protocol.includes(heading)) {
    failures.push(`Protocol is missing heading: ${heading}`);
  }
}

const checkpoint = latestResumeCheckpoint(progress);
if (!checkpoint) {
  failures.push("Progress file is missing a Resume Checkpoint section");
}

const checkpointBranch = parseBacktickValue(checkpoint, "Current branch");
const nextMilestoneText = parsePlainValue(checkpoint, "Next milestone");

if (!checkpointBranch) {
  failures.push("Resume checkpoint is missing `Current branch`");
}

if (!nextMilestoneText) {
  failures.push("Resume checkpoint is missing `Next milestone`");
}

const nextMilestone = Number(nextMilestoneText);
if (
  nextMilestoneText &&
  nextMilestoneText !== "complete" &&
  (Number.isNaN(nextMilestone) || nextMilestone < 1 || nextMilestone > 11)
) {
  failures.push(
    `Resume checkpoint has invalid next milestone: ${nextMilestoneText}`,
  );
}

const branch = currentBranch();
if (
  checkpointBranch &&
  branch &&
  checkpointBranch !== "unknown" &&
  checkpointBranch !== branch
) {
  failures.push(
    `Checkpoint branch ${checkpointBranch} does not match current branch ${branch}`,
  );
}

const commitHashes = [
  ...new Set(progress.match(/\b[0-9a-f]{7,40}\b/g) ?? []),
].filter((hash) => !/^\d+$/.test(hash));

for (const hash of commitHashes) {
  if (!commitExists(hash)) {
    failures.push(`Recorded commit does not exist locally: ${hash}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const lastCompleted =
  parsePlainValue(progress, "Last completed milestone") ?? "unknown";

console.log("Audience workflow checkpoint OK");
console.log(`- Current branch: ${branch || "unknown"}`);
console.log(`- Last completed milestone: ${lastCompleted}`);
console.log(`- Next milestone: ${nextMilestoneText ?? "unknown"}`);
