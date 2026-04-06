# Agent Scaffold — Dynamic Multi-Agent Framework

A reusable scaffold for building AI agent systems with **LangGraph.js**, **Claude**, and **React**. Create, configure, and manage agents at runtime through the UI or API. No code changes or rebuilds needed.

## Quick Start

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY=sk-ant-...

# 2. Start backend + Redis + JanusGraph (no UI)
docker compose up --build

# 3. Or start with the optional React UI
docker compose --profile ui up --build
```

| Service | URL |
|---------|-----|
| Backend API | http://localhost:3001 |
| Health check | http://localhost:3001/health |
| Frontend (if enabled) | http://localhost:3000 |

A default agent is seeded automatically on first startup. Redis and JanusGraph start alongside the backend with no additional configuration.

## Features

- **Dynamic agent creation** — create, update, clone, and delete agents at runtime via UI or API; stored in Redis (falls back to in-memory)
- **Per-agent tool assignment** — assign specific built-in tools or grant access to all tools per agent
- **Per-agent MCP server management** — connect any [Model Context Protocol](https://modelcontextprotocol.io) server to individual agents at runtime
- **Agent-to-agent delegation** — agents call each other using the `delegate_to_agent` tool with configurable depth limits
- **Cross-instance federation** — agents on different servers communicate via HTTP when `INSTANCE_URL` is configured
- **JanusGraph topology** — relationship graph for agents, tools, MCP servers, and instances with graceful fallback when unavailable
- **Session memory** — full message persistence per session (Redis-backed with in-memory fallback)
- **Scoped state** — `session`, `user`, and `app` scoped key-value storage accessible to agents and via REST
- **Guardrails** — input validation, output filtering, tool call limits, delegation depth limits, and blocked domains
- **Eval harness** — YAML-driven regression testing with `npm run eval`
- **Optional UI** — enable or disable the React frontend per-instance via `ENABLE_UI`

## Architecture

```
                        ┌─────────────────────────────────┐
                        │           Backend (Node.js)      │
                        │                                  │
  Frontend  ──REST──▶  │  AgentCompiler                   │
  (optional)           │    ├── AgentStore (Redis)         │
                        │    ├── Tool resolver              │
  curl / API  ──────▶  │    ├── Per-agent MCP              │
                        │    ├── State tools                │
                        │    └── Delegation tool            │
                        │                                  │
                        │  Agents ◀──delegate──▶ Agents    │
                        │  Agents ──HTTP──▶ Remote agents  │
                        └───────────┬─────────────┬────────┘
                                    │             │
                               Redis            JanusGraph
                          (agent configs,      (relationship
                           sessions, state,     topology)
                           MCP configs)
```

Each incoming request compiles a fresh agent from the stored config. Tool sets, MCP connections, state tools, and delegation context are assembled per-request — no caching that would leave stale agents after a config change.

## Creating Agents

### Via the UI

1. Open the app at http://localhost:3000
2. Click the agent picker dropdown in the header
3. Select **Manage Agents**, then **Create New**
4. Fill in name, description, system prompt, and tool selection
5. Save — the agent is immediately available for chat

### Via the API

```bash
curl -X POST http://localhost:3001/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Research Agent",
    "description": "Specialises in web research and fact-finding",
    "systemPrompt": "You are a research specialist. Search the web thoroughly before answering.",
    "tools": ["web_search", "web_extract", "web_crawl", "deep_research"],
    "model": "claude-sonnet-4-20250514",
    "temperature": 0,
    "isDefault": false
  }'
```

**Response:**
```json
{
  "agent": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Research Agent",
    "status": "active",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### Clone an existing agent

```bash
curl -X POST http://localhost:3001/api/agents/AGENT_ID/clone \
  -H "Content-Type: application/json" \
  -d '{"name": "Research Agent v2"}'
```

## API Reference

### Agent CRUD — `/api/agents`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agents (summary, no system prompt) |
| `GET` | `/api/agents/:id` | Get full agent config including system prompt |
| `POST` | `/api/agents` | Create a new agent |
| `PUT` | `/api/agents/:id` | Full update (all fields required) |
| `PATCH` | `/api/agents/:id` | Partial update (only supplied fields change) |
| `DELETE` | `/api/agents/:id` | Delete agent (cannot delete the default or last agent) |
| `POST` | `/api/agents/:id/clone` | Clone agent with a new name |

### Tool Assignment — `/api/agents/:id/tools` and `/api/tools`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/tools/available` | List all built-in tool names |
| `GET` | `/api/agents/:id/tools` | Get agent's current tool config and MCP tools |
| `PUT` | `/api/agents/:id/tools` | Set agent's tool list (null = all tools, [] = no tools) |

### Per-Agent MCP — `/api/agents/:id/mcp`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents/:id/mcp/servers` | List configured MCP servers and connection status |
| `POST` | `/api/agents/:id/mcp/servers` | Add an MCP server to this agent |
| `DELETE` | `/api/agents/:id/mcp/servers/:name` | Remove an MCP server from this agent |
| `POST` | `/api/agents/:id/mcp/servers/:name/reconnect` | Force-reconnect a specific MCP server |
| `GET` | `/api/agents/:id/mcp/tools` | List tools loaded from this agent's MCP servers |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agent/chat` | Standard chat — returns full response |
| `POST` | `/api/agent/stream` | SSE streaming chat |

**Chat request body:**
```json
{
  "message": "Summarise the latest AI research",
  "sessionId": "optional-uuid",
  "agentId": "optional-agent-id"
}
```

Omit `agentId` to use the default agent. Omit `sessionId` to start a new session.

**Streaming events (SSE):**

| Event | Payload |
|-------|---------|
| `session` | `{ sessionId }` |
| `text` | `{ text }` |
| `tool_call` | `{ toolName, args }` |
| `tool_result` | `{ toolName }` |
| `delegation` | `{ from, to, toName, task }` |
| `done` | `{ sessionId, agentId, agentName }` |
| `error` | `{ error }` |

### Sessions, History, and State

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agent/sessions` | List all active sessions |
| `DELETE` | `/api/agent/sessions/:id` | Clear a session |
| `GET` | `/api/agent/history/:sessionId` | Full message history including tool calls |
| `GET` | `/api/agent/state/app` | All app-level state |
| `GET` | `/api/agent/state/session/:id` | All state for a session |
| `GET` | `/api/agent/state/user` | State for the authenticated user (requires `x-user-id` header) |
| `GET` | `/api/agent/tools` | List all registered tools with descriptions |
| `GET` | `/api/agent/agents` | List agents (legacy endpoint — prefer `/api/agents`) |

### Graph Topology

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/graph/topology` | Full graph: all vertices and edges |
| `GET` | `/api/graph/agent/:id/dependencies` | Tool and delegation targets for one agent |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service status, model info, Redis status, MCP tool count |

## Agent Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique display name, max 100 characters |
| `description` | string | No | Short description shown in the UI and injected into other agents' delegation context |
| `systemPrompt` | string | Yes | Full system prompt for this agent |
| `tools` | `null` \| `string[]` | No | `null` grants all tools; `[]` grants none; `["web_search", ...]` grants specific tools |
| `model` | string | No | Claude model ID — falls back to `MODEL` env var if omitted |
| `temperature` | number | No | LLM temperature — falls back to `TEMPERATURE` env var if omitted |
| `maxTokens` | number | No | Max response tokens — falls back to `MAX_TOKENS` env var if omitted |
| `isDefault` | boolean | No | Whether this agent handles requests with no `agentId` specified |
| `status` | `"active"` \| `"inactive"` | No | Inactive agents reject requests and cannot be delegated to |
| `enableUI` | boolean | No | Whether this agent appears in the UI agent picker |

## Tool System

### Built-in Tools

| Tool | Description |
|------|-------------|
| `web_search` | Web search via Tavily (requires `TAVILY_API_KEY`); falls back gracefully |
| `web_extract` | Extract content from one or more URLs |
| `web_crawl` | Crawl a site to a configurable depth and breadth |
| `deep_research` | Multi-step research combining search, extraction, and synthesis |
| `calculator` | Safe math expression evaluator |
| `data_formatter` | Format data as JSON, markdown table, or CSV |
| `get_current_datetime` | Current date and time in any timezone |
| `get_state` | Read from session, user, or app scoped state |
| `set_state` | Write to session, user, or app scoped state |
| `delete_state` | Delete a key from session, user, or app scoped state |

Assign `tools: null` in the agent config to grant access to all built-in tools. Assign a specific list to restrict the agent.

### Per-Agent MCP Tools

Each agent can connect to independent MCP servers. Connections are persisted to Redis and reconnected automatically on startup.

```bash
# Add a filesystem MCP server to a specific agent
curl -X POST http://localhost:3001/api/agents/AGENT_ID/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "filesystem",
    "config": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }'
```

```bash
# Add an HTTP/SSE MCP server
curl -X POST http://localhost:3001/api/agents/AGENT_ID/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-service",
    "config": {
      "transport": "sse",
      "url": "http://my-mcp-server:8080/sse"
    }
  }'
```

Tools discovered from MCP servers are appended to the agent's base tool set automatically on the next request.

### Adding Custom Tools

```js
// backend/src/tools/myTool.js
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const myTool = tool(
  async ({ query }) => {
    const result = await myService.fetch(query);
    return JSON.stringify(result);
  },
  {
    name: "my_tool",
    description: "Fetch data from my service given a query",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
);
```

Then register it in `backend/src/tools/index.js` by adding it to the `ALL_TOOLS` array. It will immediately be available for assignment to any agent.

## Agent-to-Agent Delegation

When multiple active agents exist, each agent's system prompt is automatically augmented with the list of available agents and their descriptions. Agents decide autonomously when to delegate.

### How It Works

1. Agent A receives a task that suits Agent B better
2. Agent A calls `delegate_to_agent` with the target agent's ID and a task description
3. The framework compiles Agent B with depth incremented by 1
4. Agent B runs the task in a sub-session (does not pollute Agent A's conversation)
5. Agent B's response is returned to Agent A as a tool result
6. Agent A incorporates the result into its final response

The delegation depth limit (default: 3) prevents infinite loops. Each hop increments the depth counter; agents at the ceiling cannot delegate further.

### Example Delegation Workflow

```
User → "Research AI news and write a summary blog post"

Agent A (Orchestrator)
  └── delegate_to_agent(researchAgentId, "Find the top 5 AI stories this week")
        └── Research Agent: calls web_search, web_extract
        └── returns: structured research findings

Agent A
  └── delegate_to_agent(writerAgentId, "Write a blog post based on: [findings]")
        └── Writer Agent: composes post
        └── returns: draft blog post

Agent A: combines and returns final response to user
```

### Streaming Delegation Events

When using `/api/agent/stream`, delegation events are emitted as SSE:

```
event: delegation
data: {"from": "agent-a-id", "to": "agent-b-id", "toName": "Research Agent", "task": "Find..."}
```

## Cross-Instance Federation

Set `INSTANCE_URL` to enable agents to call agents running on other server instances.

```bash
INSTANCE_URL=http://this-server:3001
```

When enabled, agents gain the `call_remote_agent` tool:

```
call_remote_agent(instanceUrl, agentId, task)
```

This sends a standard HTTP request to the remote instance's `/api/agent/chat` endpoint. The remote instance compiles and runs its own agent, then returns the result.

**Example — calling an agent on another server:**

```bash
# Agent on server-1 can now call an agent on server-2 if INSTANCE_URL is set
curl -X POST http://localhost:3001/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Ask the data agent on server-2 to pull the sales report",
    "agentId": "orchestrator-id"
  }'
```

Agents avoid calling themselves (same `instanceUrl` is rejected). Timeout is 60 seconds per remote call.

## JanusGraph

JanusGraph stores the relationship topology of the agent system:

- Agent → Tool (which tools an agent uses)
- Agent → Agent (delegation relationships)
- Agent → MCP (which MCP servers an agent connects to)
- Agent → Instance (which instance an agent lives on)

This enables graph queries such as "what does this agent depend on?" via `GET /api/graph/agent/:id/dependencies`.

**JanusGraph is optional.** When `JANUSGRAPH_URL` is not set or the connection fails, the graph layer enters fallback mode. All topology endpoints return `{ "fallback": true }` and the rest of the system continues operating normally via Redis.

Docker Compose starts JanusGraph automatically. For local development without Docker:

```bash
JANUSGRAPH_URL=ws://localhost:8182/gremlin
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | **required** | Anthropic API key |
| `MODEL` | `claude-sonnet-4-20250514` | Default Claude model for agents that don't specify one |
| `TEMPERATURE` | `0` | Default LLM temperature |
| `MAX_TOKENS` | `4096` | Default max response tokens |
| `BACKEND_PORT` | `3001` | Backend API port |
| `FRONTEND_PORT` | `3000` | Frontend port (when UI profile is active) |
| `NODE_ENV` | `production` | Node environment |
| `REDIS_URL` | *(none)* | Redis connection string — enables persistent storage. Falls back to in-memory when unset. |
| `JANUSGRAPH_URL` | *(none)* | JanusGraph WebSocket URL — enables graph topology. Falls back gracefully when unset. |
| `ENABLE_UI` | `true` | Set to `false` to disable the frontend on this instance |
| `MAX_DELEGATION_DEPTH` | `3` | Maximum hops for agent-to-agent delegation |
| `INSTANCE_URL` | *(none)* | This instance's public URL — enables cross-instance federation via `call_remote_agent` |
| `INSTANCE_ID` | *(auto)* | Unique identifier for this instance; auto-generated if not set |
| `TAVILY_API_KEY` | *(none)* | Tavily API key for `web_search`, `web_extract`, `web_crawl`, and `deep_research` |
| `MCP_SERVERS` | *(none)* | JSON config for global MCP servers loaded at startup (in addition to per-agent MCP) |
| `MAX_MESSAGE_LENGTH` | `10000` | Max characters per incoming user message |
| `MAX_TOOL_CALLS` | `25` | Max tool calls per request |
| `REQUEST_TIMEOUT_MS` | `120000` | Request timeout in milliseconds |
| `MAX_CRAWL_DEPTH` | `3` | Max depth for the `web_crawl` tool |
| `MAX_CRAWL_BREADTH` | `10` | Max links per page for `web_crawl` |
| `MAX_EXTRACT_URLS` | `10` | Max URLs per `web_extract` call |
| `BLOCKED_DOMAINS` | `localhost,127.0.0.1,...` | Comma-separated list of domains blocked from web tools |

## Docker Compose

```
Services:
  backend      — Node.js API server (always started)
  redis        — Redis 7 (always started, health-checked)
  janusgraph   — JanusGraph graph database (always started, health-checked)
  frontend     — React UI (started only with --profile ui)

Volumes:
  redis_data      — Redis AOF persistence
  janusgraph_data — JanusGraph data persistence
```

Backend waits for Redis and JanusGraph to pass health checks before starting. Frontend waits for the backend health check.

**Without UI (API only):**
```bash
docker compose up
```

**With UI:**
```bash
docker compose --profile ui up
```

**Rebuild after code changes:**
```bash
docker compose --profile ui up --build
```

## Using as a Scaffold

This project is designed to be forked and customised. Typical workflow:

1. **Fork the repo** and configure `.env` with your `ANTHROPIC_API_KEY`
2. **Add custom tools** in `backend/src/tools/` and register them in `backend/src/tools/index.js`
3. **Seed your agents** via the API or UI on first startup — they persist in Redis
4. **Deploy multiple instances** for different environments or teams; each instance manages its own agents
5. **Enable federation** with `INSTANCE_URL` so agents on different instances can collaborate

No code changes are needed to create, configure, or swap agents — everything is done through the API or UI. Code changes are only needed when adding new tool implementations.

## Scoped State

Agents and API clients can read and write key-value state at three scopes:

| Scope | Lifetime | Use case |
|-------|----------|----------|
| `session` | Current conversation | Intermediate results, scratchpad data |
| `user` | Permanent per user | Preferences, personal saved data |
| `app` | Permanent global | Shared configuration, counters |

Pass `x-user-id` to unlock user-scoped state:

```bash
curl -H "x-user-id: alice" -X POST http://localhost:3001/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Remember that I prefer Celsius for temperatures"}'
```

Inspect state directly:

```bash
# App-level state
GET http://localhost:3001/api/agent/state/app

# Session state
GET http://localhost:3001/api/agent/state/session/SESSION_ID

# User state (requires x-user-id header)
GET http://localhost:3001/api/agent/state/user
```

## Guardrails

All requests pass through configurable guardrails before reaching the agent:

- **Input validation** — messages are length-checked and sanitised
- **Output filtering** — agent responses are checked before being returned
- **Tool call limits** — `MAX_TOOL_CALLS` prevents runaway tool loops
- **Delegation depth** — `MAX_DELEGATION_DEPTH` caps recursive agent calls
- **Self-delegation prevention** — agents cannot delegate to themselves
- **Domain blocking** — `BLOCKED_DOMAINS` prevents web tools from hitting internal addresses
- **Request timeout** — `REQUEST_TIMEOUT_MS` cancels requests that run too long

## Eval Harness

Run automated tests against the live agent using YAML fixture files:

```bash
cd backend

# Run all fixtures
npm run eval

# Run a specific fixture
npm run eval:fixture calculator-basic
```

Exit code is `0` when all assertions pass, `1` when any fail — suitable for CI pipelines.

**Fixture format** (`backend/evals/fixtures/my-test.yaml`):

```yaml
name: "Research agent uses web search"
description: "Agent calls web_search for current information"
turns:
  - user: "What AI models were released this week?"
    assertions:
      - type: tool_used
        tool: web_search
      - type: response_not_empty
  - user: "Summarise those in bullet points"
    assertions:
      - type: text_contains
        value: "-"
```

**Available assertion types:**

| Type | What it checks |
|------|----------------|
| `text_contains` | Response includes the `value` string |
| `text_matches` | Response matches the regex in `value` |
| `tool_used` | The named tool was called at least once |
| `no_tool_used` | No tools were called |
| `tool_trajectory` | Tools were called in the exact order listed |
| `response_not_empty` | Response text is non-empty |

Multi-turn fixtures share a session, so the agent carries context between turns.

## Session History

The history endpoint returns complete message chains, including tool calls and tool results:

```bash
GET http://localhost:3001/api/agent/history/SESSION_ID
```

```json
{
  "sessionId": "abc-123",
  "messages": [
    { "role": "human", "content": "What is 2 + 2?" },
    { "role": "ai", "content": "", "tool_calls": [{ "name": "calculator", "args": { "expression": "2+2" } }] },
    { "role": "tool", "content": "4", "tool_call_id": "tc_xyz", "tool_name": "calculator" },
    { "role": "ai", "content": "The answer is 4." }
  ]
}
```

Sessions have a 1-hour TTL and are capped at 100 messages. Truncation never splits a tool call/result pair.
