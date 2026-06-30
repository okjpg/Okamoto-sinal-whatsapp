# Conexão Supabase — projeto Sinal

Projeto Supabase: **gkwawlsebigybxntvqpr**

| Recurso | URL |
| --- | --- |
| Dashboard | https://supabase.com/dashboard/project/gkwawlsebigybxntvqpr |
| API REST | https://gkwawlsebigybxntvqpr.supabase.co/rest/v1/ |
| API URL (`.env`) | https://gkwawlsebigybxntvqpr.supabase.co |

## 1. MCP no Cursor (já configurado neste projeto)

Arquivo: `.cursor/mcp.json`

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=gkwawlsebigybxntvqpr"
    }
  }
}
```

**Autenticar:** Cursor → Settings → MCP → servidor `supabase` → **Authenticate** (login Supabase no browser).

> O MCP global em `~/.cursor/mcp.json` ainda aponta para outro projeto (`iwwvpwyfzrtppkhvkzuv`). Este projeto usa o MCP local acima.

## 2. Preencher o `.env`

Copie credenciais do dashboard:

1. **Settings → Database → Connection string → Transaction pooler (porta 6543)** → `SUPABASE_DB_URL`
2. **Settings → API → service_role (secret)** → `SUPABASE_SERVICE_KEY`

Depois edite `.env` na raiz e carregue no shell:

```bash
set -a && source .env && set +a
```

## 3. Criar tabela de mensagens (obrigatório)

O Sinal não cria `whatsapp_messages`. Rode no SQL Editor:

```bash
# conteúdo em scripts/sql/create-whatsapp-messages.sql
```

## 4. Migrations e login admin

```bash
pnpm install
pnpm --filter @workspace/scripts run migrate
pnpm --filter @workspace/scripts run bootstrap-auth
pnpm --filter @workspace/scripts run db-stats
```

## 5. Rodar o app

```bash
# Terminal 1
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sinal-web run dev
```

Abra http://localhost:5173

## 6. Agent Skills (opcional)

```bash
npx skills add supabase/agent-skills
```
