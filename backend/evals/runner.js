#!/usr/bin/env node
// evals/runner.js
// Main eval runner — invoke with: node evals/runner.js [--fixture <name>]

import dotenv from "dotenv";
dotenv.config();

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";
import yaml from "js-yaml";

import { validateConfig } from "../src/config/index.js";
import { buildRequestAgent } from "../src/agents/agentCompiler.js";
import { agentStore } from "../src/agents/agentStore.js";
import { runAgent } from "../src/agents/agentFactory.js";
import { runAssertion } from "./assertions.js";
import { generateReport } from "./report.js";

// Note: MCP tools are not loaded in the eval runner.
// Evals test the built-in tool set only.

// ── ANSI helpers ─────────────────────────────────────────────────────────────
const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BLUE   = "\x1b[34m";

const green  = (s) => `${GREEN}${s}${RESET}`;
const red    = (s) => `${RED}${s}${RESET}`;
const yellow = (s) => `${YELLOW}${s}${RESET}`;
const cyan   = (s) => `${CYAN}${s}${RESET}`;
const bold   = (s) => `${BOLD}${s}${RESET}`;
const dim    = (s) => `${DIM}${s}${RESET}`;
const blue   = (s) => `${BLUE}${s}${RESET}`;

// ── Directory resolution ─────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const FIXTURES_DIR = join(__dirname, "fixtures");

// ── CLI argument parsing ─────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { fixture: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--fixture" && argv[i + 1]) {
      args.fixture = argv[i + 1];
      i++;
    }
  }
  return args;
}

// ── YAML fixture loader ──────────────────────────────────────────────────────
function loadFixtures(fixtureFilter) {
  let files;
  try {
    files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch (err) {
    console.error(red(`Failed to read fixtures directory: ${FIXTURES_DIR}`));
    console.error(red(err.message));
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn(yellow("No .yaml fixture files found in " + FIXTURES_DIR));
    return [];
  }

  if (fixtureFilter) {
    const normalized = fixtureFilter.endsWith(".yaml") || fixtureFilter.endsWith(".yml")
      ? fixtureFilter
      : `${fixtureFilter}.yaml`;

    files = files.filter(
      (f) => f === normalized || f === fixtureFilter
    );

    if (files.length === 0) {
      console.error(red(`No fixture found matching: "${fixtureFilter}"`));
      console.error(dim(`Available fixtures: ${readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".yaml")).join(", ")}`));
      process.exit(1);
    }
  }

  return files.map((file) => {
    const filePath = join(FIXTURES_DIR, file);
    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = yaml.load(raw);
      return { file, filePath, ...parsed };
    } catch (err) {
      console.error(red(`Failed to parse fixture "${file}": ${err.message}`));
      process.exit(1);
    }
  });
}

// ── Single fixture runner ────────────────────────────────────────────────────
async function runFixture(fixture, agent) {
  const fixtureName = fixture.name || basename(fixture.file, ".yaml");
  const startTime   = Date.now();

  console.log("\n" + bold(cyan(`▶ Fixture: ${fixtureName}`)));
  if (fixture.description) {
    console.log(dim(`  ${fixture.description}`));
  }

  const sessionId = uuidv4();
  const turnResults = [];

  if (!Array.isArray(fixture.turns) || fixture.turns.length === 0) {
    console.warn(yellow("  No turns defined in this fixture — skipping."));
    return {
      fixtureName,
      description: fixture.description || "",
      turns: [],
      totalDurationMs: 0,
    };
  }

  for (const [turnIdx, turn] of fixture.turns.entries()) {
    const turnLabel = `Turn ${turnIdx + 1}`;
    const userMsg   = turn.user || "";

    console.log(`\n  ${bold(blue(turnLabel))}: ${dim(`"${userMsg.slice(0, 80)}${userMsg.length > 80 ? "…" : ""}"`)}` );

    let response = null;
    let turnError = null;

    try {
      response = await runAgent({
        agent,
        sessionId,
        userMessage: userMsg,
      });

      const toolList = response.toolsUsed.length
        ? dim(`[tools: ${response.toolsUsed.join(", ")}]`)
        : dim("[no tools]");
      console.log(`    ${dim(`↳ ${response.durationMs}ms`)} ${toolList}`);
    } catch (err) {
      turnError = err.message || String(err);
      console.log(`    ${red("✗ Agent error:")} ${red(turnError)}`);
    }

    // Run assertions
    const assertionResults = [];
    const assertions = Array.isArray(turn.assertions) ? turn.assertions : [];

    for (const assertion of assertions) {
      let result;
      if (turnError) {
        result = {
          pass: false,
          message: `Skipped — agent error: ${turnError}`,
          assertionType: assertion.type,
        };
      } else {
        try {
          const raw = runAssertion(assertion, response);
          result = { ...raw, assertionType: assertion.type };
        } catch (assertErr) {
          result = {
            pass: false,
            message: `Assertion threw an error: ${assertErr.message}`,
            assertionType: assertion.type,
          };
        }
      }

      assertionResults.push(result);

      const icon   = result.pass ? green("✓") : red("✗");
      const label  = dim(result.assertionType);
      const detail = result.pass ? dim(result.message) : red(result.message);
      console.log(`    ${icon} ${label}: ${detail}`);
    }

    turnResults.push({
      userMessage: userMsg,
      response,
      assertionResults,
      durationMs: response?.durationMs ?? 0,
      error: turnError,
    });
  }

  return {
    fixtureName,
    description: fixture.description || "",
    turns: turnResults,
    totalDurationMs: Date.now() - startTime,
  };
}

// ── Main entrypoint ──────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  // Validate API key is present before doing anything else
  try {
    validateConfig();
  } catch (err) {
    console.error(red(`\nConfiguration error: ${err.message}`));
    console.error(dim("Set ANTHROPIC_API_KEY in your environment or backend/.env file."));
    process.exit(1);
  }

  console.log(bold(cyan("\n━".repeat(50))));
  console.log(bold(cyan("  AGENT EVAL RUNNER")));
  console.log(bold(cyan("━".repeat(50))));

  // Load fixtures
  const fixtures = loadFixtures(args.fixture);
  console.log(dim(`\n  Loaded ${fixtures.length} fixture(s) from ${FIXTURES_DIR}`));

  // Build agent once — reused across all fixtures
  let agent;
  try {
    await agentStore.seedDefault();
    const { agent: compiledAgent } = await buildRequestAgent(null, uuidv4(), null);
    agent = compiledAgent;
  } catch (err) {
    console.error(red(`\nFailed to initialize agent: ${err.message}`));
    process.exit(1);
  }

  // Run all fixtures
  const allResults = [];
  for (const fixture of fixtures) {
    const result = await runFixture(fixture, agent);
    allResults.push(result);
  }

  // Print report
  generateReport(allResults);

  // Determine exit code
  const anyFailed = allResults.some((fixture) =>
    fixture.turns.some(
      (turn) =>
        turn.error ||
        (turn.assertionResults || []).some((a) => !a.pass)
    )
  );

  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error(red(`\nUnhandled error in eval runner: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
