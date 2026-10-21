# Claim format

Every field a party or a project submits, and every rule it must pass. A
rule marked **(contract)** is enforced on chain; the app runs the same rules
before signing and must agree with the contract exactly (parity tests).

## Auditor registration

| Field | Rule |
| --- | --- |
| `name` | 2-60 characters, printable, no control characters. Display only; it does not need to appear on the page. **(contract)** |
| `page_url` | The one public page that lists the auditor's audits. URL rules below. **(contract)** |
| `sample` | One exact passage from that page naming a real audit, usually one row of its audit table, 40-600 characters. It proves the page is a list a validator can read, not just any readable page. **(contract)** |
| signer | `msg.sender` becomes the auditor's address. One address may register several pages (several auditor entries). **(contract)** |

**Registration fetch.** Validators fetch `page_url` once with a plain fetch
(no rendering) and each computes one outcome: `readable` if the response is
under the byte cap, its visible text is at least 200 characters, and
`sample` is present in that visible text; otherwise `unreadable`.
Validators agree on that outcome, never on identical text. Registration
succeeds only on an agreed `readable`; otherwise it is refused and nothing
is stored. **(contract)**

Why the sample: Phase 1 measured two auditor websites (Halborn,
OpenZeppelin) whose pages are readable, with thousands of visible
characters, yet show none of their audits to a validator. A length minimum
alone would register them, and every claim against them would then be
refused. With the sample, registration proves the list itself is visible.

Why no rendering: on the probed pages, rendering never turned a page
without a usable list into one with a usable list (ChainSecurity rendered
shows project names with no scope or date; Code4rena stays empty), and one
rendered read timed out on Bradbury.

A registration read has the same deadline as any read (`read_window`). If
no report arrives by then, anyone may call `expire_registration`, and the
entry is refused; the auditor may register again. **(contract)**

An auditor entry cannot be edited. To move its list, an auditor registers a
new entry; claims on the old entry come down when its page goes silent.

## URL rules (from Remit Milestone 1)

A URL is refused unless all of these hold. **(contract)**

- It starts with `https://` and the host contains a dot.
- It contains none of: `%` (any percent-encoding, so `%2e` and `%252e`
  alike), `..`, `\`, `@`, `?`, `#`, or whitespace.
- It is at most 300 characters.

The contract never decodes or normalises a URL: a decoder in the contract
could disagree with the server. It refuses anything a server could read as a
different path.

## Claim

| Field | Rule |
| --- | --- |
| `auditor_id` | A registered auditor entry. **(contract)** |
| `subject` | The project's name exactly as the auditor writes it, 3-80 characters, containing at least 3 letters. It is refused if it consists only of words on the stop list (`the`, `and`, `inc`, `labs`, `protocol`, `audit`, `report`, `security`, ...): `labs` or `the protocol` is refused, `Acme Labs` is accepted. **(contract)** |
| `scope` | 1 to 4 strings, each 2-80 characters, for example `lending contracts v2`, `March 2026`. Each must contain a letter or digit. **(contract)** |
| `passage` | The exact confirming text from the auditor's page, 40-600 characters: one contiguous run of visible text, usually one row of the auditor's audit table (Phase 1: every list probed is a table, one audit per row). It must contain `subject` and every `scope` string. **(contract)** |
| `kind` | `audit`. The only kind in version 1. **(contract)** |
| stake | The value sent with the transaction, at least `MIN_STAKE`. **(contract)** |
| signer | `msg.sender` becomes the project's address; it receives every refund. It may not be the auditor's signer. **(contract)** |

**Matching.** `subject`, every `scope` string and `passage` are compared
after the same normalisation RedLine uses (entities decoded, typography
folded, lower-case, whitespace collapsed). The passage must appear in the
page's visible text; `subject` and every `scope` string must appear in the
passage **as whole words**: the character before and after each match is
the start or end of the text or is not a letter or digit. So `v2` does not
match `v20`, `acme` does not match `acmeswap`, and a short particle cannot
stand in for a name. The withdrawal phrases in the window around the
passage are matched the same way, as whole words: audit scopes on real
lists contain words like "Withdrawals" (Sigma Prime, Kelp LRT-ETH
Withdrawals), and a phrase must never fire on part of a word. There is no
fuzzy matching and no model deciding
whether "v2" means "version two".

## Constants (proposed; fixed per deployment)

| Constant | Studio | Bradbury | Why |
| --- | --- | --- | --- |
| `MIN_STAKE` | 0.10 GEN | 0.10 GEN | Makes spam cost something; funds keeper rewards |
| `RECHECK_FEE` | 0.01 GEN | 0.01 GEN | A re-check that finds the claim fine pays the project this, so nobody can spam re-checks for free |
| `KEEPER_REWARD` | 0.02 GEN | 0.02 GEN | Paid from the stake to whoever's re-check takes a claim down; less than `MIN_STAKE` |
| `MISS_GAP` | 300 s | 3,600 s | Two silent reads must be at least this far apart to take a claim down |
| `read_window` | 600 s | 7,200 s | A read with no report by then expires: a posting is refused, a re-check returns its fee and is not a miss; on Bradbury it must exceed finality (about 30 min) |
| `WINDOW_WORDS` | 60 | 60 | Words either side of the passage in the surroundings fingerprint (RedLine's measured value) |
| page byte cap | 400 KB | 400 KB | Larger responses count as unreadable. Phase 1: the four readable lists are 43-178 KB; ChainSecurity's 1 MB page is over and has no usable list anyway |

## Claim states

| State | Meaning |
| --- | --- |
| `pending` | Posted; the reader has not reported the posting read yet |
| `live` | Confirmed at posting or at the latest re-check. A re-check is accepted only from `live`, so it can never race the posting read of a `pending` claim |
| `refused` | The posting read did not confirm it; stake returned |
| `down` | Taken down by a re-check; stake returned (minus keeper reward) |
| `withdrawn` | The project took it down itself, from `pending` or `live`; stake returned. A late Reader report is ignored |

`live` claims also carry `last_checked_at` and `misses` (0 or 1), so the board
and badge can show how fresh a claim is.
