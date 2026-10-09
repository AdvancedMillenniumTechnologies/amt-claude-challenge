#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// =====================================================================
// Config (all via environment variables)
// =====================================================================
const BASE_URL = (process.env.GITLAB_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.GITLAB_TOKEN ?? "";
// Read-only unless GITLAB_READONLY=false
const READONLY = (process.env.GITLAB_READONLY ?? "true").toLowerCase() !== "false";
// Optional: lets you skip typing the project every time
const DEFAULT_PROJECT = (process.env.GITLAB_DEFAULT_PROJECT ?? "").trim();
// Optional: comma-separated project paths the server may touch (empty = any)
const ALLOWED = (process.env.GITLAB_ALLOWED_PROJECTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MAX_CHARS = Number(process.env.MAX_OUTPUT_CHARS ?? 60000);
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS ?? 30000);

if (!BASE_URL || !TOKEN) {
  // stdout is reserved for the MCP protocol, so log to stderr only
  console.error("Set GITLAB_URL (e.g. https://gitlab.company.com) and GITLAB_TOKEN.");
  process.exit(1);
}

// =====================================================================
// GitLab API helper
// =====================================================================
type Query = Record<string, string | number | boolean | undefined>;

async function gl(
  path: string,
  opts: { method?: string; query?: Query; body?: unknown; text?: boolean } = {}
): Promise<any> {
  const url = new URL(`${BASE_URL}/api/v4${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const method = opts.method ?? "GET";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "PRIVATE-TOKEN": TOKEN,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e: any) {
    const why = e?.name === "TimeoutError" ? `timed out after ${TIMEOUT_MS}ms` : (e?.cause?.code ?? e?.message ?? "failed");
    throw new Error(`Could not reach GitLab at ${BASE_URL} (${why}). Are you connected to the VPN?`);
  }

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    const hint =
      res.status === 401
        ? " Hint: token is invalid or expired."
        : res.status === 403
        ? " Hint: token lacks the needed scope (use 'api' for write actions) or your account has no permission."
        : res.status === 404
        ? " Hint: project/MR not found, or your account has no access. Check the project path."
        : "";
    throw new Error(`GitLab ${res.status} ${res.statusText} on ${method} ${path}: ${detail}${hint}`);
  }
  return opts.text ? res.text() : res.json();
}

// =====================================================================
// Helpers
// =====================================================================
function resolveProject(input?: string): string {
  let p = (input ?? "").trim() || DEFAULT_PROJECT;
  if (!p) throw new Error("No project given and GITLAB_DEFAULT_PROJECT is not set.");
  // Accept a pasted GitLab URL too
  if (/^https?:\/\//i.test(p)) {
    p = new URL(p).pathname.replace(/^\/+/, "").split("/-/")[0].replace(/\/+$/, "");
  }
  if (ALLOWED.length && !ALLOWED.includes(p)) {
    throw new Error(`Project '${p}' is not in GITLAB_ALLOWED_PROJECTS (${ALLOWED.join(", ")}).`);
  }
  return p;
}
const P = (input?: string) => encodeURIComponent(resolveProject(input));

function assertWritable() {
  if (READONLY) throw new Error("Server is in read-only mode. Set GITLAB_READONLY=false and restart to enable writes.");
}

function truncate(s: string): string {
  return s.length > MAX_CHARS
    ? s.slice(0, MAX_CHARS) + `\n\n[truncated: ${s.length - MAX_CHARS} more characters]`
    : s;
}

const asText = (data: unknown) => ({
  content: [
    { type: "text" as const, text: truncate(typeof data === "string" ? data : JSON.stringify(data, null, 2)) },
  ],
});

const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
});

// Lockfiles, generated and vendored files that waste review budget
const NOISE =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$|\.min\.(js|css)$|\.map$|(^|\/)(dist|build|node_modules|vendor)\//;
const TEST_PATH = /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/i;
const DOC_PATH = /\.(md|txt|rst)$/i;

async function fetchAllDiffs(projectEnc: string, iid: number): Promise<any[]> {
  const base = `/projects/${projectEnc}/merge_requests/${iid}`;
  try {
    const all: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await gl(`${base}/diffs`, { query: { per_page: 100, page } });
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  } catch {
    // Older GitLab versions: fall back to the (deprecated) /changes endpoint
    return (await gl(`${base}/changes`)).changes;
  }
}

const countChanged = (diff: string) =>
  diff.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-")).length;

const fileTag = (f: any) => (f.new_file ? "ADDED" : f.deleted_file ? "DELETED" : f.renamed_file ? "RENAMED" : "MODIFIED");

const summarizeMr = (m: any) => ({
  project: m.references?.full?.split("!")[0],
  iid: m.iid,
  title: m.title,
  author: m.author?.username,
  source_branch: m.source_branch,
  target_branch: m.target_branch,
  draft: m.draft,
  state: m.state,
  has_conflicts: m.has_conflicts,
  updated_at: m.updated_at,
  url: m.web_url,
});

// =====================================================================
// Server + read-only switch
// =====================================================================
const project = z
  .string()
  .optional()
  .describe("Project path like 'group/subgroup/repo', a numeric ID, or a GitLab URL. Optional if GITLAB_DEFAULT_PROJECT is set.");
const iid = z.number().int().describe("Merge request IID (the number after '!')");

const server = new McpServer({ name: "gitlab-mr", version: "1.2.0" });

const WRITE_TOOLS = new Set([
  "post_mr_comment",
  "post_inline_comment",
  "resolve_thread",
  "approve_merge_request",
  "retry_job",
  "merge_merge_request",
]);
const registerTool = server.tool.bind(server) as any;
(server as any).tool = (name: string, ...rest: any[]) => {
  const tool = registerTool(name, ...rest);
  if (READONLY && WRITE_TOOLS.has(name)) tool.disable(); // hidden from Claude, calls rejected
  return tool;
};

// =====================================================================
// READ tools
// =====================================================================

server.tool(
  "list_merge_requests",
  "List merge requests in a project, most recently updated first.",
  {
    project,
    state: z.enum(["opened", "closed", "merged", "all"]).default("opened"),
    author_username: z.string().optional(),
    reviewer_username: z.string().optional(),
    per_page: z.number().int().min(1).max(50).default(20),
  },
  async ({ project, state, author_username, reviewer_username, per_page }) => {
    try {
      const mrs = await gl(`/projects/${P(project)}/merge_requests`, {
        query: { state, author_username, reviewer_username, per_page, order_by: "updated_at" },
      });
      return asText(mrs.map(summarizeMr));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "my_merge_requests",
  "Your merge requests across ALL projects: ones waiting for your review, ones you authored, or ones assigned to you.",
  {
    role: z.enum(["review_requested", "authored", "assigned"]).default("review_requested"),
    state: z.enum(["opened", "merged", "closed", "all"]).default("opened"),
    per_page: z.number().int().min(1).max(50).default(20),
  },
  async ({ role, state, per_page }) => {
    try {
      const me = await gl("/user");
      const query: Query = { scope: "all", state, per_page, order_by: "updated_at" };
      if (role === "review_requested") query.reviewer_id = me.id;
      else if (role === "authored") query.author_id = me.id;
      else query.assignee_id = me.id;
      const mrs = await gl("/merge_requests", { query });
      return asText({ user: me.username, role, count: mrs.length, merge_requests: mrs.map(summarizeMr) });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_merge_request",
  "Get details of one merge request, including approvals and mergeability.",
  { project, iid },
  async ({ project, iid }) => {
    try {
      const base = `/projects/${P(project)}/merge_requests/${iid}`;
      const [mr, approvals] = await Promise.all([
        gl(base),
        gl(`${base}/approvals`).catch(() => null), // approvals API may be unavailable on some tiers
      ]);
      return asText({
        iid: mr.iid,
        title: mr.title,
        description: mr.description,
        author: mr.author?.username,
        state: mr.state,
        draft: mr.draft,
        source_branch: mr.source_branch,
        target_branch: mr.target_branch,
        merge_status: mr.detailed_merge_status ?? mr.merge_status,
        has_conflicts: mr.has_conflicts,
        changes_count: mr.changes_count,
        labels: mr.labels,
        reviewers: mr.reviewers?.map((r: any) => r.username),
        head_pipeline: mr.head_pipeline
          ? { id: mr.head_pipeline.id, status: mr.head_pipeline.status, url: mr.head_pipeline.web_url }
          : null,
        approvals: approvals && {
          approved: approvals.approved,
          approved_by: approvals.approved_by?.map((a: any) => a.user?.username),
          approvals_left: approvals.approvals_left,
        },
        url: mr.web_url,
      });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_mr_diff",
  "Get changed files and diffs of a merge request. Output is size-capped; use path_filter to focus on specific files.",
  {
    project,
    iid,
    path_filter: z.string().optional().describe("Only include files whose path contains this text"),
    include_noise: z.boolean().default(false).describe("Include lockfiles/generated files"),
  },
  async ({ project, iid, path_filter, include_noise }) => {
    try {
      let files = await fetchAllDiffs(P(project), iid);
      if (!include_noise) files = files.filter((f) => !NOISE.test(f.new_path));
      if (path_filter) {
        files = files.filter((f) => f.new_path.includes(path_filter) || f.old_path.includes(path_filter));
      }
      const out = files.map((f) => `=== ${fileTag(f)}: ${f.old_path} -> ${f.new_path} ===\n${f.diff}`).join("\n");
      return asText(`${files.length} file(s)\n\n${out}`);
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "review_merge_request",
  "One-call review package: MR details, automatic rule checks, pipeline + failed jobs, unresolved comments, and the diff (lockfiles/generated files skipped). Use this first when asked to review an MR.",
  {
    project,
    iid,
    max_diff_chars: z.number().int().min(5000).max(200000).default(40000),
  },
  async ({ project, iid, max_diff_chars }) => {
    try {
      const pe = P(project);
      const base = `/projects/${pe}/merge_requests/${iid}`;
      const [mr, files, pipelines, threads] = await Promise.all([
        gl(base),
        fetchAllDiffs(pe, iid),
        gl(`${base}/pipelines`).catch(() => [] as any[]),
        gl(`${base}/discussions`, { query: { per_page: 100 } }).catch(() => [] as any[]),
      ]);

      // --- pipeline ---
      const latest = pipelines[0];
      let failedJobs: any[] = [];
      if (latest) {
        const jobs = await gl(`/projects/${pe}/pipelines/${latest.id}/jobs`, {
          query: { per_page: 100 },
        }).catch(() => [] as any[]);
        failedJobs = jobs.filter((j: any) => j.status === "failed");
      }

      // --- unresolved threads ---
      const open = threads
        .map((t: any) => {
          const notes = t.notes.filter((n: any) => !n.system);
          const resolvable = notes.some((n: any) => n.resolvable);
          const resolved = resolvable && notes.every((n: any) => !n.resolvable || n.resolved);
          return resolvable && !resolved ? { t, notes } : null;
        })
        .filter(Boolean) as { t: any; notes: any[] }[];

      // --- rule checks ---
      const reviewFiles = files.filter((f) => !NOISE.test(f.new_path));
      const totalChanged = reviewFiles.reduce((n, f) => n + countChanged(f.diff ?? ""), 0);
      const codeFiles = reviewFiles.filter((f) => !TEST_PATH.test(f.new_path) && !DOC_PATH.test(f.new_path));
      const testFiles = reviewFiles.filter((f) => TEST_PATH.test(f.new_path));
      const warnings: string[] = [];
      if (!mr.description || mr.description.trim().length < 20) warnings.push("Description is missing or very short.");
      if (mr.draft) warnings.push("MR is marked as Draft.");
      if (mr.has_conflicts) warnings.push("MR has merge conflicts.");
      if (files.length > 30) warnings.push(`Large MR: ${files.length} files changed. Consider splitting.`);
      if (totalChanged > 800) warnings.push(`Large diff: ~${totalChanged} changed lines (excluding lockfiles/generated).`);
      if (codeFiles.length > 0 && testFiles.length === 0) warnings.push("Source files changed but no test files changed.");
      if (latest && latest.status !== "success") warnings.push(`Latest pipeline status is '${latest.status}'.`);
      if (!latest) warnings.push("No pipeline found for this MR.");
      if (open.length > 0) warnings.push(`${open.length} unresolved discussion thread(s).`);

      // --- diff, budgeted ---
      let used = 0;
      const included: string[] = [];
      const skipped: string[] = [];
      for (const f of files) {
        if (NOISE.test(f.new_path)) {
          skipped.push(`${f.new_path} (lockfile/generated)`);
          continue;
        }
        const chunk = `=== ${fileTag(f)}: ${f.old_path} -> ${f.new_path} ===\n${f.diff}\n`;
        if (used + chunk.length > max_diff_chars) {
          skipped.push(`${f.new_path} (over size budget; fetch with get_mr_diff path_filter)`);
          continue;
        }
        used += chunk.length;
        included.push(chunk);
      }

      const text = [
        `# MR !${mr.iid}: ${mr.title}`,
        `Author: ${mr.author?.username} | ${mr.source_branch} -> ${mr.target_branch} | state: ${mr.state}${mr.draft ? " (draft)" : ""}`,
        `Merge status: ${mr.detailed_merge_status ?? mr.merge_status} | URL: ${mr.web_url}`,
        `\n## Description\n${mr.description || "(none)"}`,
        `\n## Rule checks`,
        warnings.length ? warnings.map((w) => `- WARNING: ${w}`).join("\n") : "- All automatic checks passed.",
        `\n## Pipeline`,
        latest ? `Status: ${latest.status} (${latest.web_url})` : "No pipeline.",
        failedJobs.length
          ? "Failed jobs (use get_job_log with job_id):\n" +
            failedJobs.map((j) => `- ${j.name} [stage ${j.stage}] job_id=${j.id}`).join("\n")
          : "No failed jobs.",
        `\n## Unresolved comments (${open.length})`,
        open.length
          ? open
              .map(({ t, notes }) => {
                const pos = notes[0].position;
                const where = pos ? ` @ ${pos.new_path}:${pos.new_line ?? pos.old_line}` : "";
                return `- [${t.id}]${where}\n` + notes.map((n) => `    ${n.author?.username}: ${n.body}`).join("\n");
              })
              .join("\n")
          : "None.",
        `\n## Files (${files.length} changed)`,
        files.map((f) => `- ${f.new_path}`).join("\n"),
        skipped.length ? `\nNot shown in diff:\n${skipped.map((s) => `- ${s}`).join("\n")}` : "",
        `\n## Diff\n${included.join("\n")}`,
      ].join("\n");

      return asText(text);
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_pipeline_status",
  "Get the latest pipeline for a merge request and its jobs. Failed jobs are listed first.",
  { project, iid },
  async ({ project, iid }) => {
    try {
      const pe = P(project);
      const pipelines = await gl(`/projects/${pe}/merge_requests/${iid}/pipelines`);
      if (!pipelines.length) return asText("No pipelines found for this merge request.");
      const latest = pipelines[0];
      const jobs = await gl(`/projects/${pe}/pipelines/${latest.id}/jobs`, { query: { per_page: 100 } });
      jobs.sort((a: any, b: any) => Number(b.status === "failed") - Number(a.status === "failed"));
      return asText({
        pipeline: { id: latest.id, status: latest.status, ref: latest.ref, url: latest.web_url },
        jobs: jobs.map((j: any) => ({
          id: j.id,
          name: j.name,
          stage: j.stage,
          status: j.status,
          allow_failure: j.allow_failure,
          url: j.web_url,
        })),
      });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_job_log",
  "Get the tail of a CI job log (useful for failed jobs).",
  {
    project,
    job_id: z.number().int(),
    tail_lines: z.number().int().min(10).max(2000).default(200),
  },
  async ({ project, job_id, tail_lines }) => {
    try {
      const log: string = await gl(`/projects/${P(project)}/jobs/${job_id}/trace`, { text: true });
      const clean = log.replace(/\x1b\[[0-9;]*[A-Za-z]/g, ""); // strip ANSI colors
      return asText(clean.split("\n").slice(-tail_lines).join("\n"));
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "list_mr_comments",
  "List discussion threads on a merge request. Set unresolved_only to focus on open review feedback.",
  { project, iid, unresolved_only: z.boolean().default(true) },
  async ({ project, iid, unresolved_only }) => {
    try {
      const threads = await gl(`/projects/${P(project)}/merge_requests/${iid}/discussions`, {
        query: { per_page: 100 },
      });
      const out = threads
        .map((t: any) => {
          const notes = t.notes.filter((n: any) => !n.system);
          if (!notes.length) return null;
          const resolvable = notes.some((n: any) => n.resolvable);
          const resolved = resolvable && notes.every((n: any) => !n.resolvable || n.resolved);
          if (unresolved_only && (!resolvable || resolved)) return null;
          return {
            discussion_id: t.id,
            resolved,
            file: notes[0].position?.new_path,
            line: notes[0].position?.new_line,
            notes: notes.map((n: any) => ({ author: n.author?.username, body: n.body, created_at: n.created_at })),
          };
        })
        .filter(Boolean);
      return asText(out.length ? out : "No matching discussion threads.");
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_test_report",
  "Get the test results of a pipeline (from JUnit reports): totals plus only the failed/errored tests with their error output. Much cheaper than reading the full job log. Give iid (uses the MR's latest pipeline) or pipeline_id.",
  {
    project,
    iid: iid.optional(),
    pipeline_id: z.number().int().optional().describe("Specific pipeline ID; overrides iid"),
    max_failures: z.number().int().min(1).max(100).default(30),
    include_trace: z.boolean().default(true).describe("Include stack trace / error output for each failure"),
  },
  async ({ project, iid, pipeline_id, max_failures, include_trace }) => {
    try {
      const pe = P(project);
      let pid = pipeline_id;
      if (!pid) {
        if (!iid) throw new Error("Provide either iid or pipeline_id.");
        const pipelines = await gl(`/projects/${pe}/merge_requests/${iid}/pipelines`);
        if (!pipelines.length) return asText("No pipelines found for this merge request.");
        pid = pipelines[0].id as number;
      }
      const report = await gl(`/projects/${pe}/pipelines/${pid}/test_report`);
      if (!report.total_count) {
        return asText(
          `Pipeline ${pid} has no test report. Either tests have not run yet, or no job uploads JUnit XML ` +
            `(needs 'artifacts: reports: junit:' in .gitlab-ci.yml). Use get_job_log instead.`
        );
      }

      const failures: any[] = [];
      for (const suite of report.test_suites ?? []) {
        for (const c of suite.test_cases ?? []) {
          if (c.status === "failed" || c.status === "error") failures.push({ suite: suite.name, ...c });
        }
      }
      const shown = failures.slice(0, max_failures).map((c) => ({
        suite: c.suite,
        test: c.classname ? `${c.classname} :: ${c.name}` : c.name,
        status: c.status,
        seconds: c.execution_time,
        ...(include_trace
          ? { error: String(c.stack_trace || c.system_output || "").slice(0, 1200) || undefined }
          : {}),
      }));

      return asText({
        pipeline_id: pid,
        total: report.total_count,
        passed: report.success_count,
        failed: report.failed_count,
        errors: report.error_count,
        skipped: report.skipped_count,
        total_time_seconds: report.total_time,
        failures: shown,
        ...(failures.length > shown.length ? { not_shown: failures.length - shown.length } : {}),
      });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "get_file",
  "Read a file from the repository at a branch, tag or commit, with line numbers. Use it to see the code around a change (for a MR, pass ref = the source branch). Optional start_line/end_line to read just a section.",
  {
    project,
    file_path: z.string().describe("Path in the repo, e.g. 'src/app.ts'"),
    ref: z.string().optional().describe("Branch, tag or commit SHA. Defaults to the project's default branch."),
    start_line: z.number().int().min(1).optional(),
    end_line: z.number().int().min(1).optional(),
  },
  async ({ project, file_path, ref, start_line, end_line }) => {
    try {
      const pe = P(project);
      const useRef = ref || (await gl(`/projects/${pe}`)).default_branch;
      const raw: string = await gl(`/projects/${pe}/repository/files/${encodeURIComponent(file_path)}/raw`, {
        text: true,
        query: { ref: useRef },
      });
      const lines = raw.split("\n");
      const from = start_line ?? 1;
      const to = Math.min(end_line ?? lines.length, lines.length);
      if (from > lines.length) throw new Error(`File only has ${lines.length} lines.`);
      const width = String(to).length;
      const body = lines
        .slice(from - 1, to)
        .map((l, i) => `${String(from + i).padStart(width)}  ${l}`)
        .join("\n");
      return asText(`${file_path} @ ${useRef} (lines ${from}-${to} of ${lines.length})\n\n${body}`);
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "compare_branches",
  "Compare two refs (branches, tags or commits): commits and file diffs going from 'from' to 'to'. Useful for release notes, 'what is on this branch', or 'what changed between two tags'.",
  {
    project,
    from: z.string().describe("Base ref, e.g. 'main' or 'v1.2.0'"),
    to: z.string().describe("Head ref, e.g. 'feature/login' or 'v1.3.0'"),
    straight: z.boolean().default(false).describe("true = direct diff between the two refs; false = changes on 'to' since it branched off 'from'"),
    path_filter: z.string().optional().describe("Only include files whose path contains this text"),
    include_noise: z.boolean().default(false).describe("Include lockfiles/generated files"),
    include_diff: z.boolean().default(true).describe("false = commits and file list only"),
  },
  async ({ project, from, to, straight, path_filter, include_noise, include_diff }) => {
    try {
      const cmp = await gl(`/projects/${P(project)}/repository/compare`, { query: { from, to, straight } });
      if (cmp.compare_same_ref) return asText("Both refs are the same.");

      let files: any[] = cmp.diffs ?? [];
      if (!include_noise) files = files.filter((f) => !NOISE.test(f.new_path));
      if (path_filter) {
        files = files.filter((f) => f.new_path.includes(path_filter) || f.old_path.includes(path_filter));
      }

      const commits: any[] = cmp.commits ?? [];
      const out = [
        `# ${from} -> ${to}${straight ? " (straight diff)" : ""}`,
        cmp.compare_timeout ? "WARNING: GitLab timed out while comparing; the diff below may be incomplete." : "",
        `\n## Commits (${commits.length})`,
        commits
          .slice(0, 100)
          .map((c) => `- ${c.short_id} ${c.title} (${c.author_name})`)
          .join("\n") || "None.",
        commits.length > 100 ? `...and ${commits.length - 100} more` : "",
        `\n## Files (${files.length})`,
        files.map((f) => `- ${fileTag(f)}: ${f.new_path}`).join("\n") || "None.",
        include_diff
          ? `\n## Diff\n` +
            files.map((f) => `=== ${fileTag(f)}: ${f.old_path} -> ${f.new_path} ===\n${f.diff}`).join("\n")
          : "",
      ].join("\n");
      return asText(out);
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "check_mergeability",
  "Answer 'can this MR be merged?' in one call: checks state, draft, conflicts, rebase need, pipeline, unresolved threads and approval rules, and lists exactly what is blocking.",
  { project, iid },
  async ({ project, iid }) => {
    try {
      const base = `/projects/${P(project)}/merge_requests/${iid}`;
      const [mr, approvalState, threads] = await Promise.all([
        gl(base),
        gl(`${base}/approval_state`).catch(() => null), // not available on every GitLab tier
        gl(`${base}/discussions`, { query: { per_page: 100 } }).catch(() => [] as any[]),
      ]);

      const blockers: string[] = [];
      const notes: string[] = [];
      const status: string = mr.detailed_merge_status ?? mr.merge_status ?? "unknown";

      if (mr.state !== "opened") blockers.push(`MR is ${mr.state}, not open.`);
      if (mr.draft) blockers.push("MR is marked as Draft.");
      if (mr.has_conflicts) blockers.push("MR has merge conflicts with the target branch.");
      if (status === "need_rebase") blockers.push("Source branch needs a rebase onto the target branch.");
      if (status === "blocked_status") blockers.push("Blocked by another MR it depends on.");

      // pipeline
      const pl = mr.head_pipeline;
      if (!pl) {
        notes.push("No pipeline found for this MR.");
      } else if (["running", "pending", "created", "preparing", "waiting_for_resource", "scheduled"].includes(pl.status)) {
        blockers.push(`Pipeline is still ${pl.status} (${pl.web_url}).`);
      } else if (pl.status !== "success") {
        blockers.push(`Pipeline status is '${pl.status}' (${pl.web_url}).`);
      }

      // unresolved threads
      const open = threads.filter((t: any) => {
        const ns = t.notes.filter((n: any) => !n.system);
        const resolvable = ns.some((n: any) => n.resolvable);
        return resolvable && !ns.every((n: any) => !n.resolvable || n.resolved);
      });
      if (open.length) blockers.push(`${open.length} unresolved discussion thread(s): ${open.map((t: any) => t.id).join(", ")}`);

      // approvals
      if (approvalState?.rules) {
        for (const r of approvalState.rules) {
          const needed = (r.approvals_required ?? 0) - (r.approved_by?.length ?? 0);
          if (r.approvals_required > 0 && !r.approved && needed > 0) {
            const who = r.eligible_approvers?.map((a: any) => a.username).slice(0, 8).join(", ");
            blockers.push(`Approval rule '${r.name}' needs ${needed} more approval(s)${who ? ` (eligible: ${who})` : ""}.`);
          }
        }
      } else {
        const a = await gl(`${base}/approvals`).catch(() => null);
        if (a && a.approvals_left > 0) blockers.push(`${a.approvals_left} more approval(s) needed.`);
      }

      if (status === "checking" || status === "unchecked") {
        notes.push("GitLab is still computing mergeability. Run this again in a few seconds.");
      }
      if (mr.merge_when_pipeline_succeeds) notes.push("Auto-merge on pipeline success is already enabled.");
      if (mr.squash) notes.push("This MR is set to squash commits.");

      const ready = blockers.length === 0 && status === "mergeable";
      return asText({
        verdict: ready ? "READY TO MERGE" : blockers.length ? "NOT READY" : "UNCERTAIN (see notes)",
        gitlab_merge_status: status,
        blockers,
        notes,
        url: mr.web_url,
      });
    } catch (e) {
      return fail(e);
    }
  }
);

// =====================================================================
// WRITE tools (hidden unless GITLAB_READONLY=false)
// =====================================================================

server.tool(
  "post_mr_comment",
  "Post a general comment on a merge request. If discussion_id is given, replies in that thread.",
  { project, iid, body: z.string().min(1), discussion_id: z.string().optional() },
  async ({ project, iid, body, discussion_id }) => {
    try {
      assertWritable();
      const base = `/projects/${P(project)}/merge_requests/${iid}`;
      const path = discussion_id ? `${base}/discussions/${discussion_id}/notes` : `${base}/notes`;
      const note = await gl(path, { method: "POST", body: { body } });
      return asText({ posted: true, note_id: note.id });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "post_inline_comment",
  "Post a review comment on a specific line of a file in the MR diff. The line must be part of the diff (an added, removed, or nearby changed line).",
  {
    project,
    iid,
    file_path: z.string().describe("Path of the file as shown in the MR"),
    line: z.number().int().min(1).describe("Line number in the new version (or old version if side='old')"),
    side: z.enum(["new", "old"]).default("new").describe("'new' for added/changed lines, 'old' for removed lines"),
    body: z.string().min(1),
  },
  async ({ project, iid, file_path, line, side, body }) => {
    try {
      assertWritable();
      const pe = P(project);
      const base = `/projects/${pe}/merge_requests/${iid}`;
      const [mr, files] = await Promise.all([gl(base), fetchAllDiffs(pe, iid)]);
      const refs = mr.diff_refs;
      if (!refs) throw new Error("This MR has no diff_refs yet (it may have no changes).");
      const f = files.find((x) => x.new_path === file_path || x.old_path === file_path);
      if (!f) {
        throw new Error(`'${file_path}' is not in this MR's diff. Changed files: ${files.map((x) => x.new_path).join(", ")}`);
      }
      const position: Record<string, unknown> = {
        position_type: "text",
        base_sha: refs.base_sha,
        start_sha: refs.start_sha,
        head_sha: refs.head_sha,
        old_path: f.old_path,
        new_path: f.new_path,
      };
      if (side === "new") position.new_line = line;
      else position.old_line = line;

      const d = await gl(`${base}/discussions`, { method: "POST", body: { body, position } });
      return asText({ posted: true, discussion_id: d.id, file: f.new_path, line, side });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(
        new Error(
          msg.includes("400")
            ? `${msg}\nHint: GitLab only accepts inline comments on lines inside the diff. Check the line number and side.`
            : msg
        )
      );
    }
  }
);

server.tool(
  "resolve_thread",
  "Mark a discussion thread on a merge request as resolved (or reopen it).",
  { project, iid, discussion_id: z.string(), resolved: z.boolean().default(true) },
  async ({ project, iid, discussion_id, resolved }) => {
    try {
      assertWritable();
      await gl(`/projects/${P(project)}/merge_requests/${iid}/discussions/${discussion_id}`, {
        method: "PUT",
        body: { resolved },
      });
      return asText({ discussion_id, resolved });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "approve_merge_request",
  "Approve a merge request as the token's user.",
  { project, iid },
  async ({ project, iid }) => {
    try {
      assertWritable();
      await gl(`/projects/${P(project)}/merge_requests/${iid}/approve`, { method: "POST" });
      return asText({ approved: true });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "retry_job",
  "Retry a CI job (for example a failed or flaky one).",
  { project, job_id: z.number().int() },
  async ({ project, job_id }) => {
    try {
      assertWritable();
      const job = await gl(`/projects/${P(project)}/jobs/${job_id}/retry`, { method: "POST" });
      return asText({ retried: true, new_job_id: job.id, status: job.status, url: job.web_url });
    } catch (e) {
      return fail(e);
    }
  }
);

server.tool(
  "merge_merge_request",
  "Merge a merge request. Irreversible: requires confirm=true, so only use after the user explicitly asks.",
  {
    project,
    iid,
    confirm: z.literal(true).describe("Must be true"),
    squash: z.boolean().default(false),
    should_remove_source_branch: z.boolean().default(false),
  },
  async ({ project, iid, squash, should_remove_source_branch }) => {
    try {
      assertWritable();
      const mr = await gl(`/projects/${P(project)}/merge_requests/${iid}/merge`, {
        method: "PUT",
        body: { squash, should_remove_source_branch },
      });
      return asText({ state: mr.state, merge_commit_sha: mr.merge_commit_sha });
    } catch (e) {
      return fail(e);
    }
  }
);

// =====================================================================
// Prompts (one-click templates in clients that support them)
// =====================================================================

server.prompt(
  "review_mr",
  "Thorough code review of a merge request",
  { iid: z.string().describe("MR number, e.g. 142"), project: z.string().optional() },
  ({ iid, project }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            `Review merge request !${iid} in ${project || "the default project"}. ` +
            `Call review_merge_request first. Then give me: (1) a short summary of the change, ` +
            `(2) bugs, risks and security concerns ordered by severity with file:line, ` +
            `(3) missing tests or edge cases, (4) questions for the author, (5) a verdict: approve or request changes. ` +
            `Do not post comments or approve anything unless I ask.`,
        },
      },
    ],
  })
);

server.prompt(
  "debug_pipeline",
  "Explain why a merge request's pipeline failed",
  { iid: z.string().describe("MR number, e.g. 142"), project: z.string().optional() },
  ({ iid, project }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text:
            `The pipeline for merge request !${iid} in ${project || "the default project"} failed. ` +
            `Use get_pipeline_status, then get_job_log for each failed job. Explain the root cause, ` +
            `say whether it looks related to the MR's changes or flaky/infrastructure, and suggest a fix.`,
        },
      },
    ],
  })
);

server.prompt("my_review_queue", "What is waiting for my review?", {}, () => ({
  messages: [
    {
      role: "user" as const,
      content: {
        type: "text" as const,
        text:
          "Use my_merge_requests with role review_requested. List them oldest-updated first with title, author, " +
          "project and link, and tell me which look quick to review versus large.",
      },
    },
  ],
}));

// =====================================================================
await server.connect(new StdioServerTransport());
console.error(
  `gitlab-mr MCP server running (${BASE_URL}) - ${READONLY ? "READ-ONLY" : "WRITES ENABLED"}` +
    (DEFAULT_PROJECT ? ` - default project: ${DEFAULT_PROJECT}` : "") +
    (ALLOWED.length ? ` - allowlist: ${ALLOWED.join(", ")}` : "")
);
