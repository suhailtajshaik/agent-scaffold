# Agent Scaffold

A production-ready enterprise AI agent scaffold built with **LangGraph.js**, **Claude**, and **React**. Run it with a single `docker compose up`.

## Quick Start

```bash
# 1. Clone / copy this folder
# 2. Set your API key
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Run
docker compose up --build

# Frontend → http://localhost:3000
# Backend  → http://localhost:3001
# Health   → http://localhost:3001/health
```

Redis is included in Docker Compose and starts automatically. Sessions persist across container restarts with no extra configuration.

## Architecture

```
agent-scaffold/
├── backend/
│   └── src/
│       ├── agents/
│       │   ├── agentFactory.js        ← Core LangGraph agent builder (extend this)
│       │   ├── defaultAgent.js        ← System prompt + tool selection
│       │   ├── agentRegistry.js       ← Register / list specialist agents
│       │   ├── supervisorAgent.js     ← Supervisor that routes to specialists
│       │   └── specialists/
│       │       ├── researchAgent.js
│       │       ├── creativeAgent.js
│       │       └── codeAgent.js
│       ├── tools/
│       │   ├── index.js               ← Add your domain tools here
│       │   ├── stateTools.js          ← get_state / set_state / delete_state tools
│       │   └── mcpManager.js          ← MCP server connection lifecycle
│       ├── memory/
│       │   ├── sessionStore.js        ← In-memory session store (fallback)
│       │   ├── redisSessionStore.js   ← Redis-backed session store
│       │   ├── stateStore.js          ← Scoped key-value state (session/user/app)
│       │   └── messageSerializer.js   ← LangChain message serialization helpers
│       ├── middleware/
│       │   └── index.js               ← Rate limiting, guardrails, logging
│       ├── routes/
│       │   └── agent.js               ← REST + SSE streaming endpoints
│       ├── evals/
│       │   ├── runner.js              ← Eval harness entry point
│       │   ├── assertions.js          ← Assertion engine
│       │   ├── report.js              ← Terminal report printer
│       │   └── fixtures/              ← YAML test cases
│       └── config/
├── frontend/
│   └── src/
│       ├── App.jsx                    ← Full chat UI
│       ├── hooks/useAgent.js          ← All chat state logic
│       └── lib/api.js                 ← API client (chat + streaming)
├── docker-compose.yml
└── .env.example
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent/chat` | Standard chat (returns full response) |
| POST | `/api/agent/stream` | SSE streaming chat |
| GET | `/api/agent/tools` | List available tools |
| GET | `/api/agent/agents` | List registered specialist agents |
| GET | `/api/agent/history/:sessionId` | Get session message history |
| GET | `/api/agent/state/:scope/:scopeId?` | Read scoped state directly |
| DELETE | `/api/agent/sessions/:id` | Clear a session |
| GET | `/health` | Health check + model info + MCP status |

### Chat Request
```json
POST /api/agent/chat
{ "message": "What time is it in Tokyo?", "sessionId": "optional-uuid" }
```

### Streaming (SSE Events)
```
event: session      → { sessionId }
event: tool_call    → { toolName, args }
event: tool_result  → { toolName }
event: text         → { text }
event: done         → { sessionId }
event: error        → { error }
```

### Session History Response

The history endpoint returns complete message chains, including tool calls and tool results:

```json
GET /api/agent/history/:sessionId

{
  "sessionId": "abc-123",
  "messages": [
    { "role": "human", "content": "What is 2 + 2?" },
    { "role": "ai",    "content": "", "tool_calls": [{ "name": "calculator", "args": { "expression": "2+2" } }] },
    { "role": "tool",  "content": "4", "tool_call_id": "tc_xyz", "tool_name": "calculator" },
    { "role": "ai",    "content": "The answer is 4." }
  ]
}
```

## Features

### Persistent Sessions (Redis)

Docker Compose starts Redis automatically. When `REDIS_URL` is set, all session history is persisted to Redis so data survives container restarts. When `REDIS_URL` is not set the server falls back to in-memory storage transparently.

```bash
# Already wired in docker-compose.yml — nothing to do.
# For local dev without Docker:
REDIS_URL=redis://localhost:6379
```

Redis data is stored in the `redis_data` named volume. Sessions have a 1-hour TTL and are capped at 100 messages. Truncation never splits a tool call/result pair.

### Full Message Persistence

Every turn is stored completely — user messages, AI reasoning steps, tool calls, and tool results. This gives the agent accurate context across long multi-step conversations and makes session history inspectable via the history API.

### Scoped State Management

The agent has three built-in tools for persisting key-value state across scopes:

| Scope | Lifetime | Use case |
|-------|----------|----------|
| `session` | Current conversation only | Intermediate results, scratchpad |
| `user` | Permanent (per user ID) | Preferences, saved data |
| `app` | Permanent (global) | Shared config, counters |

The agent calls `get_state`, `set_state`, and `delete_state` automatically. User identity comes from the `x-user-id` request header.

```bash
# Pass user identity to unlock user-scoped state
curl -H "x-user-id: alice" -X POST /api/agent/chat \
  -d '{"message": "Remember that I prefer Celsius"}'
```

Inspect state directly without going through the agent:

```bash
GET /api/agent/state/app                    # all app-level state
GET /api/agent/state/session/<sessionId>    # state for one session
GET /api/agent/state/user                   # state for the authenticated user (requires x-user-id header)
```

State storage uses Redis when available and falls back to in-memory.

### MCP Tool Support

Connect the agent to any [Model Context Protocol](https://modelcontextprotocol.io) server. MCP tools are discovered at startup and registered alongside local tools.

**Option 1 — Environment variable:**
```bash
MCP_SERVERS='{"filesystem":{"transport":"stdio","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/tmp"]}}'
```

**Option 2 — Config file** (`backend/mcp.json`):
```json
{
  "filesystem": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
  }
}
```

MCP connections are closed gracefully on server shutdown. The `/health` endpoint reports MCP status and the count of loaded tools.

### Multi-Agent Support

Enable a supervisor-plus-specialists architecture with one env var:

```bash
MULTI_AGENT_ENABLED=true
```

When enabled the supervisor receives every request, decides which specialist fits best, and delegates. Three specialists ship out of the box:

| Specialist | Focus |
|------------|-------|
| `research` | Web search, fact-finding, analysis |
| `creative` | Writing, brainstorming, content |
| `code` | Programming, debugging, technical explanation |

Each specialist runs its own system prompt and has access to all tools. The supervisor responds directly for simple greetings that do not fit any specialist.

List registered specialists at runtime:

```bash
GET /api/agent/agents
# → { "agents": [{ "name": "research", "description": "..." }, ...] }
```

**Adding a custom specialist:**

```js
// backend/src/agents/specialists/mySpecialist.js
import { registerAgent } from "../agentRegistry.js";

registerAgent("my-specialist", {
  description: "Handles questions about X",
  systemPrompt: "You are an expert in X...",
  // tools: [specificTool]  — omit to use all tools
});
```

Then import the file in `backend/src/index.js` before the supervisor is created.

### Eval Harness

Run automated regression tests against the live agent using YAML fixture files.

```bash
cd backend

# Run all fixtures
npm run eval

# Run one fixture by name
npm run eval:fixture calculator-basic
```

Exit code is `0` when all assertions pass and `1` when any fail, making it suitable for CI pipelines.

**Fixture format** (`backend/evals/fixtures/my-test.yaml`):

```yaml
name: "My feature test"
description: "Agent uses the calculator for arithmetic"
turns:
  - user: "What is 42 * 17?"
    assertions:
      - type: tool_used
        tool: calculator
      - type: text_contains
        value: "714"
  - user: "Now divide that result by 3"
    assertions:
      - type: response_not_empty
```

**Available assertion types:**

| Type | What it checks |
|------|----------------|
| `text_contains` | Response text includes `value` |
| `text_matches` | Response text matches regex in `value` |
| `tool_used` | The named tool was called at least once |
| `no_tool_used` | No tools were called |
| `tool_trajectory` | Tools were called in the exact order listed |
| `response_not_empty` | Response text is non-empty |

Each turn in a multi-turn fixture shares a session, so the agent carries context forward between turns.

## Extending the Scaffold

### Add a New Tool
```js
// backend/src/tools/index.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const myTool = tool(
  async ({ param }) => {
    const result = await myService.call(param);
    return JSON.stringify(result);
  },
  {
    name: "my_tool",
    description: "What this tool does",
    schema: z.object({ param: z.string() }),
  }
);

// Add to ALL_TOOLS array at the bottom
export const ALL_TOOLS = [...existingTools, myTool];
```

### Create a Custom Agent
```js
// backend/src/agents/myCustomAgent.js
import { createAgent } from "./agentFactory.js";
import { myTool } from "../tools/index.js";

export const myAgent = createAgent({
  systemPrompt: "You are a specialist in...",
  tools: [myTool],
});
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | **required** | Your Anthropic API key |
| `MODEL` | `claude-sonnet-4-20250514` | Claude model to use |
| `TEMPERATURE` | `0` | LLM temperature (0 = deterministic) |
| `MAX_TOKENS` | `4096` | Max response tokens |
| `FRONTEND_PORT` | `3000` | Frontend port |
| `BACKEND_PORT` | `3001` | Backend API port |
| `REDIS_URL` | *(none)* | Redis connection string — enables persistent sessions |
| `MULTI_AGENT_ENABLED` | `false` | Enable supervisor + specialist routing |
| `MCP_SERVERS` | *(none)* | JSON config for MCP servers |

## Built-in Tools

| Tool | Description |
|------|-------------|
| `get_current_datetime` | Current date/time in any timezone |
| `calculator` | Safe math expression evaluator |
| `web_search` | Web search (mock — wire up Tavily/Serper) |
| `data_formatter` | Format data as JSON, markdown table, or CSV |
| `get_state` | Read a value from session, user, or app state |
| `set_state` | Write a value to session, user, or app state |
| `delete_state` | Delete a value from session, user, or app state |
