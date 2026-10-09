# GitLab MR Assistant — User Guide (v1.2.0)

This tool lets your AI assistant (Cursor or Claude) read and work with your company's GitLab merge requests (MRs).
It runs **on your own computer** and talks to GitLab through the VPN:

AI assistant -> this server (on your PC) -> your company GitLab

By default it is **read-only**: it can look at merge requests but cannot change anything.

---

## 1. What you need

- **Node.js 18 or newer**. Check by running `node -v` in PowerShell. If it's missing, install it from https://nodejs.org (the LTS version).
- **VPN connected**. GitLab is only reachable through the company network.
- **A GitLab personal access token** (see step 3).
- **Claude Code**, **Cursor** or **Claude Desktop**.

---

## 2. Install and build (one time, and again after every update)

Open PowerShell and run:

```powershell
cd amt-claude-challenge\mcp\jishnu-pv-gitlab-mcp
npm install
npm run build
```

When it finishes, there will be a `build\index.js` file. That is what the assistant runs.

> After you receive an update (a new `src\index.ts`), always run `npm run build` again and restart the assistant.

---

## 3. Create your GitLab token

1. Open GitLab in your browser.
2. Click your **avatar** -> **Preferences** -> **Access tokens**.
3. Click **Add new token** and give it a name, e.g. `ai-assistant`.
4. Pick the scope:
   - **`read_api`**: read-only. Recommended to start with.
   - **`api`**: needed only if you want the assistant to comment, approve, retry jobs or merge.
5. Set an expiry date and click **Create**.
6. **Copy the token immediately.** GitLab only shows it once.

**Never** commit the token to git, paste it in chat, or share it.

---

## 4. Connect it to your assistant

### Option A: Cursor

1. Create or open the file `C:\Users\<you>\.cursor\mcp.json` (or `~/.cursor/mcp.json` on Mac/Linux).
2. Paste the following, replacing the values in CAPITALS:

```json
{
  "mcpServers": {
    "gitlab-mr": {
      "command": "node",
      "args": ["C:/ABSOLUTE/PATH/TO/jishnu-pv-gitlab-mcp/build/index.js"],
      "env": {
        "GITLAB_URL": "https://YOUR-GITLAB-ADDRESS",
        "GITLAB_TOKEN": "YOUR_TOKEN",
        "GITLAB_DEFAULT_PROJECT": "GROUP/REPO"
      }
    }
  }
}
```

3. Restart Cursor, or go to **Settings -> MCP** and refresh `gitlab-mr`.
4. You should see `gitlab-mr` with a green dot and a list of tools.

### Option B: Claude Desktop

1. Open Claude Desktop -> **Settings -> Developer -> Edit Config**.
2. Paste the same `mcpServers` block as above.
3. Save and **fully restart** Claude Desktop.

### Option C: Claude Code

macOS / Linux / Git Bash:

```bash
claude mcp add gitlab-mr \
  -e GITLAB_URL=https://YOUR-GITLAB-ADDRESS \
  -e GITLAB_TOKEN=YOUR_TOKEN \
  -e GITLAB_DEFAULT_PROJECT=GROUP/REPO \
  -- node /ABSOLUTE/PATH/TO/jishnu-pv-gitlab-mcp/build/index.js
```

PowerShell (use a backtick `` ` `` instead of `\` to continue a line):

```powershell
claude mcp add gitlab-mr `
  -e GITLAB_URL=https://YOUR-GITLAB-ADDRESS `
  -e GITLAB_TOKEN=YOUR_TOKEN `
  -e GITLAB_DEFAULT_PROJECT=GROUP/REPO `
  -- node C:/ABSOLUTE/PATH/TO/jishnu-pv-gitlab-mcp/build/index.js
```

Then run `/mcp` inside Claude Code and check that `gitlab-mr` is connected.

> Use forward slashes `/` (or double backslashes `\\`) in the Windows path.

---

## 5. Test it

In the assistant chat, ask:

> What merge requests are waiting for my review?

If you get a list (or "none"), it's working. If you get an error, see **Troubleshooting** below.

**Optional: test without an AI assistant**

```powershell
cd amt-claude-challenge\mcp\jishnu-pv-gitlab-mcp
$env:GITLAB_URL = "https://YOUR-GITLAB-ADDRESS"
$env:GITLAB_TOKEN = "YOUR_TOKEN"
npm run inspect
```

Open the link it prints -> **Connect** -> **Tools** -> **List Tools** -> try `my_merge_requests`.

---

## 6. Things you can ask

| You want to... | Ask something like |
|---|---|
| See your review queue | "What's waiting for my review?" |
| List MRs in a project | "Show open MRs in group/repo" |
| Review an MR | "Review MR !142" |
| Know if it can be merged | "Can MR !142 be merged? What's blocking it?" |
| Find out why CI failed | "Why did the pipeline fail on !142?" |
| See which tests failed | "Which tests failed on !142?" |
| Read code around a change | "Show lines 80-140 of src/app.ts on branch feature/login" |
| Compare branches/releases | "What changed between v1.2.0 and v1.3.0?" |
| See open review comments | "List unresolved comments on !142" |

You can refer to a project by its path (`group/subgroup/repo`), its numeric ID, or a pasted GitLab URL.
If you set `GITLAB_DEFAULT_PROJECT`, you don't need to mention the project at all.

---

## 7. All tools

### Read tools (always available)

| Tool | What it does |
|---|---|
| `my_merge_requests` | Your MRs across all projects: to review, authored, or assigned |
| `list_merge_requests` | MRs in one project, filterable by state/author/reviewer |
| `get_merge_request` | Details, approvals, merge status, pipeline of one MR |
| `get_mr_diff` | The MR's changes (skips lockfiles/generated files) |
| `review_merge_request` | Full review package in one call, with automatic warnings |
| `get_pipeline_status` | Latest pipeline and its jobs, failed jobs first |
| `get_job_log` | The last lines of a CI job's log |
| `list_mr_comments` | Discussion threads (unresolved only by default) |
| **`get_test_report`** *(new)* | Test totals and only the failed tests with their errors |
| **`get_file`** *(new)* | Read a file at any branch/tag/commit, with line numbers |
| **`compare_branches`** *(new)* | Commits and changes between two branches/tags/commits |
| **`check_mergeability`** *(new)* | "Can this be merged?", with a list of exactly what's blocking |

### Write tools (hidden unless you turn them on)

| Tool | What it does |
|---|---|
| `post_mr_comment` | Post a comment, or reply in a thread |
| `post_inline_comment` | Comment on a specific line of a changed file |
| `resolve_thread` | Resolve or reopen a discussion |
| `approve_merge_request` | Approve the MR as you |
| `retry_job` | Re-run a CI job |
| `merge_merge_request` | Merge the MR (needs explicit confirmation) |

### Ready-made prompts

`review_mr`, `debug_pipeline`, `my_review_queue`: one-click templates in clients that support MCP prompts.

---

## 8. Turning on write actions (optional)

Only do this if you want the assistant to comment, approve, retry or merge.

1. Make sure your token has the **`api`** scope (not just `read_api`).
2. Add this line to the `env` section of your config:
   ```json
   "GITLAB_READONLY": "false"
   ```
3. Restart the assistant.

Safety rules built in:
- Merging requires `confirm: true`, so the assistant should only merge when you explicitly ask.
- Everything is done **as you**, with your GitLab permissions.

To go back to read-only, remove the line (or set it to `"true"`) and restart.

---

## 9. All settings

| Setting | Required | What it does |
|---|---|---|
| `GITLAB_URL` | Yes | Your GitLab address, e.g. `https://gitlab.company.com` |
| `GITLAB_TOKEN` | Yes | Your personal access token |
| `GITLAB_READONLY` | No | `false` turns on write tools (default: read-only) |
| `GITLAB_DEFAULT_PROJECT` | No | Project used when you don't name one |
| `GITLAB_ALLOWED_PROJECTS` | No | Comma-separated list of the only projects it may touch |
| `MAX_OUTPUT_CHARS` | No | Maximum text sent to the AI per answer (default 60000) |
| `REQUEST_TIMEOUT_MS` | No | How long to wait for GitLab (default 30000 = 30s) |
| `NODE_EXTRA_CA_CERTS` | No | Path to your company certificate file if you get TLS errors |

---

## 10. Updating to a new version

1. Replace `src\index.ts` with the new file (and `package.json` / `README.md` if provided).
2. Rebuild:
   ```powershell
   cd amt-claude-challenge\mcp\jishnu-pv-gitlab-mcp
   npm install
   npm run build
   ```
3. Restart Cursor (or refresh `gitlab-mr` in Settings -> MCP) or Claude Desktop.
4. Check that the new tools appear in the tool list.

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| "Could not reach GitLab" | Connect to the VPN. Check `GITLAB_URL` (no typos, starts with `https://`). |
| **401** error | Token is wrong or expired. Create a new one. |
| **403** error | Token scope too small (writes need `api`), or you lack access to that project. |
| **404** error | Wrong project path (use `group/subgroup/repo`) or you don't have access. |
| TLS / certificate error | Set `NODE_EXTRA_CA_CERTS` to your company CA file path. |
| Write tools missing | Expected in read-only mode. See section 8. |
| New tools don't show up | You didn't rebuild or restart. Run `npm run build`, then restart. |
| `gitlab-mr` shows red / won't start | Check that `GITLAB_URL` and `GITLAB_TOKEN` are set and the path to `build/index.js` is correct. |
| "No test report" from `get_test_report` | Your CI doesn't upload JUnit reports. Ask the assistant to use the job log instead. |
| `check_mergeability` says "UNCERTAIN" | GitLab is still computing. Ask again in a few seconds. |

---

## 12. Security tips

- Keep the token only in the config file. Never commit or share it.
- Start read-only and only enable writes when you need them.
- Use `GITLAB_ALLOWED_PROJECTS` to limit which projects the assistant can touch.
- Give tokens an expiry date and revoke them if you stop using the tool.
