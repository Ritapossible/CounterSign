# Integration

How to read CounterSign claims from your own app or contract, and the full
contract reference. Everything here is public: reading a claim needs no
account and no permission.

## Read a claim from a web app

`client/countersign.mjs` is the layer the CounterSign app itself uses. It
knows the deployed contracts on each network, decodes every record into plain
states, retries reads the network turns away for load, and sends every write
with its fee deposit on fee networks.

```js
import { connect, formatGen } from "./client/countersign.mjs";

const cs = connect("studio");              // read only
const claim = await cs.claim(22);
claim.state;                               // "live"
claim.auditor;                             // { id, name, host, signer }
claim.checkedAt;                           // last confirmed (Board clock, seconds)
formatGen(claim.stake);                    // "0.1"
claim.can;                                 // { recheck, withdraw, retry, expire }
```

To send transactions, connect with an account: a wallet address in the
browser (`connect("studionext", { account, provider })`), or a private key in
Node. See [client/README.md](../client/README.md).

**Show the host, not only the name.** An auditor's typed name is display
only: anyone can register an entry called "Northlight" on a page they
control. Show `claim.auditor.host` next to the name, and treat a claim as
meaningful only when the host is the auditor's real website.

## Read a claim from a GenLayer contract

```python
from genlayer import *
import json

board = gl.get_contract_at(Address(BOARD_ADDRESS)).view()
claim = json.loads(board.get_claim(claim_id))
if claim["state"] == "live" and claim["auditor_host"] == "northlight.example":
    ...
```

A view reads the Board's accepted state. A claim can change state at any
re-check, so read it at the moment you rely on it, and check `checked_at`
(when the auditor's page last confirmed it) against how fresh you need it.

## Read a claim from anywhere else

Any GenLayer JSON-RPC client can call the views below with `gen_call`. With
genlayer-js:

```js
const raw = await client.readContract({ address: BOARD, functionName: "get_claim", args: [22] });
const claim = JSON.parse(raw);
```

Studio rate-limits reads (about 20 per 10 seconds per contract): read only
the claims you need, and cache claims that are closed (`refused`, `down`,
`withdrawn`); they never change again.

## Deployed contracts

| Network | Board | Reader | Build |
| --- | --- | --- | --- |
| Studio | `0xd807307B04812C0035f808e4015850F3e0e6B264` | `0x5F69d0151d96a770DaA666c83eE8A7681D55aC3A` | `a43fad4` |
| Studio Next | `0x7B2793018645200690A7a3066C245DD8f3F65dd0` | `0xE30aB8EABaD0445E1D13bFC412Da4a816C604084` | `a43fad4` |
| Bradbury | not deployed yet | | |

`deploy/verify_code.mjs <commit> <record.json>` checks that the code on chain
is the build of a given commit.

## Contract reference

### Board views

| View | Returns |
| --- | --- |
| `get_claim(claim_id)` | The claim as JSON (below), plus `auditor_name`, `auditor_host`, `auditor_signer`, and `now`, the Board's clock. |
| `get_auditor(auditor_id)` | The auditor entry as JSON: `id`, `name`, `url`, `host`, `signer`, `sample`, `state` (`pending`, `registered`, `refused`), `at`, `due`, and `decided_at` once decided. |
| `owed_to(address)` | Atto-GEN credited to the address and not yet collected. |
| `refusal_of(address)` | The address's last refused `post` or `recheck`: `reason`, `at`, `returned`. |
| `status()` | `release`, `reader`, `miss_gap`, `read_window`, counts of `auditors` and `claims`, and the books: `held`, `owed`, `received`, `balance`. |

A claim:

| Field | Meaning |
| --- | --- |
| `id`, `auditor`, `project` | Claim id, auditor entry id, the project's address (it receives every refund). |
| `subject`, `scope`, `passage` | What is claimed, and the exact text quoted from the auditor's page. |
| `stake` | Atto-GEN at stake. |
| `state` | `pending`, `live`, `refused`, `down` or `withdrawn` ([Claim format](CLAIM-FORMAT.md)). |
| `posted_at`, `checked_at`, `ended_at` | When it was posted, last confirmed, and closed. |
| `misses`, `miss_at` | A silent re-check (0 or 1) and when; a second one `miss_gap` later takes the claim down. |
| `print` | Fingerprint of the words around the passage at the last confirmation. |
| `seq`, `read` | The number of the last read, and the open read if any: `seq`, `kind` (`posting` or `recheck`), `caller`, `fee`, `at`, `due`. |
| `why` | Why a closed claim closed. |

### Board writes

| Write | Who | What it does |
| --- | --- | --- |
| `register(name, page_url, sample)` | An auditor | Pins its page; returns the entry id. Pending until the Reader reports. |
| `post(auditor_id, subject, scope_json, passage)` + stake | A project | Stakes on a claim; returns the claim id, or `-1` when refused before any read (value credited back, reason in `refusal_of`). |
| `recheck(claim_id)` + exactly 0.01 GEN | Anyone but the auditor's signer | Re-reads a live claim's page. Returns `false` when refused (value credited back). |
| `withdraw_claim(claim_id)` | The project | Takes its claim down from `pending` or `live`; stake credited back. |
| `expire(claim_id)` | Anyone, after the read's deadline | Closes a read with no report: a posting is refused (stake back); a re-check returns its fee and is not a miss. |
| `expire_registration(auditor_id)` | Anyone, after the deadline | Refuses a registration with no report. |
| `collect()` | Anyone owed | Sends the caller everything it is owed. |

`note_registration` and `note_claim` are accepted only from the Reader.

### Reader

| Method | Who | What it does |
| --- | --- | --- |
| `retry_claim(claim_id)` | Anyone | Reads again the page of a claim whose read is open, from the Board's records only. |
| `retry_registration(auditor_id)` | Anyone | Same, for a pending registration. |
| `last_read(key)` | View | The Reader's last outcome for `c:<claim id>` or `a:<auditor id>`. |
| `status()` | View | `release`, the bound `board`, and the number of `reads`. |

`read_claim` and `read_registration` are accepted only from the Board, and
`bind(board)` only once, from the Reader's deployer.

## Reading outcomes correctly

- **A write that was accepted is not the same as a write that applied.**
  `post` and `recheck` never revert once value has arrived: a refusal is
  recorded and the value credited back. Check the returned value, or
  `refusal_of`, after the transaction.
- **A posting is not live until the Reader reports.** Wait for `state` to
  leave `pending`; on Studio that is under a minute.
- **Reports arrive on finality.** The Reader reports to the Board only once
  its read is final, so an appealed read reaches the Board once, with its
  final outcome.
