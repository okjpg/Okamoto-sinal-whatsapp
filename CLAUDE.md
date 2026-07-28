# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sinal** is an AI-powered WhatsApp CRM dashboard that transforms a read-only Supabase table of WhatsApp messages into an actionable cockpit. It enriches messages with AI (OpenAI/OpenRouter), then serves insights via a React frontend.

**Key principle:** "Nenhum número é beco sem saída" — every metric is drillable back to source messages.

## Monorepo Structure

**pnpm workspaces** with three top-level groups:

### `lib/*` — Shared Libraries
- **`@workspace/db`** — Drizzle ORM schema, PostgreSQL pool, migrations (source of truth: `lib/db/src/schema/*`)
- **`@workspace/ai`** — AI logic: classification, clustering (topics), mention detection, contact analysis
- **`@workspace/api-zod`** — Shared Zod schemas for API boundaries
- **`@workspace/api-spec`** — OpenAPI spec + Orval codegen config
- **`@workspace/api-client-react`** — React Query hooks for frontend

### `artifacts/*` — Deployable Apps
- **`@workspace/api-server`** — Express 5 API (handwritten routes, cookie-based sessions, scoped by `tenant_id` + owner)
- **`@workspace/sinal-web`** — React 19 + Vite + Tailwind v4 + shadcn/ui frontend
- `mockup-sandbox`, `sinal-deck` — design reference & presentation

### `scripts/*` — Data & AI Jobs
- Database migrations, auth bootstrap, backfills, topic/mention builders
- Run via `pnpm --filter @workspace/scripts run <job-name>`

## Architecture at a Glance

```
whatsapp_messages (read-only) 
  ↓ [filtered by whatsapp_owner]
AI jobs (classify, cluster, mention detect)
  ↓ [writes enrichment data]
App tables (topics, mentions, crm, tasks, etc.)
  ↓ [scoped by tenant_id + owner]
Express API (/api/*)
  ↓ [HTTP proxy in dev]
React Frontend (http://localhost:5173)
```

## Common Commands

### Development Setup
```bash
pnpm install                              # Install all dependencies
cp .env.example .env                      # Copy env template
set -a && source .env && set +a           # Load env vars (bash/zsh)
```

### Running Locally
```bash
# Terminal 1: API server (port 8080)
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2: Frontend (port 5173, proxies /api to port 8080)
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sinal-web run dev
```

Visit `http://localhost:5173`.

### Migrations & Setup
```bash
pnpm --filter @workspace/scripts run migrate        # Create schema
pnpm --filter @workspace/scripts run bootstrap-auth # Create admin user
```

### Type Checking
```bash
pnpm run typecheck          # Check all packages
pnpm run typecheck:libs     # Check lib/* composition (needed when lib changes)
```

### Testing
```bash
pnpm --filter @workspace/api-server run test    # Vitest, api-server only
```

### Individual Package Tasks
```bash
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/sinal-web run build
```

## Code Patterns & Conventions

### Database & ORM
- Schema defined in `lib/db/src/schema/*` with Drizzle ORM
- **All queries scoped by `tenant_id` AND `owner`** — checked in `artifacts/api-server/src/lib/scope.ts`
- Migrations in `lib/db/migrations/*.sql`, applied lexically
- **NEVER modify `whatsapp_messages` table** — it's read-only from external source

### API Routes
- Handwritten (not codegen) in `artifacts/api-server/src/routes/*`
- Manual sync with frontend client is intentional
- Auth: cookie-based sessions via `src/lib/auth.ts`
- Request logging via pino + pino-http

### Frontend
- **TypeScript everywhere**; React 19 + Vite
- UI: shadcn/ui components with Tailwind v4
- **No emojis** in UI — use lucide-react icons instead
- Routing via wouter (client-side)
- Data fetching via React Query (@tanstack/react-query)

### Zod Imports
- **Use `zod/v4` subpath**, not the root export

### AI Jobs
- Providers: OpenAI (default) or OpenRouter (cheaper for bulk)
- Configurable via `CLASSIFY_PROVIDER`, `CLASSIFY_MODEL` env vars
- Classification, clustering, mention detection, contact analysis in `lib/ai/src/*`

## Environment Variables

**Required:**
- `SUPABASE_DB_URL` — Postgres connection (use transaction pooler URL from Supabase)
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` — Server-side only (never send to browser)
- `SESSION_SECRET` — Random string for cookie signing (use `openssl rand -hex 32`)
- `WHATSAPP_OWNER` — Scopes all reads to this value (typically a phone number)
- `OPENAI_API_KEY` — API key for classification jobs
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` — Initial admin created by bootstrap-auth
- `PORT` — Listening port (8080 for API, 5173 for web in dev)

**Optional:**
- `API_PROXY_TARGET` — Override API proxy destination in dev (default: http://localhost:8080)
- `CLASSIFY_PROVIDER`, `CLASSIFY_MODEL` — AI provider selection
- `AUTO_REFRESH_DISABLED` — Disable auto-refresh scheduler
- `LOG_LEVEL` — Pino log level (default: info)

See `.env.example` for full list with descriptions.

## Important Notes

### Security
- **Never commit `.env`** — it's gitignored; use Replit Secrets in production
- `SUPABASE_SERVICE_KEY` (service_role) **ignores RLS** — server-only, never in browser
- All data reads scoped by both `tenant_id` and `owner` in API queries

### Cost Awareness
- **AI jobs call paid APIs** on potentially large datasets
- **Do NOT run `backfill-text-full`** without understanding cost (can be $10s–$100s)
- Start with sample jobs first; see `docs/INSTALACION.md#5-jobs-de-ia--dados`

### Multi-tenancy & Row-Level Security
- App uses multi-tenant model: `tenant_id` + owner in all app tables
- Supabase RLS policies enforce tenant isolation
- Read `docs/SUPABASE.md` for full security architecture

## Documentation References
- **`docs/INSTALACION.md`** — Full setup, credentials, AI job guide
- **`docs/ARQUITETURA.md`** — Detailed package structure, routes, schema, pipeline
- **`docs/SUPABASE.md`** — Connection pooling, RLS, schema details
- **`CONTRIBUTING.md`** — PR checklist, conventions, cost warnings

## Testing Before PR
1. Run `pnpm run typecheck` (must pass)
2. If you edited `lib/*`, run `pnpm run typecheck:libs` first
3. Run `pnpm --filter @workspace/api-server run test` (if API touched)
4. Ensure `.env` is not committed; keep it gitignored

## Contributing to Upstream

This is a fork of **[okjpg/Okamoto-sinal-whatsapp](https://github.com/okjpg/Okamoto-sinal-whatsapp)** (original project by Bruno Okamoto).

To contribute improvements back to the original project:

1. **Create a feature branch** in your fork: `git checkout -b fix/descriptive-name`
2. **Make and test your changes** locally
3. **Push to your fork**: `git push origin fix/descriptive-name`
4. **Open a Pull Request** on the original repo:
   - Go to https://github.com/okjpg/Okamoto-sinal-whatsapp
   - Click "New Pull Request" → "Compare across forks"
   - Select `okjpg/Okamoto-sinal-whatsapp` (base) ← `iCristiano/dash-whatsapp` (head)
   - Provide clear description of the problem and solution
   - Reference any related issues

**PR Guidelines:**
- Include problem statement and root cause analysis
- Explain the solution and why it was chosen
- Add test results and affected packages
- Keep PRs focused on a single issue
