import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeClaim, decodeAuditor, formatGen, outcome, MIN_STAKE } from "../countersign.mjs";

const base = {
  id: 3, auditor: 1, project: "0xAA", subject: "Acme Lending", scope: ["v2"], passage: "p", stake: String(MIN_STAKE),
  state: "live", posted_at: 100, print: "f", misses: 0, miss_at: 0, checked_at: 120, seq: 1, read: null, why: "",
  auditor_name: "Northlight", auditor_host: "example.com", auditor_signer: "0xBB", now: 1000,
};

test("a live claim with no read open can be re-checked by anyone but the auditor", () => {
  assert.equal(decodeClaim(base, "0xcc").can.recheck, true);
  assert.equal(decodeClaim(base, "0xbb").can.recheck, false);
  assert.equal(decodeClaim(base, "").can.recheck, true);
  assert.equal(decodeClaim({ ...base, read: { seq: 2, kind: "recheck", caller: "0xcc", fee: "1", at: 900, due: 1500 } }).can.recheck, false);
});

test("only the project withdraws, and only while pending or live", () => {
  assert.equal(decodeClaim(base, "0xaa").can.withdraw, true);
  assert.equal(decodeClaim(base, "0xcc").can.withdraw, false);
  assert.equal(decodeClaim({ ...base, state: "down" }, "0xaa").can.withdraw, false);
});

test("an open read can be retried until its deadline, expired after it", () => {
  const open = { ...base, state: "pending", read: { seq: 1, kind: "posting", caller: "0xaa", fee: "0", at: 900, due: 1500 } };
  const before = decodeClaim(open);
  assert.deepEqual([before.can.retry, before.can.expire, before.read.overdue], [true, false, false]);
  const after = decodeClaim({ ...open, now: 1501 });
  assert.deepEqual([after.can.retry, after.can.expire, after.read.overdue], [false, true, true]);
  assert.equal(decodeClaim({ ...open, now: 1500 }).can.expire, false, "the read is open until its deadline, inclusive");
});

test("amounts stay exact", () => {
  assert.equal(decodeClaim(base).stake, 10n ** 17n);
  assert.equal(formatGen(10n ** 17n), "0.1");
  assert.equal(formatGen(89870000000000000n), "0.08987");
  assert.equal(formatGen(2n * 10n ** 18n), "2");
});

test("auditor states are spelled out", () => {
  const a = decodeAuditor({ id: 0, name: "N", url: "https://x/y", host: "x", sample: "s", signer: "0xBB", state: "refused", at: 1, due: 601 });
  assert.equal(a.signer, "0xbb");
  assert.match(a.stateText, /Refused/);
});

test("outcome reads Studio and Bradbury spellings", () => {
  assert.deepEqual(outcome({ result_name: "MAJORITY_AGREE", consensus_data: { leader_receipt: [{ result: { status: "return" } }] } }),
    { consensus: "MAJORITY_AGREE", agreed: true, applied: true, refused: false });
  assert.equal(outcome({ resultName: "AGREE", txExecutionResultName: "FINISHED_WITH_ERROR" }).refused, true);
  assert.equal(outcome({ resultName: "DISAGREE" }).agreed, false);
});

test("few keeps order and never runs more than its width at once", async () => {
  const { few } = await import("../countersign.mjs");
  let running = 0, peak = 0;
  const out = await few(10, async (i) => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; return i * 2; }, 3);
  assert.deepEqual(out, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  assert.equal(peak, 3);
});

test("patient retries everything but a contract refusal", async () => {
  const { patient } = await import("../countersign.mjs");
  let n = 0;
  assert.equal(await patient(async () => { if (n++ < 2) throw new Error(n === 1 ? "Server busy: all 8 execution slots occupied" : "An unknown RPC error occurred."); return "ok"; }), "ok");
  await assert.rejects(patient(async () => { throw new Error("execution failed"); }), /execution failed/);
});
