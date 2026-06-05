# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## Git Workflow (required)

- The integration branch is **`development`**. Never commit directly to it.
- For **any** change, branch off the latest `development`:
  ```bash
  git checkout development && git pull origin development
  git checkout -b feature/<short-description>
  ```
- Commit work to the feature branch with clear, descriptive messages.
- Push the feature branch and open a **pull request targeting `development`**.
  Do not merge into `development` without review.
- Use short, descriptive branch prefixes: `feature/`, `fix/`, `chore/`, `docs/`.

## Project Overview

Agent Scaffold is a dynamic multi-agent framework built on **LangGraph.js**,
**Claude** (via `@langchain/anthropic`), and an optional **React** frontend.
Agents are created, configured, and managed at runtime through a REST API or
UI — no code changes or rebuilds are needed to add or swap agents.

### Layout

- `backend/` — Node.js (ESM) Express API server.
  - `src/index.js` — app entry: middleware, routes, graceful shutdown, default-agent seeding.
  - `src/agents/` — `agentStore` (Redis-backed, in-memory fallback), `agentFactory`
    (`createAgent`), and `agentCompiler` (`buildRequestAgent` — compiles a fresh
    agent per request: tools + MCP + state tools + delegation + prompt augmentation).
  - `src/tools/` — built-in tools (web search/extract/crawl, deep research, calculator,
    data formatter, datetime, scoped state) plus per-agent MCP, delegation, and
    remote-agent (federation) tools. Register new tools in `src/tools/index.js`.
  - `src/routes/` — agent chat/stream, agent CRUD, tool assignment, per-agent MCP,
    health.
  - `src/memory/` — session + scoped (`session`/`user`/`app`) state stores.
  - `src/guardrails/`, `src/middleware/`, `src/config/` — guardrails, Express
    middleware, and env-driven configuration.
  - `evals/` — YAML-driven eval harness (`npm run eval`).
- `frontend/` — React + Vite UI (optional, gated by `ENABLE_UI` / Docker `--profile ui`).
- `docker-compose.yml` — backend + Redis (+ frontend under the `ui` profile).

### Key Concepts

- **Per-request compilation** — every request rebuilds the agent from stored
  config so changes take effect immediately (no stale cached agents).
- **Delegation** — agents call each other via `delegate_to_agent`, depth-limited
  by `MAX_DELEGATION_DEPTH` (default 3); self-delegation is blocked.
- **Federation** — with `INSTANCE_URL` set, agents gain `call_remote_agent` to
  reach agents on other instances over HTTP.
- **Graceful fallbacks** — Redis (→ in-memory) and Tavily-backed web tools
  all degrade without crashing the system.

### Common Commands

```bash
docker compose up --build              # backend + Redis
docker compose --profile ui up --build # also start the React UI
cd backend && npm run dev              # backend with --watch
cd backend && npm run eval             # run the eval harness
```

See `README.md` for the full API reference, configuration, and architecture details.
