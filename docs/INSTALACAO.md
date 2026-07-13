# Instalação & Configuração

Este guia leva você do zero a uma instância do Sinal rodando. O Sinal é um
monorepo pnpm com um servidor de API em Express e um frontend em React/Vite,
apoiado por um banco PostgreSQL no Supabase e enriquecido por jobs de IA.

> Lembrete: o Sinal **não tem integração ao vivo com o WhatsApp**. Ele lê uma
> tabela read-only `whatsapp_messages` que você popula no Supabase. Veja
> [Configuração do banco](#3-configuração-do-banco).

## 1. Pré-requisitos

- **Node.js 24**
- **pnpm** (o repositório exige pnpm; npm/yarn são bloqueados por um guard de
  preinstall)
- Um projeto **Supabase** (PostgreSQL + Auth)
- Uma **chave de API da OpenAI** (para os jobs de IA)
- Opcional: uma chave da **OpenRouter** para execuções em massa mais baratas, e
  credenciais de **Google OAuth** se você quiser a sincronização de Contatos

### Serviços externos e como obter cada credencial

| Serviço | Para que serve | Como obter |
| --- | --- | --- |
| **Supabase** | Banco PostgreSQL (tabela de origem + tabelas do app) e Auth (login) | Crie um projeto em [supabase.com](https://supabase.com). Em *Project Settings → Database* pegue a connection string do **transaction pooler** (`SUPABASE_DB_URL`). Em *Project Settings → API* pegue a *Project URL* (`SUPABASE_URL`) e a chave **service_role** (`SUPABASE_SERVICE_KEY`). |
| **OpenAI** | Classificação, clustering de tópicos, detecção de menções, análise de contato | Crie uma chave em [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (`OPENAI_API_KEY`). |
| **OpenRouter** (opcional) | Modelos mais baratos (ex.: DeepSeek) para os backfills grandes | Crie uma chave em [openrouter.ai/keys](https://openrouter.ai/keys) (`AI_INTEGRATIONS_OPENROUTER_API_KEY`) e use `CLASSIFY_PROVIDER=openrouter`. |
| **Google OAuth** (opcional) | Sincronizar Contatos via People API | No [Google Cloud Console](https://console.cloud.google.com) crie credenciais OAuth 2.0 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) e habilite a People API. |

## 2. Instalar & configurar o ambiente

```bash
pnpm install
cp .env.example .env
```

Abra o `.env` e preencha os valores. As variáveis obrigatórias são:

| Variável | O que é |
| --- | --- |
| `SUPABASE_DB_URL` | Connection string do Postgres (use a URL do **transaction pooler** do Supabase). `DATABASE_URL` é aceito como fallback. |
| `SUPABASE_URL` | A URL do seu projeto Supabase. |
| `SUPABASE_SERVICE_KEY` | Chave **service_role** do Supabase. Apenas no servidor — ela ignora o RLS. |
| `SESSION_SECRET` | String aleatória para assinar o cookie de sessão (`openssl rand -hex 32`). |
| `WHATSAPP_OWNER` | O id de dono que dá escopo a todas as leituras de `whatsapp_messages`. |
| `OPENAI_API_KEY` | Alimenta os jobs de IA. |
| `PORT` | Porta em que o processo escuta (ambos os apps exigem). |
| `BASE_PATH` | Caminho base em que o app web é servido (`/` localmente). |

Defina também o seu próprio `ADMIN_EMAIL` e `ADMIN_PASSWORD` antes do bootstrap
(ambos são obrigatórios — o script não tem senha padrão). Variáveis opcionais
(provedor de IA, Google OAuth, ajustes de jobs) estão documentadas inline no
`.env.example`.

**O app lê `process.env` diretamente — não há dotenv.** No Replit, defina como
Replit Secrets. Localmente, carregue o `.env` no seu shell antes de rodar
qualquer comando:

```bash
set -a && source .env && set +a
```

## 3. Configuração do banco

### 3a. A tabela de origem (`whatsapp_messages`)

Essa tabela é a **fonte de dados read-only** e **não** é criada nem modificada
pelas migrations do Sinal. Você a fornece. Crie-a no seu banco Supabase e carregue
suas mensagens usando o formato de colunas documentado na
[seção "Fonte de dados" do README](../README.md#fonte-de-dados). Toda leitura é
filtrada por `whatsapp_owner = WHATSAPP_OWNER`, e o enriquecimento faz junção por
`message_id`.

### 3b. Tabelas do app (migrations)

As migrations criam tudo o que o Sinal *possui* (enrichment, topics, mentions,
CRM, tasks, saved, auth/tenancy, Google OAuth). Elas rodam os arquivos SQL em
`lib/db/migrations` em ordem, de forma idempotente (rastreado em uma tabela
`_migrations`):

```bash
pnpm --filter @workspace/scripts run migrate
```

### 3c. Crie seu login de admin

Isso cria (ou atualiza) um único usuário admin via a admin API do Supabase Auth e
o vincula ao tenant do MVP. Usa `ADMIN_EMAIL` / `ADMIN_PASSWORD`:

```bash
pnpm --filter @workspace/scripts run bootstrap-auth
```

Ele imprime o email/senha para login.

### 3d. Sanidade

```bash
pnpm --filter @workspace/scripts run db-stats
```

## 4. Rodar os apps

Cada processo precisa do ambiente carregado e da sua própria `PORT`. Use dois
terminais:

```bash
# Terminal 1 — servidor de API
PORT=8080 pnpm --filter @workspace/api-server run dev

# Terminal 2 — frontend web
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/sinal-web run dev
```

### Como o frontend alcança a API

O frontend chama a API no caminho relativo `/api`. O dev server do Vite **faz
proxy de `/api` para o servidor de API** (padrão `http://localhost:8080`), então,
com os dois processos rodando, basta abrir `http://localhost:5173` e o app web
alcança a API sem configuração extra. Se sua API rodar em outro host ou porta,
defina `API_PROXY_TARGET` (veja `.env.example`). No Replit, o roteador da
aplicação faz esse roteamento.

## 5. Jobs de IA & dados

Rode a partir da raiz do repositório via o pacote `@workspace/scripts`. A maioria
dos jobs é em escala de amostra e resumível (cada lote dá commit), então execuções
longas podem ultrapassar o timeout do shell sem perder progresso.

| Comando | O que faz |
| --- | --- |
| `pnpm --filter @workspace/scripts run db-stats` | Snapshot de saúde dos dados. |
| `pnpm --filter @workspace/scripts run classify-sample` | Classifica uma amostra de mensagens (env: `SAMPLE_SIZE`, `BATCH_SIZE`). |
| `pnpm --filter @workspace/scripts run backfill-contacts` | Popula o CRM a partir dos chats privados. |
| `pnpm --filter @workspace/scripts run build-topics` | Agrupa tópicos enriquecidos em *pautas* nomeadas. |
| `pnpm --filter @workspace/scripts run build-mentions` | Detecta + classifica menções de entidades (env: `MENTION_SAMPLE`). |
| `pnpm --filter @workspace/scripts run refresh-all` | Roda o pipeline de refresh completo na ordem (classificar novos → contatos → tópicos → menções). |

> ⚠️ **Aviso de custo.** `backfill-text-full` classifica o dataset *inteiro*
> contra uma API paga e pode custar de dezenas a baixas centenas de dólares. Não
> rode sem entender o custo — rode os jobs de amostra primeiro. Defina
> `CLASSIFY_PROVIDER=openrouter` para usar um modelo mais barato na execução em
> massa.

## 6. Type checking

```bash
pnpm run typecheck        # checagem completa em todos os pacotes
pnpm run typecheck:libs   # apenas as libs compostas — rode após editar lib/*
```

## 7. Keep-alive diário (plano Free do Supabase)

Projetos **Free** pausam após ~7 dias sem atividade suficiente no banco. A
migration `0013_project_heartbeat.sql` agenda um job `pg_cron` diário que grava
em `project_heartbeats` — roda dentro do Postgres, sem cron externo.

1. Dashboard → **Integrations → Cron** → habilite **pg_cron**
2. Rode `pnpm --filter @workspace/scripts run migrate` (ou execute
   `scripts/sql/setup-daily-heartbeat.sql` no SQL Editor)
3. Ping manual opcional: `pnpm --filter @workspace/scripts run heartbeat`

## Solução de problemas

- **"X environment variable is required"** — você não carregou o `.env` no shell;
  rode `set -a && source .env && set +a` primeiro.
- **"SUPABASE_DB_URL (or DATABASE_URL) must be set"** — a connection string do
  banco está ausente ou não foi exportada.
- **O frontend carrega mas as chamadas de API falham localmente** — garanta que o
  servidor de API está rodando na porta que `API_PROXY_TARGET` aponta (padrão
  8080); o dev server do Vite faz proxy de `/api` para lá.
