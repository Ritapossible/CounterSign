# Plan

What is built, what was measured, and what comes next. An item is done only
when its "done when" holds and the evidence is in this repository.

## Phase 0 - Design `[~]`

- [x] README, ARCHITECTURE, CLAIM-FORMAT, THREAT-MODEL, this plan, CLAUDE.md.
- [x] First review. Kept: the money table (no path pays the auditor).
      Fixed: the posting withdrawal list holds only phrases that always mean
      a withdrawal (not `did not`, `draft`, `preliminary`); registration
      agrees on an outcome, not identical text; subject and scope match as
      whole words and the subject must be a name; a `pending` claim can be
      withdrawn; the README says when keepers are and are not paid, and puts
      the auditor's identity (host and signer, not the typed name) on its
      first screen.
- [ ] Second review of these fixes.

**Done when** the design is reviewed and no open objection remains.

## Phase 1 - Prove the auditor's page can be read `[x]`

Before any contract, as RedLine did: can validators fetch real audit-list
pages and agree on whether a passage is present? Probe contract
`deploy/probes/probe_audit_pages.py`, cases in `audit_pages.json`, records
in `probe-audit-pages-studio.json` and `probe-audit-pages-bradbury.json`.

- [x] **Probe on Studio** (`0xd3B9173d6df9DEDEc2F02Fd40296Db94D13286E4`):
      eight real audit lists, a real confirming row from each list that had
      one, outcome compared across validators. 16 of 16 reads agreed.
- [x] **Probe on Bradbury** (`0x68a305aBf88741acb661cF2b67cDe119C576B26a`):
      the same reads plus whole-page strict mode. 15 of 16 agreed with
      exactly Studio's outcome and text digest; one rendered read (Halborn)
      timed out. Three views read empty straight after acceptance and were
      read again later (`result_reread` in the record).

| Page | Plain fetch | Rendered | Usable |
| --- | --- | --- | --- |
| Trail of Bits, Sigma Prime, Spearbit, Cyfrin (lists on GitHub, 43-144k chars) | readable; row present and complete; no phrase fired; whole-page text agreed | - | yes |
| ChainSecurity | 1 MB, over the byte cap | names only, no scope or date: present, not complete | no |
| Code4rena | 320 chars | 80 chars | no |
| Halborn | readable (6.5k chars), list absent | list absent (Studio); timed out (Bradbury) | no |
| OpenZeppelin | readable (2.8k chars), list absent | list absent | no |

- [x] Decide the registration minimum. **Length alone is not enough**:
      Halborn and OpenZeppelin pass 200 characters with no list visible.
      Registration now also needs a `sample` row that must be present
      (CLAIM-FORMAT, THREAT-MODEL T17). Byte cap stays 400 KB. Plain fetch
      only: rendering never made an unusable list usable.
- [x] Run the posting withdrawal list over each real page. No phrase fired
      in any confirming row's window, and none occurs anywhere on the four
      readable lists. The only near miss is a substring ("Kelp LRT-ETH
      Withdrawals"), so phrases now match as whole words.
- [x] Check whole-word matching of a real subject and scope against each
      page's confirming row: complete on all four (`uniswap v4 core` /
      `jul 2024`, `lido` / `january 2026`, `onchain bls library`, `morpho` /
      `september 2026`, `lending`, `greekfi oracle` / `2026-09-02`).
- [x] "Sentence" is now "passage" throughout: every list probed is a table,
      one audit per row, so the confirming text is a row, not a sentence.
- [x] Recorded from the second review: the stop list refuses a subject made
      only of stop words (`labs`), not one containing them (`Acme Labs`); a
      re-check is accepted only from `live`, so it cannot race the posting
      read (T18).

**Done when** the probe records are in `deploy/probes/` and the README's
"server-rendered only" limit is backed by them. Both hold.

## Phase 2 - Pure logic `[x]`

Run: `python3 -m pytest tests/direct -q` (183 tests) and
`python3 tests/mutation_check.py` (76 mutants).

- [x] `countersign_text.py` from RedLine's text module, with its tests
      carried over: visible text, hidden elements (twelve hiding forms, five
      that must stay visible), normalisation; plus whole-word matching and
      the surroundings (window and fingerprint), dates and numbers dropped.
- [x] `countersign_core.py`: URL rules, field validation (CLAIM-FORMAT),
      registration with its sample, the outcome of one read, the withdrawal
      phrases as whole words, read numbering and deadlines, every money path.
- [x] `countersign_prompts.py`: the jury prompt (claim and surroundings as
      neutralised data) and strict label parsing; anything but an exact
      label is `cannot_tell`, and only `confirms` keeps a claim.
- [x] **Property tests**: 400 random claim lifecycles on the pure rules and
      120 random steps on each built contract. Every atto ends with the
      project or a keeper, or is still held; the auditor is never credited
      or paid; the Board's books balance after every step.
- [x] **Mutation check**: 76 mutants, one per rule (no auditor payout,
      scope and subject matching, whole-word phrases, hidden text, the
      sample, one-miss tolerance, `MISS_GAP`, refusal refunds, terminal
      states, read numbering, expiry, URL rules, strict labels, who may
      report and who may ask), all killed.
- [x] Real rows: the five probed rows with a scope are checked against the
      field rules; the four GitHub rows are complete, ChainSecurity's is
      not, as measured on chain.

Found while building, for review:

- A generic disclaimer above an auditor's table ("a project not listed here
  was not audited by us") contains `not audited by`. Second review: a jury
  reading it beside an honest row could refuse the claim, and the stub
  cannot show otherwise. `not audited by` and `was not audited` are off the
  posting list (`test_a_standing_disclaimer_above_the_list_does_not_ask_the_jury`).
- A registration read now has a deadline too: with no report by
  `read_window`, `expire_registration` refuses the entry.
- Reports are sent on finality instead of replaced on appeal (ARCHITECTURE
  section 2); an open read has a deadline and expires as silent.
- The auditor's signer may not post or re-check on its own entry
  (THREAT-MODEL T19); the Reader serves only its Board (T20).

**Done when** the suite is green and every mutant is killed. Both hold.

## Phase 3 - Contracts `[x]`

- [x] `board_shell.py` and `reader_shell.py`, built and minified into
      `contracts/build/` by `deploy/build_contract.py`.
- [x] Tests run the readable and the deployed builds through a GenVM
      stand-in (every scenario twice); both fit Bradbury's gas cap
      (`test_it_fits_bradburys_gas_cap`): Board 17,067 bytes, Reader
      12,835 bytes deployed, against about 19,000.
- [x] Every THREAT-MODEL test named there exists and passes.
- [ ] Measured only on chain (Phase 4): `emit(on="finalized")` from the
      Reader, and the time from a request to its report on each network.

**Done when** both builds pass the whole suite and fit the cap. Both hold;
the finality message is the first thing Phase 4 measures.

## Phase 4 - On chain: Studio `[ ]`

A fictional auditor's audit-list page lives on a `live` branch of this
repository (`demo/northlight.html`) and is edited mid-run.

**Step 0, before any case** (second review): one clean registration and one
clean posting, timing request to `note_registration` and to `note_claim`
(`deploy/measure_messages.mjs`, record `deploy/messages-studio.json`). The
Reader's `emit(on="finalized")` has never run in the stand-in, and a read
that expires before its report lands refuses a good posting. `read_window`
is set longer than what this measures; no other case runs until both
messages have landed.

- [x] **Studio** (Board `0x007efCEE4F9fc1CdD7411Cb9516304d1Cd67f45a`,
      Reader `0xca1fdC90b56a85f2cbbBD720BccfB05bfd14128A`): both messages
      landed. Registration: request accepted in 7 s, the Reader's read
      recorded 7 s after that, `note_registration` on the Board 40 s after
      acceptance (`registered`). Posting: accepted in 4 s, read recorded at
      7 s, `note_claim` on the Board at 39 s (`live`). About 33 s of each is
      finality. Studio's `read_window` of 600 s is 15 times that.
- [x] **Bradbury** (Board `0xac642d7d6f97e192D87e36DdE8E15Ae7d7415713`, Reader `0x088F36a929016Ce3caF0aCf506a9645f732C4862`): both messages landed.
      Registration: accepted in 15 s, read recorded 16 s after, `note_registration`
      on the Board 2008 s after acceptance (`registered`). Posting: accepted in 15 s,
      read at 15 s, `note_claim` at 2001 s (`live`), with the same surroundings
      fingerprint Studio computed for the same page. About 33 minutes of
      each is finality. Bradbury's `read_window` is 7,200 s, 3.6 times that.

Then each case at least three times:

| Case | Expected |
| --- | --- |
| Register a server-rendered page | registered |
| Register a page drawn by JavaScript | refused |
| Register a readable page whose `sample` is not on it | refused |
| Re-check a `pending` claim | refused, fee not taken |
| Post with the exact passage, subject and every scope string | live, no model |
| Post with a scope string missing from the passage | refused, stake returned |
| Post a passage not on the page | refused, stake returned |
| Post a passage present only in hidden markup | refused, stake returned |
| Post a passage with "withdrawn" next to it | jury; denied; refused, stake returned |
| Re-check an unchanged page | live; fee to the project |
| Auditor adds "this audit has been withdrawn" beside the passage | jury; down; keeper reward to caller, rest to project |
| Auditor deletes the passage | first re-check leaves it live; a second one `MISS_GAP` later takes it down |
| Page unreachable once | stays live |
| Page talks to the jury | does not keep a withdrawn claim |
| Project withdraws a live claim, and one still pending | stake returned; a late report is ignored |
| Every path | the auditor received nothing; the Board's books balance |

**Done when** the record (`deploy/scenario-studio.json`) shows every case
with transaction hashes and 0 failed checks.

**Studio result** (Board `0xb9C634875f575cE0bB0924FF5e183132e190CeF6`, Reader `0x81f1c0Ad329a0eA23d2d9FD7Be8b0B7D9cea5c37`; `deploy/scenario.mjs`, record
`deploy/scenario-studio.json`): **90 checks, 0 failed**, every case three
times, on 27 auditor entries and 27 claims. The page edits were pushed to
the `live` branch mid-run, and each re-check waited until the edit was
visible plus 330 s of CDN margin.

- Registrations: 18 server-rendered pages registered, 3 script-drawn pages
  refused, 3 readable pages without their sample refused.
- Postings: exact row live with no model; scope string missing refused at
  once with the stake credited; row not on the page, hidden row and row
  with "(withdrawn)" beside it all refused, stake returned.
- Re-checks: unchanged page live, fee to the project; "withdrawn" added
  beside the row, down; injection text beside the row, down; row deleted,
  live on the first silent read and down on the second, 300 s later; page
  404 once, live, then live again with misses reset when it came back.
- Withdrawal of a pending and of a live claim returned the stake; the late
  report for the withdrawn pending claim was ignored; a re-check of a
  pending claim was refused with its fee back.
- The auditor is owed nothing. Balance = held + owed and received = held +
  owed + collected (3.54 = 0.30 + 0.30 + 2.94 GEN).
- `collect` pays the wallet at finality: Studio labels the triggered value
  send `NO_MAJORITY`, and the wallet is still credited
  (`deploy/probes/probe_transfer.*`).

Five earlier checks were wrong, not the contracts, and are kept in the
record under `superseded` with the reason: three compared owed balances
while another claim's refund landed in the same window, one read balances
before the collect's transfer finalised, and one used `received = held +
owed`, which stops holding once anything is collected.

## Phase 5 - On chain: Bradbury `[ ]`

- [ ] The same cases on the Bradbury testnet; jury rounds that do not decide
      are convened again and both rounds recorded, with per-validator votes.
- [ ] A verification script fetches each deployed contract's code and proves
      it is the committed build.

**Done when** the Bradbury record has 0 failed checks and the code check
passes.

## Phase 6 - App and badge `[ ]`

The front-end design comes from the project owner. Nothing in this phase is
designed or built until that design is provided; the items below are the
functions it must cover, not a layout.

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
