// Register on Studio Next with the SDK's simulation-recommended fees, then
// follow the read and the report.  KEYS=<dir> node probes/fees_write.mjs <board>
import fs from "node:fs";
import { createClient, createAccount } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const c = createClient({ chain, account: createAccount(fs.readFileSync(process.env.KEYS + "/vendor.key", "utf8").trim()) });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const board = process.argv[2];
const args = ["Northlight (recommended fees)", "https://raw.githubusercontent.com/Ritapossible/CounterSign/live/demo/northlight.html", "Acme Lending lending contracts v2 March 2026 Northlight audit report"];
const r = await c.estimateTransactionFeesForWrite({ address: board, functionName: "register", args });
const hash = await c.writeContract({ address: board, functionName: "register", args, value: 0n, fees: { distribution: r.distribution, messageAllocations: r.messageAllocations, feeValue: r.feeValue } });
console.log("register", hash);
const st = (t) => t && (t.status_name ?? t.statusName);
for (let i = 0; i < 80; i++) {
  const t = await c.getTransaction({ hash }).catch(() => undefined);
  if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"].includes(st(t))) {
    console.log("register", st(t), t.result_name, t.txExecutionResultName, "triggered", J(t.triggered_transactions));
    for (const id of t.triggered_transactions || []) {
      for (let k = 0; k < 60; k++) {
        const x = await c.getTransaction({ hash: id }).catch(() => undefined);
        if (["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED"].includes(st(x))) {
          const lr = (x.consensus_data?.leader_receipt || [])[0] || {};
          console.log(" read", id.slice(0, 12), st(x), x.result_name, x.txExecutionResultName, J(lr.result?.payload).slice(0, 120), "triggered", J(x.triggered_transactions));
          break;
        }
        await new Promise((s) => setTimeout(s, 5000));
      }
    }
    break;
  }
  await new Promise((s) => setTimeout(s, 5000));
}
