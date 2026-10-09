# Grafana MCP integration (with a pod-restart diagnosis workflow)

**Author:** Sebin Sebastian
**Type:** MCP integration

## What it does

Connects Claude Code to a Grafana instance through Grafana's official MCP server, [`mcp-grafana`](https://github.com/grafana/mcp-grafana). Once it's connected, Claude can do what you'd normally do in the Grafana UI. It can:

- run PromQL against Prometheus, both instant and range queries
- run LogQL against Loki
- search dashboards and pull the queries behind a panel
- list alert rules, firing alerts and silences
- read Grafana Incident and OnCall data, if you use them
- generate deep links to a dashboard or an Explore view, so you can check its work

It doesn't make Grafana any smarter. It gives Claude read access to the same metrics and logs you already have, and Claude does the digging: it picks the queries, runs them, reads the results and decides what to check next.

## Why this is useful for developers

Most of us open Grafana when something is already wrong, and then lose ten minutes finding the right dashboard or remembering the PromQL. With this connected, you ask in plain English from the terminal you're already in:

- "Is `orders-api` restarting? Since when, and why?"
- "Did p95 latency on `payments` change after this morning's deploy?"
- "Show me the error logs from `auth-service` in the last 30 minutes."
- "Which alerts are firing right now in the `prod` folder?"

You don't need to know PromQL or which dashboard to open. Claude shows the queries it ran, so you can check them and learn them as you go.

## Setup

### 1. Create a Grafana service account token

In Grafana: **Administration → Users and access → Service accounts → Add service account**.

- Give it the **Viewer** role. That's enough for querying and reading dashboards, and it means Claude can't change anything.
- Click **Add service account token** and copy the token (`glsa_...`).
- Set an expiry date and put a reminder in your calendar. An expired token shows up as `401 Unauthorized` on every tool call.

### 2. Install `uv`

The server runs through `uvx`, so you don't need a separate install step:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

(Prefer Docker? `grafana/mcp-grafana` works too. See the upstream README.)

### 3. Add the server to Claude Code

Use user scope so the token stays out of the repo:

```bash
claude mcp add grafana --scope user \
  -e GRAFANA_URL=https://grafana.example.com \
  -e GRAFANA_SERVICE_ACCOUNT_TOKEN=glsa_xxxxxxxx \
  -- uvx mcp-grafana
```

That writes this to `~/.claude.json`:

```json
{
  "mcpServers": {
    "grafana": {
      "type": "stdio",
      "command": "uvx",
      "args": ["mcp-grafana"],
      "env": {
        "GRAFANA_URL": "https://grafana.example.com",
        "GRAFANA_SERVICE_ACCOUNT_TOKEN": "glsa_xxxxxxxx"
      }
    }
  }
}
```

If you work with more than one Grafana instance (for example one per product or environment), add one server per instance with a clear name, such as `grafana-prod` and `grafana-staging`. Claude then sees separate tool sets (`mcp__grafana-prod__*`) and you can say which one to use.

Don't commit the token. If you want the server shared through a project `.mcp.json`, use `${GRAFANA_SERVICE_ACCOUNT_TOKEN}` there and have each person export their own.

### 4. Check that it works

Restart Claude Code, run `/mcp` and confirm `grafana` shows as connected. Then ask:

> "List the Grafana datasources."

You should get back your Prometheus and Loki datasources with their UIDs. A `401` means the token is wrong or expired.

## Example prompts

1. **"List the Prometheus and Loki datasources in Grafana."** This is a quick smoke test, and Claude needs the datasource UID for every query anyway.
2. **"Which pods in namespace `orders` have restarted in the last 24 hours?"** Claude queries `increase(kube_pod_container_status_restarts_total{namespace="orders"}[24h]) > 0`.
3. **"Why is `orders-api` restarting?"** This one triggers the full diagnosis workflow below.

## Worked example: why is my pod restarting?

This is the case I use it for most. Can it tell you why a pod restarted? **Mostly yes, with limits:**

| What Claude can find out | From |
|---|---|
| Which pods are restarting, how often, and when it started | `kube-state-metrics` restart counter |
| How the container died: exit code and reason (137 = killed, 1 = app error, ...) | `kube-state-metrics` last-terminated metrics |
| Whether it was an OOM kill: memory climbing to the limit before each restart | cAdvisor memory and the container limit |
| Whether it lines up with a deploy: only the newest ReplicaSet's pod running | `kube_pod_status_phase` |
| The actual app error (stack trace, failed DB connection, ...) | **Loki only.** Pod logs have to be shipped to Loki. |

What it **can't** see: Kubernetes events (`FailedScheduling`, `ImagePullBackOff` messages, liveness probe failures) unless you run an event exporter into Loki or Prometheus. Prometheus and Loki also can't see anything older than their retention. For those cases you still need `kubectl describe pod`.

So for the common cases (OOM kills, crash loops after a deploy, an app error you can see in the logs) you get the cause plus the evidence. For anything else you get a clear "the metrics show X, check `kubectl describe` for Y".

### The procedure

Paste this into your project's `CLAUDE.md`, or save it as a skill at `~/.claude/skills/k8s-pod-restart-diagnosis/SKILL.md` with this frontmatter:

```yaml
---
name: k8s-pod-restart-diagnosis
description: Use when a Kubernetes pod is restarting or crash-looping and you need to find out why using Grafana (Prometheus / kube-state-metrics / cAdvisor / Loki). Triggers on "why is <pod> restarting", "pod is crash-looping", "check grafana for pod crashes".
---
```

1. **Get the datasource UID.** Run `list_datasources` (type `prometheus`). Don't hardcode the UID, because it can change.

2. **Find the exact pod names.** Run `list_prometheus_label_values` on label `pod` with `pod=~"<app>.*"`. Pod names carry a ReplicaSet hash.

3. **Check restart counts** with an instant query:
   ```promql
   kube_pod_container_status_restarts_total{pod=~"<app>.*"}
   ```
   If some expected pods are missing, they're probably from an older ReplicaSet after a rollout. Confirm which pods are actually running:
   ```promql
   kube_pod_status_phase{pod=~"<app>.*", phase="Running"} == 1
   ```

4. **Find when it started.** Run the same restart counter as a range query over `now-24h` to `now`, with a step of about 600s. A flat line that turns into a steady climb marks the onset.

5. **Check how the container died:**
   ```promql
   kube_pod_container_status_last_terminated_reason{pod=~"<app>.*"}
   kube_pod_container_status_last_terminated_exitcode{pod=~"<app>.*"}
   ```
   - `137` = SIGKILL: usually OOM, sometimes a failed liveness probe. Go to step 6.
   - `1` (or another app exit code) = the app crashed. Go to step 7.
   - The `reason` label sometimes says `Error` even for OOM kills, so don't trust it on its own. Back it up with the exit code and memory.

6. **If the exit code is 137, confirm OOM** by looking for a memory sawtooth over the last few hours:
   ```promql
   container_memory_working_set_bytes{pod=~"<app>.*", container="<container>"}
   kube_pod_container_resource_limits{pod=~"<app>.*", container="<container>", resource="memory"}
   ```
   If memory climbs to the limit and drops at each restart, it's an OOM kill. Report the limit and the observed peak.

7. **If the exit code is 1, or memory looks fine, read the logs.** If a Loki datasource exists, run `query_loki_logs` scoped to the pod and container, around the restart times from step 4:
   ```logql
   {namespace="<ns>", pod=~"<app>.*"} |~ "(?i)error|exception|fatal|panic"
   ```

8. **Report** the pod, namespace and node, when the crash loop started, the restart trend, the exit code and reason, the memory limit versus the peak (if OOM), the log lines that explain it (if found), and whether it lines up with a recent deploy. End with what the metrics *couldn't* show and the `kubectl` command that would.

## Tips

- Say which datasource or Grafana instance you mean if you have several. Claude will otherwise pick the first Prometheus it finds.
- Ask Claude to "include the queries you ran". You can paste them into Grafana Explore, or ask for a deep link with `generate_deeplink`.
- Keep the token on the Viewer role. Some `mcp-grafana` tools can write (update dashboards, create incidents and annotations), and Viewer blocks all of them.
