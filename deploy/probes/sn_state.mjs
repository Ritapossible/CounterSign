// Board entry state and the read transaction's messages on Studio Next.
import { createClient } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const c = createClient({ chain });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const [board, id, readTx] = process.argv.slice(2);
console.log("entry", await c.readContract({ address: board, functionName: "get_auditor", args: [Number(id)] }).catch((e) => "err " + e.message.slice(0, 80)));
const x = await c.getTransaction({ hash: readTx });
const lr = (x.consensus_data?.leader_receipt || [])[0] || {};
console.log("read", x.status_name, "triggered", J(x.triggered_transactions), "pending", J(lr.pending_transactions).slice(0, 400));
console.log("messages", J(x.messages).slice(0, 600));
