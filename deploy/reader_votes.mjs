// Per-validator votes of every Reader transaction in a run record.
//
// A Reader transaction is sent by the Board as a message, so its hash is not
// in any receipt we hold. It is found from the consensus logs: starting at
// the block of the Board transaction that asked for the read, the candidate
// transaction ids in the following blocks are read, and the first one sent by
// the Board to the Reader, not yet matched, is its read. Every Board
// transaction's own votes are recorded too.
//
//   node reader_votes.mjs <record.json>        (writes <record>-votes.json)
import fs from "node:fs";
import { clientFor } from "./lib.mjs";

const file = process.argv[2];
const rec = JSON.parse(fs.readFileSync(file, "utf8"));
const c = clientFor(rec.network, "principal");
const board = rec.board.toLowerCase(), reader = rec.reader.toLowerCase();
const OUT = file.replace(/\.json$/, "-votes.json");
const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { network: rec.network, board: rec.board, reader: rec.reader, reads: {} };
const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const votes = (t) => ({
  status: t.statusName ?? t.status_name, result: t.resultName ?? t.result_name,
  exec: t.txExecutionResultName ?? null, rounds: String(t.numOfRounds ?? ""),
  validators: t.lastRound?.roundValidators ?? Object.keys(t.consensus_data?.votes ?? {}),
  votes: t.lastRound?.validatorVotes ?? Object.values(t.consensus_data?.votes ?? {}),
  // Vote codes (genlayer-js VoteType): 0 not voted, 1 agree, 2 disagree, 3 timeout, 4 deterministic violation.
  rotations: String(t.initialRotations ?? ""),
  leader_output: (() => { const o = Buffer.from(String(t.eqBlocksOutputs || "").replace(/^0x/, ""), "hex").toString("latin1"); return o.slice(o.indexOf("{"), o.lastIndexOf("}") + 1) || null; })(),
  validator_results: t.lastRound?.validatorResultHash ?? null,
});

// Every Board transaction in the record that asks the Reader for a read.
const asks = [];
const seen = new Set();
const walk = (v, path) => {
  if (!v || typeof v !== "object") return;
  // A batch's "settled" entry repeats its "sent" transaction: count each hash once.
  if (typeof v.hash === "string" && /register|post|recheck|batch|pending/.test(path) && !/withdraw|collect|settled/.test(path) && !seen.has(v.hash)) {
    seen.add(v.hash);
    asks.push({ path, hash: v.hash });
  }
  for (const [k, x] of Object.entries(v)) if (k !== "hash") walk(x, path + "/" + k);
};
walk(rec.done, "");

async function logsAround(block, span) {
  for (let i = 0; i < 4; i++) {
    try {
      return await c.request({ method: "eth_getLogs", params: [{ fromBlock: "0x" + block.toString(16), toBlock: "0x" + (block + BigInt(span)).toString(16) }] });
    } catch { await sleep(2000 * 2 ** i); }
  }
  return [];
}

const matched = new Set(Object.values(out.reads).map((x) => x.reader_tx).filter(Boolean));
const tip = await c.getBlockNumber();
const tipTime = Number((await c.getBlock({ blockNumber: tip })).timestamp);
const older = await c.getBlock({ blockNumber: tip - 20000n });
const blockTime = (tipTime - Number(older.timestamp)) / 20000;

for (const a of asks) {
  if (out.reads[a.path]?.reader_tx) continue;
  const t = await c.getTransaction({ hash: a.hash }).catch(() => null);
  if (!t) continue;
  const entry = { board_tx: a.hash, board_votes: votes(t) };
  if (rec.network === "studio") {
    const ids = t.triggered_transactions || [];
    for (const id of ids) {
      const x = await c.getTransaction({ hash: id }).catch(() => null);
      if (x && String(x.to_address).toLowerCase() === reader) { entry.reader_tx = id; entry.reader_votes = votes(x); break; }
    }
  } else {
    // Find the Board transaction's block from the logs, then its read just after.
    const created = Number(t.createdTimestamp);
    let start = tip - BigInt(Math.round((tipTime - created) / blockTime)) - 400n;
    let found = null;
    for (let from = start; from < start + 3000n && !found; from += 200n) {
      const logs = await logsAround(from, 199);
      const ids = [];
      for (const l of logs) for (const topic of l.topics.slice(1)) if (!/^0x0{24}/.test(topic) && !ids.includes(topic)) ids.push(topic);
      const seenBoard = logs.some((l) => l.topics.some((x) => x.toLowerCase() === a.hash.toLowerCase()));
      if (!seenBoard && !found) continue;
      for (const id of ids) {
        if (matched.has(id)) continue;
        const x = await c.getTransaction({ hash: id }).catch(() => null);
        if (x && String(x.sender).toLowerCase() === board && String(x.recipient).toLowerCase() === reader && Number(x.createdTimestamp) >= created) {
          found = { id, x };
          break;
        }
      }
    }
    if (found) { entry.reader_tx = found.id; entry.reader_votes = votes(found.x); matched.add(found.id); }
  }
  out.reads[a.path] = entry;
  save();
  console.log(a.path, entry.reader_tx ? `${entry.reader_votes.result} ${JSON.stringify(entry.reader_votes.votes)}` : "no reader tx found");
}
// Requests the Board refused before any read have no Reader transaction.
const refusedBeforeRead = (path) => /:post:scope|:pending\/recheck/.test(path);
for (const [path, x] of Object.entries(out.reads)) if (!x.reader_tx && refusedBeforeRead(path)) x.note = "refused by the Board before any read: no Reader transaction";
const reads = Object.values(out.reads).filter((x) => x.reader_tx);
out.summary = {
  requests: Object.keys(out.reads).length,
  reads: reads.length,
  refused_before_read: Object.values(out.reads).filter((x) => x.note).length,
  unexplained_missing: Object.values(out.reads).filter((x) => !x.reader_tx && !x.note).length,
  reads_agreed: reads.filter((x) => /AGREE/.test(x.reader_votes.result) && !/DISAGREE/.test(x.reader_votes.result)).length,
};
save();
console.log(JSON.stringify(out.summary));
