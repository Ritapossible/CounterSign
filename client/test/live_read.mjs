// Read every auditor and claim on a deployed network through the client.
//   node test/live_read.mjs studio
import { connect, formatGen } from "../countersign.mjs";
const cs = connect(process.argv[2] || "studio");
const s = await cs.status();
const [auditors, claims] = [await cs.auditors(), await cs.claims()];
const count = (xs) => xs.reduce((m, x) => ((m[x.state] = (m[x.state] || 0) + 1), m), {});
console.log(cs.net.name, s.release, "held", formatGen(s.held), "GEN");
console.log("auditors", auditors.length, JSON.stringify(count(auditors)));
console.log("claims", claims.length, JSON.stringify(count(claims)));
const c = claims.find((x) => x.state === "live");
if (c) console.log("e.g. claim", c.id, c.stateText, "|", c.auditor.name, "|", c.subject, "|", formatGen(c.stake), "GEN | can", JSON.stringify(c.can));
