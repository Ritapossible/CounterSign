// Register four real, public audit lists as clearly labelled demo entries.
//
// Trail of Bits, Sigma Prime, Spearbit and Cyfrin publish their audit lists as
// plain files on GitHub, which validators can read (Phase 1 probe). These
// entries let the board show real audits; their names say they were not
// registered by the firms. Each sample row was checked against the live file
// with the contract's own rules before registering (deploy/demo-auditors.json).
//
//   COUNTERSIGN_KEYS=<dir> node register_demo_auditors.mjs <network> <board>
// Resumable; writes deploy/demo-auditors-<network>-<board prefix>.json.
import fs from "node:fs";
import { accountFor, clientFor, readUntil, readView, sendTx } from "./lib.mjs";

const [network, board] = process.argv.slice(2);
if (!network || !board) throw new Error("usage: node register_demo_auditors.mjs <network> <board>");
const entries = JSON.parse(fs.readFileSync(new URL("./demo-auditors.json", import.meta.url)));
const c = clientFor(network, "principal");
const me = accountFor("principal").address.toLowerCase();
const OUT = new URL(`./demo-auditors-${network}-${board.slice(2, 8).toLowerCase()}.json`, import.meta.url);
const rec = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { network, board, signer: me, entries: {} };
const save = () => fs.writeFileSync(OUT, JSON.stringify(rec, null, 2));
const view = (fn, args = []) => readView(c, board, fn, args);

for (const e of entries) {
  if (rec.entries[e.url]?.state && rec.entries[e.url].state !== "pending") continue;
  if (!rec.entries[e.url]?.hash) {
    const t = await sendTx(c, board, "register", [e.name, e.url, e.sample], `register ${e.name}`);
    console.log(`  tx register ${e.name}: ${t.consensus} ${t.leader} ${t.hash}`);
    rec.entries[e.url] = { name: e.name, hash: t.hash, consensus: t.consensus };
    save();
  }
  // The entry's id, found by content, never from a count.
  const { value: id } = await readUntil(async () => {
    const n = (await view("status")).auditors;
    for (let i = n - 1; i >= 0; i--) {
      const a = await view("get_auditor", [i]);
      if (a.url === e.url && a.signer === me && a.sample === e.sample) return i;
    }
    return -1;
  }, (v) => v >= 0, { seconds: 300, every: 10 });
  const { value: a, waited } = await readUntil(() => view("get_auditor", [id]), (a) => a.state !== "pending", { seconds: 900, every: 8 });
  rec.entries[e.url] = { ...rec.entries[e.url], id, state: a.state, waited };
  save();
  console.log(`  ${e.name}: entry #${id} ${a.state} after ${waited ?? "timeout"}s`);
}
