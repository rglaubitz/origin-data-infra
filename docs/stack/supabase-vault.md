# Supabase Vault (pgsodium)

Application-level encryption for secrets and sensitive data.

**Docs:** https://supabase.com/docs/guides/database/vault

---

## Overview

Vault provides encrypted secret storage in Postgres:

- AEAD encryption (libsodium-based)
- Encryption keys never stored with data
- Transparent column-level encryption
- Persists through backups and replication
- Decryption only via authorized views

---

## How It Works

```
┌─────────────────────────────────────────────┐
│              vault.secrets                  │
│  (encrypted data, safe to expose)           │
└─────────────────────────────────────────────┘
                    │
                    │ Decrypts on-demand
                    ▼
┌─────────────────────────────────────────────┐
│          vault.decrypted_secrets            │
│  (plaintext, restrict access!)              │
└─────────────────────────────────────────────┘
```

---

## Managing Secrets

### Create a Secret

```sql
SELECT vault.create_secret('my-api-key-value');
```

### Create with Name and Description

```sql
SELECT vault.create_secret(
  'sk-ant-abc123...',
  'anthropic_api_key',
  'Claude API key for transaction categorization'
);
```

### View Encrypted Secrets (safe)

```sql
SELECT id, name, description, created_at
FROM vault.secrets;
```

### View Decrypted Secrets (restricted)

```sql
SELECT * FROM vault.decrypted_secrets
WHERE name = 'anthropic_api_key';
```

### Update a Secret

```sql
SELECT vault.update_secret(
  'uuid-of-secret',
  new_secret := 'new-api-key-value',
  new_name := 'anthropic_api_key_v2'
);
```

### Delete a Secret

```sql
DELETE FROM vault.secrets WHERE name = 'old_api_key';
```

---

## Using Secrets in SQL

### In a Function

```sql
CREATE OR REPLACE FUNCTION get_api_key(key_name TEXT)
RETURNS TEXT AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = key_name;
$$ LANGUAGE sql SECURITY DEFINER;
```

### In an Edge Function Call

```sql
SELECT net.http_post(
  url := 'https://api.anthropic.com/v1/messages',
  headers := jsonb_build_object(
    'x-api-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anthropic_api_key'),
    'Content-Type', 'application/json'
  ),
  body := '{"model": "claude-3-sonnet", "messages": [...]}'::jsonb
);
```

---

## Use Cases for Origin Transport

| Secret                     | Purpose                       |
| -------------------------- | ----------------------------- |
| `anthropic_api_key`        | Claude API for categorization |
| `plaid_secret`             | Bank transaction sync         |
| `quickbooks_client_secret` | QB OAuth                      |
| `google_service_account`   | Sheets API access             |

---

## Security Best Practices

### 1. Restrict View Access

```sql
-- Only allow specific roles to decrypt
REVOKE ALL ON vault.decrypted_secrets FROM anon, authenticated;
GRANT SELECT ON vault.decrypted_secrets TO service_role;
```

### 2. Use SECURITY DEFINER Functions

```sql
-- Create wrapper functions that don't expose the view
CREATE FUNCTION call_claude(prompt TEXT)
RETURNS TEXT
SECURITY DEFINER  -- Runs as function owner, not caller
SET search_path = public
AS $$
  -- Function can access vault, caller cannot
$$ LANGUAGE plpgsql;
```

### 3. Audit Access

```sql
-- Log who accesses secrets
CREATE TABLE secret_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name TEXT,
  accessed_by TEXT DEFAULT current_user,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Dashboard Access

**Supabase Dashboard** → **Project Settings** → **Vault**

- Visual secret management
- Add/edit/delete secrets
- No decrypted values shown in UI

---

_Source: Supabase Docs - pgsodium/Vault_
