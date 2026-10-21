# Architecture

Status: design. Every number here is a target until PLAN.md records it as
measured.

## 1. Two contracts

| Contract | Holds | Does | Never does |
| --- | --- | --- | --- |
| **Board** | Auditor entries, claims, stakes, the clock | Takes stakes, records states, pays refunds and keeper rewards, answers every view the app and badge read | Fetch a page or call a model |
| **Reader** | Nothing of value | Fetches an auditor's page, decides the outcome of a read, asks the jury its one question, reports to the Board | Hold money or decide who is paid |

The split follows RedLine, measured on chain: a contract that fetches a page
and runs a jury already sits within about 75 bytes of Bradbury's deploy cap,
and an appeal can leave a contract unreadable. So:

- the Reader reports to the Board by **messages** that only the Reader's
  address may send (`note_registration`, `note_claim`), emitted **on
  finality**, so an appealed read reaches the Board once, with its final
  outcome;
- the Board asks the Reader to read by message (`read_registration`,
  `read_claim`) carrying everything the read needs: page URL, passage,
  subject, scope and stored fingerprint. The Reader is bound once to its
  Board and refuses those messages from anyone else;
- anyone may **retry** a read that has not reported (`retry_claim`,
  `retry_registration`). A retry takes only an id; the Reader reads the
  auditor's URL, the claim's fields, the open read's number and kind and the
  stored fingerprint from the Board's own views, so nobody can have it read a
  page of their choosing. The Reader reads the Board; the Board never reads
  the Reader. Measured on Bradbury: a transaction a contract triggers by
  message starts with no leader rotations, so one leader whose fetch fails
  ends the read (claim 5: the leader returned `silent` on a clean page, all
  five validators voted DETERMINISTIC_VIOLATION). A retry is an ordinary
  transaction and gets the network's rotations;
- every payout is the Board's own arithmetic on its own records. The Board
  never reads the Reader's state.

If the Reader becomes unreadable or never reports, claims stay as last
recorded and projects can still withdraw their own claims and stakes,
including a claim stuck in `pending`: no stake is ever locked waiting on the
Reader.

Pure logic lives outside the contract classes, as in RedLine and Remit:

- `countersign_text.py`: visible text, normalisation, passage search,
  surroundings fingerprint (from RedLine's `redline_text.py`, with its tests);
- `countersign_core.py`: URL rules, field validation, the outcome tables in
  section 3, and money splits, all deterministic and tested directly;
- `countersign_prompts.py`: the jury prompt and strict parsing of its answer;
- `board_shell.py`, `reader_shell.py`: the two contract classes.

`contracts/build/` holds the generated, minified contracts that are deployed;
tests run both the readable and the deployed builds.

## 2. Life of a claim

```
auditor ── register(name, page_url, sample) ──► Board ──► Reader: read_registration
                                          ◄── note_registration(ok | refused)

project ── post(auditor_id, subject, scope, passage) + stake ──► Board  (pending)
                                          ──► Reader: read_posting
                                          ◄── note_posting(confirmed | denied | silent)
                    confirmed: live, fingerprint stored
                    denied / silent: refused, stake returned

anyone  ── recheck(claim_id) + RECHECK_FEE ──► Board ──► Reader: read_recheck
          (live claims only; a pending claim cannot be re-checked)
                                          ◄── note_recheck(confirmed | denied | silent)
                    confirmed: stays live, fee to project, misses reset
                    denied:    down, keeper reward to caller, rest of stake to project, fee back to caller
                    silent:    first miss: stays live, fee back to caller
                               second miss >= MISS_GAP after the first: down, as for denied

project ── withdraw(claim_id) ──► Board: withdrawn, stake returned
          (allowed from pending or live; a Reader report that arrives
           for a withdrawn claim is ignored)
```

Each read is numbered per claim and has a deadline (`read_window`, set per
deployment). A report applies only to the read that is open, with its
number; a late, replayed or out-of-order report is ignored. A read with no
report by its deadline is closed by anyone calling `expire`. That is no
result, not evidence the page is gone: an expired posting is refused and
its stake returned; an expired re-check returns its fee and leaves the
claim's misses unchanged (THREAT-MODEL T23). Only a `silent` the Reader
reports counts as a miss. Before the deadline, a read that failed is
retried (above); expiry is the last resort.

Unlike RedLine, a report is never replaced: the Reader reports on finality,
so an appeal is settled before the Board sees the outcome. On Bradbury that
is about 30 minutes after acceptance (measured in Remit), so `read_window`
there must exceed it (Phase 4 measures the margin).

## 3. One read, three outcomes

The Reader fetches the auditor's page inside a non-deterministic block. The
leader and every validator each compute the outcome from their own fetch;
validators agree only if they reach the same outcome. Validators compare
outcomes, never page bytes or whole-page text (RedLine measured whole-page
text disagreeing on Bradbury where presence agreed). CounterSign's Phase 1
probe found whole-page text agreeing on all four readable audit lists on
both networks, which is expected of plain files; the rule stays on outcomes
so a page with a changing footer or counter does not go silent.

The Reader uses a plain fetch, never rendering (CLAIM-FORMAT, registration).

| Outcome | Condition |
| --- | --- |
| `confirmed` | The normalised passage is in the page's visible text and the surroundings fingerprint matches the one stored at the last confirmation (at posting there is nothing to compare, see below). The Board has already checked, before any read, that the passage contains `subject` and every `scope` string as whole words |
| `ask_jury` | The passage is present and complete, but the surroundings fingerprint differs from the stored one, or (at posting) the window contains a withdrawal word |
| `denied` | The jury answered `denies` or `points_elsewhere` or `cannot_tell` |
| `silent` | The passage is absent, incomplete, hidden, the page is empty, over the byte cap, unfetchable, or the validators could not agree |

`confirmed` and `silent` need no model. Only `ask_jury` reaches one, and its
answer turns into `confirmed` or `denied`.

**At posting** there is no earlier fingerprint, so the Reader looks at the
window of `WINDOW_WORDS` words around the passage for a short, fixed list of
phrases that only ever mean that one item was withdrawn: `withdrawn`,
`revoked`, `retracted`, `rescinded`, `superseded`, `no longer valid`. None
present: `confirmed`, no model, and the fingerprint is stored. Any present:
`ask_jury`. The list only decides whether to ask; it never decides the
answer. Phrases match as whole words, like subject and scope.

Words that appear in ordinary audit reports are deliberately **not** on the
list: `did not` ("did not find critical issues"), `draft`, `preliminary`,
`findings`, `issues`. Otherwise the jury would be asked about the very pages
the code path exists for. So is every phrase a standing header or
disclaimer uses (second and third reviews): `not audited by`, `was not
audited`, `did not audit`, `not an audit`, `do not endorse`. A header above
a table ("projects not listed here, we did not audit"; "we do not endorse
any project") sits within the window of the first rows, and a jury reading
it beside an honest row might answer `cannot_tell`, which refuses the
claim. A real withdrawal added later beside a row changes its
surroundings and reaches the jury on re-check. Phase 1 measured the list against real audit
pages: no phrase fired in the window of any confirming row, and none of the
phrases occurs anywhere on the four readable lists (about 390,000
characters). The only near miss was a substring: Sigma Prime lists "Kelp
LRT-ETH Withdrawals", which is why phrases match as whole words.

## 4. Reading the page

Reused from RedLine, where it was measured on real pages:

- Markup, comments, `script`, `style`, `svg` and similar are dropped.
- Any element marked `hidden` or `aria-hidden`, hidden by an inline style,
  by a class or id the page's own `<style>` hides, or by a common framework
  hiding class is dropped, children included. A passage only inside hidden
  markup is **not present**.
- Entities are decoded, typography folded, text lower-cased and whitespace
  collapsed before any comparison.
- The surroundings fingerprint covers the `WINDOW_WORDS` words either side
  of every place the passage appears, with digits and month and day names
  dropped, so a date changing elsewhere does not trigger the jury.

Not readable, and stated in the README: pages drawn by JavaScript, text in
images, canvases, PDFs, or set only by an external stylesheet, and computed
opacity.

## 5. The jury's one question

The jury is asked only when the passage is present and complete but its
surroundings changed (or contain a withdrawal word at posting). It is shown
the claim (auditor name, subject, scope strings, passage) and the words
around the passage on today's page, as untrusted text. It answers with
exactly one of:

- `confirms`: the page, read around the passage, still says the auditor
  audited this subject for this scope;
- `denies`: the surrounding words withdraw, revoke or contradict it;
- `points_elsewhere`: the words make it about something else (another
  version, product or date than the scope);
- `cannot_tell`.

Only `confirms` keeps or posts a claim. The jury never decides whether the
audit was good, whether the claim is true, or whether "v2" means "version
two": the scope strings are already matched exactly by code. The prompt treats
the page as data, never as instructions (RedLine's hardened prompt), and
validators accept the leader's answer only if they reach the same label.

## 6. Money

All value sits in the Board. Outcomes credit what each address is owed;
`collect` sends it. Every path, and only these:

| Event | Stake | Re-check fee |
| --- | --- | --- |
| Posting refused before any read (fields, scope, stake) | all to project, at once | - |
| Posting refused by the read | all to project | - |
| Re-check, confirmed | stays | to project |
| Re-check, first silent read | stays | back to caller |
| Re-check takes the claim down | `KEEPER_REWARD` to caller, rest to project | back to caller |
| Project withdraws | all to project | - |

**No path pays the auditor.** A test asserts it for every path, and a mutant
that pays the auditor anything must be killed. The auditor's signer may not
post a claim on its own entry or re-check one, so no refund or keeper
reward reaches that address either (an auditor using another address is
THREAT-MODEL T19). The Board's books balance to
the atto: stakes held + paid out equals stakes received, checked by a
property test over random claim lifecycles.

A payable method never raises after value has arrived (learned on RedLine):
a posting that will be refused records `refused` and refunds; it does not
revert.

## 7. Size budget

Bradbury caps a transaction at 2^24 gas; a deploy costs about 0.96M gas plus
782 per byte, so a contract must stay under about 19 KB minified. Built: the
Board is 17,067 bytes deployed and the Reader 12,835 (the Reader needs no
excerpting: the jury sees only the window around the passage).
`test_it_fits_bradburys_gas_cap` holds both.

## 8. The app and the badge

- **Board:** every live claim, by auditor and by project, with when it was
  last checked; claims that came down, and why. Every auditor is shown by
  its page's host and signer next to its typed name, which is display only.
- **Auditor:** register a page; see every claim naming you.
- **Project:** post a claim. The app fetches the page the way a validator
  does and shows the refusal the contract would return before signing.
- **Re-check:** a button on every claim.
- **Badge:** an embeddable image served by a small function that reads the
  claim from the chain and draws "Audited by Northlight (northlight.example):
  v2, March 2026, confirmed 2 days ago" or "Claim withdrawn". The badge holds no record of its
  own.
