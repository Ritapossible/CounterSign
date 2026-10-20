// Does emit_transfer pay a wallet? Three ways of naming the payee, each paying
// a wallet that has no other activity in the probe; balances read after finality.
//   COUNTERSIGN_KEYS=<dir> node probes/probe_transfer.mjs studio
import fs from "node:fs";
import { accountFor, clientFor, deployFile, sendTx, readView } from "../lib.mjs";
const network = process.argv[2] || "studio";
const c = clientFor(network, "principal");
const caller = clientFor(network, "agent");
const OUT = new URL(`./probe-transfer-${network}.json`, import.meta.url);
const rec = { network, steps: [] };
const bal = async (a) => (await c.getBalance({ address: a })).toString();
const code = fs.readFileSync(new URL("./probe_transfer.py", import.meta.url));
const { address } = await deployFile(c, code, [], "probe deploy");
rec.address = address;
const AMT = 10n ** 15n; // 0.001 GEN
const dep = await sendTx(c, address, "deposit", [], "deposit", 10n ** 16n);
rec.steps.push({ step: "deposit 0.01", hash: dep.hash, consensus: dep.consensus });
const agent = accountFor("agent").address;
const fresh = "0x" + "c0ffee".padEnd(40, "0").slice(0, 40);
const before = { contract: await bal(address), agent: await bal(agent), fresh: await bal(fresh) };
for (const [fn, args, who, label] of [
  ["pay_sender", [AMT], caller, "sender_address (agent)"],
  ["pay_address", [fresh, AMT], c, "Address(str) (fresh wallet)"],
  ["pay_sender_str", [AMT], caller, "Address(str(sender)) (agent)"],
]) {
  const t = await sendTx(who, address, fn, args, fn);
  rec.steps.push({ step: label, hash: t.hash, consensus: t.consensus, leader: t.leader });
  console.log(label, t.consensus, t.leader, t.hash);
}
console.log("waiting 120s for finality");
await new Promise((r) => setTimeout(r, 120_000));
rec.before = before;
rec.after = { contract: await bal(address), agent: await bal(agent), fresh: await bal(fresh) };
rec.status = await readView(c, address, "status");
fs.writeFileSync(OUT, JSON.stringify(rec, null, 2));
console.log(JSON.stringify({ before, after: rec.after, status: rec.status }, null, 1));
