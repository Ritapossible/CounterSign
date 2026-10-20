# CounterSign

**A public board of "audited by" claims. A claim stands only while the
auditor's own page confirms it, word for word, and nobody can profit by
editing a page they control.**

> Status: **design.** This repository holds the plan, architecture, threat
> model and claim format. No contract is built yet. Nothing here should be
> read as measured until [PLAN.md](PLAN.md) marks it done with evidence.

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
   v2` and `March 2026`), and the exact sentence on the auditor's page that
   confirms it. Validators fetch the auditor's page **at posting**. The claim
   goes on the board only if that sentence is in the page's visible text and
   contains the project's name and every scope string, exactly. No model is
   involved when the sentence is there and its surroundings are ordinary.
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
| The exact sentence confirms this project and every scope string, and its surroundings are ordinary | The claim goes up. No model | The claim stays. The re-check fee goes to the project |
| The sentence is there, but the words around it deny it or point it at something else | The claim stays off. The stake is returned | The jury is asked only that. A denial, or `cannot_tell`, takes the claim down and returns the stake |
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
  an image, a PDF, a canvas or a stylesheet cannot be read.
- **One page per auditor,** fixed at registration. An auditor that moves its
  list registers again; claims tied to the old page come down when it goes
  silent, stakes returned.
- **One sentence per claim.** The confirmation must be a single sentence that
  contains the project's name and every scope string exactly as written. A
  paraphrase does not post.
- **The board covers registered auditors only.** A project cannot post a
  claim about an auditor that has not registered.
- **Checked when someone checks.** A claim is as fresh as its last re-check;
  the board shows when that was. Keepers are paid to re-check.

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
