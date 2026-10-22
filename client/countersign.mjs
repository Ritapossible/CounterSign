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
import { getAddress } from "viem";

// --------------------------------------------------------------- networks

/**
 * Contracts deployed from build a43fad4 (the expiry rule, THREAT-MODEL T23),
 * code verified (deploy/verify_code.mjs). Studio is the Board of the scenario
 * run in deploy/scenario-studio.json, so the app shows the demonstration run;
 * Studio Next is a fresh pair (deploy/deployment-studionext.json). Bradbury is
 * empty until it reopens after its Phase 2 reset.
 */
export const NETWORKS = {
  studio: {
    name: "GenLayer Studio",
    chain: studionet,
    fees: false,
    board: "0xd807307B04812C0035f808e4015850F3e0e6B264",
    reader: "0x5F69d0151d96a770DaA666c83eE8A7681D55aC3A",
  },
  studionext: {
    name: "GenLayer Studio Next",
    chain: { ...studioDevnet, name: "GenLayer Studio Next", rpcUrls: { default: { http: ["https://studio-next.genlayer.com/api"] } } },
    fees: true,
    board: "0x7B2793018645200690A7a3066C245DD8f3F65dd0",
    reader: "0xE30aB8EABaD0445E1D13bFC412Da4a816C604084",
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
      // Past its deadline anyone closes the read: a posting is refused, a
      // re-check's fee goes back and it is not a miss.
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

/** A read the contract itself refused: retrying cannot change it. */
const contractError = (msg) => /execution failed|exit_code|unknown (claim|auditor)|KeyError|IndexError/i.test(msg);

/**
 * Retry a read until it succeeds or the contract itself refuses it. Studio
 * limits callers per minute and per contract, both networks answer "server
 * busy" when their execution slots are full, a gateway sometimes answers
 * with an HTML page, and on a phone network these surface as an "unknown RPC
 * error" or a dropped connection. All of those are worth another try, with
 * waits that grow to half a minute.
 */
export async function patient(fn, tries = 8) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.details || e?.shortMessage || e?.message || e);
      if (i >= tries - 1 || contractError(msg)) throw e;
      await sleep(Math.min(30_000, 1500 * 2 ** i));
    }
  }
}

/** ``fn(0..n-1)`` with at most ``width`` reads in flight, results in order. */
export async function few(n, fn, width = 2) {
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

// --------------------------------------------------------------- faucet

/** Networks with a public faucet (``sim_fundAccount``). */
export const HAS_FAUCET = new Set(["studio", "studionext"]);

/**
 * Fund an address with test GEN on Studio or Studio Next. The amount travels
 * as a raw JSON integer in atto-GEN: a hex or string amount is refused.
 */
export async function fundFromFaucet(network, address, gen = 5) {
  if (!HAS_FAUCET.has(network)) throw new Error(`${NETWORKS[network].name} has no public faucet`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error("not an address");
  const url = NETWORKS[network].chain.rpcUrls.default.http[0];
  // The faucet credits the address exactly as written, and balances are read
  // under its checksummed form: a lower-case address is "funded" and the GEN
  // never shows (measured on Studio and Studio Next).
  const body = `{"jsonrpc":"2.0","id":${Date.now()},"method":"sim_fundAccount","params":["${getAddress(address)}",${BigInt(gen) * GEN}]}`;
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "the faucet refused");
}

/** An address's GEN balance, in atto-GEN. */
export async function balanceOf(network, address) {
  const url = NETWORKS[network].chain.rpcUrls.default.http[0];
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "eth_getBalance", params: [address, "latest"] }) });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? "balance unavailable");
  return BigInt(json.result ?? "0x0");
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
    /** The records as the Board returns them (JSON-safe, for caching). */
    rawAuditor: (id) => board("get_auditor", [id]),
    rawClaim: (id) => board("get_claim", [id]),
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
