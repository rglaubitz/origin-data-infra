# Technology Stack Documentation

Reference documentation for tools and services used in this project.

---

## Supabase Extensions

| Extension                          | Purpose                    | Docs                                                                                             |
| ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| [Cron](./supabase-cron.md)         | Schedule recurring jobs    | [supabase.com/docs/guides/cron](https://supabase.com/docs/guides/cron)                           |
| [Webhooks](./supabase-webhooks.md) | Real-time HTTP triggers    | [supabase.com/docs/guides/database/webhooks](https://supabase.com/docs/guides/database/webhooks) |
| [GraphQL](./supabase-graphql.md)   | Auto-generated GraphQL API | [supabase.com/docs/guides/graphql](https://supabase.com/docs/guides/graphql)                     |
| [Queues](./supabase-queues.md)     | Durable message queue      | [supabase.com/docs/guides/queues](https://supabase.com/docs/guides/queues)                       |
| [Vault](./supabase-vault.md)       | Encrypted secret storage   | [supabase.com/docs/guides/database/vault](https://supabase.com/docs/guides/database/vault)       |

---

## How These Fit Together

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│  │  Cron   │───▶│ Queues  │───▶│ Edge Fn │───▶│ Webhook │     │
│  │ (sched) │    │ (pgmq)  │    │ (Deno)  │    │ (notify)│     │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘     │
│       │              │              │              │            │
│       └──────────────┴──────────────┴──────────────┘            │
│                          │                                      │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │   Vault     │                               │
│                   │  (secrets)  │                               │
│                   └─────────────┘                               │
│                          │                                      │
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PostgreSQL                             │  │
│  │  transactions │ merchant_rules │ triggers │ RLS          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                          │                                      │
│                          ▼                                      │
│                   ┌─────────────┐                               │
│                   │  GraphQL    │                               │
│                   │   (API)     │                               │
│                   └─────────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Origin Transport Usage

| Component    | Use Case                                  |
| ------------ | ----------------------------------------- |
| **Cron**     | Trigger Sheets sync every 2 min           |
| **Queues**   | Buffer transactions for batch processing  |
| **Webhooks** | Real-time notifications on changes        |
| **Vault**    | Store API keys (Anthropic, Plaid, QB)     |
| **GraphQL**  | Alternative API for frontend/integrations |

---

## Supabase Client Libraries

| Library                                        | Purpose                           | Docs                                                                                          |
| ---------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| [Python Client](./supabase-python.md)          | Database, auth, storage, realtime | [supabase.com/docs/reference/python](https://supabase.com/docs/reference/python/introduction) |
| [Edge Functions](./supabase-edge-functions.md) | Serverless TypeScript/Deno        | [supabase.com/docs/guides/functions](https://supabase.com/docs/guides/functions)              |

---

## Google Cloud Platform

| Service                           | Purpose                   | Docs                                                                |
| --------------------------------- | ------------------------- | ------------------------------------------------------------------- |
| [BigQuery](./gcp-bigquery.md)     | Data warehouse, analytics | [cloud.google.com/bigquery](https://cloud.google.com/bigquery/docs) |
| [Cloud Storage](./gcp-storage.md) | Object storage            | [cloud.google.com/storage](https://cloud.google.com/storage/docs)   |

---

## Google Workspace

| Service                             | Purpose                   | Docs                                                      |
| ----------------------------------- | ------------------------- | --------------------------------------------------------- |
| [Google Sheets](./google-sheets.md) | Spreadsheet API (gspread) | [gspread.readthedocs.io](https://gspread.readthedocs.io/) |

---

## External Integrations

See [RESOURCES.md](../RESOURCES.md) for documentation links to:

- Anthropic (Claude AI)
- Plaid (Banking)
- QuickBooks (Accounting)
- Google Sheets / Apps Script
