# Draftsmith

Draftsmith is an AI blog writing studio. Give it a topic and a multi-step agent decides whether the post needs fresh research, searches the web, plans an outline, writes every section in parallel, adds illustrations, and streams the whole thing to the browser as it is written.

It also ships a streaming writing assistant (chat), one-click rewrite tools, a Markdown editor, and a dashboard with readability and writing-trend analytics.

## Features

- **Agentic blog pipeline** built with LangGraph: router → web research → planner → parallel section writers → assembler
- **Live streaming** over Server-Sent Events: stage updates, the outline, and token-by-token section text
- **Provider fallback** across OpenAI, Anthropic and Groq with cooldowns, rate-limit awareness and model rotation
- **Grounded writing** with Tavily search, recency filtering for news topics and inline citations
- **Illustrations** generated on demand and placed under the most relevant headings
- **Writing assistant** chat with optional document context
- **Rewrite tools**: improve, rephrase, shorten, fix spelling, expand, summarize, headline ideas
- **Dashboard**: Flesch readability, reading time, word counts, 7/14/30-day trend chart, AI editing suggestions
- **Documents** stored locally in the browser with Markdown editor, split preview, import, export and backup
- Light and dark themes, command palette (`Ctrl/⌘ + K`), fully responsive

## Architecture

```
frontend/  Next.js 16 (App Router) · React 19 · Tailwind CSS 4      → Vercel
backend/   FastAPI · LangGraph · LangChain providers · Tavily        → Render
```

```
POST /api/generate ─► router ──► research (optional) ──► planner ──┬─► writer 1 ─┐
                                                                   ├─► writer 2 ─┼─► assemble ─► done
                                                                   └─► writer n ─┘
```

The browser talks to the API directly; every long-running endpoint responds with `text/event-stream` and sends keep-alive pings so proxies never close the connection.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/health` | Service and provider status |
| `POST` | `/api/generate` | Full blog generation (SSE) |
| `POST` | `/api/chat` | Writing assistant (SSE) |
| `POST` | `/api/tools/{action}` | Rewrite tools (SSE) |
| `POST` | `/api/suggestions` | Editing suggestions for a draft (JSON) |

## Running locally

**Backend** (Python 3.11+)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Environment variables are read from `backend/.env` or the repository root `.env`. See `backend/.env.example`. At least one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GROQ_API_KEY` is required; `TAVILY_API_KEY` enables web research.

**Frontend** (Node 20.9+)

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (defaults to `http://localhost:8000`).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROVIDER_ORDER` | `openai,anthropic,groq` | Fallback priority |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Comma-separate several models to rotate |
| `ANTHROPIC_MODEL` | `claude-haiku-5-5` | |
| `GROQ_MODEL` | `openai/gpt-oss-120b,openai/gpt-oss-20b` | Rotated to spread free-tier limits |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `CORS_ORIGIN_REGEX` | `https://[a-z0-9-]+\.vercel\.app\|http://(localhost\|127\.0\.0\.1)(:\d+)?` | Allows Vercel deployments and local development on any port |
| `RATE_LIMIT_GENERATE` | `10` | Blog generations per IP per window |
| `RATE_LIMIT_REQUESTS` | `120` | Other requests per IP per window |
| `RATE_LIMIT_WINDOW` | `600` | Window length in seconds |

## Testing

**Backend** — unit and API tests run against fake providers, so they are fast and need no keys:

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

Set `RUN_LIVE=1` to run the live suite instead, which calls the configured providers for real (structured output, streaming, chat, tools, suggestions and a full generation).

**Frontend**

```bash
cd frontend
npm test                # unit tests (Vitest)
npm run build
npm run test:e2e        # browser tests (Playwright) with a mocked API, desktop and mobile
npm run test:live       # browser tests against a running API with real models
```

Playwright uses the locally installed Chrome; set `PW_CHANNEL` to use another browser.

## Deployment

- **Backend:** Render Blueprint in `render.yaml` (free web service, root directory `backend`).
- **Frontend:** Vercel project with root directory `frontend` and `NEXT_PUBLIC_API_URL` pointing to the Render URL.

## License

MIT
