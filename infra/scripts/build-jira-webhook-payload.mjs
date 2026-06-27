import { appendFileSync } from "node:fs";

const jiraKeyPattern = /\b[A-Z][A-Z0-9]+-\d+\b/g;
const autoCompleteHeadingPattern = /^(jira\s+auto-?complete\s+issues?|jira\s+complete\s+issues?|jira\s+completion\s+issues?|completed\s+jira\s+issues?|완료한\s*jira\s*이슈|jira\s*완료\s*이슈|jira\s+자동\s*완료\s*이슈|자동\s*완료\s*jira\s*이슈|자동\s*완료\s*대상)$/i;

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

function readPullRequestBody() {
  const bodyJson = process.env.PR_BODY_JSON;

  if (!bodyJson) {
    return process.env.PR_BODY ?? "";
  }

  try {
    return JSON.parse(bodyJson) ?? "";
  } catch {
    return process.env.PR_BODY ?? "";
  }
}

function normalizeHeading(line) {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function findAutoCompleteSectionKeys(body) {
  const issues = [];
  let isAutoCompleteSection = false;

  for (const line of body.split(/\r?\n/)) {
    const heading = normalizeHeading(line);
    const isHeading = /^#{1,6}\s+/.test(line);

    if (isHeading) {
      if (isAutoCompleteSection) {
        break;
      }

      isAutoCompleteSection = autoCompleteHeadingPattern.test(heading);
      continue;
    }

    if (isAutoCompleteSection) {
      issues.push(...findKeys(line));
    }
  }

  return Array.from(new Set(issues));
}

const sources = [
  process.env.PR_TITLE ?? "",
  process.env.PR_BRANCH ?? process.env.GITHUB_HEAD_REF ?? "",
].join("\n");

const issues = Array.from(new Set([...findKeys(sources), ...findAutoCompleteSectionKeys(readPullRequestBody())]));

writeGithubOutput("has_issues", issues.length > 0 ? "true" : "false");
writeGithubOutput("issues", issues.join(" "));

if (issues.length === 0) {
  console.error("No Jira issue keys found in PR title, source branch, or explicit auto-complete section.");
}

console.log(JSON.stringify({ issues }));
