// Network, wallet and chain data, shared by every page.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NETWORKS, connect } from "../../client/countersign.mjs";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const remember = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const LIVE_NETWORKS = Object.entries(NETWORKS).filter(([, n]) => n.board).map(([k]) => k);

/** Ask the wallet to use this network's chain, adding it the first time. */
async function switchChain(eth, chain) {
  const chainId = "0x" + chain.id.toString(16);
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if (e?.code !== 4902 && !/unrecognized|not added/i.test(String(e?.message))) throw e;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: chain.name,
        rpcUrls: chain.rpcUrls.default.http,
        nativeCurrency: chain.nativeCurrency ?? { name: "GEN", symbol: "GEN", decimals: 18 },
        ...(chain.blockExplorers?.default?.url ? { blockExplorerUrls: [chain.blockExplorers.default.url] } : {}),
      }],
    });
  }
}

export function AppProvider({ children }) {
  const [network, setNetworkState] = useState(() => (LIVE_NETWORKS.includes(recall("cs.network")) ? recall("cs.network") : "studio"));
  const [account, setAccount] = useState(null);
  const [data, setData] = useState({ status: null, auditors: null, claims: null, error: null, at: 0 });
  const [toast, setToast] = useState(null);
  const loading = useRef(0);

  const reader = useMemo(() => connect(network), [network]);
  const signer = useMemo(
    () => (account ? connect(network, { account, provider: window.ethereum }) : null),
    [network, account],
  );

  const refresh = useCallback(async () => {
    const ticket = ++loading.current;
    try {
      const status = await reader.status();
      const [auditors, claims] = await Promise.all([reader.auditors(), reader.claims()]);
      if (ticket === loading.current) setData({ status, auditors, claims, error: null, at: Date.now() });
    } catch (e) {
      if (ticket === loading.current) setData((d) => ({ ...d, error: String(e?.shortMessage || e?.message || e) }));
    }
  }, [reader]);

  useEffect(() => {
    setData({ status: null, auditors: null, claims: null, error: null, at: 0 });
    refresh();
  }, [refresh]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth?.on) return;
    const onAccounts = (a) => setAccount(a?.[0]?.toLowerCase() ?? null);
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  const setNetwork = (n) => { remember("cs.network", n); setNetworkState(n); };

  const connectWallet = async () => {
    const eth = window.ethereum;
    if (!eth) throw new Error("No browser wallet found. Install MetaMask or another EIP-1193 wallet.");
    const [a] = await eth.request({ method: "eth_requestAccounts" });
    await switchChain(eth, NETWORKS[network].chain);
    setAccount(a.toLowerCase());
    return a.toLowerCase();
  };

  /**
   * Run a write with visible progress. ``fn`` receives the signing client.
   * Resolves to the write's result, or null when it failed.
   */
  const run = async (label, fn, onStep) => {
    try {
      const addr = account ?? (await connectWallet());
      await switchChain(window.ethereum, NETWORKS[network].chain);
      const cs = connect(network, { account: addr, provider: window.ethereum });
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

  const value = { network, setNetwork, net: NETWORKS[network], reader, signer, account, connectWallet, data, refresh, run, say };
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
