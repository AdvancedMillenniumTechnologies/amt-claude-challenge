# GitLab merge request MCP integration

**Author:** _Jishnu PV_
**Type:** MCP integration

## What it does

Connects Claude Code to our GitLab so you can review merge requests, debug pipelines and check mergeability without leaving the terminal: "what's waiting for my review", "review MR !142", "why did the pipeline fail", "can I merge this?".

It is a local server that runs on your machine while you're on the VPN or the office network: Claude Code -> this server -> our GitLab API.

**Read tools (always on):** `list_merge_requests`, `my_merge_requests`, `get_merge_request`, `get_mr_diff`, `review_merge_request` (one-call review package with automatic rule checks), `get_pipeline_status`, `get_job_log`, `get_test_report`, `list_mr_comments`, `get_file`, `compare_branches`, `check_mergeability`.

**Write tools (off by default):** `post_mr_comment`, `post_inline_comment`, `resolve_thread`, `approve_merge_request`, `retry_job`, `merge_merge_request`.

**Safety built in:**
- Read-only unless you set `GITLAB_READONLY=false`.
- Merging also needs an explicit `confirm: true`.
- `GITLAB_ALLOWED_PROJECTS` limits which projects Claude can touch.
- The token stays in the server's environment, not in commands Claude writes.

## Setup

Needs Node 18+ and VPN access to GitLab.

1. Get the code, then build it:

```bash
cd mcp/jishnu-pv-gitlab-mcp
npm install
npm run build
```

2. Create a GitLab token: avatar -> Preferences -> Access tokens. Use scope `read_api` for read-only use (`api` only if you want comments, approvals or merges). Never commit it.

3. Add the server to Claude Code:

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://gitlab.company.com \
  -e GITLAB_TOKEN=your_token_here \
  -e GITLAB_DEFAULT_PROJECT=group/repo \
  -- node /absolute/path/to/jishnu-pv-gitlab-mcp/build/index.js
```

On PowerShell, end each line with a backtick `` ` `` instead of `\`. See [.env.example](.env.example) for all settings.

4. Check it works: run `/mcp` inside Claude Code and confirm `gitlab-mr` is connected. You can also test without Claude using `npm run inspect`.

If you share the config through a project `.mcp.json`, reference the token as `${GITLAB_TOKEN}` instead of pasting it.

For Cursor / Claude Desktop setup, every setting, all tools and troubleshooting, see the [user guide](USER_GUIDE.md).

## Example prompts once connected

- "What's waiting for my review?"
- "Review MR !142." (uses the one-call review package: summary, bugs by severity, missing tests, verdict)
- "Why did the pipeline fail on !142?" (reads the failed tests and job logs, says whether it looks flaky)
- "Can I merge !142?" (lists exactly what is blocking, such as unresolved threads or missing approvals)

## Why this is useful for AMT

Review and pipeline work normally means switching between the browser, the terminal and the editor. With this connected, Claude Code can read an MR, check the failing tests, open the surrounding code and then fix the problem in the same session, all in one place. Review quality improves because Claude sees the full context (rule checks, unresolved comments, pipeline state), not just the diff. The read-only default and project allowlist keep it safe to try.
