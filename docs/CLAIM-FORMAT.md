# Claim format

Every field a party or a project submits, and every rule it must pass. A
rule marked **(contract)** is enforced on chain; the app runs the same rules
before signing and must agree with the contract exactly (parity tests).

## Auditor registration

| Field | Rule |
| --- | --- |
| `name` | 2-60 characters, printable, no control characters. Display only; it does not need to appear on the page. **(contract)** |
| `page_url` | The one public page that lists the auditor's audits. URL rules below. **(contract)** |
| signer | `msg.sender` becomes the auditor's address. One address may register several pages (several auditor entries). **(contract)** |

**Registration fetch.** Validators fetch `page_url` once. Registration is
refused, and nothing is stored, if the validators do not agree on the page's
visible text, if the visible text is shorter than 200 characters (a page
drawn by JavaScript returns almost nothing), or if the page is over the byte
cap. **(contract)**

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
| `subject` | The project's name exactly as the auditor writes it, 2-80 characters. **(contract)** |
| `scope` | 1 to 4 strings, each 2-80 characters, for example `lending contracts v2`, `March 2026`. **(contract)** |
| `sentence` | The exact confirming sentence from the auditor's page, 40-600 characters. It must contain `subject` and every `scope` string. **(contract)** |
| `kind` | `audit`. The only kind in version 1. **(contract)** |
| stake | The value sent with the transaction, at least `MIN_STAKE`. **(contract)** |
| signer | `msg.sender` becomes the project's address; it receives every refund. **(contract)** |

**Matching.** `subject`, every `scope` string and `sentence` are compared
after the same normalisation RedLine uses (entities decoded, typography
folded, lower-case, whitespace collapsed). Containment is plain substring
matching on normalised text. There is no fuzzy matching and no model
deciding whether "v2" means "version two".

## Constants (proposed; fixed per deployment)

| Constant | Studio | Bradbury | Why |
| --- | --- | --- | --- |
| `MIN_STAKE` | 0.10 GEN | 0.10 GEN | Makes spam cost something; funds keeper rewards |
| `RECHECK_FEE` | 0.01 GEN | 0.01 GEN | A re-check that finds the claim fine pays the project this, so nobody can spam re-checks for free |
| `KEEPER_REWARD` | 0.02 GEN | 0.02 GEN | Paid from the stake to whoever's re-check takes a claim down; less than `MIN_STAKE` |
| `MISS_GAP` | 300 s | 3,600 s | Two silent reads must be at least this far apart to take a claim down |
| `WINDOW_WORDS` | 60 | 60 | Words either side of the sentence in the surroundings fingerprint (RedLine's measured value) |
| page byte cap | 400 KB | 400 KB | Larger pages count as unreadable |

## Claim states

| State | Meaning |
| --- | --- |
| `pending` | Posted; the reader has not reported the posting read yet |
| `live` | Confirmed at posting or at the latest re-check |
| `refused` | The posting read did not confirm it; stake returned |
| `down` | Taken down by a re-check; stake returned (minus keeper reward) |
| `withdrawn` | The project took it down itself; stake returned |

`live` claims also carry `last_checked_at` and `misses` (0 or 1), so the board
and badge can show how fresh a claim is.
