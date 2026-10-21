// What a fee-network transaction actually charged its sender: deposits minus refunds.
//   node probes/tx_fee.mjs <hash>
import { createClient } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const c = createClient({ chain });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
const t = await c.getTransaction({ hash: process.argv[2] });
const fa = t.data?.fee_accounting || {};
const dep = (fa.top_ups || []).reduce((s, x) => s + BigInt(x.amount), 0n);
const ref = (fa.refunds || []).reduce((s, x) => s + BigInt(x.amount ?? x.value ?? 0), 0n);
console.log(t.status_name, "deposited", dep.toString(), "refunded", ref.toString(), "charged", (dep - ref).toString());
console.log(J(fa.refunds).slice(0, 400));
