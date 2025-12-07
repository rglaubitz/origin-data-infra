# Supabase Cron (pg_cron)

Schedule recurring jobs in Postgres using cron syntax.

**Docs:** https://supabase.com/docs/guides/cron

---

## Overview

Supabase Cron enables scheduled recurring jobs directly in Postgres:

- Run SQL snippets or database functions (zero network latency)
- Trigger HTTP requests (e.g., Edge Functions)
- Schedule from every second to once annually

**Limits:** Max 8 concurrent jobs, 10 minute runtime per job

---

## Cron Syntax

```
┌───────────── minute (0-59)
│ ┌───────────── hour (0-23)
│ │ ┌───────────── day of month (1-31)
│ │ │ ┌───────────── month (1-12)
│ │ │ │ ┌───────────── day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

| Expression    | Description        |
| ------------- | ------------------ |
| `* * * * *`   | Every minute       |
| `*/5 * * * *` | Every 5 minutes    |
| `0 * * * *`   | Every hour         |
| `0 0 * * *`   | Daily at midnight  |
| `0 0 * * 0`   | Weekly on Sunday   |
| `0 0 1 * *`   | Monthly on the 1st |

---

## Managing Jobs

### Schedule a SQL Job

```sql
SELECT cron.schedule(
  'cleanup-old-transactions',      -- job name
  '0 3 * * *',                     -- schedule (3 AM daily)
  $$DELETE FROM transactions WHERE created_at < NOW() - INTERVAL '1 year'$$
);
```

### Schedule an HTTP Request (Edge Function)

```sql
SELECT cron.schedule(
  'sync-to-sheets',
  '*/2 * * * *',                   -- every 2 minutes
  $$
  SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/sync-to-sheets',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### View Scheduled Jobs

```sql
SELECT * FROM cron.job;
```

### View Job Run History

```sql
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

### Unschedule a Job

```sql
SELECT cron.unschedule('cleanup-old-transactions');
```

---

## Use Cases for Origin Transport

1. **Sync to Sheets** - Trigger Edge Function every 1-2 minutes
2. **Cleanup** - Archive old transactions monthly
3. **Stats Refresh** - Update merchant rule counts daily
4. **Health Checks** - Ping external services

---

## Dashboard Access

**Supabase Dashboard** → **Integrations** → **Cron**

- Visual job creation
- Monitor run history
- View success/failure status

---

_Source: Supabase Docs - pg_cron extension_
