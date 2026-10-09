# Submission — Sebin Sebastian

## Track

- [x] Track A — Claude Code (Pro)
- [ ] Track B — claude.ai web (free)

## Course(s) completed

- Claude Code in Action — October 8, 2026

## Proof

- **Completion badge:** [`claude-code-in-action-badge.png`](claude-code-in-action-badge.png)
- **LinkedIn post:** https://lnkd.in/p/geuKVKiU

## My artifact

**Track A** — MCP integration: [`mcp/sebin-grafana.md`](../../mcp/sebin-grafana.md)

### What it does

It connects Claude Code to Grafana through the official `mcp-grafana` server, so Claude can query Prometheus and Loki, read dashboards and check alerts from the terminal. The doc covers setup with a read-only service account token and running more than one Grafana instance side by side. It also includes a worked workflow for the question I get asked most: **"why is this pod restarting?"**

For that workflow, Claude finds the pods and when the crash loop started, reads the exit code, and checks memory against the limit to confirm an OOM kill. If the cause isn't OOM, it pulls the error logs from Loki. Then it reports the cause along with the queries it ran. The doc also says what it can't see (Kubernetes events, anything not in Prometheus or Loki) and when you still need `kubectl`.

### How I built it

- I run two `mcp-grafana` servers in my own Claude Code setup, one for each of the Grafana instances I work with, and I've been using them for pod restart and alert triage.
- I first wrote the pod restart steps as a personal skill after doing the same diagnosis by hand a few times. I've generalized it here: no hardcoded datasource UIDs or instance names.
- I've used this procedure on real crash-looping pods. It reliably separates OOM kills from other kills and says when you need `kubectl` to finish the job.
- The doc also covers the gotchas I ran into: `kube-state-metrics` reporting reason `Error` for OOM kills, missing pods after a rollout, and expired tokens showing up as `401` on every call.
