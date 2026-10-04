import "dotenv/config";
import { backfillFingerprints } from "../src/lib/googleSheets/backfillFingerprints";

async function main() {
  const result = await backfillFingerprints();
  console.log(`Backfilled Google Sheets fingerprints: scanned=${result.scanned} reanchored=${result.reanchored} alreadyCurrent=${result.alreadyCurrent}`);
  if (result.reanchored > 0) {
    console.log(`${result.reanchored} mapping(s) were re-anchored to the current database fingerprint.`);
  }
  if (result.alreadyCurrent > 0) {
    console.log(`${result.alreadyCurrent} mapping(s) were already on the new fingerprint.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
