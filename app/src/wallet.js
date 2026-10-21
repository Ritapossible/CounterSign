// Wallet connection through Reown AppKit (reown.com), as in Remit: browser
// extension wallets, and mobile wallets over WalletConnect. It needs a
// project ID from dashboard.reown.com in VITE_REOWN_PROJECT_ID, with this
// site's domain on the project's allowlist. Without one the app falls back
// to the browser's injected wallet (window.ethereum).
import { useCallback, useEffect, useRef, useState } from "react";
import { createAppKit, useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider, useAppKitState, useDisconnect, useWalletInfo } from "@reown/appkit/react";
import { defineChain } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { NETWORKS } from "../../client/countersign.mjs";

export const projectId = String(import.meta.env.VITE_REOWN_PROJECT_ID ?? "").trim();
export const appKitEnabled = projectId.length > 0;

const LIVE = Object.keys(NETWORKS).filter((k) => NETWORKS[k].board);

function toAppKit(key) {
  const c = NETWORKS[key].chain;
  return defineChain({
    id: c.id,
    caipNetworkId: `eip155:${c.id}`,
    chainNamespace: "eip155",
    name: NETWORKS[key].name,
    nativeCurrency: c.nativeCurrency ?? { name: "GEN", symbol: "GEN", decimals: 18 },
    // The endpoint the app itself reads from, so a wallet that adds the chain
    // from this config talks to the same node.
    rpcUrls: { default: { http: c.rpcUrls.default.http } },
    blockExplorers: c.blockExplorers?.default?.url ? { default: { name: "Explorer", url: c.blockExplorers.default.url } } : undefined,
    testnet: true,
  });
}

export const APPKIT_NETWORKS = Object.fromEntries(LIVE.map((k) => [k, toAppKit(k)]));
const list = LIVE.map((k) => APPKIT_NETWORKS[k]);

export const wagmiAdapter = appKitEnabled ? new WagmiAdapter({ networks: list, projectId, ssr: false }) : null;

const saved = (() => { try { return localStorage.getItem("cs.network"); } catch { return null; } })();

export const appKit = wagmiAdapter && createAppKit({
  adapters: [wagmiAdapter],
  networks: list,
  defaultNetwork: APPKIT_NETWORKS[saved] ?? list[0],
  projectId,
  metadata: {
    name: "CounterSign",
    description: "Public audit claims, read from the auditor's own page by GenLayer validators.",
    url: window.location.origin,
    icons: [`${window.location.origin}/mark.svg`],
  },
  // A wallet on any other chain is asked to switch before it can be used.
  allowUnsupportedChain: false,
  enableNetworkSwitch: true,
  features: { analytics: false, email: false, socials: false, onramp: false, swaps: false, history: false, send: false },
  themeMode: "light",
  themeVariables: {
    "--w3m-font-family": "Inter, system-ui, sans-serif",
    "--w3m-accent": "#51735c",
    "--w3m-color-mix": "#201e21",
    "--w3m-color-mix-strength": 0,
    "--w3m-border-radius-master": "3px",
    "--w3m-z-index": 1000,
  },
});

export const networkOfChain = (chainId) => LIVE.find((k) => NETWORKS[k].chain.id === Number(chainId));

export const injected = () => (typeof window !== "undefined" ? window.ethereum : undefined);

/** Ask a wallet to move to the network, adding it first if it does not know it. */
export async function switchProvider(provider, key) {
  const c = NETWORKS[key].chain;
  const chainId = "0x" + c.id.toString(16);
  const current = await provider.request({ method: "eth_chainId" }).catch(() => null);
  if (String(current).toLowerCase() === chainId) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if (Number(e?.code) === 4001) throw e; // the user said no
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: NETWORKS[key].name,
        rpcUrls: c.rpcUrls.default.http,
        nativeCurrency: c.nativeCurrency ?? { name: "GEN", symbol: "GEN", decimals: 18 },
        ...(c.blockExplorers?.default?.url ? { blockExplorerUrls: [c.blockExplorers.default.url] } : {}),
      }],
    });
  }
}

function useAppKitWallet() {
  const { open, close } = useAppKit();
  const { open: modalOpen } = useAppKitState();
  const { address, isConnected, status } = useAppKitAccount({ namespace: "eip155" });
  const { walletProvider } = useAppKitProvider("eip155");
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { disconnect } = useDisconnect();
  const { walletInfo } = useWalletInfo("eip155");
  const connected = isConnected && !!address && !!walletProvider;

  // The chain the wallet is really on, asked of the wallet itself: AppKit's
  // own state keeps the last supported network while the wallet sits on
  // another chain, and signing there would fail.
  const [walletChain, setWalletChain] = useState();
  useEffect(() => {
    setWalletChain(undefined);
    if (!connected || !walletProvider) return;
    let live = true;
    const read = () => walletProvider.request({ method: "eth_chainId" })
      .then((c) => live && setWalletChain(Number(c)))
      .catch(() => live && setWalletChain(chainId === undefined ? undefined : Number(chainId)));
    const onChain = (c) => live && setWalletChain(Number(c));
    read();
    walletProvider.on?.("chainChanged", onChain);
    return () => { live = false; walletProvider.removeListener?.("chainChanged", onChain); };
  }, [connected, walletProvider, chainId]);

  // AppKit's "Switch network" sheet can stay open after the wallet switched by
  // another route; close it once the wallet reaches a GenLayer network.
  const last = useRef();
  useEffect(() => {
    const before = last.current;
    last.current = walletChain;
    if (modalOpen && walletChain !== undefined && before !== walletChain && networkOfChain(walletChain) && !networkOfChain(before)) close();
  }, [walletChain, modalOpen, close]);

  return {
    via: "appkit",
    available: true,
    address: connected ? address.toLowerCase() : "",
    provider: connected ? walletProvider : undefined,
    chainId: connected ? walletChain : undefined,
    name: walletInfo?.name ?? "Wallet",
    connecting: status === "connecting" || status === "reconnecting",
    connect: async () => { await open({ view: "Connect" }); },
    manage: async () => { await open({ view: "Account" }); },
    disconnect: () => disconnect({ namespace: "eip155" }),
    switchTo: async (key) => {
      // Ask the wallet itself first; AppKit's switchNetwork compares against
      // its own state and can skip the request.
      if (connected && walletProvider) {
        try { await switchProvider(walletProvider, key); return; } catch (e) { if (Number(e?.code) === 4001) throw e; }
      }
      await switchNetwork(APPKIT_NETWORKS[key]);
    },
  };
}

function useInjectedWallet() {
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState();
  const [connecting, setConnecting] = useState(false);
  const eth = injected();

  useEffect(() => {
    if (!eth?.on) return;
    const onAccounts = (a) => setAddress(a?.[0]?.toLowerCase() ?? "");
    const onChain = (c) => setChainId(parseInt(c, 16));
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => { eth.removeListener?.("accountsChanged", onAccounts); eth.removeListener?.("chainChanged", onChain); };
  }, [eth]);

  const connect = useCallback(async () => {
    if (!eth) throw new Error("No wallet in this browser. Open this page in your wallet app's browser.");
    setConnecting(true);
    try {
      const [a] = await eth.request({ method: "eth_requestAccounts" });
      if (!a) throw new Error("The wallet shared no account.");
      setChainId(parseInt(await eth.request({ method: "eth_chainId" }), 16));
      setAddress(a.toLowerCase());
    } finally {
      setConnecting(false);
    }
  }, [eth]);

  return {
    via: "injected",
    available: !!eth,
    address,
    provider: address ? eth : undefined,
    chainId,
    name: eth?.isMetaMask ? "MetaMask" : "Browser wallet",
    connecting,
    connect,
    manage: async () => {},
    disconnect: async () => setAddress(""),
    switchTo: async (key) => { if (eth) await switchProvider(eth, key); },
  };
}

// Chosen once at load, so the same hooks run on every render.
export const useExternalWallet = appKitEnabled ? useAppKitWallet : useInjectedWallet;
