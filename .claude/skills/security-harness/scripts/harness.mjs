#!/usr/bin/env node
// Security harness state CLI: externalized, resumable state for audit runs.
// Zero dependencies (Node >= 18). The model is a stateless worker; this file is the bookkeeping.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, normalize, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const HELP = `security harness — externalized audit state

usage: harness.mjs <command> [options]     (global: --dir <state-dir>  --repo <path>)

  init [--profile quick|standard|deep]      start a run; requeues open work and changed-source units
  status                                    counts by unit status and finding verdict
  unit add --surface S --boundary B --subsystem X --attack-class C --paths a,b [--priority 1-5]
  unit import <units.json>                  add many units (array of the fields above)
  next --agent ID [--n 1]                   claim the highest-priority planned units (prints JSON)
  submit <agent> <result.json>              record a hunter result (units, candidates, wishlist, uncovered)
  finding add <finding.json> --agent ID     add one candidate finding
  check                                     re-run deterministic checks on every finding
  verdict <fingerprint> --agent ID --verdict confirmed|needs_validation|rejected
          [--reachability R] [--severity S] [--reason TEXT] [--blocker TEXT ...]
  merge <keep-fingerprint> <drop-fingerprint>
  wishlist add --need TEXT --context TEXT [--unit ID]
  gapfill                                   requeue shallow units; list empty subsystem x class cells
  report                                    render REPORT.md to stdout (no model)

State defaults to ~/.security-harness/<repo-name>/state.json (outside the repo).`;

export const UNIT_STATUSES = ["planned", "in_progress", "covered", "candidate", "blocked", "shallow", "deferred"];
export const VERDICTS = ["candidate", "confirmed", "needs_validation", "rejected"];
export const REACHABILITY = ["internet_unauthenticated", "internet_authenticated", "internal", "latent", "unknown"];
export const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const ROLES = ["entrypoint", "propagation", "control", "sink"];
const FINGERPRINT_RE = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/;
const AGENT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

class HarnessError extends Error {}
const fail = (msg) => {
  throw new HarnessError(msg);
};
const now = () => new Date().toISOString();

// ---------- state ----------

function git(repo, args) {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function repoName(repo) {
  const remote = git(repo, ["remote", "get-url", "origin"]);
  if (remote) return basename(remote).replace(/\.git$/, "");
  return basename(resolve(repo));
}

export function statePath(opts) {
  const dir = opts.dir ? resolve(opts.dir) : join(homedir(), ".security-harness", repoName(opts.repo));
  return join(dir, "state.json");
}

export function emptyState(repo) {
  return { version: 1, repo: resolve(repo), runs: [], current_run: null, units: {}, findings: {}, wishlist: [], hardening: [] };
}

export function loadState(opts) {
  const p = statePath(opts);
  if (!existsSync(p)) return emptyState(opts.repo);
  return JSON.parse(readFileSync(p, "utf8"));
}

export function saveState(opts, state) {
  const p = statePath(opts);
  mkdirSync(join(p, ".."), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  renameSync(tmp, p); // atomic: a crash loses only the command in flight
}

function requireRun(state) {
  if (!state.current_run) fail("no active run; run `init` first");
  return state.current_run;
}

// ---------- units ----------

export function unitId(u) {
  const key = [u.surface, u.boundary, u.subsystem, u.attack_class].map((s) => String(s).trim()).join("␟");
  return "u_" + createHash("sha256").update(key).digest("hex").slice(0, 12);
}

export function addUnit(state, raw, { wave = 1 } = {}) {
  for (const f of ["surface", "boundary", "subsystem", "attack_class"]) {
    if (typeof raw[f] !== "string" || !raw[f].trim()) fail(`unit missing ${f}`);
  }
  const paths = Array.isArray(raw.paths) ? raw.paths : String(raw.paths || "").split(",").filter(Boolean);
  const priority = raw.priority === undefined ? 3 : Number(raw.priority);
  if (!Number.isInteger(priority) || priority < 1 || priority > 5) fail("priority must be an integer 1-5");
  const id = unitId(raw);
  if (state.units[id]) return { id, created: false };
  state.units[id] = {
    id,
    surface: raw.surface.trim(),
    boundary: raw.boundary.trim(),
    subsystem: raw.subsystem.trim(),
    attack_class: raw.attack_class.trim(),
    paths,
    priority,
    status: "planned",
    agent: null,
    wave,
    reviewed_paths: [],
    notes: "",
    attempts: [],
    run_id: state.current_run,
  };
  return { id, created: true };
}

export function claimUnits(state, agent, n) {
  requireRun(state);
  if (!AGENT_RE.test(agent)) fail(`agent id must match ${AGENT_RE}`);
  const planned = Object.values(state.units)
    .filter((u) => u.status === "planned")
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const claimed = planned.slice(0, n);
  for (const u of claimed) {
    u.status = "in_progress";
    u.agent = agent;
    u.claimed_at = now();
  }
  return claimed;
}

function closeUnit(state, agent, r) {
  const u = state.units[r.unit_id];
  if (!u) fail(`unknown unit ${r.unit_id}`);
  if (u.status !== "in_progress" || u.agent !== agent) fail(`unit ${r.unit_id} is not claimed by ${agent}`);
  if (!["covered", "candidate", "blocked"].includes(r.disposition)) fail(`bad disposition for ${r.unit_id}`);
  const reviewed = Array.isArray(r.reviewed_paths) ? r.reviewed_paths : [];
  u.reviewed_paths = reviewed;
  u.notes = r.notes || "";
  u.closed_at = now();
  if (reviewed.length === 0) {
    // A unit closed without reading anything is shallow: usually a crashed tool, not clean code.
    u.attempts.push({ agent, disposition: r.disposition, shallow: true, at: u.closed_at });
    u.status = "shallow";
    return "shallow";
  }
  u.status = r.disposition;
  return r.disposition;
}

// ---------- findings ----------

function safeRepoPath(repo, p) {
  if (typeof p !== "string" || !p || isAbsolute(p) || normalize(p).split(sep).includes("..")) return null;
  return join(repo, p);
}

export function checkFinding(repo, f) {
  const errs = [];
  if (!f || typeof f !== "object") return ["finding is not an object"];
  if (typeof f.fingerprint !== "string" || !FINGERPRINT_RE.test(f.fingerprint)) errs.push("fingerprint missing or malformed");
  else if (/:\d+$/.test(f.fingerprint)) errs.push("fingerprint must not end in a line number");
  if (typeof f.title !== "string" || f.title.trim().length < 8) errs.push("title missing or too short");
  if (typeof f.attack_class !== "string" || !f.attack_class) errs.push("attack_class missing");
  const tm = f.threat_model || {};
  for (const k of ["attacker", "entry_point", "boundary", "asset"]) {
    if (typeof tm[k] !== "string" || !tm[k].trim()) errs.push(`threat_model.${k} missing (threat model comes first)`);
  }
  if (!Array.isArray(f.trace) || f.trace.length === 0) errs.push("trace must be a non-empty array");
  else {
    f.trace.forEach((t, i) => {
      if (!ROLES.includes(t.role)) errs.push(`trace[${i}].role must be one of ${ROLES.join("|")}`);
      const abs = safeRepoPath(repo, t.path);
      if (!abs) return errs.push(`trace[${i}].path must be repo-relative: ${t.path}`);
      if (!existsSync(abs) || !statSync(abs).isFile()) return errs.push(`trace[${i}].path does not exist: ${t.path}`);
      if (t.line !== undefined) {
        const lines = readFileSync(abs, "utf8").split("\n").length;
        if (!Number.isInteger(t.line) || t.line < 1 || t.line > lines) errs.push(`trace[${i}].line ${t.line} outside ${t.path} (${lines} lines)`);
      }
    });
    if (f.trace.length > 1) {
      if (f.trace[0].role !== "entrypoint") errs.push("multi-step trace must start at an entrypoint");
      if (f.trace[f.trace.length - 1].role !== "sink") errs.push("multi-step trace must end at a sink");
    }
  }
  const pv = f.proposed_verdict;
  if (!["confirmed", "needs_validation"].includes(pv)) errs.push("proposed_verdict must be confirmed|needs_validation");
  if (pv === "confirmed") {
    const poc = f.poc || {};
    if (!poc.command || !poc.expected || !["test", "request", "fixture", "script"].includes(poc.kind)) {
      errs.push("confirmed needs poc {kind, command, expected} that runs against untouched code");
    }
    if (typeof f.patch !== "string" || !/^--- /m.test(f.patch) || !/^\+\+\+ /m.test(f.patch) || !/^@@/m.test(f.patch)) {
      errs.push("confirmed needs patch as a unified diff (---, +++, @@)");
    }
  }
  if (pv === "needs_validation") {
    if (!Array.isArray(f.blockers) || f.blockers.length === 0) errs.push("needs_validation needs at least one exact blocker");
    if (typeof f.validation_plan !== "string" || !f.validation_plan.trim()) errs.push("needs_validation needs a validation_plan");
  }
  if ("severity" in f) errs.push("hunters do not assign severity; the validator does");
  return errs;
}

export function addFinding(state, repo, f, agent) {
  requireRun(state);
  const errs = checkFinding(repo, f);
  if (errs.length) fail(`finding ${f?.fingerprint ?? "?"} rejected by deterministic checks:\n  - ${errs.join("\n  - ")}`);
  const existing = state.findings[f.fingerprint];
  if (existing) {
    // Same root cause: keep one record, remember every hunter so none of them can validate it.
    existing.found_by = [...new Set([...existing.found_by, agent])];
    existing.duplicates = (existing.duplicates || 0) + 1;
    return { fingerprint: f.fingerprint, created: false };
  }
  state.findings[f.fingerprint] = { ...f, verdict: "candidate", found_by: [agent], verdicts: [], run_id: state.current_run, added_at: now() };
  return { fingerprint: f.fingerprint, created: true };
}

export function recordVerdict(state, fp, { agent, verdict, reachability, severity, reason, blockers = [] }) {
  const f = state.findings[fp];
  if (!f) fail(`unknown finding ${fp}`);
  if (!AGENT_RE.test(agent || "")) fail("verdict needs --agent");
  if (f.found_by.includes(agent)) fail(`separation of duties: ${agent} hunted ${fp} and cannot validate it`);
  if (!["confirmed", "needs_validation", "rejected"].includes(verdict)) fail("verdict must be confirmed|needs_validation|rejected");
  if (verdict === "confirmed") {
    if (!REACHABILITY.includes(reachability)) fail(`confirmed needs --reachability ${REACHABILITY.join("|")}`);
    if (!SEVERITIES.includes(severity)) fail(`confirmed needs --severity ${SEVERITIES.join("|")}`);
    if (!f.poc || !f.patch) fail("confirmed needs a PoC and a patch on the finding");
  } else if (severity) {
    fail("only confirmed findings carry severity");
  }
  if (verdict === "needs_validation" && blockers.length === 0 && !(f.blockers || []).length) fail("needs_validation needs --blocker");
  if (verdict === "rejected" && !reason) fail("rejected needs --reason");
  f.verdict = verdict;
  f.reachability = verdict === "confirmed" ? reachability : reachability || f.reachability || "unknown";
  f.severity = verdict === "confirmed" ? severity : undefined;
  if (blockers.length) f.blockers = blockers;
  f.verdicts.push({ agent, verdict, reachability: f.reachability, severity: f.severity, reason: reason || "", at: now() });
  return f;
}

export function mergeFindings(state, keep, drop) {
  const k = state.findings[keep];
  const d = state.findings[drop];
  if (!k || !d) fail("both fingerprints must exist");
  k.found_by = [...new Set([...k.found_by, ...d.found_by])];
  k.merged = [...(k.merged || []), drop];
  delete state.findings[drop];
  return k;
}

// ---------- hunter results ----------

export function submitResult(state, repo, agent, result) {
  requireRun(state);
  const out = { closed: {}, findings: [], rejected: [], uncovered: [], wishlist: 0 };
  for (const r of result.units || []) out.closed[r.unit_id] = closeUnit(state, agent, r);
  for (const c of result.candidates || []) {
    try {
      out.findings.push(addFinding(state, repo, c, agent).fingerprint);
    } catch (e) {
      if (!(e instanceof HarnessError)) throw e;
      out.rejected.push(e.message);
    }
  }
  for (const w of result.wishlist || []) {
    state.wishlist.push({ ...w, agent, run_id: state.current_run, at: now(), status: "open" });
    out.wishlist++;
  }
  for (const h of result.hardening || []) state.hardening.push({ note: h, agent, run_id: state.current_run });
  const wave = Math.max(1, ...Object.values(state.units).map((u) => u.wave)) + 1;
  for (const u of result.uncovered || []) {
    const { id, created } = addUnit(state, { ...u, priority: u.priority ?? 2 }, { wave });
    if (created) out.uncovered.push(id);
  }
  return out;
}

// ---------- runs and coverage ----------

export function initRun(state, repo, profile) {
  if (!["quick", "standard", "deep"].includes(profile)) fail("profile must be quick|standard|deep");
  const commit = git(repo, ["rev-parse", "HEAD"]);
  const dirty = Boolean(git(repo, ["status", "--porcelain"]));
  const prev = state.runs.at(-1);
  const id = `run-${state.runs.length + 1}`;
  state.runs.push({ id, started_at: now(), commit, dirty, profile });
  state.current_run = id;
  let changed = new Set();
  if (prev?.commit && commit && prev.commit !== commit) {
    const diff = git(repo, ["diff", "--name-only", prev.commit, commit]);
    changed = new Set((diff || "").split("\n").filter(Boolean));
  }
  const requeued = [];
  for (const u of Object.values(state.units)) {
    const open = ["in_progress", "shallow", "blocked"].includes(u.status);
    const stale = ["covered", "candidate"].includes(u.status) && [...u.paths, ...u.reviewed_paths].some((p) => changed.has(p));
    if (open || stale) {
      u.attempts.push({ agent: u.agent, disposition: u.status, at: now(), reason: open ? "carried open work" : "source changed" });
      u.status = "planned";
      u.agent = null;
      requeued.push(u.id);
    }
  }
  return { id, commit, dirty, requeued };
}

export function gapfill(state) {
  requireRun(state);
  const requeued = [];
  for (const u of Object.values(state.units)) {
    if (u.status === "shallow") {
      u.status = "planned";
      u.agent = null;
      u.priority = Math.max(1, u.priority - 1);
      requeued.push(u.id);
    }
  }
  const subsystems = [...new Set(Object.values(state.units).map((u) => u.subsystem))].sort();
  const classes = [...new Set(Object.values(state.units).map((u) => u.attack_class))].sort();
  const emptyCells = [];
  for (const s of subsystems) {
    for (const c of classes) {
      const cell = Object.values(state.units).filter((u) => u.subsystem === s && u.attack_class === c);
      if (!cell.some((u) => ["covered", "candidate"].includes(u.status))) emptyCells.push({ subsystem: s, attack_class: c, units: cell.length });
    }
  }
  return { requeued, empty_cells: emptyCells };
}

export function status(state) {
  const units = Object.fromEntries(UNIT_STATUSES.map((s) => [s, 0]));
  for (const u of Object.values(state.units)) units[u.status]++;
  const findings = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  for (const f of Object.values(state.findings)) findings[f.verdict]++;
  return { run: state.current_run, runs: state.runs.length, units, findings, wishlist_open: state.wishlist.filter((w) => w.status === "open").length };
}

const REACH_RANK = Object.fromEntries(REACHABILITY.map((r, i) => [r, i]));
const SEV_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderReport(state) {
  const run = state.runs.find((r) => r.id === state.current_run) || {};
  const st = status(state);
  const all = Object.values(state.findings);
  const confirmed = all
    .filter((f) => f.verdict === "confirmed")
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || REACH_RANK[a.reachability] - REACH_RANK[b.reachability] || a.fingerprint.localeCompare(b.fingerprint));
  const nv = all.filter((f) => f.verdict === "needs_validation").sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  const pending = all.filter((f) => f.verdict === "candidate");
  const L = [];
  L.push(`# Security harness report — ${basename(state.repo)}`, "");
  L.push(`Run \`${run.id}\` · profile \`${run.profile}\` · commit \`${(run.commit || "unknown").slice(0, 12)}\`${run.dirty ? " (dirty worktree)" : ""} · started ${run.started_at}`, "");
  L.push("Source review and local, sandboxed checks only. No deployed system was probed.", "");
  if (pending.length) L.push(`**Incomplete:** ${pending.length} candidate(s) not yet validated: ${pending.map((f) => `\`${f.fingerprint}\``).join(", ")}. They are not findings.`, "");
  L.push("## Coverage", "");
  L.push("| covered | candidate | blocked | shallow | planned | in progress | deferred |", "|---|---|---|---|---|---|---|");
  const u = st.units;
  L.push(`| ${u.covered} | ${u.candidate} | ${u.blocked} | ${u.shallow} | ${u.planned} | ${u.in_progress} | ${u.deferred} |`, "");
  if (u.planned || u.in_progress || u.shallow) L.push("This is a partial pass: planned, in-progress or shallow units remain.", "");
  L.push("## Confirmed findings", "");
  if (!confirmed.length) L.push("None confirmed in this run.", "");
  else {
    L.push("| severity | reachability | title | boundary | fingerprint |", "|---|---|---|---|---|");
    for (const f of confirmed) L.push(`| ${f.severity} | ${f.reachability} | ${cell(f.title)} | ${cell(f.threat_model.boundary)} | \`${f.fingerprint}\` |`);
    L.push("");
    for (const f of confirmed) {
      L.push(`### ${f.title}`, "");
      L.push(`- **Attacker:** ${f.threat_model.attacker}`, `- **Entry point:** ${f.threat_model.entry_point}`, `- **Boundary:** ${f.threat_model.boundary}`, `- **Asset:** ${f.threat_model.asset}`);
      if (f.impact) L.push(`- **Impact:** ${f.impact}`);
      L.push(`- **Trace:** ${f.trace.map((t) => `\`${t.path}${t.line ? `:${t.line}` : ""}\` (${t.role})`).join(" → ")}`);
      L.push(`- **PoC (${f.poc.kind}):** \`${f.poc.command}\` — ${f.poc.expected}`);
      L.push(`- **Validated by:** ${f.verdicts.at(-1)?.agent} · found by ${f.found_by.join(", ")}`, "");
      L.push("```diff", f.patch.trimEnd(), "```", "");
    }
  }
  L.push("## Needs validation", "");
  if (!nv.length) L.push("None.", "");
  else {
    L.push("| title | blocker | plan | fingerprint |", "|---|---|---|---|");
    for (const f of nv) L.push(`| ${cell(f.title)} | ${cell((f.blockers || []).join("; "))} | ${cell(f.validation_plan)} | \`${f.fingerprint}\` |`);
    L.push("");
  }
  const open = state.wishlist.filter((w) => w.status === "open");
  L.push("## Wishlist", "");
  if (!open.length) L.push("Empty.", "");
  else for (const w of open) L.push(`- **${cell(w.need)}** — ${cell(w.context)} _(from ${w.agent})_`);
  if (open.length) L.push("");
  L.push("## Hardening notes", "");
  if (!state.hardening.length) L.push("None.", "");
  else for (const h of state.hardening) L.push(`- ${cell(h.note)}`);
  const rejected = all.filter((f) => f.verdict === "rejected").length;
  L.push("", `_${rejected} candidate(s) rejected by validators are kept in state so later runs don't re-file them unchanged._`, "");
  return L.join("\n");
}

// ---------- CLI ----------

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    fail(`cannot read JSON from ${p}: ${e.message}`);
  }
}

export function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      dir: { type: "string" },
      repo: { type: "string", default: "." },
      profile: { type: "string", default: "standard" },
      agent: { type: "string" },
      n: { type: "string", default: "1" },
      surface: { type: "string" },
      boundary: { type: "string" },
      subsystem: { type: "string" },
      "attack-class": { type: "string" },
      paths: { type: "string", default: "" },
      priority: { type: "string" },
      verdict: { type: "string" },
      reachability: { type: "string" },
      severity: { type: "string" },
      reason: { type: "string" },
      blocker: { type: "string", multiple: true, default: [] },
      need: { type: "string" },
      context: { type: "string" },
      unit: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [cmd, sub, ...rest] = positionals;
  if (values.help || !cmd) return { out: HELP };
  const repo = resolve(values.repo);
  const opts = { dir: values.dir, repo };
  const state = loadState(opts);
  let out;
  switch (cmd) {
    case "init":
      out = initRun(state, repo, values.profile);
      break;
    case "status":
      return { out: status(state) };
    case "unit":
      requireRun(state);
      if (sub === "add") {
        out = addUnit(state, { surface: values.surface, boundary: values.boundary, subsystem: values.subsystem, attack_class: values["attack-class"], paths: values.paths, priority: values.priority });
      } else if (sub === "import") {
        const units = readJson(rest[0]);
        if (!Array.isArray(units)) fail("units file must be a JSON array");
        out = units.map((x) => addUnit(state, x));
      } else fail("unit add | unit import <file>");
      break;
    case "next":
      out = claimUnits(state, values.agent || "", Number(values.n));
      break;
    case "submit":
      if (!sub || !rest[0]) fail("submit <agent> <result.json>");
      out = submitResult(state, repo, sub, readJson(rest[0]));
      break;
    case "finding":
      if (sub !== "add" || !rest[0]) fail("finding add <finding.json> --agent ID");
      if (!AGENT_RE.test(values.agent || "")) fail("finding add needs --agent");
      out = addFinding(state, repo, readJson(rest[0]), values.agent);
      break;
    case "check": {
      const problems = {};
      for (const f of Object.values(state.findings)) {
        const errs = checkFinding(repo, f).filter((e) => !e.startsWith("hunters do not assign severity"));
        if (errs.length) problems[f.fingerprint] = errs;
      }
      return { out: problems, code: Object.keys(problems).length ? 1 : 0 };
    }
    case "verdict":
      out = recordVerdict(state, sub, { agent: values.agent, verdict: values.verdict, reachability: values.reachability, severity: values.severity, reason: values.reason, blockers: values.blocker });
      break;
    case "merge":
      out = mergeFindings(state, sub, rest[0]);
      break;
    case "wishlist":
      requireRun(state);
      if (sub !== "add" || !values.need || !values.context) fail("wishlist add --need TEXT --context TEXT");
      state.wishlist.push({ need: values.need, context: values.context, unit: values.unit || null, agent: values.agent || "parent", run_id: state.current_run, at: now(), status: "open" });
      out = { wishlist: state.wishlist.length };
      break;
    case "gapfill":
      out = gapfill(state);
      break;
    case "report":
      return { out: renderReport(state) };
    default:
      fail(`unknown command ${cmd}\n\n${HELP}`);
  }
  saveState(opts, state);
  return { out };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  try {
    const { out, code = 0 } = main(process.argv.slice(2));
    process.stdout.write((typeof out === "string" ? out : JSON.stringify(out, null, 2)) + "\n");
    process.exitCode = code;
  } catch (e) {
    process.stderr.write(`error: ${e.message}\n`);
    process.exitCode = e instanceof HarnessError ? 2 : 1;
  }
}
