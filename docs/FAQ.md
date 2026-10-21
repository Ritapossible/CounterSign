# FAQ

## Does CounterSign say an audit was good?

No. It checks one thing: that the auditor's own page says, word for word,
that it audited this project for this scope. Whether the audit was thorough
is not something a page can confirm, and CounterSign does not try.

## Why is the auditor's page the source, and not the project's?

Because the project is the party making the claim. The auditor pins its page
once, at registration, and every claim against that auditor can only quote
that page. A project cannot point the validators at a page of its own
choosing, and neither can anyone retrying a read: the Reader takes only a
claim id and reads the page from the Board's records
([threat model T20](THREAT-MODEL.md)).

## Can someone pretend to be a well-known auditor?

Anyone can register an entry *named* "Northlight" on a page they control.
What identifies an auditor is the **host** of its pinned page and the
**address** that signed the registration, and the app shows the host next
to every name. A claim against `northlight-security.example` means nothing
about Northlight unless that is Northlight's site. An auditor can publish its
entry id on its own website so projects and readers can check it.

## Can an auditor take a project's stake by editing its page?

No. No outcome ever pays an auditor, and the auditor's signer cannot post or
re-check claims on its own entry ([threat model T4, T19](THREAT-MODEL.md)).
If an auditor edits its page so a claim no longer stands, the claim comes
down and the stake goes back to the project, minus the keeper reward paid to
whoever re-checked.

## What does the AI decide?

Very little. If the passage is on the page and the words around it are the
same as at the last confirmation, code decides: confirmed. If the passage is
missing, code decides: silent. Only when the passage is there but its
surroundings changed, or a withdrawal phrase (`withdrawn`, `revoked`,
`retracted`, `rescinded`, `superseded`, `no longer valid`) sits near it at
posting, are the validators' language models asked one question, and only
the answer `confirms` keeps or posts a claim.

## What if the auditor's site is down for an hour?

One silent re-check records a **miss** and changes nothing else. A claim
comes down for silence only after a second silent re-check at least
`miss_gap` later (one hour on Bradbury). A read that times out without the
validators agreeing does not count as a miss at all
([threat model T9, T23](THREAT-MODEL.md)).

## What if every validator fails to fetch the page when I post?

Then they agree the page is silent, the posting is refused, and your stake is
credited back. You lose the transaction fee and post again. This is an
accepted limit ([threat model T22](THREAT-MODEL.md)): keeping a refused
posting open for a retry would lock your stake for a case that costs only a
fee.

## Why does a re-check cost a fee?

So that nobody can make the validators read pages for free, again and again.
If the claim is fine, the fee goes to the project that was checked. If the
re-check finds the claim no longer stands, the keeper gets the fee back plus
a 0.02 GEN reward from the stake.

## Why does nothing arrive in my wallet automatically?

Every outcome *credits* what each address is owed, and only `collect` sends
GEN, from the Account page. A payment that fails cannot block anyone else's
outcome that way.

## Why did my posting say "refused" straight away?

A field broke a rule before any page was read: for example, the passage does
not contain a scope item as whole words, or the stake is below 0.1 GEN. The
value you sent is credited back, and the message names the rule. The rules
are in [Claim format](CLAIM-FORMAT.md).

## Which networks does it run on?

GenLayer Studio and Studio Next today. CounterSign was run on the earlier
Bradbury testnet; Bradbury was reset for its Phase 2 and CounterSign will be
deployed there once it reopens. All networks use test GEN with no value.

## Is it audited?

No. The contracts have 199 direct tests, a mutation harness in which every
rule must have a test that fails without it, and recorded runs of the full
scenario table on chain ([plan and records](../PLAN.md)). That is not an
audit.
