# N8N Workflow — Sinal WhatsApp Integration

## Overview

Este workflow recebe mensagens do Uazapi (via webhook) e insere na tabela `whatsapp_messages` do Supabase.

## Pré-requisitos

1. **Supabase Connection** no n8n configurada com:
   - Host: `db.wdrrtdjcxkvepmwlciyx.supabase.co`
   - User: `postgres`
   - Password: Sua senha do banco
   - Database: `postgres`
   - Port: `5432`

2. **Webhook URL do n8n** configurada no Uazapi

## Workflow JSON

Copie o JSON abaixo, vá em n8n → Create New Workflow → Import from clipboard:

```json
{
  "name": "Sinal - Uazapi WhatsApp Webhook",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "whatsapp-webhook",
        "responseMode": "onReceived",
        "options": {}
      },
      "id": "webhook",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [
        250,
        300
      ]
    },
    {
      "parameters": {
        "functionCode": "// Extrai dados do payload Uazapi e mapeia para whatsapp_messages\nconst body = $input.first().json.body;\n\n// Extrai timestamp e converte para ISO string\nconst messageTimestamp = new Date(body.message.messageTimestamp);\n\n// Extrai telefone do sender\nconst senderPhone = body.message.sender_pn.replace('@s.whatsapp.net', '').replace('@lid', '');\nconst contactPhone = body.chat.wa_isGroup ? null : senderPhone;\n\n// Define direção baseado em fromMe\nconst direction = body.message.fromMe ? 'out' : 'in';\n\nreturn [{\n  whatsapp_owner: body.owner,\n  chat_type: body.chat.wa_isGroup ? 'group' : 'private',\n  chat_id: body.chat.wa_chatid,\n  chat_name: body.chat.name,\n  contact_phone: contactPhone,\n  sender_phone: senderPhone,\n  sender_name: body.message.senderName,\n  recipient_phone: body.owner,\n  direction: direction,\n  message_type: body.message.type,\n  message: body.message.text || '',\n  caption: body.message.type !== 'text' ? body.message.content : null,\n  media_url: null,\n  media_mime_type: null,\n  transcription: null,\n  message_id: body.message.messageid,\n  reply_to_message_id: body.message.quoted || null,\n  forwarded: false,\n  reaction: body.message.reaction || null,\n  reacted_to_message_id: null,\n  status: body.message.status || 'received',\n  message_created_at: messageTimestamp.toISOString(),\n  metadata: JSON.stringify({\n    instanceName: body.instanceName,\n    baseUrl: body.BaseUrl,\n    source: body.message.source,\n    wasApi: body.message.wasSentByApi,\n    uazapiToken: body.token\n  })\n}];"
      },
      "id": "transform",
      "name": "Transform Data",\n      "type": "n8n-nodes-base.code",
      "typeVersion": 2,\n      "position": [\n        450,\n        300\n      ],\n      "credentials": {},\n      "continueOnFail": false\n    },\n    {\n      "parameters": {\n        "operation": "executeQuery",\n        "query": "INSERT INTO whatsapp_messages (\n  whatsapp_owner,\n  chat_type,\n  chat_id,\n  chat_name,\n  contact_phone,\n  sender_phone,\n  sender_name,\n  recipient_phone,\n  direction,\n  message_type,\n  message,\n  caption,\n  media_url,\n  media_mime_type,\n  transcription,\n  message_id,\n  reply_to_message_id,\n  forwarded,\n  reaction,\n  reacted_to_message_id,\n  status,\n  message_created_at,\n  metadata\n) VALUES (\n  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,\n  $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,\n  $21, $22, $23\n)\nON CONFLICT (message_id) DO UPDATE SET\n  status = EXCLUDED.status,\n  reaction = EXCLUDED.reaction,\n  metadata = EXCLUDED.metadata;",
        "queryParams": "={{[\n  $('transform').item.json.whatsapp_owner,\n  $('transform').item.json.chat_type,\n  $('transform').item.json.chat_id,\n  $('transform').item.json.chat_name,\n  $('transform').item.json.contact_phone,\n  $('transform').item.json.sender_phone,\n  $('transform').item.json.sender_name,\n  $('transform').item.json.recipient_phone,\n  $('transform').item.json.direction,\n  $('transform').item.json.message_type,\n  $('transform').item.json.message,\n  $('transform').item.json.caption,\n  $('transform').item.json.media_url,\n  $('transform').item.json.media_mime_type,\n  $('transform').item.json.transcription,\n  $('transform').item.json.message_id,\n  $('transform').item.json.reply_to_message_id,\n  $('transform').item.json.forwarded,\n  $('transform').item.json.reaction,\n  $('transform').item.json.reacted_to_message_id,\n  $('transform').item.json.status,\n  $('transform').item.json.message_created_at,\n  $('transform').item.json.metadata\n]}}",
        "nodeCredentialType": "postgres"
      },
      "id": "postgres",
      "name": "Insert WhatsApp Message",\n      "type": "n8n-nodes-base.postgres",
n      "typeVersion": 2.3,\n      "position": [\n        650,\n        300\n      ],\n      "credentials": {\n        "postgres": {\n          "id": \"your-postgres-credential-id\",\n          "name": \"Supabase PostgreSQL\"\n        }\n      },\n      "continueOnFail": true\n    },\n    {\n      "parameters": {\n        \"response\": \"success\"\n      },\n      \"id\": \"response\",\n      \"name\": \"Respond to Webhook\",\n      \"type\": \"n8n-nodes-base.respondToWebhook\",\n      \"typeVersion\": 1,\n      \"position\": [\n        850,\n        300\n      ]\n    }\n  ],\n  \"connections\": {\n    \"webhook\": {\n      \"main\": [\n        [\n          {\n            \"node\": \"transform\",\n            \"type\": \"main\",\n            \"index\": 0\n          }\n        ]\n      ]\n    },\n    \"transform\": {\n      \"main\": [\n        [\n          {\n            \"node\": \"postgres\",\n            \"type\": \"main\",\n            \"index\": 0\n          }\n        ]\n      ]\n    },\n    \"postgres\": {\n      \"main\": [\n        [\n          {\n            \"node\": \"response\",\n            \"type\": \"main\",\n            \"index\": 0\n          }\n        ]\n      ]\n    }\n  }\n}
```

## Passo a Passo de Setup

### 1. Criar Credencial PostgreSQL no n8n

1. Va em **Settings** → **Credentials** → **New**
2. Selecione **PostgreSQL**
3. Preencha:
   - **Hostname:** `db.wdrrtdjcxkvepmwlciyx.supabase.co`
   - **Port:** `5432`
   - **Database:** `postgres`
   - **User:** `postgres`
   - **Password:** `gFM52k?2FiV&ePh`
   - **SSL:** Enable (Supabase requer)
4. Clique **Save**

### 2. Importar Workflow

1. Va em **Workflows** → **Create New** → **Import from File**
2. Cole o JSON acima
3. Clique nos nodes PostgreSQL e selecione a credencial criada no passo 1
4. Teste o workflow com um Webhook Trigger

### 3. Obter URL do Webhook

1. Abra o workflow no n8n
2. Clique no node **Webhook**
3. Copie a URL gerada (vai parecer com `https://seu-n8n.com/webhook/whatsapp-webhook`)
4. Cole essa URL no Uazapi na configuração de webhook

## Testando

1. Envie uma mensagem no WhatsApp (DM ou grupo)
2. Verifique se apareceu no n8n (clique em "Executions")
3. Verifique no Supabase se inseriu na tabela `whatsapp_messages`:
   ```sql
   SELECT * FROM whatsapp_messages ORDER BY message_created_at DESC LIMIT 1;
   ```

## Tratamento de Erros

Se o workflow falhar:

1. **Erro de conexão PostgreSQL:** Verifique as credenciais
2. **Erro de "message_id já existe":** Workflow tem duplicação — é normal (ON CONFLICT faz update)
3. **Erro de timestamp:** Mensagem não foi inserida — verifique o formato

## Campos Opcionais (Para Expandir Depois)

- `media_url` — Será preenchido quando Uazapi enviar URL de mídia
- `transcription` — Para mensagens de áudio
- `reply_to_message_id` — Quando houver reply
- `reaction` — Para reações de emoji

Esses campos podem ser populados com jobs de IA ou webhooks adicionais de `messages_update`.
