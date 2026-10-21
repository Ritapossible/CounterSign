// Shared pieces: header, footer, marks, pills, cards, transaction status.
import { useState } from "react";
import { NETWORKS, formatGen } from "../../client/countersign.mjs";
import { LIVE_NETWORKS, useApp } from "./state.jsx";

export const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function ago(seconds, now) {
  if (!seconds) return "";
  const d = Math.max(0, Number(now) - Number(seconds));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return `${Math.floor(d / 86400)} d ago`;
}

export function until(seconds, now) {
  const d = Number(seconds) - Number(now);
  if (d <= 0) return "passed";
  if (d < 60) return `in ${d}s`;
  if (d < 3600) return `in ${Math.ceil(d / 60)} min`;
  return `in ${Math.round(d / 360) / 10} h`;
}

export function Mark() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <path d="M4 12.5 20 4l16 8.5-16 8.5z" fill="currentColor" />
      <path d="M4 20.5l5.2-2.8L20 23.4l10.8-5.7 5.2 2.8L20 29z" fill="currentColor" opacity=".72" />
      <path d="M4 28.5l5.2-2.8L20 31.4l10.8-5.7 5.2 2.8L20 37z" fill="var(--green)" />
    </svg>
  );
}

export function Brand() {
  return (
    <a className="brand" href="#/">
      <Mark />
      <span>CounterSign</span>
    </a>
  );
}

export function StatePill({ state }) {
  return <span className={`pill ${state}`}>{state}</span>;
}

const LINKS = [
  ["claims", "Claims"],
  ["auditors", "Auditors"],
  ["post", "Post a claim"],
  ["docs", "Docs"],
  ["account", "Account"],
  ["how", "How it works"],
];

function NetworkSelect() {
  const { network, setNetwork } = useApp();
  return (
    <select className="select" aria-label="Network" value={network} onChange={(e) => setNetwork(e.target.value)}>
      {Object.entries(NETWORKS).map(([k, n]) => (
        <option key={k} value={k} disabled={!LIVE_NETWORKS.includes(k)}>
          {n.name.replace("GenLayer ", "")}{LIVE_NETWORKS.includes(k) ? "" : " · soon"}
        </option>
      ))}
    </select>
  );
}

function WalletButton({ block }) {
  const { account, wallet, connectWallet, say } = useApp();
  if (account) {
    // AppKit's account view has the address, balance, network and disconnect.
    return wallet.via === "appkit"
      ? <button className={`btn-line dark small${block ? " block" : ""}`} onClick={() => wallet.manage()}>{short(account)}</button>
      : <a className={`btn-line dark small${block ? " block" : ""}`} href="#/account">{short(account)}</a>;
  }
  return (
    <button className={`btn small${block ? " block" : ""}`} disabled={wallet.connecting} onClick={() => connectWallet().catch((e) => say(e.message))}>
      {wallet.connecting ? "Connecting" : "Connect"}
    </button>
  );
}

export function Header({ page }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="header">
        <div className="wrap">
          <Brand />
          <nav className="nav" aria-label="Main">
            {LINKS.slice(0, 4).map(([k, t]) => (
              <a key={k} href={`#/${k}`} aria-current={page === k ? "page" : undefined}>{t}</a>
            ))}
          </nav>
          <div className="header-tools">
            <span className="hide-sm"><NetworkSelect /></span>
            <span className="hide-sm"><WalletButton /></span>
            <button className="menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
              <i /><i /><i /><i /><span />
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div className="drawer" onClick={(e) => e.target.tagName === "A" && setOpen(false)}>
          <a href="#/">Home</a>
          {LINKS.map(([k, t]) => (
            <a key={k} href={`#/${k}`} aria-current={page === k ? "page" : undefined}>{t}</a>
          ))}
          <div className="drawer-tools">
            <NetworkSelect />
            <WalletButton block />
          </div>
        </div>
      )}
    </>
  );
}

export function Footer() {
  const { net, data } = useApp();
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-card">
          <div className="footer-grid">
            <div>
              <Brand />
              <p className="tagline">Public audit claims, read from the auditor's own page by GenLayer validators.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#/claims">Claims</a></li>
                <li><a href="#/auditors">Auditors</a></li>
                <li><a href="#/post">Post a claim</a></li>
                <li><a href="#/account">Account</a></li>
              </ul>
            </div>
            <div>
              <h4>Docs</h4>
              <ul>
                <li><a href="#/docs/getting-started">Getting started</a></li>
                <li><a href="#/docs/integration">Integration</a></li>
                <li><a href="#/docs/threat-model">Threat model</a></li>
                <li><a href="#/docs/faq">FAQ</a></li>
                <li><a href="https://github.com/Ritapossible/CounterSign" target="_blank" rel="noreferrer">Source code</a></li>
              </ul>
            </div>
          </div>
          <div className="base">
            <span>{net.name} · Board <span className="nocase">{short(net.board)}</span></span>
            <span>{data.status ? `${formatGen(data.status.held)} GEN held` : "Testnet only"}</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** One claim as a card. */
export function ClaimCard({ c }) {
  return (
    <a className="card" href={`#/claims/${c.id}`}>
      <div className="top">
        <StatePill state={c.state} />
        <span className="label muted">#{c.id}</span>
      </div>
      <h3>{c.subject}</h3>
      <p className="quote">{c.scope.join(" · ")}</p>
      <div className="meta">
        <span>{c.auditor.name}</span>
        <span className="nocase">{c.auditor.host}</span>
        <span>{formatGen(c.stake)} GEN</span>
      </div>
      <span className="go">View claim</span>
    </a>
  );
}

/** Progress of one write: signing, waiting for validators, done or refused. */
export function TxStatus({ step }) {
  const { net } = useApp();
  if (!step) return null;
  const link = step.hash && net.chain.blockExplorers?.default?.url
    ? <a href={`${net.chain.blockExplorers.default.url}/tx/${step.hash}`} target="_blank" rel="noreferrer">{short(step.hash)}</a>
    : step.hash ? <span className="mono">{short(step.hash)}</span> : null;
  const text = {
    sign: ["wait", "Confirm the transaction in your wallet…"],
    wait: ["wait", "Sent. Waiting for validators to agree…"],
    done: ["ok", "Done. Validators agreed."],
    refused: ["err", step.message],
    error: ["err", step.message],
  }[step.phase];
  return (
    <div className={`notice ${text[0]}`} role="status" style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
      {text[0] === "wait" && <span className="spin" style={{ marginTop: 4 }} />}
      <span style={{ flex: 1, minWidth: 180 }}>{text[1]}</span>
      {link}
    </div>
  );
}

/** The wireframe globe behind the hero. */
export function Globe() {
  const rings = [0.12, 0.3, 0.5, 0.7, 0.88];
  const meridians = [0.18, 0.42, 0.66, 0.86, 1];
  return (
    <svg className="globe" viewBox="-520 -520 1040 1040" aria-hidden="true">
      <circle r="500" />
      {rings.map((r) => (
        <g key={r}>
          <ellipse cy={-r * 500} rx={Math.sqrt(1 - r * r) * 500} ry={Math.sqrt(1 - r * r) * 90} />
          <ellipse cy={r * 500} rx={Math.sqrt(1 - r * r) * 500} ry={Math.sqrt(1 - r * r) * 90} />
        </g>
      ))}
      <ellipse rx="500" ry="90" />
      {meridians.map((m) => <ellipse key={m} rx={m * 500} ry="500" />)}
      <line x1="0" y1="-500" x2="0" y2="500" />
    </svg>
  );
}
