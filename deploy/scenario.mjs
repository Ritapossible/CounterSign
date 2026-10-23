// Phase 4/5: the scenario table on chain, each case once per run (3 runs).
//
// A fictional auditor's pages live on the `live` branch of this repository,
// one directory per network and run (deploy/demo_pages.py). Edits are
// committed and pushed mid-run; a recheck waits until the edit is visible
// at raw.githubusercontent.com and then a further CDN_MARGIN, so every
// validator fetches the same version.
//
//   COUNTERSIGN_KEYS=<dir> LIVE_DIR=<checkout of live> node scenario.mjs studio
// Resumable: every finished step is in deploy/scenario-<network>.json.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { accountFor, clientFor, deployFile, readBuild, readUntil, readView, sendTx } from "./lib.mjs";

const network = process.argv[2] || "studio";
const RUNS = Number(process.env.RUNS || 3);
const LIVE = process.env.LIVE_DIR;
if (!LIVE) throw new Error("LIVE_DIR: a checkout of the live branch");
// Studio and Studio Next both report about 40 s after a request (measured).
const STUDIO = network === "studio" || network === "studionext";
const MISS_GAP = STUDIO ? 300 : 3600;
const READ_WINDOW = STUDIO ? 600 : 7200;
const REPORT_WAIT = STUDIO ? 900 : 9000; // seconds to wait for a report to land (past READ_WINDOW)
const CDN_MARGIN = 330; // raw.githubusercontent.com caches for 300 s
const GEN = 10n ** 18n;
const STAKE = GEN / 10n, FEE = GEN / 100n, REWARD = GEN / 50n;

const ACME = "Acme Lending lending contracts v2 March 2026 Northlight audit report";
const NEGATIVE_ROW = "Acme Lending lending contracts v2 March 2026 engagement cancelled before fieldwork, no report issued";
const SAMPLE = "Borealis Swap router and pools v1 January 2026 Northlight audit report";
const SCOPE = JSON.stringify(["lending contracts v2", "March 2026"]);
const raw = (r, name) => `https://raw.githubusercontent.com/Ritapossible/CounterSign/live/demo/${network}/r${r}/${name}`;

const who = { deployer: "principal", auditor: "vendor", project: "funder", keeper: "challenger", keeper2: "agent" };
const C = Object.fromEntries(Object.entries(who).map(([k, role]) => [k, clientFor(network, role)]));
const A = Object.fromEntries(Object.entries(who).map(([k, role]) => [k, accountFor(role).address.toLowerCase()]));

const OUT = new URL(process.env.RECORD || `./scenario-${network}.json`, import.meta.url);
const rec = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { network, accounts: A, pages: {}, done: {}, checks: [] };
const save = () => { rec.recorded_at = new Date().toISOString(); fs.writeFileSync(OUT, JSON.stringify(rec, null, 2)); };

function check(name, ok, detail = {}) {
  rec.checks.push({ name, ok: !!ok, ...detail });
  save();
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}`, ok ? "" : JSON.stringify(detail));
}

/** Run ``fn`` once; its result is kept in the record so a rerun skips it. */
async function once(key, fn) {
  if (key in rec.done) return rec.done[key];
  const v = await fn();
  rec.done[key] = v ?? null;
  save();
  return rec.done[key];
}

const view = (fn, args = []) => readView(C.deployer, rec.board, fn, args);
const claim = (id) => view("get_claim", [id]);
const auditor = (id) => view("get_auditor", [id]);
const owed = async (k) => BigInt(await view("owed_to", [A[k]]));
const status = () => view("status");

/**
 * The id of the entry or claim a write just created, found by its content,
 * never from a count: on Bradbury a read straight after acceptance can be
 * stale, and a stale count once gave four registrations and four postings
 * the wrong id (the aborted run, scenario-bradbury-aborted.json). Ids already
 * assigned are skipped, newest first.
 */
async function locate(kind, match) {
  const used = new Set((rec.used && rec.used[kind]) || []);
  const get = kind === "auditor" ? auditor : claim;
  const { value } = await readUntil(async () => {
    const n = (await status())[kind === "auditor" ? "auditors" : "claims"];
    for (let id = n - 1; id >= 0; id--) {
      if (used.has(id)) continue;
      if (match(await get(id))) return id;
    }
    return -1;
  }, (v) => v >= 0, { seconds: STUDIO ? 60 : 1800, every: 10 });
  if (value < 0) throw new Error(`no ${kind} found for this write`);
  rec.used = rec.used || {};
  (rec.used[kind] = rec.used[kind] || []).push(value);
  save();
  return value;
}

async function tx(k, fn, args, label, value = 0n) {
  const t = await sendTx(C[k], rec.board, fn, args, label, value);
  console.log(`  tx ${label}: ${t.consensus} ${t.leader} ${t.hash}`);
  return { hash: t.hash, consensus: t.consensus, leader: t.leader };
}

async function settle(id, ok, label) {
  const { value, waited } = await readUntil(() => claim(id), ok, { seconds: REPORT_WAIT, every: 6 });
  console.log(`  ${label}: ${value.state} after ${waited ?? "timeout"}s`);
  return { claim: value, waited };
}

/** What a Reader transaction shows: status, votes, and the leader's output. */
async function readerTx(hash) {
  const t = await C.deployer.getTransaction({ hash }).catch(() => null);
  if (!t) return { hash };
  const hex = String(t.eqBlocksOutputs || "").replace(/^0x/, "");
  const out = Buffer.from(hex, "hex").toString("latin1");
  return {
    hash, status: t.statusName ?? t.status_name, result: t.resultName ?? t.result_name,
    votes: t.lastRound?.validatorVotes ?? Object.values(t.consensus_data?.votes ?? {}),
    rotations: String(t.initialRotations ?? ""), leader_output: out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1) || null,
  };
}

/**
 * Wait for a read to report. A read the Board triggers by message gets no
 * leader rotations (measured on Bradbury: one leader's failed fetch ended
 * claim 5's read). So when the Reader holds no record of the open read after
 * a grace period, the read failed: anyone retries it with an ordinary
 * transaction, which the network rotates. Every failed read and every retry
 * is recorded. ``kind``: "claim" or "auditor".
 */
async function awaitRead(kind, id, done, label) {
  const get = kind === "claim" ? claim : auditor;
  const key = (kind === "claim" ? "c:" : "a:") + id;
  const grace = STUDIO ? 120 : 900;
  const retries = [];
  const t0 = Date.now();
  for (;;) {
    const { value: x } = await readUntil(() => get(id), done, { seconds: grace, every: 8 });
    if (done(x)) return { value: x, retries, waited: Math.round((Date.now() - t0) / 1000) };
    if (kind === "claim" && (!x.read || x.now > x.read.due)) return { value: x, retries, late: true };
    if ((Date.now() - t0) / 1000 > REPORT_WAIT) return { value: x, retries, gaveUp: true };
    const last = await readView(C.deployer, rec.reader, "last_read", [key]).catch(() => ({}));
    const recorded = kind === "claim" ? last && last.seq === x.read.seq : last && "ok" in last;
    if (recorded) continue; // the read happened; its report lands at finality
    if (retries.length >= 3) continue; // three retries failed: wait for the deadline
    const t = await sendTx(C.keeper2, rec.reader, kind === "claim" ? "retry_claim" : "retry_registration", [id], `retry ${key}`);
    const info = await readerTx(t.hash);
    retries.push({ ...info, consensus: t.consensus, leader: t.leader, at: Math.floor(Date.now() / 1000) });
    rec.failed_reads = [...(rec.failed_reads || []), { key, label, read: kind === "claim" ? x.read : null, retry: retries.at(-1) }];
    save();
    console.log(`  ${label}: the Reader holds no record of the read; retried -> ${t.consensus} ${info.result ?? ""}`);
  }
}

/**
 * Wait for a read's report, retrying a read that failed. A read with no
 * agreed report by its deadline is closed the way the design says: anyone
 * calls `expire`; a posting is refused, a re-check returns its fee and is not
 * a miss. The expiry is recorded as an event, never hidden.
 */
async function settleOrExpire(id, ok, label) {
  const { value: c0, waited, retries, late } = await awaitRead("claim", id, ok, label);
  console.log(`  ${label}: ${c0.state}${late ? " (deadline passed)" : ""}`);
  if (ok(c0) || !late || !c0.read) return { claim: c0, waited, retries };
  const t = await tx("keeper2", "expire", [id], `expire claim ${id}`);
  const { value: c } = await readUntil(() => claim(id), (c) => !c.read, { seconds: 600, every: 6 });
  const event = { id, label, read: c0.read, expire: t, state_after: c.state, misses_after: c.misses, why: c.why };
  rec.expired = [...(rec.expired || []), { ...event, retries }];
  save();
  console.log(`  ${label}: no report by the deadline; expired -> ${c.state}`);
  return { claim: c, waited, expired: event, retries };
}

function git(...args) {
  return execFileSync("git", ["-C", LIVE, ...args], { encoding: "utf8" }).trim();
}

/** Write a stage of the pages, push it, and wait until the CDN serves it. */
async function publish(stage) {
  return once(`pages:${stage}`, async () => {
    execFileSync("python3", [new URL("./demo_pages.py", import.meta.url).pathname, LIVE, stage, network, String(RUNS)]);
    git("add", "-A");
    const dirty = git("status", "--porcelain");
    if (dirty) {
      git("-c", "user.name=Ritapossible", "-c", "user.email=egwuaturita95@gmail.com", "commit", "-qm",
        `Demo pages: ${network} ${stage} (fictional auditor; never merge)`);
      // Another network's run may push to live too: rebase onto it first.
      for (let i = 0; i < 5; i++) {
        try { git("pull", "-q", "--rebase", "origin", "live"); git("push", "-q", "origin", "live"); break; }
        catch (e) { if (i === 4) throw e; await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); }
      }
    }
    const commit = git("rev-parse", "HEAD");
    // Wait until every page of this network serves what was committed.
    const t0 = Date.now();
    for (;;) {
      let stale = 0;
      for (let r = 1; r <= RUNS; r++) {
        for (const name of ["happy.html", "withdraw.html", "delete.html", "outage.html", "inject.html", "negative.html"]) {
          const local = `${LIVE}/demo/${network}/r${r}/${name}`;
          const want = fs.existsSync(local) ? fs.readFileSync(local, "utf8") : null;
          const res = await fetch(raw(r, name), { cache: "no-store" }).catch(() => null);
          const got = res && res.ok ? await res.text() : null;
          if (got !== want) stale++;
        }
      }
      if (!stale) break;
      if (Date.now() - t0 > 1800_000) throw new Error(`pages:${stage} still stale after 30 min`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
    const visible = Math.round((Date.now() - t0) / 1000);
    console.log(`pages ${stage}: ${commit.slice(0, 7)} visible after ${visible}s; waiting ${CDN_MARGIN}s more`);
    await new Promise((r) => setTimeout(r, CDN_MARGIN * 1000));
    return { commit, visible_after_s: visible };
  });
}

// ------------------------------------------------------------------ deploy

await publish("initial");
if (!rec.reader) {
  rec.reader = (await deployFile(C.deployer, readBuild("countersign_reader"), [], "reader deploy")).address;
  save();
}
if (!rec.board) {
  rec.board = (await deployFile(C.deployer, readBuild("countersign_board"), [rec.reader, MISS_GAP, READ_WINDOW], "board deploy")).address;
  save();
}
await once("bind", () => sendTx(C.deployer, rec.reader, "bind", [rec.board], "bind").then((t) => ({ hash: t.hash, consensus: t.consensus })));
console.log("reader", rec.reader, "board", rec.board);

// ------------------------------------------------------- 1. registrations

const ENTRIES = [
  ["happy", "happy.html", SAMPLE, "registered"],
  ["spa", "spa.html", SAMPLE, "refused"],
  ["nosample", "happy.html", SAMPLE.replace("v1", "v9"), "refused"],
  ["hidden", "hidden.html", SAMPLE, "registered"],
  ["flagged", "flagged.html", SAMPLE, "registered"],
  ["withdraw", "withdraw.html", SAMPLE, "registered"],
  ["delete", "delete.html", SAMPLE, "registered"],
  ["outage", "outage.html", SAMPLE, "registered"],
  ["inject", "inject.html", SAMPLE, "registered"],
  ["negative", "negative.html", SAMPLE, "registered"],
];
for (let r = 1; r <= RUNS; r++) {
  for (const [name, file, sample] of ENTRIES) {
    await once(`r${r}:register:${name}`, async () => {
      // Kept apart, so a restart never sends the same registration twice.
      const t = await once(`r${r}:register:${name}:tx`, () => tx("auditor", "register", [`Northlight Security (demo r${r})`, raw(r, file), sample], `r${r} register ${name}`));
      const id = await locate("auditor", (a) => a.url === raw(r, file) && a.sample === sample && a.signer === A.auditor);
      return { id, ...t };
    });
  }
}
for (let r = 1; r <= RUNS; r++) {
  for (const [name, , , expected] of ENTRIES) {
    await once(`r${r}:registered:${name}`, async () => {
      const id = rec.done[`r${r}:register:${name}`].id;
      const { value, waited, retries } = await awaitRead("auditor", id, (a) => a.state !== "pending", `r${r} register ${name}`);
      check(`r${r} register ${name}: ${expected}`, value.state === expected, { id, state: value.state, waited, retries });
      return { state: value.state, waited, retries };
    });
  }
}
const entry = (r, name) => rec.done[`r${r}:register:${name}`].id;

// ---------------------------------------------------------------- 2. posts

async function post(r, key, auditorName, { scope = SCOPE, passage = ACME, refused = false } = {}) {
  return once(`r${r}:post:${key}`, async () => {
    const before = await owed("project");
    const t = await once(`r${r}:post:${key}:tx`, () => tx("project", "post", [entry(r, auditorName), "Acme Lending", scope, passage], `r${r} post ${key}`, STAKE));
    // A posting refused before any read creates no claim; its check reads the refusal record.
    if (refused) return { id: -1, owed_before: String(before), ...t };
    const aud = entry(r, auditorName), sc = JSON.stringify(JSON.parse(scope).map((x) => x.trim()));
    const id = await locate("claim", (c) => c.auditor === aud && c.passage === passage && JSON.stringify(c.scope) === sc && c.project === A.project);
    return { id, owed_before: String(before), ...t };
  });
}

for (let r = 1; r <= RUNS; r++) {
  for (const k of ["happy", "absent", "hidden", "flagged", "withdraw", "delete", "outage", "inject", "negative"]) {
    const opts = k === "absent" ? { passage: "Acme Lending lending contracts v2 March 2026 Northlight final audit report" }
      : k === "negative" ? { passage: NEGATIVE_ROW } : {};
    await post(r, k, k === "absent" ? "happy" : k, opts);
  }
  await once(`r${r}:scope-missing`, async () => {
    // The refusal records the value it credited back. (A difference in owed
    // is not used: other claims' reports land asynchronously in between.)
    const p = await post(r, "scope", "happy", { scope: JSON.stringify(["lending contracts v2", "April 2026"]), refused: true });
    const refusal = await view("refusal_of", [A.project]);
    const reason = refusal.reason || "";
    check(`r${r} scope string missing: refused at once, stake credited back`,
      p.id === -1 && String(refusal.returned) === String(STAKE) && reason.includes("April 2026"), { id: p.id, refusal });
    return { reason, returned: String(refusal.returned) };
  });
  // The reviewer's case: a passage that names Acme and its scope and says
  // they were not audited is refused before any read, contraction or not.
  for (const [key, passage] of [
    ["negated", "Acme Lending lending contracts v2 March 2026 was not audited by Northlight"],
    ["contracted", "Acme Lending lending contracts v2 March 2026 wasn't audited by Northlight"],
  ]) {
    await once(`r${r}:${key}`, async () => {
      const p = await post(r, key, "happy", { passage, refused: true });
      const refusal = await view("refusal_of", [A.project]);
      const reason = refusal.reason || "";
      check(`r${r} passage says not audited (${key}): refused at once, stake credited back`,
        p.id === -1 && String(refusal.returned) === String(STAKE) && reason.includes("not audited"), { id: p.id, refusal });
      return { reason, returned: String(refusal.returned) };
    });
  }
}

const EXPECT_POST = { happy: "live", absent: "refused", hidden: "refused", flagged: "refused", withdraw: "live", delete: "live", outage: "live", inject: "live", negative: "refused" };
const ABSENT = { passage: "Acme Lending lending contracts v2 March 2026 Northlight final audit report" };
for (let r = 1; r <= RUNS; r++) {
  for (const [k, expected] of Object.entries(EXPECT_POST)) {
    await once(`r${r}:posted:${k}`, async () => {
      let { id } = rec.done[`r${r}:post:${k}`];
      let { claim: c, waited, expired } = await settleOrExpire(id, (c) => c.state !== "pending", `r${r} post ${k}`);
      let repost = null;
      if (expired) {
        check(`r${r} post ${k}: a read that never reported expired as silent; refused, stake returned`,
          c.state === "refused" && /silent/.test(c.why), expired);
        if (expected === "live") {
          // As a project would: post again, and run the case on the new claim.
          const p2 = await post(r, k + "#2", k === "absent" ? "happy" : k, k === "absent" ? ABSENT : {});
          id = p2.id;
          ({ claim: c, waited } = await settleOrExpire(id, (c) => c.state !== "pending", `r${r} post ${k} (again)`));
          repost = { id, hash: p2.hash };
        }
      }
      const last = await readView(C.deployer, rec.reader, "last_read", [`c:${id}`]);
      check(`r${r} post ${k}: ${expected}`, c.state === expected, { id, state: c.state, why: c.why, reader: last, waited, repost });
      return { state: c.state, waited, reader: last, expired: !!expired, repost };
    });
  }
}

// ---------------------------------- 3. a pending claim: recheck and withdraw

// All runs at once: post, try to re-check while pending, withdraw; then wait
// past finality for the posting reports, which must be ignored.
for (let r = 1; r <= RUNS; r++) {
  await once(`r${r}:pending`, async () => {
    const p = await post(r, "pending", "happy");
    const id = p.id;
    const keeperBefore = await owed("keeper");
    const t1 = await tx("keeper", "recheck", [id], `r${r} recheck pending`, FEE);
    const refusal = await view("refusal_of", [A.keeper]);
    const refunded = (await owed("keeper")) - keeperBefore;
    const projectBefore = await owed("project");
    const t2 = await tx("project", "withdraw_claim", [id], `r${r} withdraw pending`);
    const c = await claim(id);
    const returned = (await owed("project")) - projectBefore;
    check(`r${r} re-check a pending claim: refused, fee back`,
      (refusal.reason || "").includes("only a live claim") && String(refusal.returned) === String(FEE), { id, refusal });
    check(`r${r} withdraw a pending claim: withdrawn, stake returned`,
      c.state === "withdrawn" && returned === STAKE, { id, state: c.state, returned: String(returned) });
    return { id, recheck: t1, withdraw: t2 };
  });
}
for (let r = 1; r <= RUNS; r++) {
  await once(`r${r}:pending-late`, async () => {
    const id = rec.done[`r${r}:pending`].id;
    const { value: last } = await readUntil(() => readView(C.deployer, rec.reader, "last_read", [`c:${id}`]), (v) => v && v.kind,
      { seconds: REPORT_WAIT, every: 10 });
    return { id, reader: last, reader_seen_at: Date.now() };
  });
}
await once("wait:pending-finality", async () => {
  // The Reader recorded each read; its report reaches the Board at finality.
  const wait = STUDIO ? 90 : 2400;
  await new Promise((s) => setTimeout(s, wait * 1000));
  return wait;
});
for (let r = 1; r <= RUNS; r++) {
  await once(`r${r}:checked:pending-late`, async () => {
    const id = rec.done[`r${r}:pending`].id;
    const later = await claim(id);
    check(`r${r} a late report for a withdrawn claim is ignored`, later.state === "withdrawn",
      { id, reader: rec.done[`r${r}:pending-late`].reader, state: later.state });
    return true;
  });
}

// ------------------------------------------------ re-checks, sent in batches

/**
 * Send every re-check of a stage, then wait for all of their reports.
 * items: [{ r, key, id, keeper, label }]. Money is checked per batch: the
 * sum of what each keeper and the project should be credited.
 */
/** What one re-check did, from the claim after it, and what it pays. */
function outcomeOf(c, expired) {
  if (expired) return "expired"; // no result: the fee goes back, misses unchanged
  if (c.state === "down") return /denies/.test(c.why) ? "denied" : "silent-down";
  return c.misses === 0 ? "confirmed" : "silent";
}
function paysFor(kind, keeper, owe) {
  if (kind === "confirmed") owe.project += FEE;
  else if (kind === "expired") owe[keeper] += FEE;
  else if (kind === "silent") owe[keeper] += FEE;
  else { owe[keeper] += REWARD + FEE; owe.project += STAKE - REWARD; }
}

async function recheckBatch(stage, items) {
  // The balances before the batch, and each re-check, are recorded as soon as
  // they exist: a run killed mid-batch once took its "before" balances again
  // after one re-check had already paid out, and sent that re-check twice
  // (superseded check in scenario-studio.json).
  const sent = await once(`batch:${stage}:sent`, async () => {
    const before = await once(`batch:${stage}:before`, async () =>
      ({ project: String(await owed("project")), keeper: String(await owed("keeper")), keeper2: String(await owed("keeper2")) }));
    const out = {};
    for (const it of items) {
      out[it.key + ":" + it.r] = await once(`batch:${stage}:${it.key}:${it.r}:tx`, async () => {
        const seq = (await claim(it.id)).seq;
        const t = await tx(it.keeper, "recheck", [it.id], `r${it.r} ${it.label}`, FEE);
        return { ...t, id: it.id, seq, sent_at: Math.floor(Date.now() / 1000) };
      });
    }
    return { before, out };
  });
  return once(`batch:${stage}:settled`, async () => {
    const results = {};
    const owe = { project: 0n, keeper: 0n, keeper2: 0n };
    for (const it of items) {
      const s0 = sent.out[it.key + ":" + it.r];
      let { claim: c, waited, expired } = await settleOrExpire(it.id, (c) => c.seq > s0.seq && !c.read, `r${it.r} ${it.label}`);
      const attempts = [{ hash: s0.hash, outcome: outcomeOf(c, expired), expired: !!expired }];
      paysFor(outcomeOf(c, expired), it.keeper, owe);
      // An expired re-check is no result (fee back, misses unchanged): the
      // keeper re-checks once more, whatever the case under test.
      if (expired && c.state === "live") {
        const seq = c.seq;
        const t = await tx(it.keeper, "recheck", [it.id], `r${it.r} ${it.label} (again)`, FEE);
        let again;
        ({ claim: c, waited, expired: again } = await settleOrExpire(it.id, (c) => c.seq > seq && !c.read, `r${it.r} ${it.label} (again)`));
        attempts.push({ hash: t.hash, outcome: outcomeOf(c, again), expired: !!again });
        paysFor(outcomeOf(c, again), it.keeper, owe);
      }
      const last = await readView(C.deployer, rec.reader, "last_read", [`c:${it.id}`]);
      results[it.key + ":" + it.r] = { ...s0, state: c.state, misses: c.misses, why: c.why, miss_at: c.miss_at, checked_at: c.checked_at, waited, reader: last, attempts };
    }
    const delta = {}, expected = {};
    for (const k of ["project", "keeper", "keeper2"]) {
      delta[k] = String((await owed(k)) - BigInt(sent.before[k]));
      expected[k] = String(owe[k]);
    }
    return { results, delta, expected };
  });
}
const cid = (r, k) => (rec.done[`r${r}:posted:${k}`]?.repost || rec.done[`r${r}:post:${k}`]).id;
const runs = [...Array(RUNS).keys()].map((i) => i + 1);
const sum = (n, x) => String(BigInt(n) * x);

// ------------------------------------------------ 4. recheck, page unchanged

{
  const b = await recheckBatch("unchanged", runs.map((r) => ({ r, key: "unchanged", id: cid(r, "happy"), keeper: "keeper", label: "recheck unchanged", expect: "confirmed" })));
  await once("checked:unchanged", () => {
    for (const r of runs) {
      const x = b.results[`unchanged:${r}`];
      check(`r${r} re-check an unchanged page: live`, x.state === "live" && x.misses === 0, x);
    }
    check("re-checks of unchanged pages: the money matches each re-check's outcome",
      JSON.stringify(b.delta) === JSON.stringify(b.expected), { delta: b.delta, expected: b.expected });
    return true;
  });
}

// ------------------------------------------------- 5. the auditor edits pages

await publish("edited");
{
  const items = [];
  for (const r of runs) {
    items.push({ r, key: "withdrawn", id: cid(r, "withdraw"), keeper: "keeper", label: "recheck withdrawn", expect: "denied" });
    items.push({ r, key: "deleted-1", id: cid(r, "delete"), keeper: "keeper", label: "recheck deleted (1st)", expect: "silent" });
    items.push({ r, key: "outage-1", id: cid(r, "outage"), keeper: "keeper", label: "recheck page down", expect: "silent" });
    items.push({ r, key: "inject", id: cid(r, "inject"), keeper: "keeper", label: "recheck injection", expect: "denied" });
  }
  const b = await recheckBatch("edited", items);
  await once("checked:edited", () => {
    for (const r of runs) {
      const w = b.results[`withdrawn:${r}`], d = b.results[`deleted-1:${r}`], o = b.results[`outage-1:${r}`], j = b.results[`inject:${r}`];
      check(`r${r} auditor withdraws beside the row: down`, w.state === "down" && /denies/.test(w.why), w);
      check(`r${r} auditor deletes the row, first re-check: live, one miss`, d.state === "live" && d.misses === 1, d);
      check(`r${r} page unreachable once: live, one miss`, o.state === "live" && o.misses === 1, o);
      check(`r${r} page talks to the jury: down`, j.state === "down" && /denies/.test(j.why), j);
    }
    // A take-down pays the keeper reward + fee and the rest of the stake to the project; a miss returns the fee.
    check("edited pages: the money matches each re-check's outcome",
      JSON.stringify(b.delta) === JSON.stringify(b.expected), { delta: b.delta, expected: b.expected });
    return true;
  });
}

// A second silent read of the deleted row, at least MISS_GAP after the first.
await once("wait:miss-gap", async () => {
  const b = rec.done["batch:edited:settled"];
  const firsts = runs.map((r) => b.results[`deleted-1:${r}`].miss_at);
  const now = (await claim(cid(1, "delete"))).now;
  const wait = Math.max(0, Math.max(...firsts) + MISS_GAP + 30 - now);
  console.log(`waiting ${wait}s for MISS_GAP`);
  await new Promise((s) => setTimeout(s, wait * 1000));
  return wait;
});
{
  const b = await recheckBatch("deleted-2", runs.map((r) => ({ r, key: "deleted-2", id: cid(r, "delete"), keeper: "keeper2", label: "recheck deleted (2nd)", expect: "silent" })));
  await once("checked:deleted-2", () => {
    for (const r of runs) {
      const d2 = b.results[`deleted-2:${r}`];
      check(`r${r} auditor deletes the row, second re-check MISS_GAP later: down`, d2.state === "down" && /twice/.test(d2.why), d2);
    }
    check("second silent reads: the money matches each re-check's outcome",
      JSON.stringify(b.delta) === JSON.stringify(b.expected), { delta: b.delta, expected: b.expected });
    return true;
  });
}

// ----------------------------------------- 6. the page is back; withdraw live

await publish("restored");
{
  const b = await recheckBatch("outage-2", runs.map((r) => ({ r, key: "outage-2", id: cid(r, "outage"), keeper: "keeper", label: "recheck page back", expect: "confirmed" })));
  await once("checked:outage-2", () => {
    for (const r of runs) {
      const o2 = b.results[`outage-2:${r}`];
      check(`r${r} page back: live, misses reset`, o2.state === "live" && o2.misses === 0, o2);
    }
    check("pages back: the money matches each re-check's outcome",
      JSON.stringify(b.delta) === JSON.stringify(b.expected), { delta: b.delta, expected: b.expected });
    return true;
  });
}
for (const r of runs) {
  await once(`r${r}:withdraw-live`, async () => {
    const before = await owed("project");
    const t = await tx("project", "withdraw_claim", [cid(r, "happy")], `r${r} withdraw live`);
    const c = await claim(cid(r, "happy"));
    const returned = (await owed("project")) - before;
    check(`r${r} withdraw a live claim: withdrawn, stake returned`, c.state === "withdrawn" && returned === STAKE,
      { ...t, state: c.state, returned: String(returned) });
    return t;
  });
}

// --------------------------------------------------------- 7. every path

await once("final", async () => {
  const s = await status();
  const auditorOwed = await owed("auditor");
  check("every path: the auditor is owed nothing", auditorOwed === 0n, { owed: String(auditorOwed) });
  const received = BigInt(s.received), held = BigInt(s.held), owedTotal = BigInt(s.owed), balance = BigInt(s.balance);
  // Everything received is held, owed, or already collected out.
  const collected = (rec.collected || []).reduce((t, x) => t + BigInt(x), 0n);
  check("every path: the Board's books balance (balance = held + owed; received = held + owed + collected)",
    balance === held + owedTotal && received === held + owedTotal + collected, { ...s, collected: String(collected) });
  // Collect for whoever is owed. Value sent by emit_transfer leaves the Board
  // when the collect transaction finalises: wait for the wallet to be paid.
  const payee = (await owed("keeper2")) > 0n ? "keeper2" : (await owed("keeper")) > 0n ? "keeper" : "project";
  const due = await owed(payee);
  const wallet0 = await C.deployer.getBalance({ address: A[payee] });
  const board0 = await C.deployer.getBalance({ address: rec.board });
  const t = await tx(payee, "collect", [], `${payee} collects`);
  // On a fee network the payee also pays for sending collect: its wallet rises
  // by the payout less at most that transaction's fee deposit.
  let deposit = 0n;
  if (C.deployer.withFees) {
    const ct = await C.deployer.getTransaction({ hash: t.hash });
    deposit = (ct.data?.fee_accounting?.top_ups || []).reduce((s, x) => s + BigInt(x.amount), 0n);
  }
  const { value: paid, waited } = await readUntil(
    async () => ({ wallet: (await C.deployer.getBalance({ address: A[payee] })) - wallet0, board: board0 - (await C.deployer.getBalance({ address: rec.board })) }),
    (v) => v.wallet >= due - deposit && v.board >= due, { seconds: REPORT_WAIT, every: 10 });
  const after = await status();
  rec.collected = [...(rec.collected || []), String(due)];
  check("collect zeroes what is owed, and the wallet is paid at finality",
    (await owed(payee)) === 0n && paid.board === due && paid.wallet <= due && paid.wallet >= due - deposit &&
      BigInt(after.balance) === BigInt(after.held) + BigInt(after.owed),
    { ...t, payee, collected: String(due), wallet_delta: String(paid.wallet), board_delta: String(paid.board), fee_deposit: String(deposit), waited, status: after });
  return { status: after };
});

const failed = rec.checks.filter((c) => !c.ok);
rec.summary = { checks: rec.checks.length, failed: failed.length };
save();
console.log(`${rec.checks.length} checks, ${failed.length} failed`);
