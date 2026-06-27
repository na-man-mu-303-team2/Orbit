import { appendFileSync } from "node:fs";

const jiraKeyPattern = /\b[A-Z][A-Z0-9]+-\d+\b/g;

function findKeys(value) {
  return Array.from(new Set((value.match(jiraKeyPattern) ?? []).map((key) => key.toUpperCase())));
}

function writeGithubOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    return;
  }

  appendFileSync(outputPath, `${name}=${value}\n`, "utf8");
}

const sources = [
  process.env.PR_TITLE ?? "",
  process.env.PR_BRANCH ?? process.env.GITHUB_HEAD_REF ?? "",
].join("\n");

const issues = findKeys(sources);

writeGithubOutput("has_issues", issues.length > 0 ? "true" : "false");
writeGithubOutput("issues", issues.join(" "));

if (issues.length === 0) {
  console.error("No Jira issue keys found in PR title, source branch, or body.");
}

console.log(JSON.stringify({ issues }));
