// Print a Studio Next transaction's status, execution result and leader error.
//   node probes/tx_status.mjs <hash>
import { createClient } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const c = createClient({ chain });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
try {
  const t = await c.getTransaction({ hash: process.argv[2] });
  const lr = (t.consensus_data?.leader_receipt || [])[0] || {};
  console.log(t.status_name ?? t.statusName, t.result_name, t.txExecutionResultName, "triggered", J(t.triggered_transactions));
  console.log("leader", J(lr.result).slice(0, 300), J(lr.genvm_result?.stderr || "").slice(-400));
  console.log("fees", J(t.data?.fee_accounting).slice(0, 500));
} catch (e) { console.log("err", String(e.message).slice(0, 300)); }
