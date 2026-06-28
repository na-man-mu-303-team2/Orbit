const env = process.env;
const token = env.GITHUB_TOKEN;
const repository = env.GITHUB_REPOSITORY;
const pullNumber = Number(env.PR_NUMBER);
const rawReview = env.CODEX_REVIEW_JSON || "";
const maxInlineComments = Number(env.CODEX_REVIEW_MAX_INLINE_COMMENTS || 20);

if (!token) {
  throw new Error("GITHUB_TOKEN is required.");
}

if (!repository || !repository.includes("/")) {
  throw new Error("GITHUB_REPOSITORY must be set to owner/repo.");
}

if (!Number.isInteger(pullNumber) || pullNumber < 1) {
  throw new Error("PR_NUMBER must be a positive integer.");
}

function parseJsonPayload(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Codex review output is empty.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "");
    try {
      return JSON.parse(withoutFence);
    } catch {
      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
      throw new Error("Codex review output did not contain valid JSON.");
    }
  }
}

function truncate(value, maxChars) {
  if (!value) {
    return "";
  }
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}\n[truncated]`;
}

function parsePatchPositions(patch) {
  const positionsByLine = new Map();
  if (!patch) {
    return positionsByLine;
  }

  let newLine = 0;
  let position = 0;
  for (const line of patch.split(/\r?\n/)) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (line.startsWith("\\ No newline")) {
      continue;
    }

    position += 1;

    if (line.startsWith("+")) {
      positionsByLine.set(newLine, position);
      newLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      positionsByLine.set(newLine, position);
      newLine += 1;
    }
  }

  return positionsByLine;
}

async function githubRequest(method, endpoint, body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${endpoint} failed: ${response.status} ${text}`);
  }

  return response.status === 204 ? null : response.json();
}

async function listPullFiles(owner, repo, prNumber) {
  const files = [];
  for (let page = 1; page <= 10; page += 1) {
    const pageFiles = await githubRequest(
      "GET",
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
    );
    files.push(...pageFiles);
    if (pageFiles.length < 100) {
      break;
    }
  }
  return files;
}

function findingBody(finding) {
  const evidence = finding.evidence?.references?.length
    ? finding.evidence.references.map((item) => `- ${item}`).join("\n")
    : "- No evidence reference provided.";
  const basis = finding.evidence?.basis?.length
    ? finding.evidence.basis.join(", ")
    : "unspecified";

  return truncate(
    `**[${finding.severity}] ${finding.title}**\n\n${finding.body}\n\nEvidence basis: ${basis}\n\n${evidence}`,
    3000,
  );
}

function summaryBody(review, inlineComments, summaryOnlyFindings) {
  const lines = [
    "## Codex standard review",
    "",
    review.summary,
    "",
    `Inline findings posted: ${inlineComments.length}`,
  ];

  if (summaryOnlyFindings.length > 0) {
    lines.push("", "### Findings not posted inline", "");
    for (const finding of summaryOnlyFindings) {
      lines.push(
        `- **[${finding.severity}] ${finding.path}${finding.line ? `:${finding.line}` : ""} - ${finding.title}**: ${finding.body}`,
      );
    }
  }

  if (review.followUps?.length) {
    lines.push("", "### Follow-up checks", "");
    for (const followUp of review.followUps) {
      lines.push(`- ${followUp}`);
    }
  }

  return truncate(lines.join("\n"), 60000);
}

const [owner, repo] = repository.split("/");
const review = parseJsonPayload(rawReview);
const pullFiles = await listPullFiles(owner, repo, pullNumber);
const positionsByPath = new Map(
  pullFiles.map((file) => [file.filename, parsePatchPositions(file.patch || "")]),
);

const inlineComments = [];
const summaryOnlyFindings = [];

for (const finding of review.findings || []) {
  const line = finding.line;
  const positions = positionsByPath.get(finding.path);
  const position = Number.isInteger(line) ? positions?.get(line) : undefined;

  if (position && inlineComments.length < maxInlineComments) {
    inlineComments.push({
      path: finding.path,
      position,
      body: findingBody(finding),
    });
  } else {
    summaryOnlyFindings.push(finding);
  }
}

await githubRequest("POST", `/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
  event: "COMMENT",
  body: summaryBody(review, inlineComments, summaryOnlyFindings),
  comments: inlineComments,
});

console.log(
  `Posted Codex review with ${inlineComments.length} inline comments and ${summaryOnlyFindings.length} summary-only findings.`,
);
