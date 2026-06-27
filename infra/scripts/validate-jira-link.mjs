const jiraKeyPattern = /\b[A-Z][A-Z0-9]+-\d+\b/g;

function findKeys(value) {
  return Array.from(new Set((value.match(jiraKeyPattern) ?? []).map((key) => key.toUpperCase())));
}

const title = process.env.PR_TITLE ?? "";
const branch = process.env.PR_BRANCH ?? process.env.GITHUB_HEAD_REF ?? "";
const titleKeys = findKeys(title);
const branchKeys = findKeys(branch);
const errors = [];

if (titleKeys.length === 0) {
  errors.push(`PR title must include a Jira issue key like PPT-123. Current title: "${title}"`);
}

if (branchKeys.length === 0) {
  errors.push(`Source branch must include a Jira issue key like feature/PPT-123-slide-control. Current branch: "${branch}"`);
}

const commonKeys = titleKeys.filter((key) => branchKeys.includes(key));

if (titleKeys.length > 0 && branchKeys.length > 0 && commonKeys.length === 0) {
  errors.push(`PR title Jira key (${titleKeys.join(", ")}) must match source branch Jira key (${branchKeys.join(", ")}).`);
}

if (errors.length > 0) {
  console.error("Jira link validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Jira link validation passed for ${commonKeys[0] ?? titleKeys[0] ?? branchKeys[0]}.`);
