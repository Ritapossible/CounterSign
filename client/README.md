# CounterSign client

The layer between the deployed contracts and an app. It holds no design: the
front end's design is supplied separately and goes on top of this module.

- `NETWORKS`: Board and Reader addresses on Studio and Studio Next (build
  `991d8c1`, code verified). Bradbury is empty until it reopens after its
  Phase 2 reset.
- Views decoded into plain states (`decodeClaim`, `decodeAuditor`), with
  what the viewer may do now: `can.recheck`, `can.withdraw`, `can.retry`,
  `can.expire`. Deadlines use the Board's clock, returned with each claim.
- One function per write, each with its fee deposit on fee networks (the
  SDK's simulation of that exact call, including the message to the Reader).
  `post` and `recheck` refuse without reverting; their result carries the
  reason from `refusal_of` when the call was refused.
- Reads are paced: at most three in flight, and a read the node turns away
  for load ("server busy", Studio's per-minute limit) is retried.

Studio still runs the older GenVM and SDK 2 cannot read from it, so Studio
uses `genlayer-js` 1.1.8 and the fee networks use 2.0.0-rc.2.

```js
import { connect, formatGen } from "./countersign.mjs";

const cs = connect("studionext");                    // read only
const claims = await cs.claims();

const me = connect("studionext", { account: walletAddress });  // browser wallet
const r = await me.post(auditorId, "Acme Lending", ["lending contracts v2", "March 2026"], passage);
if (r.refusal) show(r.refusal.reason);
```

`npm test` runs the decoding tests; `node test/live_read.mjs <network>`
reads every auditor and claim on a deployed network.
