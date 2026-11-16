// Run: node --test <skill-dir>/scripts/selftest.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { main, checkFinding } from "./harness.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "harness-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "api"), { recursive: true });
  writeFileSync(join(repo, "api", "deals.py"), "def get_deal(user, number):\n    return Deal.objects.get(number=number)\n");
  const g = (...a) => execFileSync("git", ["-C", repo, ...a], { stdio: "ignore" });
  g("init", "-q");
  g("-c", "user.email=t@t", "-c", "user.name=t", "add", ".");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  const dir = join(root, "state");
  const run = (...args) => main([...args, "--repo", repo, "--dir", dir]).out;
  const json = (name, value) => {
    const p = join(root, name);
    writeFileSync(p, JSON.stringify(value));
    return p;
  };
  return { repo, root, run, json, g };
}

const unit = { surface: "GET /api/deals/{number}", boundary: "org ownership", subsystem: "deals", attack_class: "access-control", paths: ["api/deals.py"], priority: 1 };

const finding = (over = {}) => ({
  fingerprint: "access-control:api/deals.py:get_deal",
  title: "Deal lookup is not scoped to the caller's organization",
  attack_class: "access-control",
  threat_model: { attacker: "signed-in member of org B", entry_point: "GET /api/deals/{number}", boundary: "org tenancy", asset: "org A deal terms" },
  trace: [
    { path: "api/deals.py", line: 1, role: "entrypoint" },
    { path: "api/deals.py", line: 2, role: "sink" },
  ],
  proposed_verdict: "confirmed",
  poc: { kind: "test", command: "pytest api/tests/test_deal_idor.py", expected: "org B reads org A deal (200)" },
  patch: "--- a/api/deals.py\n+++ b/api/deals.py\n@@ -2 +2 @@\n-    return Deal.objects.get(number=number)\n+    return Deal.objects.get(number=number, org__members=user)\n",
  ...over,
});

test("full loop: init, claim, submit, validate, report", () => {
  const { run, json } = fixture();
  assert.equal(run("init").id, "run-1");
  run("unit", "import", json("units.json", [unit]));
  const [claimed] = run("next", "--agent", "hunter-1");
  assert.equal(claimed.status, "in_progress");
  const res = run("submit", "hunter-1", json("r.json", { units: [{ unit_id: claimed.id, disposition: "candidate", reviewed_paths: ["api/deals.py"] }], candidates: [finding()] }));
  assert.deepEqual(res.findings, ["access-control:api/deals.py:get_deal"]);
  assert.deepEqual(res.rejected, []);
  assert.throws(() => run("verdict", "access-control:api/deals.py:get_deal", "--agent", "hunter-1", "--verdict", "confirmed", "--reachability", "internet_authenticated", "--severity", "high"), /separation of duties/);
  run("verdict", "access-control:api/deals.py:get_deal", "--agent", "validator-1", "--verdict", "confirmed", "--reachability", "internet_authenticated", "--severity", "high");
  const report = run("report");
  assert.match(report, /\| high \| internet_authenticated \| Deal lookup/);
  assert.match(report, /```diff/);
  assert.equal(run("status").findings.confirmed, 1);
});

test("deterministic checks reject vacuous findings", () => {
  const { repo } = fixture();
  const errs = checkFinding(repo, finding({ threat_model: { attacker: "", entry_point: "x", boundary: "y", asset: "z" }, patch: "just trust me", trace: [{ path: "api/missing.py", role: "sink" }] }));
  assert.ok(errs.some((e) => e.includes("threat_model.attacker")));
  assert.ok(errs.some((e) => e.includes("unified diff")));
  assert.ok(errs.some((e) => e.includes("does not exist")));
  assert.ok(checkFinding(repo, finding({ trace: [{ path: "../etc/passwd", role: "sink" }] })).some((e) => e.includes("repo-relative")));
  assert.ok(checkFinding(repo, finding({ trace: [{ path: "api/deals.py", line: 99, role: "sink" }] })).some((e) => e.includes("outside")));
  assert.ok(checkFinding(repo, finding({ fingerprint: "access-control:api/deals.py:2" })).some((e) => e.includes("line number")));
  assert.ok(checkFinding(repo, finding({ severity: "high" })).some((e) => e.includes("validator does")));
  assert.ok(checkFinding(repo, finding({ proposed_verdict: "needs_validation", poc: undefined, patch: undefined })).some((e) => e.includes("blocker")));
});

test("bad candidates are reported, not stored; zero-read units are shallow and requeued", () => {
  const { run, json } = fixture();
  run("init");
  run("unit", "import", json("units.json", [unit]));
  const [u] = run("next", "--agent", "hunter-1");
  const res = run("submit", "hunter-1", json("r.json", { units: [{ unit_id: u.id, disposition: "covered", reviewed_paths: [] }], candidates: [finding({ patch: "nope" })] }));
  assert.equal(res.closed[u.id], "shallow");
  assert.equal(res.findings.length, 0);
  assert.equal(res.rejected.length, 1);
  const gf = run("gapfill");
  assert.deepEqual(gf.requeued, [u.id]);
  assert.equal(gf.empty_cells.length, 1);
  assert.equal(run("next", "--agent", "hunter-2")[0].id, u.id);
});

test("duplicate fingerprints merge and every hunter is barred from validating", () => {
  const { run, json } = fixture();
  run("init");
  run("finding", "add", json("f.json", finding()), "--agent", "hunter-1");
  assert.equal(run("finding", "add", json("f.json", finding()), "--agent", "hunter-2").created, false);
  assert.throws(() => run("verdict", finding().fingerprint, "--agent", "hunter-2", "--verdict", "rejected", "--reason", "x"), /separation of duties/);
  assert.throws(() => run("verdict", finding().fingerprint, "--agent", "validator-1", "--verdict", "needs_validation", "--severity", "low"), /only confirmed/);
});

test("uncovered surfaces become new units; changed source requeues covered units on the next run", () => {
  const { run, json, repo, g } = fixture();
  run("init");
  run("unit", "import", json("units.json", [unit]));
  const [u] = run("next", "--agent", "hunter-1");
  const res = run("submit", "hunter-1", json("r.json", { units: [{ unit_id: u.id, disposition: "covered", reviewed_paths: ["api/deals.py"] }], uncovered: [{ surface: "POST /api/deals/export", boundary: "org ownership", subsystem: "deals", attack_class: "data-exposure", paths: ["api/deals.py"], reason: "export path" }] }));
  assert.equal(res.uncovered.length, 1);
  writeFileSync(join(repo, "api", "deals.py"), "def get_deal(user, number):\n    return None\n");
  g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qam", "change");
  const r2 = run("init");
  assert.equal(r2.id, "run-2");
  assert.ok(r2.requeued.includes(u.id));
});
