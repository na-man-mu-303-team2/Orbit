# Jira Webhook Runner

The `Jira Complete Issue` workflow sends Jira Automation webhook calls when a pull
request is merged into `main` or `develop`.

By default, the workflow runs on GitHub-hosted Ubuntu runners:

```yaml
runs-on: ubuntu-latest
```

Use a self-hosted runner only if the Jira Automation webhook is not reachable from
GitHub-hosted runners, for example when Jira is available only on a private network.

## GitHub-hosted Runner Setup

No runner registration is required for the default setup.

The repository must have this GitHub Actions secret:

```text
JIRA_AUTOMATION_WEBHOOK_URL
```

The webhook URL must be reachable from GitHub-hosted runners.

## Optional Self-hosted Runner Setup

1. Open the GitHub repository.
2. Go to `Settings` -> `Actions` -> `Runners`.
3. Select `New self-hosted runner`.
4. Choose the OS for a machine that can open the Jira site and webhook URL.
5. Follow the GitHub commands to download and configure the runner.
6. When GitHub asks for labels, include this label:

```text
jira-access
```

The runner must have:

- Network access to `https://jungle-303.opik.net`
- Git available for `actions/checkout`
- Bash and curl available for the webhook step
- Permission to run as a long-lived service

If the workflow is changed back to a self-hosted runner, keep this runner selector:

```yaml
runs-on: [self-hosted, jira-access]
```

On Windows, installing Git for Windows normally provides Bash and curl. After the
runner is configured, install it as a service so webhook completion works even when
no terminal is open.

## Repository Secret

Keep the Jira Automation webhook URL in GitHub Actions secrets:

```text
JIRA_AUTOMATION_WEBHOOK_URL
```

The current Jira Server/Data Center Automation screen does not show a separate
webhook token field. If a future Jira version adds one, store it separately as
`JIRA_AUTOMATION_WEBHOOK_TOKEN` and update the workflow to send the matching header.

## Workflow Behavior

`.github/workflows/jira-complete-issue.yml` runs only when a pull request is closed
and merged into `main` or `develop`.

The workflow:

1. Extracts Jira issue keys from the PR title, source branch, and completed Jira
   issue section.
2. Sends the issue list to Jira Automation.
3. Lets the Jira rule transition the provided issues to the configured completion status.

With the default GitHub-hosted setup, queued jobs usually indicate a GitHub Actions
service or billing/permission issue rather than a missing self-hosted runner.
