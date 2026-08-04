const fs = require("fs");

const report = "C:\\dev\\cosmo-os\\data\\adapt-prod-full-report.json";
const term = "C:\\Users\\Bad-Boy\\.cursor\\projects\\c-dev-cosmo-os\\terminals\\907003.txt";
const intervalMs = 30 * 60 * 1000;

function isImportRunning() {
  if (!fs.existsSync(term)) return false;
  const head = fs.readFileSync(term, "utf8").slice(0, 800);
  return /status:\s*running/.test(head);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  while (true) {
    await sleep(intervalMs);

    if (fs.existsSync(report)) {
      console.log(
        'AGENT_LOOP_WAKE_adapt_import {"prompt":"Adapt import finished — read data/adapt-prod-full-report.json and terminal 907003, summarize results for user, stop loop"}'
      );
      break;
    }

    if (!isImportRunning()) {
      console.log(
        'AGENT_LOOP_WAKE_adapt_import {"prompt":"Adapt import process ended — check terminal 907003 and report file, summarize for user whether success or failure, stop loop"}'
      );
      break;
    }

    console.log(
      'AGENT_LOOP_TICK_adapt_import {"prompt":"Adapt import still running — check progress via scripts/_tmp-adapt-progress.mjs and give brief ETA update"}'
    );
  }
})();
