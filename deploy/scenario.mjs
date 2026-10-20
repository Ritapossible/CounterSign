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
const STUDIO = network === "studio";
const MISS_GAP = STUDIO ? 300 : 3600;
const READ_WINDOW = STUDIO ? 600 : 7200;
const REPORT_WAIT = STUDIO ? 900 : 7200; // seconds to wait for a report to land
const CDN_MARGIN = 330; // raw.githubusercontent.com caches for 300 s
const GEN = 10n ** 18n;
const STAKE = GEN / 10n, FEE = GEN / 100n, REWARD = GEN / 50n;

const ACME = "Acme Lending lending contracts v2 March 2026 Northlight audit report";
const SAMPLE = "Borealis Swap router and pools v1 January 2026 Northlight audit report";
const SCOPE = JSON.stringify(["lending contracts v2", "March 2026"]);
const raw = (r, name) => `https://raw.githubusercontent.com/Ritapossible/CounterSign/live/demo/${network}/r${r}/${name}`;

const who = { deployer: "principal", auditor: "vendor", project: "funder", keeper: "challenger", keeper2: "agent" };
const C = Object.fromEntries(Object.entries(who).map(([k, role]) => [k, clientFor(network, role)]));
const A = Object.fromEntries(Object.entries(who).map(([k, role]) => [k, accountFor(role).address.toLowerCase()]));

const OUT = new URL(`./scenario-${network}.json`, import.meta.url);
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
      for (let i = 0; i < 5; i++) {
        try { git("push", "-q", "origin", "live"); break; } catch (e) { if (i === 4) throw e; await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); }
      }
    }
    const commit = git("rev-parse", "HEAD");
    // Wait until every page of this network serves what was committed.
    const t0 = Date.now();
    for (;;) {
      let stale = 0;
      for (let r = 1; r <= RUNS; r++) {
        for (const name of ["happy.html", "withdraw.html", "delete.html", "outage.html", "inject.html"]) {
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
];
for (let r = 1; r <= RUNS; r++) {
  for (const [name, file, sample] of ENTRIES) {
    await once(`r${r}:register:${name}`, async () => {
      const id = (await status()).auditors;
      const t = await tx("auditor", "register", [`Northlight Security (demo r${r})`, raw(r, file), sample], `r${r} register ${name}`);
      return { id, ...t };
    });
  }
}
for (let r = 1; r <= RUNS; r++) {
  for (const [name, , , expected] of ENTRIES) {
    await once(`r${r}:registered:${name}`, async () => {
      const id = rec.done[`r${r}:register:${name}`].id;
      const { value, waited } = await readUntil(() => auditor(id), (a) => a.state !== "pending", { seconds: REPORT_WAIT, every: 6 });
      check(`r${r} register ${name}: ${expected}`, value.state === expected, { id, state: value.state, waited });
      return { state: value.state, waited };
    });
  }
}
const entry = (r, name) => rec.done[`r${r}:register:${name}`].id;

// ---------------------------------------------------------------- 2. posts

async function post(r, key, auditorName, { scope = SCOPE, passage = ACME } = {}) {
  return once(`r${r}:post:${key}`, async () => {
    const before = await owed("project");
    const id = (await status()).claims;
    const t = await tx("project", "post", [entry(r, auditorName), "Acme Lending", scope, passage], `r${r} post ${key}`, STAKE);
    const after = await status();
    return { id: after.claims > id ? id : -1, owed_before: String(before), ...t };
  });
}

for (let r = 1; r <= RUNS; r++) {
  for (const k of ["happy", "absent", "hidden", "flagged", "withdraw", "delete", "outage", "inject"]) {
    const opts = k === "absent" ? { passage: "Acme Lending lending contracts v2 March 2026 Northlight final audit report" } : {};
    await post(r, k, k === "absent" ? "happy" : k, opts);
  }
  await once(`r${r}:scope-missing`, async () => {
    // The refusal records the value it credited back. (A difference in owed
    // is not used: other claims' reports land asynchronously in between.)
    const p = await post(r, "scope", "happy", { scope: JSON.stringify(["lending contracts v2", "April 2026"]) });
    const refusal = await view("refusal_of", [A.project]);
    const reason = refusal.reason || "";
    check(`r${r} scope string missing: refused at once, stake credited back`,
      p.id === -1 && String(refusal.returned) === String(STAKE) && reason.includes("April 2026"), { id: p.id, refusal });
    return { reason, returned: String(refusal.returned) };
  });
}

const EXPECT_POST = { happy: "live", absent: "refused", hidden: "refused", flagged: "refused", withdraw: "live", delete: "live", outage: "live", inject: "live" };
for (let r = 1; r <= RUNS; r++) {
  for (const [k, expected] of Object.entries(EXPECT_POST)) {
    await once(`r${r}:posted:${k}`, async () => {
      const { id } = rec.done[`r${r}:post:${k}`];
      const { claim: c, waited } = await settle(id, (c) => c.state !== "pending", `r${r} post ${k}`);
      const last = await readView(C.deployer, rec.reader, "last_read", [`c:${id}`]);
      check(`r${r} post ${k}: ${expected}`, c.state === expected, { id, state: c.state, why: c.why, reader: last, waited });
      return { state: c.state, waited, reader: last };
    });
  }
}

// ---------------------------------- 3. a pending claim: recheck and withdraw

for (let r = 1; r <= RUNS; r++) {
  await once(`r${r}:pending`, async () => {
    const p = await post(r, "pending", "happy");
    const id = p.id;
    const keeperBefore = await owed("keeper");
    const t1 = await tx("keeper", "recheck", [id], `r${r} recheck pending`, FEE);
    const reason = (await view("refusal_of", [A.keeper])).reason || "";
    const refunded = (await owed("keeper")) - keeperBefore;
    const projectBefore = await owed("project");
    const t2 = await tx("project", "withdraw_claim", [id], `r${r} withdraw pending`);
    const c = await claim(id);
    const returned = (await owed("project")) - projectBefore;
    check(`r${r} re-check a pending claim: refused, fee back`,
      reason.includes("only a live claim") && refunded === FEE, { id, reason, refunded: String(refunded), state_at_recheck: "pending" });
    check(`r${r} withdraw a pending claim: withdrawn, stake returned`,
      c.state === "withdrawn" && returned === STAKE, { id, state: c.state, returned: String(returned) });
    // The Reader's report for the posting read still lands; it must be ignored.
    const { value: last } = await readUntil(() => readView(C.deployer, rec.reader, "last_read", [`c:${id}`]), (v) => v && v.kind,
      { seconds: REPORT_WAIT, every: 6 });
    await new Promise((s) => setTimeout(s, (STUDIO ? 60 : 1800) * 1000)); // past finality
    const later = await claim(id);
    check(`r${r} a late report for a withdrawn claim is ignored`, later.state === "withdrawn", { id, reader: last, state: later.state });
    return { id, recheck: t1, withdraw: t2, reader: last };
  });
}

// ------------------------------------------------ 4. recheck, page unchanged

async function recheck(r, key, id, keeperKey, label) {
  return once(`r${r}:recheck:${key}`, async () => {
    const before = { project: await owed("project"), keeper: await owed(keeperKey) };
    const seq = (await claim(id)).seq;
    const t = await tx(keeperKey, "recheck", [id], `r${r} ${label}`, FEE);
    const { claim: c, waited } = await settle(id, (c) => c.seq > seq && !c.read, `r${r} ${label}`);
    const delta = { project: String((await owed("project")) - before.project), keeper: String((await owed(keeperKey)) - before.keeper) };
    const last = await readView(C.deployer, rec.reader, "last_read", [`c:${id}`]);
    return { ...t, state: c.state, misses: c.misses, why: c.why, delta, waited, reader: last, checked_at: c.checked_at, miss_at: c.miss_at };
  });
}
const cid = (r, k) => rec.done[`r${r}:post:${k}`].id;

for (let r = 1; r <= RUNS; r++) {
  const x = await recheck(r, "unchanged", cid(r, "happy"), "keeper", "recheck unchanged");
  if (!rec.done[`r${r}:checked:unchanged`]) {
    check(`r${r} re-check an unchanged page: live, fee to project`,
      x.state === "live" && x.delta.project === String(FEE) && x.delta.keeper === "0", x);
    await once(`r${r}:checked:unchanged`, () => true);
  }
}

// ------------------------------------------------- 5. the auditor edits pages

await publish("edited");
for (let r = 1; r <= RUNS; r++) {
  const w = await recheck(r, "withdrawn", cid(r, "withdraw"), "keeper", "recheck withdrawn");
  const d = await recheck(r, "deleted-1", cid(r, "delete"), "keeper", "recheck deleted (1st)");
  const o = await recheck(r, "outage-1", cid(r, "outage"), "keeper", "recheck page down");
  const j = await recheck(r, "inject", cid(r, "inject"), "keeper", "recheck injection");
  await once(`r${r}:checked:edited`, () => {
    check(`r${r} auditor withdraws beside the row: down, keeper reward, rest to project`,
      w.state === "down" && w.delta.keeper === String(REWARD + FEE) && w.delta.project === String(STAKE - REWARD), w);
    check(`r${r} auditor deletes the row, first re-check: live, one miss, fee back`,
      d.state === "live" && d.misses === 1 && d.delta.keeper === String(FEE), d);
    check(`r${r} page unreachable once: live, one miss, fee back`,
      o.state === "live" && o.misses === 1 && o.delta.keeper === String(FEE), o);
    check(`r${r} page talks to the jury: down`, j.state === "down" && j.delta.keeper === String(REWARD + FEE), j);
    return true;
  });
}

// A second silent read of the deleted row, at least MISS_GAP after the first.
await once("wait:miss-gap", async () => {
  const firsts = [];
  for (let r = 1; r <= RUNS; r++) firsts.push(rec.done[`r${r}:recheck:deleted-1`].miss_at);
  const now = (await claim(cid(1, "delete"))).now;
  const wait = Math.max(0, Math.max(...firsts) + MISS_GAP + 30 - now);
  console.log(`waiting ${wait}s for MISS_GAP`);
  await new Promise((s) => setTimeout(s, wait * 1000));
  return wait;
});
for (let r = 1; r <= RUNS; r++) {
  const d2 = await recheck(r, "deleted-2", cid(r, "delete"), "keeper2", "recheck deleted (2nd)");
  await once(`r${r}:checked:deleted-2`, () => {
    check(`r${r} auditor deletes the row, second re-check MISS_GAP later: down, keeper reward`,
      d2.state === "down" && d2.delta.keeper === String(REWARD + FEE) && d2.delta.project === String(STAKE - REWARD), d2);
    return true;
  });
}

// ----------------------------------------- 6. the page is back; withdraw live

await publish("restored");
for (let r = 1; r <= RUNS; r++) {
  const o2 = await recheck(r, "outage-2", cid(r, "outage"), "keeper", "recheck page back");
  await once(`r${r}:checked:outage-2`, () => {
    check(`r${r} page back: live, misses reset, fee to project`,
      o2.state === "live" && o2.misses === 0 && o2.delta.project === String(FEE), o2);
    return true;
  });
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
  const { value: paid, waited } = await readUntil(
    async () => ({ wallet: (await C.deployer.getBalance({ address: A[payee] })) - wallet0, board: board0 - (await C.deployer.getBalance({ address: rec.board })) }),
    (v) => v.wallet >= due && v.board >= due, { seconds: REPORT_WAIT, every: 10 });
  const after = await status();
  rec.collected = [...(rec.collected || []), String(due)];
  check("collect zeroes what is owed, and the wallet is paid at finality",
    (await owed(payee)) === 0n && paid.wallet === due && paid.board === due && BigInt(after.balance) === BigInt(after.held) + BigInt(after.owed),
    { ...t, payee, collected: String(due), wallet_delta: String(paid.wallet), board_delta: String(paid.board), waited, status: after });
  return { status: after };
});

const failed = rec.checks.filter((c) => !c.ok);
rec.summary = { checks: rec.checks.length, failed: failed.length };
save();
console.log(`${rec.checks.length} checks, ${failed.length} failed`);
