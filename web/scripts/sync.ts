/**
 * Run a sync from the command line (uses the same code as /api/sync).
 *   npm run sync            # quick
 *   npm run sync -- full    # full, incl. reconciliation against pivot tabs
 */
import { runSync } from "../src/lib/sync/run";

const mode = process.argv[2] === "full" ? "full" : "quick";
runSync({ mode, trigger: "manual", triggeredBy: "cli" })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.status === "failed" ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
