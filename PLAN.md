# Plan

What is built, what was measured, and what comes next. An item is done only
when its "done when" holds and the evidence is in this repository. Nothing
is built yet.

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

## Phase 2 - Pure logic `[ ]`

- [ ] `countersign_text.py` from RedLine's text module, with its tests
      carried over: visible text, hidden elements, normalisation, passage
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
