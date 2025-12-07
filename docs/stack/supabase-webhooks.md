# Supabase Database Webhooks

Send real-time data to external systems when table events occur.

**Docs:** https://supabase.com/docs/guides/database/webhooks

---

## Overview

Database Webhooks are triggers that send HTTP requests when rows change:

- Built on `pg_net` extension (async, non-blocking)
- Fire AFTER row changes complete
- POST or GET with JSON payload

---

## Supported Events

| Event    | Fires When            |
| -------- | --------------------- |
| `INSERT` | New row added         |
| `UPDATE` | Existing row modified |
| `DELETE` | Row removed           |

---

## Payload Format

```json
{
  "type": "INSERT",
  "table": "transactions",
  "schema": "public",
  "record": {
    "id": "uuid-here",
    "merchant": "PENSKE TRUCK",
    "amount": 150.0,
    "qb_account": "Equipment Expense:Truck Rental"
  },
  "old_record": null
}
```

- `record` - Current row data (INSERT/UPDATE)
- `old_record` - Previous row data (UPDATE/DELETE only)

---

## Creating Webhooks

### Via Dashboard

1. **Database** → **Webhooks** → **Create**
2. Name the webhook
3. Select table and events (INSERT/UPDATE/DELETE)
4. Enter target URL
5. Add headers (e.g., Authorization)

### Via SQL

```sql
CREATE OR REPLACE FUNCTION notify_external_service()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://api.example.com/webhook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_TOKEN'
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_external
AFTER INSERT OR UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION notify_external_service();
```

---

## Use Cases for Origin Transport

1. **Real-time Sheets Sync** - Webhook on transaction INSERT/UPDATE
2. **Slack Notifications** - Alert on high-value transactions
3. **QuickBooks Sync** - Push categorized transactions
4. **Audit Logging** - External audit trail

---

## Monitoring

View webhook call history:

```sql
SELECT * FROM net._http_response
ORDER BY created DESC
LIMIT 20;
```

---

## Local Development

When running Supabase locally with Docker, use `host.docker.internal` instead of `localhost` to reach your host machine.

---

_Source: Supabase Docs - Database Webhooks_
