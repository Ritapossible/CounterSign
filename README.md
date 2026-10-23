# CounterSign

**A public board of "audited by" claims. A claim stands only while the
auditor's own page confirms it, word for word, and nobody can profit by
editing a page they control.**

Built on [GenLayer](https://genlayer.com) Intelligent Contracts.
**Live app: [counter-sign-v0.vercel.app](https://counter-sign-v0.vercel.app)**
· [Docs](https://counter-sign-v0.vercel.app/#/docs/getting-started)

> **Status.** Live on GenLayer **Studio** and **Studio Next** (test
> networks), on build `a43fad4`. The full scenario table ran on Studio on
> that build with **93 checks, 0 failed** (one more check is kept as
> superseded, with its chain evidence), and on the previous build on Studio
> and Studio Next with **94 checks, 0 failed** each. The code on chain was
> verified against each build. After a review, build `a8f9209` makes every
> posting's passage affirm the audit, not only name it; it is live on Studio
> with **106 checks, 0 failed**, and waits on Studio Next while GenLayer
> fixes a server error there. The contracts pass **237 tests**, and the
> mutation harness kills **87 of 87** mutants. **Bradbury** (GenLayer's public testnet) was reset for its Phase 2
> and is next. Everything measured, and everything not yet measured, is in
> [PLAN.md](PLAN.md) with its evidence. Test GEN only; nothing here holds
> value.

> **Who the auditor is.** An auditor entry is identified by the **web
> address (host) of its pinned page** and the **address that signed the
> registration**. The name it types is display only: anyone can register an
> entry called "Northlight" on a page they control. Check the host. The app
> shows the host next to every name, and an auditor can publish its entry id
> on its own site.

---

## Contents

- [The problem](#the-problem)
- [How it works](#how-it-works)
- [What happens at each read](#what-happens-at-each-read)
- [The money rule](#the-money-rule)
- [What has been shown on chain](#what-has-been-shown-on-chain)
- [Design decisions](#design-decisions)
- [Deployed contracts](#deployed-contracts)
- [The web app](#the-web-app)
- [Use it from code](#use-it-from-code)
- [Run it yourself](#run-it-yourself)
- [Repository layout](#repository-layout)
- [Limits, stated plainly](#limits-stated-plainly)
- [What it is not](#what-it-is-not)
- [Where it is going](#where-it-is-going)
- [Documents](#documents)

## The problem

A project's website says "Audited by Northlight Security". Northlight never
audited it, or audited version 1 two years ago, and the badge now sits on
version 3. Users and investors cannot tell. Northlight can post a callout or
hire a lawyer; neither removes the claim, and a project that is lying will
not agree to remove it.

A normal smart contract cannot help: whether Northlight confirms an audit is
written on Northlight's web page, not on a chain. GenLayer validators can
fetch a web page and agree on what it says, so the confirmation can be read
where it actually lives.

## How it works

1. **The auditor registers its page.** Northlight signs once and pins the one
   public page that lists its audits, with one row copied from it.
   Validators fetch the page without running scripts and check that row is
   visible. The project never chooses that URL.
2. **The project stakes to post a claim.** It names the auditor, its own
   name as the auditor writes it, one to four scope items (for example
   `lending contracts v2` and `March 2026`), and the exact passage on the
   auditor's page that confirms it, with at least 0.1 GEN. Validators fetch
   the auditor's page **at posting**. The claim goes on the board only if the
   passage is in the page's visible text and contains the project's name and
   every scope item, as whole words.
3. **Anyone can re-check a claim at any time,** for 0.01 GEN. Validators read
   the page again. If it still confirms the claim, the claim stays and the
   fee goes to the project. If the auditor has withdrawn or contradicted it,
   or the passage has gone, the claim comes down.
4. **The board is the record.** Wallets, launchpads and explorers can read
   any claim from the chain, with when the auditor's page last confirmed it.

Two contracts do this, each with one job:

```
                  asks for a read (message, on acceptance)
   +-----------+ ----------------------------------------> +------------+
   |   Board   |                                           |   Reader   | --> auditor's page
   |  stakes,  | <---------------------------------------- |  fetches,  |     (plain HTTPS fetch,
   |  records, |   reports the outcome (message, on        |  asks the  |      by every validator)
   |  payouts  |   finality, so an appeal lands once)      |  jury only |
   +-----------+                                           |  if needed |
         ^                                                 +------------+
         |  register, post, recheck, withdraw,                    ^
         |  expire, collect                                       |  retry_claim,
       people                                         anyone -----+  retry_registration
```

The **Board** holds the money and the records and never fetches anything;
it never even reads the Reader. The **Reader** fetches pages and decides an
outcome; it holds no GEN and decides nobody's pay. Every payout is the
Board's own arithmetic on its own records, so a Reader that never reports
locks nothing: an open read has a deadline, and a project can always
withdraw. More in [How it works](docs/ARCHITECTURE.md).

## What happens at each read

Every validator fetches the auditor's page itself and keeps only its visible
text: scripts, styles, comments, and elements the page hides are dropped.
Validators must agree on the outcome **and** on a fingerprint of the 60 words
either side of the passage. The fingerprint leaves out digits, punctuation,
and month and day names, so a date or a counter near the passage does not
count as a change.

| On the page | Who decides | Outcome |
| --- | --- | --- |
| At posting, the passage itself says the subject was not audited ("was not audited", "never audited", "unaudited", "did not audit", "not an audit", "audit was declined", ...) | Code, before any read | **refused**, stake credited back |
| At posting, the passage is on the page | The validators' language models, asked one question: does the passage affirm that this auditor audited the subject for every scope item? | only `confirms` posts the claim; anything else is **denied** |
| At a re-check, the passage word for word, with the surroundings the jury affirmed | Code | **confirmed** |
| The passage is missing, the page is unreadable, or it could not be fetched | Code | **silent** |
| At a re-check, the passage is there but its surroundings changed | The jury, the same question | only `confirms` keeps the claim; anything else is **denied** |

The page comes from the auditor's server and the claim from the project, so
either might try to talk to the jury. Neither can open or close a block of
the prompt, and the answer is read strictly: exactly one of four labels, or
`cannot_tell`, which does not keep a claim.

## The money rule

The auditor controls the evidence, so **no outcome ever pays the auditor**,
and the auditor's own signer cannot post or re-check claims on its entry.
Otherwise an auditor could confirm an audit, wait, delete the line, and
collect the project's stake.

| What the validators find | At posting | At a re-check |
| --- | --- | --- |
| **confirmed** | The claim goes live. | The claim stays. The 0.01 GEN fee goes to the project. |
| **denied** (withdrawn, contradicted, about something else) | Refused. The stake is credited back. | The claim comes **down**. The caller gets the fee back plus a 0.02 GEN keeper reward from the stake; the rest of the stake goes back to the project. |
| **silent** (passage gone, page empty or unreachable) | Refused. The stake is credited back. | First time: a **miss** is recorded and the fee goes back. A second silent re-check at least `miss_gap` later takes the claim down, as above. |
| **no agreed result** (validators disagree) | The read stays open: anyone may retry it before its deadline. After it, anyone closes it, and the posting is refused with the stake credited back. | The same retry. A re-check that expires returns its fee and is **not** a miss, so failed reads can never take a claim down. |

The project can **withdraw** its claim at any time, from pending or live, and
its stake is credited back. Outcomes only *credit* what each address is owed;
`collect` sends it, so a failed payment can never block anyone else's
outcome.

With the check at posting, a false claim never reaches the board, so there is
nothing to fine. The stake pays for spam and for keepers, not penalties.

## What has been shown on chain

| Run | Network | Result | Record |
| --- | --- | --- | --- |
| Phase 1 probe: can validators read real audit lists and agree? | Studio, Bradbury | 16 of 16 reads agreed on Studio; on Bradbury 15 of 16 matched Studio's outcome and text digest (one rendered read timed out) | `deploy/probes/` |
| Full scenario table, three runs, build `991d8c1` | Studio | **94 checks, 0 failed**; 75 Reader reads, all agreed; no retry or expiry needed; code verified | `deploy/scenario-studio-v4.json` |
| The same table, fees on | Studio Next | **94 checks, 0 failed**; 75 reads, all agreed; code verified | `deploy/scenario-studionext.json` |
| Retry check | Studio, Studio Next | A registration whose Board read was made to fail was recovered by a third party's `retry_registration`; on Studio a `retry_claim` read the page itself and agreed with the Board's read | `deploy/retry-*.json` |
| The table on the current build `a43fad4` (with the expiry rule) | Studio | **93 checks, 0 failed**; 74 Reader reads, all agreed; one check superseded with its chain evidence (a run killed mid-batch measured its starting balances late); no read expired, so the expiry rule itself is covered by the direct tests and mutants; code verified | `deploy/scenario-studio.json` |
| The table on build `a8f9209` (a passage must affirm the audit), with the reviewer's cases | Studio | **106 checks, 0 failed**; 81 Reader reads, all agreed; 12 requests refused by the Board before any read, as expected; every posting read by the jury; code verified | `deploy/scenario-studio-a8f9209.json` |
| The same, fees on | Studio Next | waiting: Studio Next answers every contract call with a server database error (23 October) | |
| The table on Bradbury | Bradbury | after the Phase 2 reset | |

Each scenario run deploys a fresh pair of contracts, publishes a fictional
auditor's pages on the repository's `live` branch, and runs every case three
times, editing the pages mid-run:

| Case | Expected, and shown |
| --- | --- |
| Register a server-rendered page | registered |
| Register a page drawn by JavaScript | refused |
| Register a readable page whose sample row is not on it | refused |
| Re-check a pending claim | refused, fee not taken |
| Post with the exact passage, subject and every scope item | jury affirms; live (build `a43fad4`: live, no model) |
| Post a passage that says Acme was not audited, and the same with "wasn't" | refused at once, stake credited back, no read (build `a8f9209`) |
| Post a row naming Acme and its scope that says the engagement was cancelled | jury asked; denied; refused, stake returned (build `a8f9209`) |
| Post with a scope item missing from the passage | refused at once, stake credited back |
| Post a passage not on the page, or only in hidden markup | refused, stake returned |
| Post a passage with "withdrawn" next to it | jury asked; denied; refused, stake returned |
| Re-check an unchanged page | live; fee to the project |
| The auditor adds "this audit has been withdrawn" beside the passage | jury asked; down; keeper reward to the caller, rest to the project |
| The auditor deletes the passage | the first re-check leaves it live; a second one `miss_gap` later takes it down |
| The page is unreachable once | stays live |
| The page talks to the jury | does not keep a withdrawn claim |
| The project withdraws a live claim, and one still pending | stake returned; a late report is ignored |
| Every path | the auditor received nothing; the Board's books balance |

**After the review.** Build `a43fad4` confirmed a posting by code when the
passage named the subject and scope, even if it said they were not audited.
Build `a8f9209` refuses such a passage before any read and has the jury
affirm every other posting ([Design decisions](#design-decisions)). Its
Studio run shows every case above, the three new ones included.

**Not shown yet.** A read the Board triggers that fails on its own and is
then recovered by a retry. On the earlier Bradbury network, one leader's
failed fetch ended a read (claim 5), which is why retries exist, but the test
networks give no way to cause that on demand. It is part of the Bradbury run.

## Design decisions

- **The auditor's page is the only evidence.** The project names the auditor
  and quotes it; it never supplies a URL. Retries take only an id and read
  the page from the Board's own records, so nobody can have the Reader read a
  page of their choosing ([T20](docs/THREAT-MODEL.md)).
- **A sample row at registration.** Measured: some auditors' websites are
  readable, with thousands of characters, yet show none of their audits to a
  validator. A length minimum would register them and every claim would then
  fail. The sample proves the list itself is visible ([T17](docs/THREAT-MODEL.md)).
- **Naming is not affirming.** Whole words prove a passage names the
  subject and scope, not that it says they were audited: "Project X was not
  audited for Scope Y" contains both. So code never confirms a posting. A
  passage that negates itself is refused before any read, and the jury must
  find that every other one affirms the audit. After that, code decides
  every re-check of an unchanged page: those are the words the jury
  affirmed. The cost is a model call per posting, and a cautious jury may
  refuse an honest claim (its stake comes back); it can no longer post a
  denial.
- **Whole-word matching, no fuzziness.** `v2` does not match `v20`, `acme`
  does not match `acmeswap`, and a negation never fires on part of a word
  ("notaudited", "re-audited").
- **Two contracts.** The Board never reads the Reader, so an appealed or
  stuck read cannot freeze money. The Reader reports on finality, so an
  appeal reaches the Board once, with its final outcome.
- **Anyone can retry a read.** A transaction a contract triggers by message
  starts with no leader rotations, so one leader's failed fetch can end it
  (measured on Bradbury). A retry is an ordinary transaction, which the
  network rotates ([T21](docs/THREAT-MODEL.md)).
- **An expiry is not evidence.** A read with no agreed result returns its fee
  and does not count as a miss, so repeated failed reads can never take a
  claim down or pay a keeper from the stake ([T23](docs/THREAT-MODEL.md)).
- **An agreed "silent" at posting is final.** If every validator fails to
  fetch the page the same way, that is a result: the posting is refused and
  the stake credited back. Keeping it retryable would lock the stake for a
  case that costs one transaction fee ([T22](docs/THREAT-MODEL.md)).
- **Payable calls never revert after value arrives.** A refused posting or
  re-check is recorded with its reason and the value credited back.

Every attack considered, and what stops it, is in the
[threat model](docs/THREAT-MODEL.md) (T1 to T23).

## Deployed contracts

### Build `a8f9209`: a passage must affirm the audit (the app uses these)

| Network | Board | Reader | Build |
| --- | --- | --- | --- |
| Studio | [`0x2905e0C304f2F801d98cd1D57c31b50403c8F50a`](https://explorer-studio.genlayer.com/address/0x2905e0C304f2F801d98cd1D57c31b50403c8F50a) | [`0xd48F81D47b588058CBCe3767f6ec1270eF5D1850`](https://explorer-studio.genlayer.com/address/0xd48F81D47b588058CBCe3767f6ec1270eF5D1850) | `a8f9209` |
| Studio Next | waiting on a Studio Next server error | | |
| Bradbury | after the Phase 2 reset | | |

### Build `a43fad4`: as first submitted

| Network | Board | Reader | Build |
| --- | --- | --- | --- |
| Studio | [`0xd807307B04812C0035f808e4015850F3e0e6B264`](https://explorer-studio.genlayer.com/address/0xd807307B04812C0035f808e4015850F3e0e6B264) | [`0x5F69d0151d96a770DaA666c83eE8A7681D55aC3A`](https://explorer-studio.genlayer.com/address/0x5F69d0151d96a770DaA666c83eE8A7681D55aC3A) | `a43fad4` |
| Studio Next | [`0x7B2793018645200690A7a3066C245DD8f3F65dd0`](https://explorer-studio-next.genlayer.com/address/0x7B2793018645200690A7a3066C245DD8f3F65dd0) | [`0xE30aB8EABaD0445E1D13bFC412Da4a816C604084`](https://explorer-studio-next.genlayer.com/address/0xE30aB8EABaD0445E1D13bFC412Da4a816C604084) | `a43fad4` |
| Bradbury | after the Phase 2 reset | | |

On Studio the app uses the `a8f9209` Board, the one its scenario table ran
on, so it shows that demonstration run. On Studio Next it uses the
`a43fad4` pair until `a8f9209` is deployed there. Four public audit lists
are registered on every Board as labelled demo entries
(`deploy/demo-auditors.json`). The `991d8c1` pairs the
earlier tables ran on stay on chain, recorded in their files.

| Constant | Studio | Bradbury |
| --- | --- | --- |
| Minimum stake | 0.1 GEN | 0.1 GEN |
| Re-check fee | 0.01 GEN | 0.01 GEN |
| Keeper reward | 0.02 GEN | 0.02 GEN |
| `miss_gap` | 300 s | 3,600 s |
| `read_window` | 600 s | 7,200 s |

## The web app

[counter-sign-v0.vercel.app](https://counter-sign-v0.vercel.app)

- **Board:** every claim, newest first, filtered by state, with its auditor's
  name and host, stake and last confirmation.
- **Claim page:** the passage, its last read, and every action the viewer may
  take: re-check, withdraw, retry an open read, or close an expired one.
- **Auditors:** every entry with its page, and registration.
- **Post a claim:** the form, with the contract's field rules.
- **Account:** what the Board owes the wallet, `collect`, the wallet's
  balance, and test GEN from the faucet on Studio and Studio Next.
- **Docs:** this repository's documentation, rendered in the app.

Wallets connect through Reown AppKit (extension wallets, and mobile wallets
over WalletConnect) when `VITE_REOWN_PROJECT_ID` is set, or the browser's own
wallet otherwise. The app reads the Board robustly on busy networks and keeps
closed claims in the browser, so a return visit reads only what is still open.

```bash
cd client && npm install
cd ../app && npm install
npm run dev          # http://localhost:5173
```

On Vercel, set the root directory to `app/` and add `VITE_REOWN_PROJECT_ID`.
See [Deployment](docs/DEPLOYMENT.md).

## Use it from code

From a web app, with the same layer the app uses:

```js
import { connect } from "./client/countersign.mjs";

const cs = connect("studio");
const claim = await cs.claim(22);
claim.state;            // "live"
claim.auditor.host;     // the host of the auditor's page: check it
claim.checkedAt;        // when the auditor's page last confirmed it
```

From a GenLayer contract:

```python
claim = json.loads(gl.get_contract_at(Address(BOARD)).view().get_claim(claim_id))
ok = claim["state"] == "live" and claim["auditor_host"] == "northlight.example"
```

Every view, write and field is in [Integration](docs/INTEGRATION.md).

## Run it yourself

```bash
pip install -r requirements-dev.txt
python3 deploy/build_contract.py        # build both contracts
python3 -m pytest tests/direct -q       # 237 tests
python3 tests/mutation_check.py         # 87 mutants, each must be killed

cd deploy && npm install
COUNTERSIGN_KEYS=<dir> node deploy.mjs studio     # deploy and bind a pair
```

The scenario table, measurement scripts and code verification are described
in [Deployment](docs/DEPLOYMENT.md).

## Repository layout

| Path | What it is |
| --- | --- |
| `contracts/` | Pure logic (`countersign_core.py`, `countersign_text.py`, `countersign_prompts.py`) and the Board and Reader shells. `build/` is generated. |
| `tests/` | Direct tests of the logic and of both contracts on a GenVM stub, run on the deployed bytes too, and the mutation harness. |
| `deploy/` | Build, deploy, scenario, measurement and verification scripts, and every on-chain record. |
| `client/` | The JavaScript layer for reading and writing the contracts. |
| `app/` | The web app (Vite and React). |
| `docs/` | Getting started, how it works, integration, deployment, FAQ, claim format, threat model. |
| `PLAN.md` | Every phase, what "done" means, and its evidence. |

## Limits, stated plainly

- **Audits only** in version 1. Partnerships, backers, grants and listings
  have the same shape, but many of those pages are not complete lists
  ("integrated with Uniswap" would make every unlisted integration look
  false).
- **Server-rendered or plain-text pages only.** A page drawn by JavaScript
  reads as empty to a validator, so it fails registration. A confirmation in
  an image, a PDF, a canvas or a stylesheet cannot be read. Measured: of
  eight real audit lists, the four published as plain files on GitHub (Trail
  of Bits, Sigma Prime, Spearbit, Cyfrin) read and agree on every validator;
  the four auditor websites tried (ChainSecurity, Code4rena, Halborn,
  OpenZeppelin) do not show their list to a validator. Many auditors will
  need to pin a plain-file list.
- **One page per auditor,** fixed at registration. An auditor that moves its
  list registers again; claims tied to the old page come down when it goes
  silent, stakes returned.
- **One passage per claim.** The confirmation is one exact run of visible
  text, usually one row of the auditor's audit table. A paraphrase does not
  post.
- **Registered auditors only.** A project cannot post a claim about an
  auditor that has not registered.
- **Checked when someone checks.** A claim is as fresh as its last re-check,
  and the board shows when that was. A keeper is paid only when its re-check
  takes a claim down, so a claim nobody doubts stays only as fresh as a
  volunteer, the auditor, or the project itself keeps it.
- **An agreed "silent" at posting is final** (above, and [T22](docs/THREAT-MODEL.md)).
- **Test networks only,** with test GEN. The contracts have not been audited.

## What it is not

- **Not a judge of truth.** CounterSign shows what the named auditor's page
  confirms. If an auditor confirms an audit it never did, the board shows it;
  the auditor's word is the evidence.
- **Not a judge of quality.** Whether an audit was thorough is not something
  a page can confirm.
- **Not an editor of anyone's website.** A logo on the project's own site can
  say anything. The board cannot.
- **Not a reputation score.** There is no token, rating or ranking.

## Where it is going

- **Bradbury.** Measure how long a Reader report takes to reach the Board,
  set `read_window` above it, run the full table, and record per-validator
  votes and a recovered retry. Phase 5 is done only then.
- **The badge.** An embeddable image, served by a small function that reads
  a claim from the chain and draws "Audited by Northlight
  (northlight.example): v2, March 2026, confirmed 2 days ago", or "Claim
  withdrawn" once it comes down. It holds no record of its own.
- **A preview before signing.** Fetch the auditor's page the way a validator
  does and show what the contract would decide before the project stakes.
- **More kinds of claim,** where the source page is a complete list.

## Documents

| Document | What it covers |
| --- | --- |
| [Getting started](docs/GETTING-STARTED.md) | Using the app as an auditor, a project, or anyone checking a claim. |
| [How it works](docs/ARCHITECTURE.md) | The two contracts, the life of a claim, reading the page, the jury's one question, money, size budget. |
| [Integration](docs/INTEGRATION.md) | Reading claims from an app or a contract; the full contract reference. |
| [Deployment](docs/DEPLOYMENT.md) | Build, test, deploy, run the scenario table, publish the app. |
| [FAQ](docs/FAQ.md) | Short answers. |
| [Claim format](docs/CLAIM-FORMAT.md) | Every field, rule and constant. |
| [Threat model](docs/THREAT-MODEL.md) | Every attack we know of, and what stops it, or that nothing does. |
| [PLAN.md](PLAN.md) | Phases, what "done" means, and the evidence for each. |

## Built with

[GenLayer](https://genlayer.com) Intelligent Contracts, genlayer-js, Vite,
React and Reown AppKit. It reuses the page-reading rules measured in
[RedLine](https://github.com/Ritapossible/RedLine) and the URL rules from
[Remit](https://github.com/Ritapossible/Remit).

## License

[MIT](LICENSE) © 2026 Rita Egwuatu.
