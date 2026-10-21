// A Studio Next transaction's validators: vote, result, error. node probes/tx_votes.mjs <hash>
import { createClient } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const c = createClient({ chain });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const t = await c.getTransaction({ hash: process.argv[2] });
console.log("votes", J(t.consensus_data?.votes), "valid_until", t.data?.valid_until, "created", t.created_at, "rotation", t.rotation_count, "rounds", t.num_of_rounds);
for (const v of t.consensus_data?.validators || []) console.log(" ", v.vote, v.execution_result, J(v.result).slice(0, 160), J(v.genvm_result?.stderr || "").slice(-200));
const hist = t.consensus_history || {};
console.log("history", J(hist).slice(0, 1200));
