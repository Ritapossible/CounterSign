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
  address may send (`note_registration`, `note_posting`, `note_recheck`),
  emitted on acceptance;
- the Board asks the Reader to read by message (`read_registration`,
  `read_posting`, `read_recheck`);
- every payout is the Board's own arithmetic on its own records. The Board
  never reads the Reader's state.

If the Reader becomes unreadable, claims stay as last recorded and projects
can still withdraw their own claims and stakes.

Pure logic lives outside the contract classes, as in RedLine and Remit:

- `countersign_text.py`: visible text, normalisation, sentence search,
  surroundings fingerprint (from RedLine's `redline_text.py`, with its tests);
- `countersign_core.py`: URL rules, field validation, the outcome tables in
  section 3, and money splits, all deterministic and tested directly;
- `countersign_prompts.py`: the jury prompt and strict parsing of its answer;
- `board_shell.py`, `reader_shell.py`: the two contract classes.

`contracts/build/` holds the generated, minified contracts that are deployed;
tests run both the readable and the deployed builds.

## 2. Life of a claim

```
auditor ── register(name, page_url) ──► Board ──► Reader: read_registration
                                          ◄── note_registration(ok | refused)

project ── post(auditor_id, subject, scope, sentence) + stake ──► Board  (pending)
                                          ──► Reader: read_posting
                                          ◄── note_posting(confirmed | denied | silent)
                    confirmed: live, fingerprint stored
                    denied / silent: refused, stake returned

anyone  ── recheck(claim_id) + RECHECK_FEE ──► Board ──► Reader: read_recheck
                                          ◄── note_recheck(confirmed | denied | silent)
                    confirmed: stays live, fee to project, misses reset
                    denied:    down, keeper reward to caller, rest of stake to project, fee back to caller
                    silent:    first miss: stays live, fee back to caller
                               second miss >= MISS_GAP after the first: down, as for denied

project ── withdraw(claim_id) ──► Board: withdrawn, stake returned
```

Each read is numbered per claim. A report for an older read than the latest
recorded one is ignored, and a re-executed read (an appeal) replaces the
report with the same number, as in RedLine.

## 3. One read, three outcomes

The Reader fetches the auditor's page inside a non-deterministic block. The
leader and every validator each compute the outcome from their own fetch;
validators agree only if they reach the same outcome. Validators compare
outcomes, never page bytes or whole-page text (RedLine measured whole-page
text disagreeing on Bradbury where presence agreed).

| Outcome | Condition |
| --- | --- |
| `confirmed` | The normalised sentence is in the page's visible text, contains `subject` and every `scope` string, and the surroundings fingerprint matches the one stored at posting (at posting there is nothing to compare, see below) |
| `ask_jury` | The sentence is present and complete, but the surroundings fingerprint differs from the stored one, or (at posting) the window contains a withdrawal word |
| `denied` | The jury answered `denies` or `points_elsewhere` or `cannot_tell` |
| `silent` | The sentence is absent, incomplete, hidden, the page is empty, over the byte cap, unfetchable, or the validators could not agree |

`confirmed` and `silent` need no model. Only `ask_jury` reaches one, and its
answer turns into `confirmed` or `denied`.

**At posting** there is no earlier fingerprint, so the Reader looks at the
window of `WINDOW_WORDS` words around the sentence for a short, fixed list of
withdrawal words (`withdrawn`, `revoked`, `retracted`, `not audited`, `did
not`, `draft`, `superseded`, `not an audit`, `preliminary`, `unofficial`,
`disclaim`). None present: `confirmed`, no model, and the fingerprint is
stored. Any present: `ask_jury`. The list only decides whether to ask; it
never decides the answer.

## 4. Reading the page

Reused from RedLine, where it was measured on real pages:

- Markup, comments, `script`, `style`, `svg` and similar are dropped.
- Any element marked `hidden` or `aria-hidden`, hidden by an inline style,
  by a class or id the page's own `<style>` hides, or by a common framework
  hiding class is dropped, children included. A sentence only inside hidden
  markup is **not present**.
- Entities are decoded, typography folded, text lower-cased and whitespace
  collapsed before any comparison.
- The surroundings fingerprint covers the `WINDOW_WORDS` words either side
  of every place the sentence appears, with digits and month and day names
  dropped, so a date changing elsewhere does not trigger the jury.

Not readable, and stated in the README: pages drawn by JavaScript, text in
images, canvases, PDFs, or set only by an external stylesheet, and computed
opacity.

## 5. The jury's one question

The jury is asked only when the sentence is present and complete but its
surroundings changed (or contain a withdrawal word at posting). It is shown
the claim (auditor name, subject, scope strings, sentence) and the words
around the sentence on today's page, as untrusted text. It answers with
exactly one of:

- `confirms`: the page, read around the sentence, still says the auditor
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

All value sits in the Board. Every path, and only these:

| Event | Stake | Re-check fee |
| --- | --- | --- |
| Posting refused | all to project | - |
| Re-check, confirmed | stays | to project |
| Re-check, first silent read | stays | back to caller |
| Re-check takes the claim down | `KEEPER_REWARD` to caller, rest to project | back to caller |
| Project withdraws | all to project | - |

**No path pays the auditor.** A test asserts it for every path, and a mutant
that pays the auditor anything must be killed. The Board's books balance to
the atto: stakes held + paid out equals stakes received, checked by a
property test over random claim lifecycles.

A payable method never raises after value has arrived (learned on RedLine):
a posting that will be refused records `refused` and refunds; it does not
revert.

## 7. Size budget

Bradbury caps a transaction at 2^24 gas; a deploy costs about 0.96M gas plus
782 per byte, so a contract must stay under about 19 KB minified. The Board
has no page logic and should be well under. The Reader carries the text
rules and the jury and is the one to watch; `test_it_fits_bradburys_gas_cap`
holds both from the first build.

## 8. The app and the badge

- **Board:** every live claim, by auditor and by project, with when it was
  last checked; claims that came down, and why.
- **Auditor:** register a page; see every claim naming you.
- **Project:** post a claim. The app fetches the page the way a validator
  does and shows the refusal the contract would return before signing.
- **Re-check:** a button on every claim.
- **Badge:** an embeddable image served by a small function that reads the
  claim from the chain and draws "Audited by Northlight: v2, March 2026,
  confirmed 2 days ago" or "Claim withdrawn". The badge holds no record of its
  own.
