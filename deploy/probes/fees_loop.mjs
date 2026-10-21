// Studio Next (fees on): does a registration fund the Reader's read and its report?
//   KEYS=<dir> node probes/fees_loop.mjs
import fs from "node:fs";
import { createClient, createAccount, MessageType, deriveInternalMessageCallKey, encodeInternalMessageFeeParams } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const K = (r) => createAccount(fs.readFileSync(process.env.KEYS + `/${r}.key`, "utf8").trim());
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const dep = createClient({ chain, account: K("principal") }), aud = createClient({ chain, account: K("vendor") });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const st = (t) => t && (t.status_name ?? t.statusName);
const wait = async (hash) => { console.log("  waiting for", hash); for (let i = 0; i < 100; i++) { const t = await dep.getTransaction({ hash }).catch(() => undefined); if (["ACCEPTED", "FINALIZED", "UNDETERMINED"].includes(st(t))) return t; await new Promise((r) => setTimeout(r, 3000)); } };
const base = await dep.estimateTransactionFees({});
const plain = { distribution: base.distribution, feeValue: base.feeValue };
const deploy = async (name, args) => { const h = await dep.deployContract({ code: fs.readFileSync(new URL(`../../contracts/build/${name}.min.py`, import.meta.url), "utf8"), args, fees: plain }); const t = await wait(h); console.log(name, st(t), t.txExecutionResultName, t.data?.contract_address); return t.data.contract_address; };
const reader = await deploy("countersign_reader", []);
const board = await deploy("countersign_board", [reader, 300, 600]);
let t = await wait(await dep.writeContract({ address: reader, functionName: "bind", args: [board], value: 0n, fees: plain }));
console.log("bind", st(t), t.txExecutionResultName);
// Read on acceptance (root), report on finality (child of the read).
const params = encodeInternalMessageFeeParams({ leaderTimeunitsAllocation: 100n, validatorTimeunitsAllocation: 200n, rotations: [3n] });
const GEN = 10n ** 18n;
const allocations = [
  { messageType: MessageType.Internal, recipient: reader, callKey: deriveInternalMessageCallKey("read_registration"), onAcceptance: true, budget: GEN / 4n, feeParams: params },
  { messageType: MessageType.Internal, recipient: board, callKey: deriveInternalMessageCallKey("note_registration"), onAcceptance: false, parentIndex: 0n, budget: GEN / 10n, feeParams: params },
];
const est = await aud.estimateTransactionFees({ messageAllocations: allocations });
console.log("fee value", J(est.feeValue), "message fees", J(est.distribution.totalMessageFees));
const PAGE = "https://raw.githubusercontent.com/Ritapossible/CounterSign/live/demo/northlight.html";
const SAMPLE = "Acme Lending lending contracts v2 March 2026 Northlight audit report";
t = await wait(await aud.writeContract({ address: board, functionName: "register", args: ["Northlight (fees probe)", PAGE, SAMPLE], value: 0n,
  fees: { distribution: est.distribution, messageAllocations: est.messageAllocations, feeValue: est.feeValue } }));
console.log("register", st(t), t.txExecutionResultName, "triggered", J(t.triggered_transactions));
for (let i = 0; i < 50; i++) {
  const a = JSON.parse(await dep.readContract({ address: board, functionName: "get_auditor", args: [0] }));
  if (a.state !== "pending") { console.log("auditor", a.state, "after", i * 6, "s"); break; }
  if (i === 49) console.log("auditor still pending");
  await new Promise((r) => setTimeout(r, 6000));
}
for (const id of t.triggered_transactions || []) {
  const x = await dep.getTransaction({ hash: id });
  const lr = (x.consensus_data?.leader_receipt || [])[0] || {};
  console.log("read tx", id.slice(0, 12), st(x), x.txExecutionResultName, "rotations", x.config_rotation_rounds ?? x.initial_rotations, "payload", J(lr.result?.payload).slice(0, 160), "triggered", J(x.triggered_transactions));
  for (const id2 of x.triggered_transactions || []) { const y = await dep.getTransaction({ hash: id2 }); const l2 = (y.consensus_data?.leader_receipt || [])[0] || {}; console.log("  report tx", id2.slice(0, 12), st(y), y.txExecutionResultName, J(l2.result?.payload).slice(0, 160)); }
}
console.log("reader", reader, "board", board);
