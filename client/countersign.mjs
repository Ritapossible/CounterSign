// CounterSign for an app: the deployed contracts on each network, every view
// decoded into plain states, and every write with its fee deposit.
//
// No UI here: the design comes separately and sits on top of this module.
// Works in the browser (pass a wallet address and the client signs through
// the injected provider) and in Node (pass a private key).
//
//   import { connect } from "./countersign.mjs";
//   const cs = connect("studio");                    // read only
//   const cs = connect("studionext", { account });   // reads and writes
//   const claims = await cs.claims();
// Studio runs the older GenVM: SDK 2 cannot read from it (its gen_call fails
// with exit_code 1), so Studio uses SDK 1. Fee networks need SDK 2.
import { createClient as createFeeClient, createAccount as createFeeAccount } from "genlayer-js";
import { studioDevnet, testnetBradbury } from "genlayer-js/chains";
import { createClient as createV1Client, createAccount as createV1Account } from "genlayer-js-v1";
import { studionet } from "genlayer-js-v1/chains";

// --------------------------------------------------------------- networks

/**
 * Contracts deployed from build 991d8c1, code verified (deploy/verify_code.mjs).
 * Bradbury is empty until it reopens after its Phase 2 reset.
 */
export const NETWORKS = {
  studio: {
    name: "GenLayer Studio",
    chain: studionet,
    fees: false,
    board: "0x334ae6d55d4113177F1eC05890d228A62E6DdC4F",
    reader: "0x5Cc46d899319C505a600403af9BEEc9AB0c80dA1",
  },
  studionext: {
    name: "GenLayer Studio Next",
    chain: { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } },
    fees: true,
    board: "0x3Ae1CeADe2d568C0861d2174E2b4C45a52b8CBe3",
    reader: "0x521CaE5A1CFB2CFe92C3E54a9b01c24d5d348979",
  },
  bradbury: {
    name: "GenLayer Bradbury",
    chain: testnetBradbury,
    fees: true,
    board: null,
    reader: null,
  },
};

// ------------------------------------------------- the contract's numbers

// Mirrors contracts/countersign_core.py; amounts in atto-GEN.
export const GEN = 10n ** 18n;
export const MIN_STAKE = GEN / 10n;
export const RECHECK_FEE = GEN / 100n;
export const KEEPER_REWARD = GEN / 50n;

/** What each state means, in words a page can show as they are. */
export const CLAIM_STATES = {
  pending: "Waiting for the auditor's page to be read",
  live: "Confirmed on the auditor's page",
  refused: "Not posted: the auditor's page did not confirm it",
  down: "Taken down by a re-check",
  withdrawn: "Withdrawn by the project",
};
export const AUDITOR_STATES = {
  pending: "Waiting for the page to be read",
  registered: "Registered",
  refused: "Refused: the sample row was not visible on the page",
};

// ------------------------------------------------------------- decoding

const lower = (a) => String(a || "").toLowerCase();
const parse = (raw) => (typeof raw === "string" && /^[[{]/.test(raw) ? JSON.parse(raw) : raw);

/**
 * A claim as the Board returns it, plus what anyone may do with it now.
 * ``me`` is the viewer's address, or empty. ``now`` is the Board's clock,
 * returned with the claim, so deadlines never depend on the viewer's clock.
 */
export function decodeClaim(c, me = "") {
  const read = c.read || null;
  const now = Number(c.now);
  const due = read ? Number(read.due) : null;
  const meL = lower(me);
  const open = c.state === "pending" || c.state === "live";
  return {
    id: Number(c.id),
    state: c.state,
    stateText: CLAIM_STATES[c.state] ?? c.state,
    why: c.why || "",
    auditor: { id: Number(c.auditor), name: c.auditor_name, host: c.auditor_host, signer: lower(c.auditor_signer) },
    project: lower(c.project),
    subject: c.subject,
    scope: c.scope,
    passage: c.passage,
    stake: BigInt(c.stake),
    postedAt: Number(c.posted_at),
    checkedAt: Number(c.checked_at) || null,
    endedAt: Number(c.ended_at) || null,
    misses: Number(c.misses),
    read: read && {
      seq: Number(read.seq), kind: read.kind, caller: lower(read.caller), fee: BigInt(read.fee),
      at: Number(read.at), due, overdue: now > due,
    },
    now,
    can: {
      // A re-check: live, no read open, not by the auditor's own signer.
      recheck: c.state === "live" && !read && (!meL || meL !== lower(c.auditor_signer)),
      withdraw: open && !!meL && meL === lower(c.project),
      // Past its deadline a read counts as silent; anyone closes it.
      expire: !!read && now > due,
      // Before the deadline anyone may read the page again (the Reader takes
      // only the id; the page and passage come from the Board's record).
      retry: !!read && now <= due,
    },
  };
}

export function decodeAuditor(a) {
  return {
    id: Number(a.id),
    name: a.name,
    url: a.url,
    host: a.host,
    sample: a.sample,
    signer: lower(a.signer),
    state: a.state,
    stateText: AUDITOR_STATES[a.state] ?? a.state,
    due: a.due != null ? Number(a.due) : null,
  };
}

export const formatGen = (atto) => {
  const v = BigInt(atto);
  const whole = v / GEN;
  const frac = (v % GEN).toString().padStart(18, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
};

/**
 * The outcome of a transaction receipt, across the spellings Studio and
 * Bradbury use: ``applied`` (agreed and returned), ``refused`` (agreed on a
 * contract error: nothing changed), or neither (no agreement).
 */
export function outcome(r) {
  const consensus = r?.result_name ?? r?.resultName ?? "UNKNOWN";
  const exec = r?.txExecutionResultName ?? "";
  const leader =
    r?.consensus_data?.leader_receipt?.[0]?.result?.status ??
    (/RETURN/.test(exec) ? "return" : /ERROR|ROLLBACK/.test(exec) ? "contract_error" : exec || "unknown");
  const agreed = /AGREE/.test(consensus) && !/DISAGREE/.test(consensus);
  return { consensus, agreed, applied: agreed && leader === "return", refused: agreed && leader === "contract_error" };
}

// ------------------------------------------------------------ pacing

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry a read the node turned away for load: Studio limits callers per
 * minute, both networks answer "server busy" when their execution slots are
 * full, and a gateway in front of Studio Next sometimes answers with an HTML
 * error page. Anything else is thrown at once. */
export async function patient(fn, tries = 6) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.details || e?.message || e);
      if (i >= tries - 1 || !/busy|rate limit|429|50[234]|slots occupied|gateway|Unexpected token '<'/i.test(msg)) throw e;
      await sleep(Math.min(30_000, 2000 * 2 ** i));
    }
  }
}

/** ``fn(0..n-1)`` with at most ``width`` reads in flight, results in order. */
export async function few(n, fn, width = 3) {
  const out = new Array(n);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, n) }, async () => {
    while (next < n) {
      const i = next++;
      out[i] = await fn(i);
    }
  }));
  return out;
}

// -------------------------------------------------------------- connect

/**
 * ``account``: a wallet address (browser: signs through window.ethereum), a
 * private key (Node), or nothing for read-only use.
 */
export function connect(network, { account, provider } = {}) {
  const net = NETWORKS[network];
  if (!net) throw new Error(`unknown network ${network}`);
  if (!net.board) throw new Error(`${net.name}: CounterSign is not deployed there yet`);
  const [createClient, createAccount] = net.fees ? [createFeeClient, createFeeAccount] : [createV1Client, createV1Account];
  const signer = typeof account === "string" && /^0x[0-9a-fA-F]{64}$/.test(account) ? createAccount(account) : account;
  const client = createClient({ chain: net.chain, ...(signer ? { account: signer } : {}), ...(provider ? { provider } : {}) });
  const me = lower(typeof signer === "string" ? signer : signer?.address);

  const view = (address, functionName, args = []) =>
    patient(async () => parse(await client.readContract({ address, functionName, args })));
  const board = (fn, args) => view(net.board, fn, args);

  async function fees(address, functionName, args, value) {
    if (!net.fees) return undefined;
    const r = await client.estimateTransactionFeesForWrite({ address, functionName, args, value });
    return { distribution: r.distribution, messageAllocations: r.messageAllocations, feeValue: r.feeValue };
  }

  /** Send a write and wait until it is accepted. Returns the hash and outcome. */
  async function write(address, functionName, args, value = 0n, { onSent } = {}) {
    if (!signer) throw new Error("connect with an account to send transactions");
    const f = await fees(address, functionName, args, value);
    const hash = await client.writeContract({ address, functionName, args, value, ...(f ? { fees: f } : {}) });
    onSent?.(hash);
    let r = await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 200, interval: 3000 });
    // Bradbury can hand back a receipt whose round is not decided yet.
    for (let i = 0; i < 60 && ["IDLE", "UNKNOWN", ""].includes(outcome(r).consensus); i++) {
      await new Promise((s) => setTimeout(s, 5000));
      r = await client.getTransaction({ hash }).catch(() => r);
    }
    return { hash, receipt: r, ...outcome(r) };
  }

  /** ``post`` and ``recheck`` refuse without reverting: the value comes back
   * as ``owed`` and ``refusal_of`` says why. A refusal is new when the
   * record changed during this write; it is then attached. */
  async function refusable(functionName, args, value, o) {
    const before = JSON.stringify(await board("refusal_of", [me]).catch(() => ({})));
    const sent = await write(net.board, functionName, args, value, o);
    if (!sent.applied) return sent;
    const after = await board("refusal_of", [me]).catch(() => ({}));
    return { ...sent, refusal: after && after.reason && JSON.stringify(after) !== before ? after : null };
  }

  return {
    network, net, client, me,

    // ---- views
    status: () => board("status"),
    auditor: async (id) => decodeAuditor(await board("get_auditor", [id])),
    claim: async (id) => decodeClaim(await board("get_claim", [id]), me),
    async auditors() {
      const n = (await board("status")).auditors;
      return few(n, (i) => this.auditor(i));
    },
    async claims() {
      const n = (await board("status")).claims;
      return few(n, (i) => this.claim(i));
    },
    owedTo: async (address = me) => BigInt(await board("owed_to", [address])),
    refusalOf: (address = me) => board("refusal_of", [address]),
    /** The Reader's last outcome for a claim or a registration. */
    lastRead: (kind, id) => view(net.reader, "last_read", [`${kind === "claim" ? "c" : "a"}:${id}`]),

    // ---- writes (each resolves once the transaction is accepted)
    register: (name, pageUrl, sample, o) => write(net.board, "register", [name, pageUrl, sample], 0n, o),
    post: (auditorId, subject, scope, passage, stake = MIN_STAKE, o) =>
      refusable("post", [auditorId, subject, JSON.stringify(scope), passage], BigInt(stake), o),
    recheck: (claimId, o) => refusable("recheck", [claimId], RECHECK_FEE, o),
    withdraw: (claimId, o) => write(net.board, "withdraw_claim", [claimId], 0n, o),
    expire: (claimId, o) => write(net.board, "expire", [claimId], 0n, o),
    expireRegistration: (auditorId, o) => write(net.board, "expire_registration", [auditorId], 0n, o),
    collect: (o) => write(net.board, "collect", [], 0n, o),
    retryClaim: (claimId, o) => write(net.reader, "retry_claim", [claimId], 0n, o),
    retryRegistration: (auditorId, o) => write(net.reader, "retry_registration", [auditorId], 0n, o),
  };
}
