// Does a retry recover a read the Board asked for and that never reported?
//
// On Bradbury a read the Board triggers by message gets no leader rotations,
// so one failed fetch ends it (claim 5). That cannot be provoked on demand,
// so this check makes the Board's own request fail where it can, and has a
// third party recover the read with `retry_*`:
//
//   registration: the Reader is deployed but not yet bound, so it refuses
//     the Board's `read_registration`; the entry stays pending. Then the
//     Reader is bound and anyone calls `retry_registration`.
//   claim: no way was found to make the Board's claim read fail on demand
//     (see below), so `retry_claim` is sent while that read is still open.
//
// Each step records the Board transaction, the Reader transaction it
// triggered (or that none ran), and the retry's per-validator votes.
//
//   COUNTERSIGN_KEYS=<dir> node retry_check.mjs <network>
// Resumable: every finished step is in deploy/retry-<network>.json.
import fs from "node:fs";
import { accountFor, clientFor, deployFile, outcome, readBuild, readUntil, readView, sendTx, settledReceipt } from "./lib.mjs";

const network = process.argv[2] || "studio";
const MISS_GAP = 300, READ_WINDOW = 600;
const GEN = 10n ** 18n, STAKE = GEN / 10n;
const PAGE = "https://raw.githubusercontent.com/Ritapossible/CounterSign/live/demo/northlight.html";
const SAMPLE = "Borealis Swap router and pools v1 January 2026 Northlight audit report";
const ACME = "Acme Lending lending contracts v2 March 2026 Northlight audit report";
const SCOPE = JSON.stringify(["lending contracts v2", "March 2026"]);
const GRACE = 150; // seconds; a read on Studio reports in about 40

const who = { deployer: "principal", auditor: "vendor", project: "funder", keeper: "agent" };
const C = Object.fromEntries(Object.entries(who).map(([k, role]) => [k, clientFor(network, role)]));
const A = Object.fromEntries(Object.entries(who).map(([k, role]) => [k, accountFor(role).address.toLowerCase()]));

const OUT = new URL(`./retry-${network}.json`, import.meta.url);
const rec = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { network, accounts: A, done: {}, checks: [] };
const save = () => { rec.recorded_at = new Date().toISOString(); fs.writeFileSync(OUT, JSON.stringify(rec, (_, x) => typeof x === "bigint" ? x.toString() : x, 2)); };
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

function check(name, ok, detail = {}) {
  rec.checks.push({ name, ok: !!ok, ...detail });
  save();
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}`, ok ? "" : JSON.stringify(detail));
}
async function once(key, fn) {
  if (key in rec.done) return rec.done[key];
  const v = await fn();
  rec.done[key] = v ?? null;
  save();
  return rec.done[key];
}

const view = (addr, fn, args = []) => readView(C.deployer, addr, fn, args);

/** Status, result, rotations, votes and leader output of one transaction. */
const votes = (t) => ({
  status: t.statusName ?? t.status_name, result: t.resultName ?? t.result_name,
  exec: t.txExecutionResultName ?? null,
  leader: t.consensus_data?.leader_receipt?.[0]?.result?.status ?? null,
  rotations: String(t.initialRotations ?? ""),
  validators: t.lastRound?.roundValidators ?? Object.keys(t.consensus_data?.votes ?? {}),
  // genlayer-js VoteType: 0 not voted, 1 agree, 2 disagree, 3 timeout, 4 deterministic violation.
  votes: t.lastRound?.validatorVotes ?? Object.values(t.consensus_data?.votes ?? {}),
  // Bradbury and Studio Next: eqBlocksOutputs. Studio: the leader receipt's payload.
  leader_output: (() => {
    const eq = t.consensus_data?.leader_receipt?.[0]?.eq_outputs?.["0"]?.raw;
    const o = t.eqBlocksOutputs ? Buffer.from(String(t.eqBlocksOutputs).replace(/^0x/, ""), "hex").toString("latin1")
      : eq ? Buffer.from(eq, "base64").toString("latin1") : "";
    const i = o.indexOf("{"), j = o.lastIndexOf("}");
    return i >= 0 && j > i ? o.slice(i, j + 1) : null;
  })(),
});

/** The Reader transactions a Board transaction triggered, with their state once decided. */
async function triggered(hash) {
  const t = await C.deployer.getTransaction({ hash });
  const out = [];
  for (const id of t.triggered_transactions || []) {
    let x = await C.deployer.getTransaction({ hash: id }).catch(() => null);
    for (let i = 0; i < 40 && x && !/ACCEPTED|FINALIZED|UNDETERMINED|CANCELED/.test(String(x.status_name ?? x.statusName)); i++) {
      await sleep(5);
      x = await C.deployer.getTransaction({ hash: id }).catch(() => x);
    }
    out.push(x ? { id, to: x.to_address, ...votes(x) } : { id, missing: true });
  }
  return out;
}

async function send(k, addr, fn, args, label, value = 0n) {
  const t = await sendTx(C[k], addr, fn, args, label, value);
  console.log(`  tx ${label}: ${t.consensus} ${t.leader} ${t.hash}`);
  return { hash: t.hash, consensus: t.consensus, leader: t.leader, applied: t.applied };
}

// ------------------------------------------------------------------ deploy

if (!rec.reader) {
  rec.reader = (await deployFile(C.deployer, readBuild("countersign_reader"), [], "reader deploy")).address;
  save();
}
if (!rec.board) {
  rec.board = (await deployFile(C.deployer, readBuild("countersign_board"), [rec.reader, MISS_GAP, READ_WINDOW], "board deploy")).address;
  save();
}
console.log("reader", rec.reader, "board", rec.board, "(not bound yet)");

// ------------------------------------------- registration: the ask fails

const reg = await once("register", async () => {
  const t = await send("auditor", rec.board, "register", ["Northlight Security (retry check)", PAGE, SAMPLE], "register");
  return { ...t, triggered: await triggered(t.hash) };
});
await once("register:pending", async () => {
  await sleep(GRACE);
  const a = await view(rec.board, "get_auditor", [0]);
  const last = await view(rec.reader, "last_read", ["a:0"]);
  const refused = reg.triggered.length > 0 && reg.triggered.every((x) => x.leader === "contract_error" || /ERROR|ROLLBACK/.test(String(x.exec)));
  check("the Board's read_registration was refused by the unbound Reader", refused, { triggered: reg.triggered });
  check(`registration still pending ${GRACE}s later, no read recorded`, a.state === "pending" && Object.keys(last).length === 0, { state: a.state, last });
  return { state: a.state, last };
});

// ------------------------------------------------- registration: recovered

await once("bind", () => send("deployer", rec.reader, "bind", [rec.board], "bind"));
const regRetry = await once("retry_registration", async () => {
  const t = await send("keeper", rec.reader, "retry_registration", [0], "retry_registration 0");
  return { ...t, votes: votes(await C.deployer.getTransaction({ hash: t.hash })) };
});
await once("registered", async () => {
  const { value: a, waited } = await readUntil(() => view(rec.board, "get_auditor", [0]), (a) => a.state !== "pending", { seconds: 900, every: 8 });
  check("retry_registration by a third party: entry registered", a.state === "registered", { state: a.state, waited, retry: regRetry });
  return { state: a.state, waited };
});

// ------------------------------------------- claim: a retry during the read
//
// The network gives no way to make the Board's claim read fail on demand: a
// posting with no fee for its message is rolled back whole, and one with too
// small a fee is reverted at submission (both measured on Studio Next, kept
// in its record as findings). So the retry is sent while the Board's own read
// is still open: it reads the page and reports under the same read number,
// and whichever report lands first decides; the other is ignored. If the
// Board's read reports first, the retry is refused ("no read of this claim is
// open") and changes nothing. Up to three postings are tried until a retry
// actually reads the page; every attempt is recorded. A retry that reads must
// agree `confirmed` with the same fingerprint as the Board's read, which shows
// `retry_claim` rebuilds the read from the Board's records alone.

/** Why a transaction was refused: Studio Next and Bradbury keep only
 * "exit_code 1" in the result and the contract's message in stderr. */
async function refusal(hash) {
  const t = await C.deployer.getTransaction({ hash });
  const lr = t.consensus_data?.leader_receipt?.[0] ?? {};
  const err = String(lr.genvm_result?.stderr ?? "").split("\n").filter((l) => /Exception|EXPECTED/.test(l)).pop();
  return err || (typeof lr.result?.payload === "string" ? lr.result.payload : null);
}

const ATTEMPTS = 3;
for (let n = 0; n < ATTEMPTS; n++) {
  const won = Object.values(rec.done).some((v) => v && v.race === "retry read the page");
  if (won) break;
  const at = await once(`claim${n}`, async () => {
    const before = (await view(rec.board, "status")).claims;
    // Sent without waiting for the outcome: the retry goes out as soon as the claim is visible.
    const f = C.project.withFees ? await C.project.estimateTransactionFeesForWrite({ address: rec.board, functionName: "post", args: [0, "Acme Lending", SCOPE, ACME], value: STAKE }) : null;
    const post = await C.project.writeContract({ address: rec.board, functionName: "post", args: [0, "Acme Lending", SCOPE, ACME], value: STAKE,
      ...(f ? { fees: { distribution: f.distribution, messageAllocations: f.messageAllocations, feeValue: f.feeValue } } : {}) });
    const { value: c } = await readUntil(async () => (await view(rec.board, "status")).claims > before ? view(rec.board, "get_claim", [before]) : null,
      (c) => !!c, { seconds: 300, every: 1 });
    const id = before;
    const sent = await send("keeper", rec.reader, "retry_claim", [id], `retry_claim ${id}`);
    return { id, post, read_open_when_seen: c.read, retry: sent };
  });
  await once(`claim${n}:settled`, async () => {
    const { value: c, waited } = await readUntil(() => view(rec.board, "get_claim", [at.id]), (c) => c.state !== "pending", { seconds: 900, every: 8 });
    const owed = BigInt(await view(rec.board, "owed_to", [A.project]));
    const boardRead = await triggered(at.post);
    const retryVotes = votes(await C.deployer.getTransaction({ hash: at.retry.hash }));
    const why = at.retry.applied ? null : await refusal(at.retry.hash);
    const race = at.retry.applied ? "retry read the page" : /no read of this claim is open/.test(String(why)) ? "lost the race: the Board's read had reported" : "refused for another reason";
    const agreed = (o) => !!o && o.includes('"confirmed"') && !!c.print && o.includes(c.print);
    check(`claim ${at.id}: live, stake held, nothing refunded`, c.state === "live" && owed === 0n, { state: c.state, owed: owed.toString(), waited });
    check(`claim ${at.id}: the Board's read agreed confirmed`, boardRead.length === 1 && /AGREE/.test(boardRead[0].result) && agreed(boardRead[0].leader_output),
      { board_read: boardRead, print: c.print });
    check(`claim ${at.id}: retry_claim ${race}`, race === "retry read the page" ? /AGREE/.test(retryVotes.result) && agreed(retryVotes.leader_output) : race.startsWith("lost"),
      { retry: { ...at.retry, ...retryVotes, refusal: why } });
    return { id: at.id, state: c.state, print: c.print, race, retry_votes: retryVotes, refusal: why, board_read: boardRead };
  });
}

console.log(`${rec.checks.filter((c) => c.ok).length} ok, ${rec.checks.filter((c) => !c.ok).length} failed`);
