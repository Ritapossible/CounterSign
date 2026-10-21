# CounterSign

**A public board of "audited by" claims. A claim stands only while the
auditor's own page confirms it, word for word, and nobody can profit by
editing a page they control.**

> Status: **contracts built and tested off chain; not deployed.** The
> Phase 1 probe of real audit pages on Studio and Bradbury is in
> [deploy/probes/](deploy/probes/). The Board and Reader contracts pass 199
> tests (every contract scenario runs on the deployed bytes too) and kill 83
> mutants. Nothing here should be read as measured on chain until
> [PLAN.md](PLAN.md) marks it done with evidence.

> **Who the auditor is.** An auditor entry is identified by the **web
> address (host) of its pinned page** and the **address that signed the
> registration**. The name it types is display only: anyone can register an
> entry called "Northlight" on a page they control. Check the host. The board
> and badge always show the host next to the name, and an auditor can publish
> its entry id on its own site.

## The problem

A project's website says "Audited by Northlight Security". Northlight never
audited it, or audited version 1 two years ago, and the badge now sits on
version 3. Users and investors cannot tell. Northlight can post a callout or
hire a lawyer; neither removes the claim, and a project that is lying will
not agree to remove it.

A normal smart contract cannot help: whether Northlight confirms an audit is
written on Northlight's web page, not on a chain.

## What CounterSign does

CounterSign is a board, on GenLayer, where an audit claim can only exist
while the auditor's own page confirms it.

1. **The auditor registers its page.** Northlight signs once and pins the one
   public page that lists its audits. The project never chooses that URL.
2. **The project stakes to post a claim.** It names the auditor, its own
   name as the auditor writes it, the scope (for example `lending contracts
   v2` and `March 2026`), and the exact passage on the auditor's page that
   confirms it. Validators fetch the auditor's page **at posting**. The claim
   goes on the board only if that passage is in the page's visible text and
   contains the project's name and every scope string, exactly. No model is
   involved when the passage is there and its surroundings are ordinary.
3. **Anyone can re-check a claim at any time,** paying a small fee. If the
   auditor's page still confirms it, the claim stays and the fee goes to the
   project. If the auditor has withdrawn it, the claim comes down.
4. **The board is the record.** Wallets, launchpads and explorers can read it
   from the chain, and projects can embed a live badge that reads the chain
   and shows "Claim withdrawn" the moment it comes down.

## The money rule

The auditor controls the evidence, so **no outcome ever pays the auditor**.
Otherwise an auditor could confirm an audit, wait, delete or deny the line,
and collect the project's stake.

| What the auditor's pinned page does | At posting | At a later re-check |
| --- | --- | --- |
| The exact passage confirms this project and every scope string, and its surroundings are ordinary | The claim goes up. No model | The claim stays. The re-check fee goes to the project |
| The passage is there, but the words around it deny it or point it at something else | The claim stays off. The stake is returned | The jury is asked only that. A denial, or `cannot_tell`, takes the claim down and returns the stake |
| The page is silent, empty, or the validators disagree | The claim never goes up. The stake is returned | Two such reads, a gap apart, take the claim down and return the stake. One bad read leaves it up |

When a re-check takes a claim down, the caller is paid a fixed keeper reward
out of the stake and the rest returns to the project. The stake only ever
goes to the project or to the keeper who did the work.

With the check at posting, a false claim never reaches the board, so there is
nothing to fine. The stake pays for spam and for keepers, not penalties.

## What it is not

- **Not a judge of truth.** CounterSign shows what the named auditor's page
  confirms. If an auditor confirms an audit it never did, the board will show
  it; the auditor's word is the evidence.
- **Not an editor of anyone's website.** A logo on the project's own site can
  say anything. The board, and badges that read it, cannot.
- **Not a reputation score.** There is no token, rating or ranking.

## Limits, stated plainly

- **Audits only** in version 1. Partnerships, backers, grants and listings
  have the same shape, but many of those pages are not complete lists
  ("integrated with Uniswap" would make every unlisted integration look
  false). They are out of scope for now.
- **Server-rendered or plain-text pages only.** A page drawn by JavaScript
  reads as empty to a validator, so it fails registration. A confirmation in
  an image, a PDF, a canvas or a stylesheet cannot be read. Measured on
  Studio and Bradbury: of eight real audit lists, the four published as
  plain files on GitHub (Trail of Bits, Sigma Prime, Spearbit, Cyfrin) read
  and agree on every validator; the four auditor websites tried
  (ChainSecurity, Code4rena, Halborn, OpenZeppelin) do not show their list
  to a validator. Many auditors will need to pin a plain-file list.
- **One page per auditor,** fixed at registration. An auditor that moves its
  list registers again; claims tied to the old page come down when it goes
  silent, stakes returned.
- **One passage per claim.** The confirmation is one exact run of visible
  text on the auditor's page, usually one row of its audit table, and it
  must contain the project's name and every scope string exactly as written.
  A paraphrase does not post.
- **The board covers registered auditors only.** A project cannot post a
  claim about an auditor that has not registered.
- **Checked when someone checks.** A claim is as fresh as its last re-check;
  the board shows when that was. A keeper is paid only when its re-check
  takes a claim down. A re-check that confirms a claim pays the fee to the
  project and costs the caller, so a claim nobody doubts stays only as fresh
  as a volunteer, the auditor, or the project itself keeps it.

## Documents

- [PLAN.md](PLAN.md): phases, each with what "done" means and its evidence.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): contracts, life of a claim,
  money, reading the page, the jury's one question, size budget.
- [docs/CLAIM-FORMAT.md](docs/CLAIM-FORMAT.md): registration and claim
  fields, and every validation rule.
- [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md): every attack we know of and
  what stops it, or that nothing does.

Built on [GenLayer](https://genlayer.com) Intelligent Contracts, reusing the
page-reading rules measured in
[RedLine](https://github.com/Ritapossible/RedLine) and the URL rules from
[Remit](https://github.com/Ritapossible/Remit).

## License

[MIT](LICENSE) © 2026 Rita Egwuatu.
