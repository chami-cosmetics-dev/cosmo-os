import { buildDumpKeyPlan, parseProtectedSystem } from "../../lib/backup/object-key";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1];
}

const system = parseProtectedSystem(arg("--system") ?? "");
const takenRaw = arg("--taken-at");
const takenAt = takenRaw ? new Date(takenRaw) : new Date();
if (Number.isNaN(takenAt.getTime())) {
  console.error("Invalid --taken-at");
  process.exit(1);
}

const format = arg("--format") ?? "env";
const plan = buildDumpKeyPlan(system, takenAt);

if (format === "json") {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

function sh(value: string | null): string {
  if (value == null) return "";
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

process.stdout.write(
  [
    `SYSTEM=${sh(plan.system)}`,
    `TAKEN_AT=${sh(plan.takenAt)}`,
    `DAILY_KEY=${sh(plan.dailyKey)}`,
    `WEEKLY_KEY=${sh(plan.weeklyKey)}`,
    `MONTHLY_KEY=${sh(plan.monthlyKey)}`,
    `STATUS_KEY=${sh(plan.statusKey)}`,
  ].join("\n") + "\n",
);
