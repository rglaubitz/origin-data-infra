# Supabase Queues (pgmq)

Postgres-native durable message queue with guaranteed delivery.

**Docs:** https://supabase.com/docs/guides/queues

---

## Overview

Supabase Queues is built on the `pgmq` extension:

- Guaranteed message delivery
- Exactly-once processing (within visibility window)
- Durable with optional archival
- Row-level security support
- Dashboard management

---

## Core Concepts

| Concept                | Description                                 |
| ---------------------- | ------------------------------------------- |
| **Queue**              | Named channel for messages                  |
| **Message**            | JSON payload with metadata                  |
| **Visibility Timeout** | Lock period preventing duplicate processing |
| **Archive**            | Historical record of processed messages     |

---

## Managing Queues

### Create a Queue

```sql
SELECT pgmq.create('transaction_processing');
```

### List Queues

```sql
SELECT * FROM pgmq.list_queues();
```

### Delete a Queue

```sql
SELECT pgmq.drop_queue('transaction_processing');
```

---

## Message Operations

### Send a Message

```sql
SELECT pgmq.send(
  'transaction_processing',
  '{"transaction_id": "uuid-here", "action": "categorize"}'::jsonb
);
```

### Send Batch Messages

```sql
SELECT pgmq.send_batch(
  'transaction_processing',
  ARRAY[
    '{"id": "1", "action": "process"}'::jsonb,
    '{"id": "2", "action": "process"}'::jsonb
  ]
);
```

### Read Messages (without removing)

```sql
-- Read up to 10 messages, 30 second visibility timeout
SELECT * FROM pgmq.read('transaction_processing', 30, 10);
```

### Pop Messages (read and remove)

```sql
SELECT * FROM pgmq.pop('transaction_processing');
```

### Delete a Message

```sql
SELECT pgmq.delete('transaction_processing', 12345);  -- message_id
```

### Archive a Message

```sql
SELECT pgmq.archive('transaction_processing', 12345);
```

---

## Use Cases for Origin Transport

1. **Transaction Processing** - Queue new transactions for categorization
2. **Batch Sync** - Queue items for Sheets/QuickBooks sync
3. **Notification Queue** - Async alerts for review items
4. **Retry Logic** - Failed operations with backoff

---

## Edge Function Consumer

```typescript
// sync/edge-functions/process-queue/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Read messages from queue
  const { data: messages } = await supabase.rpc("pgmq_read", {
    queue_name: "transaction_processing",
    vt: 60, // 60 second visibility timeout
    qty: 10,
  });

  for (const msg of messages || []) {
    // Process message
    console.log("Processing:", msg.message);

    // Delete after successful processing
    await supabase.rpc("pgmq_delete", {
      queue_name: "transaction_processing",
      msg_id: msg.msg_id,
    });
  }

  return new Response("OK");
});
```

---

## Dashboard Access

**Supabase Dashboard** → **Integrations** → **Queues**

- Create and manage queues
- View message counts
- Monitor processing

---

_Source: Supabase Docs - pgmq extension_
