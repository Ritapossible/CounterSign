// Top up the scenario keys on Studio Next from its faucet (sim_fundAccount).
//   COUNTERSIGN_KEYS=<dir> node probes/fund_studionext.mjs [GEN each]
import { clientFor, accountFor } from "../lib.mjs";
const amount = Number(process.argv[2] || 40);
const c = clientFor("studionext", "principal");
for (const r of ["principal", "vendor", "funder", "challenger", "agent"]) {
  const address = accountFor(r).address;
  await c.request({ method: "sim_fundAccount", params: [address, amount * 1e18] });
  console.log(r, Number(await c.getBalance({ address })) / 1e18);
}
