// Network, wallet and chain data, shared by every page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NETWORKS, connect, decodeAuditor, decodeClaim } from "../../client/countersign.mjs";
import { useExternalWallet } from "./wallet.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const remember = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const LIVE_NETWORKS = Object.entries(NETWORKS).filter(([, n]) => n.board).map(([k]) => k);

export function AppProvider({ children }) {
  const [network, setNetworkState] = useState(() => (LIVE_NETWORKS.includes(recall("cs.network")) ? recall("cs.network") : "studio"));
  const ext = useExternalWallet();
  const account = ext.address || null;
  const [data, setData] = useState({ status: null, auditors: null, claims: null, loading: true, failed: 0, error: null, at: 0 });
  const [toast, setToast] = useState(null);
  const loading = useRef(0);

  const reader = useMemo(() => connect(network), [network]);
  const signer = useMemo(
    () => (account && ext.provider ? connect(network, { account, provider: ext.provider }) : null),
    [network, account, ext.provider],
  );

  /**
   * Read the Board: its status, then every claim (newest first) and every
   * auditor entry, shown as they arrive. Records that can no longer change
   * (a closed claim, a decided registration) are kept in this browser and not
   * read again, so a return visit reads only what is still open. A record
   * that cannot be read after the client's retries is skipped and counted.
   */
  const refresh = useCallback(async () => {
    const ticket = ++loading.current;
    const live = () => ticket === loading.current;
    const key = `cs.cache.${network}.${NETWORKS[network].board}`;
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
    cache.claims ??= {};
    cache.auditors ??= {};
    const save = () => { try { localStorage.setItem(key, JSON.stringify(cache)); } catch {} };
    let status;
    try {
      status = await reader.status();
    } catch (e) {
      if (live()) setData((d) => ({ ...d, error: String(e?.shortMessage || e?.message || e) }));
      return;
    }
    const claims = new Map(), auditors = new Map();
    let failed = 0, now = Math.floor(Date.now() / 1000);
    const show = (done) => {
      if (!live()) return;
      const order = (m) => [...m.values()].sort((x, y) => x.id - y.id);
      setData({
        status,
        claims: order(claims).map((c) => ({ ...c, now: Math.max(c.now, now), read: c.read && { ...c.read, overdue: now > c.read.due } })),
        auditors: order(auditors),
        loading: !done,
        failed,
        error: null,
        at: Date.now(),
      });
    };
    const CLOSED = new Set(["refused", "down", "withdrawn"]);
    // Newest claims first, then auditor entries; four reads in flight, well
    // under Studio's limit of 20 reads per 10 s per contract.
    const jobs = [
      ...Array.from({ length: status.claims }, (_, i) => ["claim", status.claims - 1 - i]),
      ...Array.from({ length: status.auditors }, (_, i) => ["auditor", status.auditors - 1 - i]),
    ];
    let next = 0, since = 0;
    const work = async () => {
      while (next < jobs.length && live()) {
        const [kind, id] = jobs[next++];
        const store = kind === "claim" ? cache.claims : cache.auditors;
        let raw = store[id];
        if (!raw) {
          try {
            raw = await (kind === "claim" ? reader.rawClaim(id) : reader.rawAuditor(id));
          } catch { failed++; continue; }
          if (kind === "claim") now = Math.max(now, Number(raw.now) || 0);
          if (kind === "claim" ? CLOSED.has(raw.state) : raw.state !== "pending") { store[id] = raw; save(); }
        }
        if (kind === "claim") claims.set(id, decodeClaim(raw));
        else auditors.set(id, decodeAuditor(raw));
        if (++since >= 3) { since = 0; show(false); }
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    if (!live()) return;
    show(true);
  }, [reader, network]);

  useEffect(() => {
    setData({ status: null, auditors: null, claims: null, loading: true, failed: 0, error: null, at: 0 });
    refresh();
  }, [refresh]);

  const setNetwork = (n) => { remember("cs.network", n); setNetworkState(n); };

  /** Open the wallet picker (Reown AppKit), or ask the browser wallet. */
  const connectWallet = async () => {
    if (!ext.available) throw new Error("No wallet in this browser. Open this page in your wallet app's browser.");
    await ext.connect();
  };

  /**
   * Run a write with visible progress. ``fn`` receives the signing client.
   * Resolves to the write's result, or null when it failed.
   */
  const run = async (label, fn, onStep) => {
    try {
      if (!account || !ext.provider) {
        await connectWallet();
        onStep?.({ phase: "error", label, message: "Connect your wallet, then press the button again." });
        return null;
      }
      // The wallet must be on the network the app shows before it signs.
      await ext.switchTo(network);
      const cs = connect(network, { account, provider: ext.provider });
      onStep?.({ phase: "sign", label });
      const r = await fn(cs, { onSent: (hash) => onStep?.({ phase: "wait", label, hash }) });
      const result = r.refusal
        ? { phase: "refused", label, hash: r.hash, message: r.refusal.reason }
        : r.applied
          ? { phase: "done", label, hash: r.hash }
          : r.refused
            ? { phase: "refused", label, hash: r.hash, message: "The contract refused this call; nothing changed." }
            : { phase: "error", label, hash: r.hash, message: `Validators did not agree (${r.consensus}); nothing changed.` };
      onStep?.(result);
      refresh();
      return r;
    } catch (e) {
      const message = String(e?.shortMessage || e?.details || e?.message || e).split("\n")[0];
      onStep?.({ phase: "error", label, message: /rejected|denied/i.test(message) ? "You rejected the request in your wallet." : message });
      return null;
    }
  };

  const say = (text) => { setToast(text); setTimeout(() => setToast(null), 4200); };

  const value = { network, setNetwork, net: NETWORKS[network], reader, signer, account, wallet: ext, connectWallet, data, refresh, run, say };
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

/** ``#/claims/3`` → ["claims", "3"]. */
export function useRoute() {
  const read = () => (window.location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
