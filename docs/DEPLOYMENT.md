# Deployment

How to build, test and deploy the contracts, and how to run and publish the
app.

## Repository layout

| Path | What it is |
| --- | --- |
| `contracts/` | The Board and Reader sources: pure logic (`countersign_core.py`, `countersign_text.py`, `countersign_prompts.py`) and the two contract shells. |
| `contracts/build/` | Generated. One readable and one minified (deployed) file per contract. Never edit. |
| `tests/` | Direct tests of the pure logic and of both contracts on a GenVM stub, and the mutation harness. |
| `deploy/` | Deploy and measurement scripts, and the records of every on-chain run. |
| `client/` | The JavaScript layer the app uses to read and write the contracts. |
| `app/` | The web app (Vite and React). |

## Build and test the contracts

```bash
pip install -r requirements-dev.txt
python3 deploy/build_contract.py        # writes contracts/build/
python3 -m pytest tests/direct -q       # 199 tests
python3 tests/mutation_check.py         # every rule must have a test that fails without it
```

The build inlines the pure-logic modules into each contract, drops what the
contract never reaches, and minifies. Both deployed files must stay under
about 19 KB: Bradbury caps a transaction at 2^24 gas
(`test_it_fits_bradburys_gas_cap`).

Each built file starts with the runner header:

```
# v0.2.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

Studio Next refuses a contract without the version line ("runner
malformed"); Studio accepts it too.

## Deploy the contracts

```bash
cd deploy && npm install
COUNTERSIGN_KEYS=<dir> node deploy.mjs studio          # or studionext, bradbury
```

`<dir>` holds `principal.key`, a private key with GEN on that network. Keep it
out of the repository (`*.key` is ignored). The script deploys the Reader,
then the Board with the Reader's address, then binds the Reader to the Board,
and prints both addresses. The timing constants default to
[Claim format](CLAIM-FORMAT.md): `miss_gap` 300 s and `read_window` 600 s on
Studio, 3,600 s and 7,200 s on Bradbury; pass them as the next two arguments
to change them. On Bradbury, `read_window` must be longer than the measured
time for a Reader report to reach the Board (`deploy/measure_messages.mjs`).

On fee networks (Studio Next, Bradbury) every write carries a fee deposit
from the SDK's simulation of that exact call, including the fee for the
message the Board sends the Reader. A posting with no fee for that message
is rolled back, and one with too small a fee is refused at submission.

Then check the deployed code is the build of a commit:

```bash
node verify_code.mjs <commit> <record.json>
```

and put the addresses in `client/countersign.mjs` (`NETWORKS`).

To fund a key on Studio or Studio Next, call the network's faucet RPC
`sim_fundAccount(address, amount)` with the amount as a raw JSON integer in
atto-GEN.

## Run the scenario table

```bash
COUNTERSIGN_KEYS=<dir> LIVE_DIR=<checkout of the live branch> node scenario.mjs studio
```

It deploys a fresh pair, publishes a fictional auditor's pages on the `live`
branch, and runs every case three times, recording each transaction in
`deploy/scenario-<network>.json`. It is resumable. `reader_votes.mjs` then
collects each Reader read's per-validator votes. The `live` branch holds only
demo pages and is never merged.

## Run the app

```bash
cd client && npm install
cd ../app && npm install
cp .env.example .env.local     # optional: VITE_REOWN_PROJECT_ID
npm run dev                    # http://localhost:5173
npm run build                  # app/dist
```

`VITE_REOWN_PROJECT_ID` enables Reown AppKit (extension wallets, and mobile
wallets over WalletConnect). Get one at dashboard.reown.com and add the
site's domain to the project's allowlist. Without it the app uses the
browser's injected wallet.

## Publish on Vercel

1. Import the repository and set **Root Directory** to `app`. The preset is
   Vite; `app/vercel.json` sets the build and installs `client/` as well.
2. Keep **Include source files outside of the Root Directory** on (the
   default): the app imports `../client`.
3. Add `VITE_REOWN_PROJECT_ID` under **Environment Variables**, and the
   Vercel domain to the Reown project's allowlist. The variable is built into
   the site, so a change takes effect on the next deployment.
