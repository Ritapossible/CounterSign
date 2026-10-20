// Phase 1: can GenLayer validators read real audit-list pages and agree on
// whether a confirming passage is there?
//
// For each page in audit_pages.json:
//   get         validators agree on the outcome (readable, present, complete,
//               withdrawal phrases in the window) - the rule CounterSign uses
//   get-strict  validators must agree on the whole page's text digest, to see
//               whether whole-page agreement holds on these pages (RedLine
//               measured that it does not always)
//   render      the page rendered, for the pages that are empty or oversize
//               to a plain fetch
//
//   COUNTERSIGN_KEYS=<dir with principal.key> node probes/probe_audit_pages.mjs studio
import fs from "node:fs";
import { clientFor, deployFile, sendTx, readView } from "../lib.mjs";

const network = process.argv[2] || "studio";
const c = clientFor(network, "principal");
const code = fs.readFileSync(new URL("./probe_audit_pages.py", import.meta.url));
const cases = JSON.parse(fs.readFileSync(new URL("./audit_pages.json", import.meta.url), "utf8"));
const OUT = new URL(`./probe-audit-pages-${network}.json`, import.meta.url);
const record = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { network, out: {} };
if (!record.address) {
  const { address } = await deployFile(c, code, [], "probe deploy");
  record.address = address;
}
console.log("probe at", record.address);

const RENDER = ["https://code4rena.com/reports", "https://www.halborn.com/audits", "https://blog.openzeppelin.com/security-audits", "https://www.chainsecurity.com/smart-contract-audit-reports"];
const runs = [];
for (const u of Object.keys(cases)) runs.push([u, "get"]);
for (const u of Object.keys(cases).filter((u) => !RENDER.includes(u))) runs.push([u, "get-strict"]);
for (const u of RENDER) runs.push([u, "render"]);

for (const [u, mode] of runs) {
  const key = `${mode} ${u}`;
  if (record.out[key]?.result) continue;                   // resumable
  const k = cases[u];
  const t = await sendTx(c, record.address, "probe", [u, k.passage, k.subject, JSON.stringify(k.scope), mode], key);
  const result = await readView(c, record.address, "get", [u + "|" + mode]);
  record.out[key] = { consensus: t.consensus, leader: t.leader, agreed: t.agreed, hash: t.hash, result };
  record.recorded_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(record, null, 2));
  const r = typeof result === "string" ? result : JSON.stringify(result);
  console.log(mode.padEnd(10), t.consensus.padEnd(15), u, r.slice(0, 160));
}
