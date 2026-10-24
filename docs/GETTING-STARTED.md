# Getting started

CounterSign is a public board of audit claims. A project stakes GEN on a
claim that an auditor audited it; GenLayer validators read the auditor's own
page to confirm it; anyone can have them read it again; and if the page stops
confirming it, the claim comes down.

This guide walks through the app for each of the three people who use it:
the **auditor**, the **project**, and **anyone** who checks a claim. It runs
on GenLayer test networks only, with test GEN that has no value.

## 1. Connect a wallet

Open the app and press **Connect**. Any browser wallet works (MetaMask,
Rabby, and so on); when the site is configured with a Reown project ID, the
picker also offers mobile wallets over WalletConnect.

Choose the network in the header:

| Network | What it is |
| --- | --- |
| **Studio** | GenLayer's hosted test network. No fees beyond the value you send. |
| **Studio Next** | The next version of Studio, with transaction fees on. |
| **Bradbury** | GenLayer's public testnet. Listed, but CounterSign is not deployed on its reset network yet. |

Before every transaction the app asks your wallet to switch to the network
it shows, and to add the network first if your wallet does not know it.

**Test GEN.** On Studio and Studio Next, the **Account** page has a **Get
test GEN** button that funds your address from the network's faucet.

## 2. As an auditor: register your page

An auditor pins the **one public page that lists its audits**. Claims can
only quote that page, and the project never chooses it.

1. Go to **Auditors** and fill in the form on the right:
   - **Auditor name**, as you want it shown (2 to 60 characters). It is
     display only: what identifies you is the page's web address and the
     address that signs the registration.
   - **Page that lists your audits**: a plain `https://` address, at most
     300 characters, with no `?`, `#`, `@`, `%` or `..` in it.
   - **One row copied from that page**, word for word, 40 to 600
     characters, usually one row of your audit table.
2. Press **Register page** and sign. Registration costs nothing but the
   transaction fee.
3. Validators fetch the page without running scripts and check that your
   row is visible in it. In a minute or so the entry turns **registered**,
   or **refused** if the row was not visible to them.

Why a sample row: some audit firms' pages are readable but build their list
with scripts, so a validator sees none of the audits. The sample proves the
list itself is visible. See [Claim format](CLAIM-FORMAT.md).

Your signer can never post or re-check claims on your own entry, and no
outcome ever pays an auditor, so nobody gains by editing a page they
control.

## 3. As a project: post a claim

1. Go to **Post a claim**.
2. Choose the **auditor** (only registered entries are listed; check the
   host shown next to the name).
3. Enter your **project** name exactly as the auditor writes it.
4. Add one to four **scope** items, such as `lending contracts v2` and
   `March 2026`.
5. Paste the **passage**: 40 to 600 characters copied from the auditor's
   page, usually your row of its audit table. It must contain the project
   name and every scope item as whole words (`v2` does not match `v20`),
   and it must say they were audited: a passage that says the project was
   not audited is refused at once.
6. Set the **stake**, at least 0.1 GEN, and press **Stake and post**.

The claim is **pending** while validators read the page, usually under a
minute on Studio. Their language models check that the passage affirms
an audit of your project for every scope item. If they confirm it, the
claim goes **live**. If
they do not, it is **refused** and your stake is credited back. If the app
shows a refusal right away (a field broke a rule), nothing was read and the
value you sent is credited back too; the message says which rule.

You can **withdraw** your claim at any time from its page; the stake is
credited back.

**Try it with a real audit list.** Four audit firms publish their lists as
plain files on GitHub, which validators can read. They are registered on
Studio and Studio Next as clearly labelled demo entries: the firms did not
register them. Pick one, use the project and scope below, and paste the
firm's row for that audit, copied from the raw file at the entry's address (not from GitHub's rendered view, which hides the link addresses in the row), as the passage.

| Auditor entry | Project | Scope |
| --- | --- | --- |
| Trail of Bits list (demo, not by Trail of Bits) | Uniswap v4 Core | `Jul 2024` |
| Sigma Prime list (demo, not by Sigma Prime) | Lido | `January 2026`; `Onchain BLS Library` |
| Spearbit list (demo, not by Spearbit) | Morpho | `September 2026`; `Lending` |
| Cyfrin list (demo, not by Cyfrin) | GreekFi Oracle | `2026-09-02` |

The passage for each is in
[deploy/demo-auditors.json](../deploy/demo-auditors.json).

## 4. As anyone: check a claim

Every claim's page shows the passage, the auditor's host, the scope, the
stake, when it was last confirmed and any miss.

**Re-check** (0.01 GEN) asks validators to read the auditor's page again:

| What they find | What happens |
| --- | --- |
| The passage, confirmed | The claim stays live; your fee goes to the project. |
| A withdrawal next to it, or a denial | The claim comes **down**; you earn 0.02 GEN from the stake plus your fee back; the rest of the stake goes back to the project. |
| Nothing (page gone, passage gone) | First time: a **miss** is recorded and your fee comes back. A second silent re-check at least `miss_gap` later takes the claim down, as above. |

Only one read of a claim is open at a time. If a read does not report (the
validators could not agree), anyone may press **Retry read** before its
deadline, or **Close read** after it. Closing an expired posting read
refuses the posting and returns the stake; closing an expired re-check
returns its fee and does **not** count as a miss.

## 5. Collect

Outcomes credit what each address is owed; nothing is sent automatically.
Open **Account** to see what you are owed and press **Collect**. On Studio
Next the transaction fee for `collect` comes out of your wallet as usual.

## Next

- [How it works](ARCHITECTURE.md): the two contracts and the life of a claim.
- [Claim format](CLAIM-FORMAT.md): every field rule and constant.
- [Threat model](THREAT-MODEL.md): what can go wrong, and what stops it.
- [FAQ](FAQ.md).
