// evals/report.js
// Report generator for eval run results

// ── ANSI color helpers ───────────────────────────────────────────────────────
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";

function green(str) { return `${GREEN}${str}${RESET}`; }
function red(str) { return `${RED}${str}${RESET}`; }
function yellow(str) { return `${YELLOW}${str}${RESET}`; }
function cyan(str) { return `${CYAN}${str}${RESET}`; }
function bold(str) { return `${BOLD}${str}${RESET}`; }
function dim(str) { return `${DIM}${str}${RESET}`; }

/**
 * Pad a string to a given width (left-aligned).
 * @param {string} str
 * @param {number} width
 */
function padEnd(str, width) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI for length calc
  const pad = Math.max(0, width - visible.length);
  return str + " ".repeat(pad);
}

/**
 * Generate and print a summary report for all fixture results.
 *
 * @param {Array<{
 *   fixtureName: string,
 *   description: string,
 *   turns: Array<{
 *     userMessage: string,
 *     assertionResults: Array<{ pass: boolean, message: string, assertionType: string }>,
 *     durationMs: number,
 *     error?: string
 *   }>,
 *   totalDurationMs: number
 * }>} results
 */
export function generateReport(results) {
  console.log("\n" + bold(cyan("━".repeat(70))));
  console.log(bold(cyan("  EVAL REPORT")));
  console.log(bold(cyan("━".repeat(70))));

  if (!results || results.length === 0) {
    console.log(yellow("  No fixtures were run."));
    console.log("");
    return;
  }

  // ── Column headers ──────────────────────────────────────────────────────
  const COL_NAME   = 28;
  const COL_TURNS  = 7;
  const COL_ASSERTS = 9;
  const COL_PASS   = 7;
  const COL_FAIL   = 7;
  const COL_DUR    = 10;

  const header = [
    padEnd(bold("Fixture"),     COL_NAME),
    padEnd(bold("Turns"),       COL_TURNS),
    padEnd(bold("Asserts"),     COL_ASSERTS),
    padEnd(bold("Pass"),        COL_PASS),
    padEnd(bold("Fail"),        COL_FAIL),
    padEnd(bold("Duration"),    COL_DUR),
  ].join("  ");

  console.log("\n  " + header);
  console.log("  " + dim("─".repeat(72)));

  let totalTurns = 0;
  let totalAssertions = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  for (const fixture of results) {
    const fixtureAssertions = fixture.turns.flatMap((t) => t.assertionResults || []);
    const fixturePassed = fixtureAssertions.filter((a) => a.pass).length;
    const fixtureFailed = fixtureAssertions.length - fixturePassed;
    const fixtureStatus = fixtureFailed === 0 ? green("PASS") : red("FAIL");

    totalTurns      += fixture.turns.length;
    totalAssertions += fixtureAssertions.length;
    totalPassed     += fixturePassed;
    totalFailed     += fixtureFailed;
    totalDuration   += fixture.totalDurationMs || 0;

    const durationStr = `${((fixture.totalDurationMs || 0) / 1000).toFixed(2)}s`;

    const row = [
      padEnd(`${fixtureStatus} ${fixture.fixtureName}`, COL_NAME + 7), // +7 for ANSI codes
      padEnd(String(fixture.turns.length), COL_TURNS),
      padEnd(String(fixtureAssertions.length), COL_ASSERTS),
      padEnd(fixturePassed > 0 ? green(String(fixturePassed)) : dim("0"), COL_PASS + 7),
      padEnd(fixtureFailed > 0 ? red(String(fixtureFailed))   : dim("0"), COL_FAIL + 7),
      padEnd(dim(durationStr), COL_DUR + 4),
    ].join("  ");

    console.log("  " + row);

    // Print failed assertion details indented under the fixture
    for (const [turnIdx, turn] of fixture.turns.entries()) {
      if (turn.error) {
        console.log(`      ${red("✗")} Turn ${turnIdx + 1} error: ${red(turn.error)}`);
        continue;
      }

      for (const result of (turn.assertionResults || [])) {
        if (!result.pass) {
          console.log(`      ${red("✗")} [turn ${turnIdx + 1}] ${dim(result.assertionType)}: ${result.message}`);
        }
      }
    }
  }

  // ── Summary footer ──────────────────────────────────────────────────────
  console.log("  " + dim("─".repeat(72)));

  const overallStatus = totalFailed === 0
    ? bold(green("ALL PASSED"))
    : bold(red("SOME FAILED"));

  const summaryRow = [
    padEnd(bold("TOTAL"), COL_NAME),
    padEnd(String(totalTurns), COL_TURNS),
    padEnd(String(totalAssertions), COL_ASSERTS),
    padEnd(bold(green(String(totalPassed))), COL_PASS + 7),
    padEnd(totalFailed > 0 ? bold(red(String(totalFailed))) : dim("0"), COL_FAIL + 7),
    padEnd(dim(`${(totalDuration / 1000).toFixed(2)}s`), COL_DUR + 4),
  ].join("  ");

  console.log("  " + summaryRow);
  console.log(bold(cyan("━".repeat(70))));
  console.log(`  ${overallStatus}  —  ${totalPassed}/${totalAssertions} assertions passed across ${results.length} fixture(s)`);
  console.log(bold(cyan("━".repeat(70))) + "\n");
}
