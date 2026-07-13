# Como acompanhar os Pull Requests

Orientação para acompanhar as contribuições abertas no repositório upstream
[okjpg/Okamoto-sinal-whatsapp](https://github.com/okjpg/Okamoto-sinal-whatsapp).

## PRs abertos

| PR | Título | Link |
| --- | --- | --- |
| **#1** | Keep-alive Supabase (plano Free) | https://github.com/okjpg/Okamoto-sinal-whatsapp/pull/1 |
| **#2** | Evolution API, IA por tenant, SMTP e operação local | https://github.com/okjpg/Okamoto-sinal-whatsapp/pull/2 |

Branch local correspondente:

- PR #1 → `feat/supabase-daily-heartbeat`
- PR #2 → `feat/melhorias-sinal`

Remotes configurados:

- `origin` → seu fork: `Abel-Odorico/Okamoto-sinal-whatsapp`
- `upstream` → original: `okjpg/Okamoto-sinal-whatsapp`

---

## 1. Pelo navegador

1. Abra os links dos PRs na tabela acima.
2. No repositório upstream, clique em **Watch** → **Custom** → marque **Pull requests**.
3. Você recebe e-mail quando houver comentário, review ou merge.

Para ver todos os PRs que você criou:

https://github.com/pulls

(filtre por **Created**)

---

## 2. Pelo terminal (`gh`)

```bash
# Listar seus PRs no repo original
gh pr list --repo okjpg/Okamoto-sinal-whatsapp --author Abel-Odorico

# Ver status do PR #1
gh pr view 1 --repo okjpg/Okamoto-sinal-whatsapp

# Ver status do PR #2
gh pr view 2 --repo okjpg/Okamoto-sinal-whatsapp

# Ver comentários e reviews
gh pr view 1 --repo okjpg/Okamoto-sinal-whatsapp --comments
```

Acompanhar checks de CI em tempo real:

```bash
gh pr checks 1 --repo okjpg/Okamoto-sinal-whatsapp --watch
```

---

## 3. O que observar em cada PR

| Área | O que significa |
| --- | --- |
| **Conversation** | Comentários do mantenedor ou de outros contribuidores |
| **Files changed** | Diff do que será mergeado; base para pedidos de alteração |
| **Checks** | CI (typecheck, testes) — verde = passou, vermelho = falhou |
| **Review** | **Approve** = ok para merge · **Request changes** = ajustes pedidos · **Comment** = feedback sem bloquear |

---

## 4. Se pedirem mudanças

Corrija na **mesma branch** e faça push — o PR atualiza automaticamente.

**PR #1 (heartbeat):**

```bash
cd "/caminho/para/whats_page"
git checkout feat/supabase-daily-heartbeat
# ... edite os arquivos ...
git add .
git commit -m "fix: responde review do PR #1"
git push origin feat/supabase-daily-heartbeat
```

**PR #2 (melhorias):**

```bash
git checkout feat/melhorias-sinal
# ... edite os arquivos ...
git add .
git commit -m "fix: responde review do PR #2"
git push origin feat/melhorias-sinal
```

Não é necessário abrir um novo PR.

---

## 5. Notificações no GitHub

**Settings** → **Notifications** → configure e-mail e/ou app mobile para:

- Pull request reviews
- Comments on issues and pull requests

---

## 6. Checagens antes de responder a um review

```bash
source scripts/env.sh
pnpm run typecheck
```

Testes da API (exigem Postgres local, não o Supabase do `.env`):

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/sinal \
  pnpm --filter @workspace/api-server run test
```

---

## 7. Depois do merge

Quando um PR for aceito:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

Ou sincronize seu fork pelo GitHub (**Sync fork**) e atualize o clone local.

---

## Resumo

1. Salve os links dos PRs #1 e #2.
2. Ative **Watch** no repositório upstream.
3. Olhe **Conversation** e **Checks** periodicamente.
4. Se houver pedido de mudança: edite, commit, `git push` na mesma branch.
5. Responda comentários na thread do PR no GitHub.
