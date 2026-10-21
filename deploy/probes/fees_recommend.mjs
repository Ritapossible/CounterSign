// What the SDK recommends, from a simulation, for a Board write on Studio Next.
//   KEYS=<dir> node probes/fees_recommend.mjs <board> <function> <json args>
import fs from "node:fs";
import { createClient, createAccount } from "genlayer-js-next";
import { studioDevnet } from "genlayer-js-next/chains";
const chain = { ...studioDevnet, rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } };
const c = createClient({ chain, account: createAccount(fs.readFileSync(process.env.KEYS + "/vendor.key", "utf8").trim()) });
const J = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x, 1);
try {
  const r = await c.estimateTransactionFeesForWrite({ address: process.argv[2], functionName: process.argv[3], args: JSON.parse(process.argv[4]) });
  console.log(J({ messageAllocations: r.messageAllocations, feeValue: r.feeValue, totalMessageFees: r.distribution.totalMessageFees, observed: r.observed }).slice(0, 3000));
} catch (e) { console.log("err", String(e.message).slice(0, 600)); }
