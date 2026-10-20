// Phase 4, step 0: do the Reader's finality messages land, and how long do
// they take? Before any other case runs (PLAN.md, Phase 4).
//
// Deploys a Reader and a Board, binds them, then makes one clean
// registration and one clean posting against the demo page on the `live`
// branch, and times:
//   request accepted -> the Reader's own read recorded (last_read)
//   request accepted -> note_registration / note_claim visible on the Board
//
//   COUNTERSIGN_KEYS=<dir> node measure_messages.mjs studio
import fs from "node:fs";
import { clientFor, deployFile, sendTx, readView, readBuild } from "./lib.mjs";

const network = process.argv[2] || "studio";
const PAGE = "https://raw.githubusercontent.com/Ritapossible/CounterSign/live/demo/northlight.html";
const SAMPLE = "Acme Lending lending contracts v2 March 2026 Northlight audit report";
const STAKE = 10n ** 17n;
// Long enough that nothing can expire while we measure.
const MISS_GAP = network === "studio" ? 300 : 3600;
const READ_WINDOW = 7 * 86400;
const WAIT_SECONDS = network === "studio" ? 1800 : 7200;

const deployer = clientFor(network, "principal");
const auditor = clientFor(network, "vendor");
const project = clientFor(network, "funder");

const OUT = new URL(`./messages-${network}.json`, import.meta.url);
const rec = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { network, page: PAGE, steps: {} };
const save = () => {
  rec.recorded_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(rec, null, 2));
};
const now = () => Date.now();
const secs = (a, b) => Math.round((b - a) / 1000);

if (!rec.reader) {
  rec.reader = (await deployFile(deployer, readBuild("countersign_reader"), [], "reader deploy")).address;
  save();
}
if (!rec.board) {
  rec.board = (await deployFile(deployer, readBuild("countersign_board"), [rec.reader, MISS_GAP, READ_WINDOW], "board deploy")).address;
  save();
}
if (!rec.steps.bind) {
  const t = await sendTx(deployer, rec.reader, "bind", [rec.board], "bind");
  rec.steps.bind = { hash: t.hash, consensus: t.consensus, leader: t.leader };
  save();
}
console.log("reader", rec.reader, "board", rec.board);

/** Poll until ``done(value)`` holds; record when the Reader and the Board each saw it. */
async function watch(label, readerKey, boardRead, done) {
  const step = rec.steps[label];
  const t0 = step.accepted_ms;
  let readerAt = step.reader_after_s ?? null;
  for (;;) {
    const elapsed = secs(t0, now());
    if (readerAt === null) {
      const r = await readView(deployer, rec.reader, "last_read", [readerKey]).catch(() => ({}));
      if (r && Object.keys(r).length) {
        readerAt = elapsed;
        step.reader_after_s = readerAt;
        step.reader_result = r;
        save();
        console.log(`  ${label}: Reader recorded its read after ${readerAt}s`, JSON.stringify(r));
      }
    }
    const b = await boardRead().catch(() => null);
    if (b && done(b)) {
      step.board_after_s = elapsed;
      step.board_result = b;
      save();
      console.log(`  ${label}: Board saw the report after ${elapsed}s`);
      return;
    }
    if (elapsed > WAIT_SECONDS) {
      step.board_after_s = null;
      step.timed_out_after_s = elapsed;
      step.board_result = b;
      save();
      console.log(`  ${label}: no report after ${elapsed}s`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

if (!rec.steps.register?.board_result) {
  if (!rec.steps.register) {
    const sent = now();
    const t = await sendTx(auditor, rec.board, "register", ["Northlight Security (demo)", PAGE, SAMPLE], "register");
    rec.steps.register = { hash: t.hash, consensus: t.consensus, leader: t.leader, sent_ms: sent, accepted_ms: now() };
    rec.steps.register.request_s = secs(sent, rec.steps.register.accepted_ms);
    save();
    console.log(`register accepted after ${rec.steps.register.request_s}s`, t.consensus, t.leader);
  }
  await watch("register", "a:0", () => readView(deployer, rec.board, "get_auditor", [0]), (a) => a.state !== "pending");
}

if (rec.steps.register?.board_result?.state === "registered" && !rec.steps.post?.board_result) {
  if (!rec.steps.post) {
    const sent = now();
    const t = await sendTx(project, rec.board, "post", [0, "Acme Lending", JSON.stringify(["lending contracts v2", "March 2026"]), SAMPLE],
      "post", STAKE);
    rec.steps.post = { hash: t.hash, consensus: t.consensus, leader: t.leader, sent_ms: sent, accepted_ms: now() };
    rec.steps.post.request_s = secs(sent, rec.steps.post.accepted_ms);
    save();
    console.log(`post accepted after ${rec.steps.post.request_s}s`, t.consensus, t.leader);
  }
  await watch("post", "c:0", () => readView(deployer, rec.board, "get_claim", [0]), (c) => c.state !== "pending");
}

rec.status = await readView(deployer, rec.board, "status");
save();
console.log(JSON.stringify({ register: rec.steps.register?.board_after_s, post: rec.steps.post?.board_after_s, status: rec.status }));
