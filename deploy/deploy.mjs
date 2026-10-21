// Deploy a CounterSign Reader and Board and bind them.
//
//   COUNTERSIGN_KEYS=<dir with principal.key> node deploy/deploy.mjs <network> [miss_gap] [read_window]
//
// Networks: studio, studionext, bradbury. The windows default to the values
// in docs/CLAIM-FORMAT.md (Studio 300 / 600 s, Bradbury 3,600 / 7,200 s).
// Prints the two addresses; put them in client/countersign.mjs NETWORKS.
import { clientFor, deployFile, readBuild, sendTx } from "./lib.mjs";

const network = process.argv[2];
if (!network) throw new Error("usage: node deploy/deploy.mjs <studio|studionext|bradbury> [miss_gap] [read_window]");
const studio = network.startsWith("studio");
const missGap = Number(process.argv[3] || (studio ? 300 : 3600));
const readWindow = Number(process.argv[4] || (studio ? 600 : 7200));
const c = clientFor(network, "principal");

const reader = (await deployFile(c, readBuild("countersign_reader"), [], "reader deploy")).address;
console.log("reader", reader);
const board = (await deployFile(c, readBuild("countersign_board"), [reader, missGap, readWindow], "board deploy")).address;
console.log("board ", board);
const t = await sendTx(c, reader, "bind", [board], "bind");
if (!t.applied) throw new Error(`bind failed: ${t.consensus} ${t.leader}`);
console.log(JSON.stringify({ network, board, reader, miss_gap: missGap, read_window: readWindow }, null, 2));
