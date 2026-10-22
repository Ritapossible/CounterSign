// Every page of the app.
import { useEffect, useMemo, useState } from "react";
import { GEN, HAS_FAUCET, MIN_STAKE, RECHECK_FEE, KEEPER_REWARD, balanceOf, formatGen, fundFromFaucet } from "../../client/countersign.mjs";
import { useApp } from "./state.jsx";
import { ClaimCard, Globe, StatePill, TxStatus, ago, short, until } from "./ui.jsx";
import { DOCS, GROUPS, REPO_URL, renderDoc } from "./docs.js";

const STATES = ["live", "pending", "down", "refused", "withdrawn"];

function useClaims() {
  const { data } = useApp();
  return data.claims ? [...data.claims].reverse() : null;
}

function Loading({ error }) {
  const { refresh } = useApp();
  if (error) {
    return (
      <div className="notice err" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: 1 }}>Could not read the contracts: {error}</span>
        <button className="btn small" onClick={refresh}>Try again</button>
      </div>
    );
  }
  return <div className="cards">{[0, 1, 2].map((i) => <div key={i} className="skeleton" />)}</div>;
}

/** While the Board is being read, how far it got; after, what could not be read. */
function LoadState() {
  const { data, refresh } = useApp();
  if (!data.status) return null;
  if (data.loading) {
    return (
      <div className="notice wait" role="status" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 18 }}>
        <span className="spin" />
        <span>Reading the Board: {data.claims?.length ?? 0} of {data.status.claims} claims, {data.auditors?.length ?? 0} of {data.status.auditors} auditor pages.</span>
      </div>
    );
  }
  if (!data.failed) return null;
  return (
    <div className="notice err" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
      <span style={{ flex: 1, minWidth: 200 }}>{data.failed} record{data.failed > 1 ? "s" : ""} could not be read: the network is busy. The rest is shown.</span>
      <button className="btn small" onClick={refresh}>Read again</button>
    </div>
  );
}

function ClaimTabs({ claims, tab, setTab }) {
  const count = (s) => claims.filter((c) => c.state === s).length;
  return (
    <div className="tabs" role="tablist">
      {["live", "pending", "down", "all"].map((s) => (
        <button key={s} role="tab" className="tab" aria-selected={tab === s} onClick={() => setTab(s)}>
          {s}<span className="count">{s === "all" ? claims.length : count(s)}</span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- home

export function Home() {
  const { net, data } = useApp();
  const claims = useClaims();
  const [tab, setTab] = useState("live");
  const shown = claims ? claims.filter((c) => tab === "all" || c.state === tab).slice(0, 6) : null;
  const live = claims ? claims.filter((c) => c.state === "live").length : null;
  const registered = data.auditors ? data.auditors.filter((a) => a.state === "registered").length : null;
  // A real record from the Board: the newest live claim.
  const sample = claims?.find((c) => c.state === "live" && c.print);

  return (
    <>
      <section className="hero">
        <Globe />
        <div className="wrap">
          <p className="hero-badge">Live on GenLayer {net.name.replace("GenLayer ", "")} · test GEN</p>
          <h1 className="display">Audit claims,<br />read at the source</h1>
          <p className="lede">
            A project stakes GEN on a claim that it was audited. GenLayer validators read the auditor's own page to
            confirm it, and anyone can have them read it again. If the page stops saying so, the claim comes down.
          </p>
          <div className="ctas">
            <a className="btn" href="#/claims">Browse claims</a>
            <a className="arrow-link" href="#/post">Post a claim</a>
          </div>
          <p className="demo-note">
            This board is CounterSign's demonstration run on a GenLayer test network: a fictional auditor's pages,
            edited on purpose to exercise every case, and four public audit lists registered as labelled demo entries.
            Test GEN has no value.
          </p>
        </div>
      </section>

      <div className="wrap">
        <div className="stats">
          <div className="stat"><div className="v">{live ?? "–"}</div><div className="k">Live claims</div></div>
          <div className="stat"><div className="v">{registered ?? "–"}</div><div className="k">Registered auditors</div></div>
          <div className="stat"><div className="v">{data.status ? formatGen(data.status.held) : "–"}</div><div className="k">GEN at stake</div></div>
          <div className="stat"><div className="v">{claims ? claims.length : "–"}</div><div className="k">Claims posted</div></div>
        </div>
      </div>

      <section className="night" style={{ marginTop: "clamp(64px, 9vw, 110px)" }}>
        <div className="grid-lines" />
        <div className="wrap split">
          <div className="ruled">
            <h2>The auditor's page is the record, not the project's word</h2>
            <p>
              Each claim quotes a passage from the page the auditor registered. Validators fetch that page themselves,
              and only agreement between them changes a claim.
            </p>
            <a className="btn-line" href="#/how">How it works</a>
          </div>
          <div>
            <div className="console">
              <div className="console-bar"><span className="dot" />Board · <span className="nocase">{short(net.board)}</span></div>
              {(claims ?? []).slice(0, 4).map((c) => (
                <a key={c.id} className="console-row" href={`#/claims/${c.id}`} style={{ textDecoration: "none" }}>
                  <StatePill state={c.state} />
                  <span className="t">{c.subject} · {c.auditor.name}</span>
                  <span className="s">#{c.id}</span>
                </a>
              ))}
              {!claims && <div className="console-row"><span className="s">Reading the Board…</span></div>}
              <hr className="hr" />
              {sample && (
                <pre>
                  <b>$</b> get_claim({sample.id}){"\n"}
                  {`{"state": "${sample.state}", "print": "${sample.print}", "misses": ${sample.misses}}`}
                </pre>
              )}
            </div>
          </div>
        </div>
        <hr className="hr" />
        <div className="wrap split">
          <ol className="steps">
            <li className="step"><span className="n">01</span><div><h3>Auditor registers</h3><p>It pins the one page that lists its audits, with one row from it. Validators check the row is visible there.</p></div></li>
            <li className="step"><span className="n">02</span><div><h3>Project posts</h3><p>It stakes at least {formatGen(MIN_STAKE)} GEN and quotes the passage. The claim goes live only if validators confirm it.</p></div></li>
            <li className="step"><span className="n">03</span><div><h3>Anyone re-checks</h3><p>For {formatGen(RECHECK_FEE)} GEN, validators read the page again. A denial, or silence twice, takes the claim down.</p></div></li>
            <li className="step"><span className="n">04</span><div><h3>Everyone collects</h3><p>Stakes, fees and the {formatGen(KEEPER_REWARD)} GEN keeper reward are credited, then collected. The auditor is never paid.</p></div></li>
          </ol>
          <div className="ruled">
            <h2>Four steps, and nobody's word is taken for it</h2>
            <p>Registration, posting and every re-check are reads of a public page by validators who must agree.</p>
            <a className="btn-line" href="#/auditors">Register an auditor page</a>
          </div>
        </div>
      </section>

      <section className="section on-paper">
        <div className="grid-lines" />
        <div className="wrap">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <p className="eyebrow">/On the Board</p>
            <h2 className="display" style={{ fontSize: "clamp(44px, 8vw, 96px)" }}>Every claim, read<br />from the source</h2>
            <p className="muted" style={{ fontSize: 19, maxWidth: 560, margin: "22px auto 0" }}>
              Claims on {net.name}, newest first. Open one to see its passage, its last read and what you can do.
            </p>
          </div>
          {claims ? (
            <>
              <LoadState />
              <ClaimTabs claims={claims} tab={tab} setTab={setTab} />
              <div className="cards" style={{ marginTop: 22 }}>
                {shown.map((c) => <ClaimCard key={c.id} c={c} />)}
              </div>
              {!shown.length && !data.loading && <div className="empty">No {tab} claims on this network yet.</div>}
              <div style={{ textAlign: "center", marginTop: 36 }}><a className="arrow-link" href="#/claims">View all</a></div>
            </>
          ) : <Loading error={data.error} />}
        </div>
      </section>

      <section className="night section" style={{ textAlign: "center" }}>
        <div className="grid-lines" />
        <div className="wrap">
          <h2 className="display" style={{ fontSize: "clamp(48px, 9vw, 110px)" }}>Put your audit<br />on the record</h2>
          <div className="ctas" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, marginTop: 44 }}>
            <a className="btn-line" href="#/post">Post a claim</a>
            <a className="arrow-link" href="#/auditors">Register as an auditor</a>
          </div>
        </div>
      </section>
      <div style={{ height: 40 }} />
    </>
  );
}

// ----------------------------------------------------------------- claims

export function Claims() {
  const { data } = useApp();
  const claims = useClaims();
  const [tab, setTab] = useState("all");
  const shown = claims?.filter((c) => tab === "all" || c.state === tab);
  return (
    <div className="wrap on-paper" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <p className="eyebrow">/Claims</p>
        <h1 className="display">The Board</h1>
        <p>Every claim posted on this network. A live claim was confirmed on the auditor's page at its last read.</p>
      </div>
      {claims ? (
        <>
          <LoadState />
          <ClaimTabs claims={claims} tab={tab} setTab={setTab} />
          <div className="cards" style={{ marginTop: 22 }}>{shown.map((c) => <ClaimCard key={c.id} c={c} />)}</div>
          {!shown.length && !data.loading && <div className="empty" style={{ marginTop: 22 }}>No {tab === "all" ? "" : tab + " "}claims yet. <a href="#/post">Post the first one.</a></div>}
        </>
      ) : <Loading error={data.error} />}
    </div>
  );
}

// ------------------------------------------------------------ claim detail

function Action({ title, text, children }) {
  return (
    <div className="action">
      <span className="label">{title}</span>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function ClaimDetail({ id }) {
  const { data, account, run } = useApp();
  const [step, setStep] = useState(null);
  const raw = data.claims?.find((c) => c.id === Number(id));
  if (!data.claims) return <div className="wrap" style={{ padding: "60px 0" }}><Loading error={data.error} /></div>;
  if (!raw && data.loading) return <div className="wrap" style={{ padding: "60px 0" }}><LoadState /><div className="skeleton" /></div>;
  if (!raw) return <div className="wrap page-head"><h1 className="display">Claim not found</h1><p><a href="#/claims">Back to the Board</a></p></div>;
  // Re-derive what this viewer may do (the list was read without a wallet).
  const me = account ?? "";
  const c = { ...raw, can: { ...raw.can, recheck: raw.can.recheck && me !== raw.auditor.signer, withdraw: raw.state !== "refused" && raw.state !== "down" && raw.state !== "withdrawn" && !!me && me === raw.project } };
  const busy = step && (step.phase === "sign" || step.phase === "wait");
  const act = (label, fn) => run(label, fn, setStep);

  return (
    <div className="wrap on-paper">
      <div className="page-head" style={{ paddingBottom: 28 }}>
        <a className="crumb" href="#/claims">← The Board</a>
        <div style={{ display: "flex", gap: 14, alignItems: "center", margin: "22px 0 14px" }}>
          <StatePill state={c.state} /><span className="label muted">Claim #{c.id}</span>
        </div>
        <h1 className="display" style={{ fontSize: "clamp(42px, 7vw, 84px)" }}>{c.subject}</h1>
        <p>{c.stateText}{c.why ? `: ${c.why}.` : "."}</p>
      </div>
      <div className="detail">
        <div style={{ display: "grid", gap: 24 }}>
          <div className="panel">
            <div className="panel-head"><span className="label">Passage on the auditor's page</span></div>
            <blockquote className="passage">{c.passage}</blockquote>
            <dl className="rows">
              <div><dt>Auditor</dt><dd>{c.auditor.name} <span className="muted">· {c.auditor.host}</span></dd></div>
              <div><dt>Scope</dt><dd>{c.scope.join(" · ")}</dd></div>
              <div><dt>Project</dt><dd className="addr">{c.project}</dd></div>
              <div><dt>Stake</dt><dd>{formatGen(c.stake)} GEN</dd></div>
              <div><dt>Posted</dt><dd>{ago(c.postedAt, c.now)}</dd></div>
              <div><dt>Last confirmed</dt><dd>{c.checkedAt ? ago(c.checkedAt, c.now) : "never"}</dd></div>
              <div><dt>Misses</dt><dd>{c.misses ? `${c.misses}: the page was silent at one re-check` : "none"}</dd></div>
              {c.print && <div><dt>Fingerprint</dt><dd className="addr">{c.print}</dd></div>}
            </dl>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><span className="label">{c.read ? "A read is open" : "Actions"}</span>{c.read && <span className="spin" />}</div>
          {c.read && (
            <div className="action">
              <p>
                {c.read.kind === "posting" ? "The posting read" : "A re-check"} was asked {ago(c.read.at, c.now)}. Validators report when they agree; the deadline is {until(c.read.due, c.now)}.
              </p>
            </div>
          )}
          {c.can.retry && (
            <Action title="Retry the read" text="If the read has not reported, anyone can ask the validators to read the page again. It reads only what the Board recorded for this claim.">
              <button className="btn small" disabled={busy} onClick={() => act("Retry", (cs, o) => cs.retryClaim(c.id, o))}>Retry read</button>
            </Action>
          )}
          {c.can.expire && (
            <Action title="Close the read" text={c.read.kind === "posting" ? "The deadline passed with no agreed result. Closing it refuses the posting and returns the stake." : "The deadline passed with no agreed result. Closing it returns the re-check fee; it does not count as a miss."}>
              <button className="btn small" disabled={busy} onClick={() => act("Expire", (cs, o) => cs.expire(c.id, o))}>Close read</button>
            </Action>
          )}
          {c.can.recheck && (
            <Action title={`Re-check · ${formatGen(RECHECK_FEE)} GEN`} text={`Validators read the auditor's page again. If it still confirms the claim, your fee goes to the project. If it denies it, or is silent twice, the claim comes down and you earn ${formatGen(KEEPER_REWARD)} GEN from the stake plus your fee back.`}>
              <button className="btn small green" disabled={busy} onClick={() => act("Re-check", (cs, o) => cs.recheck(c.id, o))}>Re-check claim</button>
            </Action>
          )}
          {c.state === "live" && me && me === c.auditor.signer && (
            <Action title="Re-check" text="The auditor's own signer cannot re-check claims on its entry." />
          )}
          {c.can.withdraw && (
            <Action title="Withdraw" text={`Take your claim down. Your ${formatGen(c.stake)} GEN stake is credited back${c.read?.fee ? ", and the open re-check's fee goes back to whoever paid it" : ""}.`}>
              <button className="btn-line dark small" disabled={busy} onClick={() => act("Withdraw", (cs, o) => cs.withdraw(c.id, o))}>Withdraw claim</button>
            </Action>
          )}
          {!c.read && !c.can.recheck && !c.can.withdraw && (
            <Action title="Closed" text="This claim is closed. Any stake or fee owed is waiting in Account." />
          )}
          {step && <div className="action"><TxStatus step={step} /></div>}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- auditors

export function Auditors() {
  const { data, run } = useApp();
  const [form, setForm] = useState({ name: "", url: "", sample: "" });
  const [step, setStep] = useState(null);
  const busy = step && (step.phase === "sign" || step.phase === "wait");
  const auditors = data.auditors ? [...data.auditors].reverse() : null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run("Register", (cs, o) => cs.register(form.name.trim(), form.url.trim(), form.sample.trim(), o), setStep);
  };

  return (
    <div className="wrap on-paper" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <p className="eyebrow">/Auditors</p>
        <h1 className="display">Auditor pages</h1>
        <p>An auditor pins the one public page that lists its audits. Claims can only quote that page.</p>
      </div>
      <div className="detail">
        <div>
          <LoadState />
          {auditors ? (
            <div className="cards" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {auditors.map((a) => (
                <div key={a.id} className="card">
                  <div className="top"><StatePill state={a.state} /><span className="label muted">#{a.id}</span></div>
                  <h3 style={{ fontSize: 20 }}>{a.name}</h3>
                  <a className="quote" href={a.url} target="_blank" rel="noreferrer" style={{ textTransform: "none", overflowWrap: "anywhere" }}>{a.url}</a>
                  <div className="meta"><span>Signer {short(a.signer)}</span></div>
                </div>
              ))}
              {!auditors.length && <div className="empty">No auditors registered yet.</div>}
            </div>
          ) : <Loading error={data.error} />}
        </div>
        <form className="panel" onSubmit={submit}>
          <div className="panel-head"><span className="label">Register an auditor page</span></div>
          <div className="panel-body form">
            <div className="field">
              <label htmlFor="a-name">Auditor name</label>
              <input id="a-name" className="input" required minLength={2} maxLength={60} value={form.name} onChange={set("name")} placeholder="Northlight Security" />
            </div>
            <div className="field">
              <label htmlFor="a-url">Page that lists your audits</label>
              <input id="a-url" className="input" required type="url" maxLength={300} value={form.url} onChange={set("url")} placeholder="https://example.com/audits" />
              <span className="hint">A plain HTTPS page, at most 300 characters, with no <span className="mono">? # @ %</span> or <span className="mono">..</span> in it. Validators fetch it without running scripts, so the list must be in the page itself.</span>
            </div>
            <div className="field">
              <label htmlFor="a-sample">One row copied from that page</label>
              <textarea id="a-sample" className="textarea" required minLength={40} maxLength={600} value={form.sample} onChange={set("sample")} placeholder="Borealis Swap router and pools v1 January 2026 audit report" />
              <span className="hint">40 to 600 characters, word for word. Validators check this row is visible on the page. Registration is free apart from the transaction fee.</span>
            </div>
            <button className="btn green block" disabled={busy}>Register page</button>
            <TxStatus step={step} />
          </div>
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- post

/** The end of a page address, which tells apart entries on the same host. */
const pathTail = (url) => {
  const parts = url.replace(/^https?:\/\/[^/]+/, "").split("/").filter(Boolean);
  return parts.length ? (parts.length > 2 ? "…/" : "/") + parts.slice(-2).join("/") : "/";
};

/** Choose a registered auditor: search, then one card per entry. */
function AuditorPicker({ auditors, claims, value, onChange }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(!value);
  const live = useMemo(() => {
    const m = {};
    for (const c of claims) if (c.state === "live") m[c.auditor.id] = (m[c.auditor.id] ?? 0) + 1;
    return m;
  }, [claims]);
  const chosen = auditors.find((a) => String(a.id) === String(value));
  const needle = q.trim().toLowerCase();
  const shown = [...auditors].reverse().filter((a) => !needle || `${a.name} ${a.url} #${a.id}`.toLowerCase().includes(needle));

  const Row = ({ a, selected, onClick }) => (
    <button type="button" role="radio" aria-checked={selected} className="pick" onClick={onClick}>
      <span className="pick-main">
        <span className="pick-name">{a.name}</span>
        <span className="pick-host">{a.host}</span>
        <span className="pick-path">{pathTail(a.url)}</span>
      </span>
      <span className="pick-meta">
        <span>#{a.id}</span>
        <span>{live[a.id] ?? 0} live</span>
      </span>
    </button>
  );

  if (!auditors.length) return <div className="empty" style={{ padding: 24 }}>No registered auditors on this network yet. <a href="#/auditors">Register one.</a></div>;
  if (chosen && !open) {
    return (
      <div className="picker">
        <Row a={chosen} selected onClick={() => setOpen(true)} />
        <button type="button" className="arrow-link" style={{ fontSize: 12.5, justifySelf: "start" }} onClick={() => setOpen(true)}>Change auditor</button>
      </div>
    );
  }
  return (
    <div className="picker">
      <input className="input" type="search" placeholder={`Search ${auditors.length} auditor pages by name or address`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search auditors" />
      <div className="pick-list" role="radiogroup" aria-labelledby="p-aud">
        {shown.map((a) => (
          <Row key={a.id} a={a} selected={String(a.id) === String(value)} onClick={() => { onChange(String(a.id)); setOpen(false); setQ(""); }} />
        ))}
        {!shown.length && <div className="muted" style={{ padding: 16 }}>No auditor matches "{q}".</div>}
      </div>
      <span className="hint">Check the host: the name is typed by whoever registered the page, and only the page's address identifies the auditor.</span>
    </div>
  );
}

export function Post() {
  const { data, account, run } = useApp();
  const registered = useMemo(() => (data.auditors ?? []).filter((a) => a.state === "registered"), [data.auditors]);
  const [form, setForm] = useState({ auditor: "", subject: "", scope: [""], passage: "", stake: formatGen(MIN_STAKE) });
  const [step, setStep] = useState(null);
  const busy = step && (step.phase === "sign" || step.phase === "wait");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const own = registered.find((a) => String(a.id) === form.auditor && account && a.signer === account);

  const submit = (e) => {
    e.preventDefault();
    const [whole, frac = ""] = form.stake.split(".");
    const stake = BigInt(whole || 0) * GEN + BigInt((frac + "0".repeat(18)).slice(0, 18));
    const scope = form.scope.map((s) => s.trim()).filter(Boolean);
    run("Post", (cs, o) => cs.post(Number(form.auditor), form.subject.trim(), scope, form.passage.trim(), stake, o), setStep);
  };

  return (
    <div className="wrap on-paper" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <p className="eyebrow">/Post a claim</p>
        <h1 className="display">Stake a claim</h1>
        <p>Quote the passage on the auditor's page that names your project. Validators confirm it before the claim goes live; if they do not, your stake comes back.</p>
      </div>
      <form className="panel" onSubmit={submit} style={{ maxWidth: 760 }}>
        <div className="panel-body form">
          <div className="field">
            <label id="p-aud">Auditor</label>
            <AuditorPicker auditors={registered} claims={data.claims ?? []} value={form.auditor} onChange={(id) => setForm({ ...form, auditor: id })} />
            {own && <span className="hint" style={{ color: "var(--red)" }}>You signed this auditor's registration; an auditor cannot post claims on its own entry.</span>}
          </div>
          <div className="field">
            <label htmlFor="p-sub">Project</label>
            <input id="p-sub" className="input" required minLength={3} maxLength={80} value={form.subject} onChange={set("subject")} placeholder="Acme Lending" />
          </div>
          <div className="field">
            <label>Scope</label>
            <div className="scope-list">
              {form.scope.map((s, i) => (
                <div key={i} className="scope-item">
                  <input className="input" required={i === 0} minLength={2} maxLength={80} value={s} placeholder={i ? "March 2026" : "lending contracts v2"}
                    onChange={(e) => setForm({ ...form, scope: form.scope.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {form.scope.length > 1 && <button type="button" className="icon-btn" onClick={() => setForm({ ...form, scope: form.scope.filter((_, j) => j !== i) })}>Remove</button>}
                </div>
              ))}
            </div>
            {form.scope.length < 4 && <button type="button" className="arrow-link" style={{ justifySelf: "start", fontSize: 13 }} onClick={() => setForm({ ...form, scope: [...form.scope, ""] })}>Add scope item</button>}
            <span className="hint">One to four items, such as a component, version or date. Each must appear in the passage as whole words: <span className="mono">v2</span> does not match <span className="mono">v20</span>.</span>
          </div>
          <div className="field">
            <label htmlFor="p-pas">Passage, word for word</label>
            <textarea id="p-pas" className="textarea" required minLength={40} maxLength={600} value={form.passage} onChange={set("passage")} placeholder="Acme Lending lending contracts v2 March 2026 Northlight audit report" />
            <span className="hint">40 to 600 characters copied from the auditor's page, usually one row of its audit table. It must contain the project name and every scope item as whole words.</span>
          </div>
          <div className="field">
            <label htmlFor="p-stake">Stake (GEN)</label>
            <input id="p-stake" className="input" required inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,18})?" value={form.stake} onChange={set("stake")} />
            <span className="hint">At least {formatGen(MIN_STAKE)} GEN. Returned when you withdraw, or if the posting is refused. If a re-check takes the claim down, {formatGen(KEEPER_REWARD)} GEN goes to whoever re-checked and the rest comes back to you.</span>
          </div>
          <button className="btn green block" disabled={busy || !!own || !form.auditor}>Stake and post</button>
          <TxStatus step={step} />
          {step?.phase === "done" && <a className="arrow-link" href="#/claims">See it on the Board</a>}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- account

export function Account() {
  const { account, wallet, connectWallet, signer, run, say, data, network, net } = useApp();
  const [balance, setBalance] = useState(null);
  const [funding, setFunding] = useState(false);
  const [owed, setOwed] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [step, setStep] = useState(null);
  const busy = step && (step.phase === "sign" || step.phase === "wait");

  useEffect(() => {
    if (!account) return;
    balanceOf(network, account).then(setBalance).catch(() => setBalance(null));
  }, [account, network, data.at, funding]);

  const fund = async () => {
    setFunding(true);
    try {
      await fundFromFaucet(network, account);
      say(`Sent 5 test GEN to your address on ${net.name}.`);
    } catch (e) {
      say(`The faucet refused: ${e.message}`);
    } finally {
      setFunding(false);
    }
  };

  useEffect(() => {
    if (!signer) return;
    signer.owedTo().then(setOwed).catch(() => setOwed(null));
    signer.refusalOf().then(setRefusal).catch(() => setRefusal(null));
  }, [signer, data.at]);

  const mine = (data.claims ?? []).filter((c) => account && c.project === account);

  return (
    <div className="wrap on-paper" style={{ paddingBottom: 96 }}>
      <div className="page-head">
        <p className="eyebrow">/Account</p>
        <h1 className="display">Your account</h1>
        <p>What the Board owes you, and your claims. Credits are collected with one transaction.</p>
      </div>
      {!account ? (
        <div className="panel" style={{ maxWidth: 560 }}>
          <div className="panel-body" style={{ display: "grid", gap: 18 }}>
            <p style={{ margin: 0 }}>Connect a browser wallet to see what you are owed and to send transactions.</p>
            <button className="btn" onClick={() => connectWallet().catch((e) => say(e.message))}>Connect wallet</button>
          </div>
        </div>
      ) : (
        <div className="detail">
          <div className="panel">
            <div className="panel-head">
              <span className="label">Your claims</span>
              <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="addr muted nocase">{wallet.name} · {short(account)}</span>
                <button className="arrow-link" style={{ fontSize: 12, padding: 0 }} onClick={() => wallet.disconnect()}>Disconnect</button>
              </span>
            </div>
            {mine.length ? (
              <dl className="rows">
                {mine.map((c) => (
                  <div key={c.id}><dt><StatePill state={c.state} /></dt><dd><a href={`#/claims/${c.id}`}>{c.subject}</a> <span className="muted">· {c.auditor.name}</span></dd></div>
                ))}
              </dl>
            ) : <div className="panel-body muted">No claims posted from this address on this network.</div>}
          </div>
          <div className="panel">
            <div className="panel-head"><span className="label">Owed to you</span></div>
            <div className="panel-body" style={{ display: "grid", gap: 16 }}>
              <div className="display" style={{ fontSize: 56 }}>{owed == null ? "–" : formatGen(owed)} <span style={{ fontSize: 24 }}>GEN</span></div>
              <button className="btn green" disabled={busy || !owed} onClick={() => run("Collect", (cs, o) => cs.collect(o), setStep)}>Collect</button>
              <TxStatus step={step} />
              <hr className="hr" />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span><span className="label muted">Wallet balance</span><br />{balance == null ? "–" : `${formatGen(balance)} GEN`}</span>
                {HAS_FAUCET.has(network) && (
                  <button className="btn-line dark small" disabled={funding} onClick={fund}>{funding ? "Funding" : "Get test GEN"}</button>
                )}
              </div>
              {refusal?.reason && (
                <div className="notice">
                  <span className="label" style={{ display: "block", marginBottom: 6 }}>Last refusal</span>
                  {refusal.reason}{refusal.returned ? ` (${formatGen(refusal.returned)} GEN credited back)` : ""}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ how it works

export function How() {
  const { data } = useApp();
  const s = data.status;
  const minutes = (x) => (x ? `${Math.round(x / 60)} min` : "–");
  return (
    <>
      <div className="wrap on-paper">
        <div className="page-head">
          <p className="eyebrow">/How it works</p>
          <h1 className="display">Read at the source</h1>
          <p>CounterSign does not judge whether an audit was good. It checks one thing: that the auditor's own page still says the audit happened.</p>
        </div>
      </div>
      <section className="night">
        <div className="grid-lines" />
        <div className="wrap split">
          <div className="ruled">
            <h2>Two contracts, one job each</h2>
            <p>The Board holds stakes and records and never fetches anything. The Reader fetches pages and asks the validators, then reports to the Board once its result is final.</p>
          </div>
          <div className="ruled">
            <h2>Code first, the jury only when needed</h2>
            <p>If the passage is on the page and its surroundings have not changed, code decides. Only a changed context, or a withdrawal word near it, goes to the validators' language models, and only "confirms" keeps a claim.</p>
          </div>
        </div>
        <hr className="hr" />
        <div className="wrap split">
          <div className="ruled">
            <h2>When validators do not agree</h2>
            <p>A read with no agreed result can be retried by anyone before its deadline ({minutes(s?.read_window)} on this network). After it, anyone closes it: a posting is refused with its stake returned, and a re-check returns its fee without counting as a miss.</p>
          </div>
          <div className="ruled">
            <h2>Limits, stated plainly</h2>
            <p>If every validator fails to fetch a page the same way, they agree it is silent; a posting is then refused and must be posted again. This runs on GenLayer test networks only, and the contracts are not yet on the reset Bradbury testnet.</p>
          </div>
        </div>
      </section>
      <section className="section on-paper" style={{ textAlign: "center" }}>
        <div className="wrap">
          <h2 className="display" style={{ fontSize: "clamp(40px, 7vw, 84px)" }}>See it on the Board</h2>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, marginTop: 36 }}>
            <a className="btn" href="#/docs/getting-started">Read the docs</a>
            <a className="arrow-link" href="#/claims">Browse claims</a>
          </div>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------- docs

export function Docs({ slug }) {
  const index = Math.max(0, DOCS.findIndex((d) => d.slug === slug));
  const doc = DOCS[index];
  const rendered = useMemo(() => renderDoc(doc), [doc]);
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];
  return (
    <div className="wrap docs on-paper">
      <aside className="docs-side">
        <select className="select docs-select" aria-label="Choose a page" value={doc.slug} onChange={(e) => { window.location.hash = `#/docs/${e.target.value}`; }}>
          {DOCS.map((d) => <option key={d.slug} value={d.slug}>{d.group} · {d.title}</option>)}
        </select>
        <nav className="docs-nav" aria-label="Documentation">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="label muted">{g}</p>
              {DOCS.filter((d) => d.group === g).map((d) => (
                <a key={d.slug} href={`#/docs/${d.slug}`} aria-current={d.slug === doc.slug ? "page" : undefined}>{d.title}</a>
              ))}
            </div>
          ))}
          <div>
            <p className="label muted">Project</p>
            <a href={REPO_URL} target="_blank" rel="noreferrer">Source on GitHub</a>
          </div>
        </nav>
      </aside>
      <article>
        <div className="prose" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        <div className="doc-foot">
          {prev ? <a className="btn-line dark small" href={`#/docs/${prev.slug}`}>{prev.title}</a> : <span />}
          {next ? <a className="btn small" href={`#/docs/${next.slug}`}>{next.title}</a> : <span />}
        </div>
        <p className="muted" style={{ fontSize: 14, marginTop: 24 }}>
          This page is <span className="mono">{doc.file}</span> in the repository.{" "}
          <a href={`${REPO_URL}/blob/main/${doc.file}`} target="_blank" rel="noreferrer">View or propose a change on GitHub</a>.
        </p>
      </article>
      <aside className="docs-toc" aria-label="On this page">
        {rendered.toc.length > 0 && (
          <>
            <p className="label muted">On this page</p>
            {rendered.toc.map((t) => (
              <button key={t.id} onClick={() => document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{t.text}</button>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}
