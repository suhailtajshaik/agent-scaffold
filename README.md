# 🤖 Agent Scaffold

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

## Architecture

```
agent-scaffold/
├── backend/
│   └── src/
│       ├── agents/
│       │   ├── agentFactory.js   ← Core LangGraph agent builder (extend this)
│       │   └── defaultAgent.js   ← System prompt + tool selection
│       ├── tools/
│       │   └── index.js          ← Add your domain tools here
│       ├── memory/
│       │   └── sessionStore.js   ← In-memory sessions (swap for Redis/Mongo)
│       ├── middleware/
│       │   └── index.js          ← Rate limiting, guardrails, logging
│       ├── routes/
│       │   └── agent.js          ← REST + SSE streaming endpoints
│       └── config/
├── frontend/
│   └── src/
│       ├── App.jsx               ← Full chat UI
│       ├── hooks/useAgent.js     ← All chat state logic
│       └── lib/api.js            ← API client (chat + streaming)
├── docker-compose.yml
└── .env.example
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/agent/chat` | Standard chat (returns full response) |
| POST | `/api/agent/stream` | SSE streaming chat |
| GET | `/api/agent/tools` | List available tools |
| GET | `/api/agent/history/:sessionId` | Get session history |
| DELETE | `/api/agent/sessions/:id` | Clear a session |
| GET | `/health` | Health + model info |

### Chat Request
```json
POST /api/agent/chat
{ "message": "What time is it in Tokyo?", "sessionId": "optional-uuid" }
```

### Streaming (SSE Events)
```
event: session   → { sessionId }
event: tool_call → { toolName, args }
event: tool_result → { toolName }
event: text      → { text }
event: done      → { sessionId }
event: error     → { error }
```

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

### Swap Memory Backend (Redis)
```js
// backend/src/memory/sessionStore.js
// Replace Map with ioredis calls — same interface, persistent storage
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

## Built-in Tools

| Tool | Description |
|------|-------------|
| `get_current_datetime` | Current date/time in any timezone |
| `calculator` | Safe math expression evaluator |
| `web_search` | Web search (mock — wire up Tavily/Serper) |
| `data_formatter` | Format data as JSON, markdown table, or CSV |
