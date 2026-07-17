import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const wrapperPath = path.join(
  scriptDirectory,
  "orbit-deploy-personal-staging-wrapper.sh",
);
const wrapper = fs.readFileSync(wrapperPath, "utf8").replaceAll("\r\n", "\n");
const expectedWrapper = [
  "#!/usr/bin/env bash",
  "set -euo pipefail",
  "",
  "exec /usr/bin/sudo -iu orbit -- \\",
  '  /bin/bash /var/www/orbit/infra/scripts/deploy-personal-server.sh "$@"',
  "",
].join("\n");

test("personal staging wrapper uses absolute executable and deploy script paths", () => {
  assert.match(wrapper, /exec \/usr\/bin\/sudo -iu orbit --/);
  assert.match(
    wrapper,
    /\/bin\/bash \/var\/www\/orbit\/infra\/scripts\/deploy-personal-server\.sh/,
  );
});

test('personal staging wrapper forwards every argument with "$@"', () => {
  assert.match(wrapper, /deploy-personal-server\.sh "\$@"/);
});

test("personal staging wrapper does not use bash -lc", () => {
  assert.doesNotMatch(wrapper, /\/bin\/bash\s+-lc\b/);
});

test("personal staging wrapper contains no deployment policy or implementation", () => {
  assert.equal(wrapper, expectedWrapper);
});
