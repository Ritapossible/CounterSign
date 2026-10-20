# Plan

What is built, what was measured, and what comes next. An item is done only
when its "done when" holds and the evidence is in this repository. Nothing
is built yet.

## Phase 0 - Design `[~]`

- [x] README, ARCHITECTURE, CLAIM-FORMAT, THREAT-MODEL, this plan, CLAUDE.md.
- [ ] Reviewed: the money table, the outcome table and the threat model
      checked by a second reader before any code.

**Done when** the design is reviewed and no open objection remains.

## Phase 1 - Prove the auditor's page can be read `[ ]`

Before any contract, as RedLine did: can validators fetch real audit-list
pages and agree on whether a sentence is present?

- [ ] **Probe on Studio**: five real public audit pages (auditors' published
      report lists), a known confirming sentence from each, presence
      compared across validators. Record which pages are server-rendered and
      which are empty to a validator (JavaScript).
- [ ] **Probe on Bradbury**: the same pages, strict mode.
- [ ] Decide the registration minimum (visible text length) from the probe.

**Done when** the probe records are in `deploy/probes/` and the README's
"server-rendered only" limit is backed by them.

## Phase 2 - Pure logic `[ ]`

- [ ] `countersign_text.py` from RedLine's text module, with its tests
      carried over: visible text, hidden elements, normalisation, sentence
      search, surroundings fingerprint.
- [ ] `countersign_core.py`: URL rules, field validation (CLAIM-FORMAT),
      the outcome table (ARCHITECTURE section 3), withdrawal-word window,
      read numbering, money splits.
- [ ] `countersign_prompts.py`: the jury prompt and strict label parsing;
      anything unparseable is `cannot_tell`.
- [ ] **Property test**: random claim lifecycles; every atto of every stake
      ends with the project or a keeper; never with the auditor.
- [ ] **Mutation check**: a mutant per rule (no auditor payout, scope
      matching, hidden text, one-miss tolerance, `MISS_GAP`, refusal
      refunds, terminal `down`, read numbering, URL rules), all killed.

**Done when** the suite is green and every mutant is killed.

## Phase 3 - Contracts `[ ]`

- [ ] `board_shell.py` and `reader_shell.py`, built and minified into
      `contracts/build/`.
- [ ] Tests run the readable and the deployed builds through a GenVM
      stand-in; both fit Bradbury's gas cap
      (`test_it_fits_bradburys_gas_cap`).
- [ ] Every THREAT-MODEL test named there exists and passes.

**Done when** both builds pass the whole suite and fit the cap.

## Phase 4 - On chain: Studio `[ ]`

A fictional auditor's audit-list page lives on a `live` branch of this
repository and is edited mid-run. Each case at least three times:

| Case | Expected |
| --- | --- |
| Register a server-rendered page | registered |
| Register a page drawn by JavaScript | refused |
| Post with the exact sentence, subject and every scope string | live, no model |
| Post with a scope string missing from the sentence | refused, stake returned |
| Post a sentence not on the page | refused, stake returned |
| Post a sentence present only in hidden markup | refused, stake returned |
| Post a sentence with "withdrawn" next to it | jury; denied; refused, stake returned |
| Re-check an unchanged page | live; fee to the project |
| Auditor adds "this audit has been withdrawn" beside the sentence | jury; down; keeper reward to caller, rest to project |
| Auditor deletes the sentence | first re-check leaves it live; a second one `MISS_GAP` later takes it down |
| Page unreachable once | stays live |
| Page talks to the jury | does not keep a withdrawn claim |
| Project withdraws | stake returned |
| Every path | the auditor received nothing; the Board's books balance |

**Done when** the record (`deploy/scenario-studio.json`) shows every case
with transaction hashes and 0 failed checks.

## Phase 5 - On chain: Bradbury `[ ]`

- [ ] The same cases on the Bradbury testnet; jury rounds that do not decide
      are convened again and both rounds recorded, with per-validator votes.
- [ ] A verification script fetches each deployed contract's code and proves
      it is the committed build.

**Done when** the Bradbury record has 0 failed checks and the code check
passes.

## Phase 6 - App and badge `[ ]`

- [ ] Board, auditor, project and claim pages; Studio burner and wallets on
      Studio and Bradbury.
- [ ] Posting shows the contract's refusal before signing (same rules,
      parity-tested against the Python).
- [ ] Re-check button with the fee shown.
- [ ] Badge function: reads one claim from the chain and serves an image;
      holds no record of its own.
- [ ] Browser end-to-end on Studio; phone layout.

**Done when** the app runs every Phase 4 case end to end against Studio.

## Phase 7 - Release `[ ]`

- [ ] README results from the records, deployed addresses, limits.
- [ ] Docs pages on the site, roadmap last.
- [ ] The demo auditor page is in this repository, so the runs prove the
      gate, not an independent auditor. Stated plainly.

## Later, not scheduled

- Other claim kinds where the named party's page is a complete list
  (grant recipients, hackathon winners). Not partnerships or integrations.
- Auditor-signed confirmations, checked by signature instead of a page.

## Non-goals

- Judging whether a claim, an audit or a project is good.
- Editing or removing anything on a project's own website.
- A reputation token, score or ranking.
- Paying the named party for anything.
