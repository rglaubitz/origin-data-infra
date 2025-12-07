# MCP Configuration Guide

## Connecting Claude to External Services

**Purpose:** Setup guide for MCP (Model Context Protocol) integrations
**Last Updated:** December 2025

---

## Overview

This project uses MCP servers to give Claude access to:

- **Ref Tools** - Documentation search for APIs, SDKs, and libraries
- **Supabase** - SQL queries, migrations, and Edge Functions

---

## Quick Start

The project includes an MCP configuration at `.claude/mcp.json`. Set these environment variables:

```bash
# Required for Ref Tools
REF_API_KEY=your-ref-api-key

# Required for Supabase
SUPABASE_PROJECT_REF=your-project-ref
```

---

## Ref Tools MCP

Ref Tools (https://ref.tools) provides documentation context for coding agents - helping Claude find accurate, up-to-date information about APIs, libraries, and SDKs.

### Configuration

```json
{
  "mcpServers": {
    "ref": {
      "type": "http",
      "url": "https://api.ref.tools/mcp?apiKey=YOUR_API_KEY"
    }
  }
}
```

### Available Tools

| Tool                       | Description                                           |
| -------------------------- | ----------------------------------------------------- |
| `ref_search_documentation` | Search technical docs across public/private resources |
| `ref_read_url`             | Fetch and convert webpage content to markdown         |

### Getting an API Key

1. Visit https://ref.tools/
2. Sign up for an account
3. Generate an API key from the dashboard
4. Add to your `.env` file as `REF_API_KEY`

---

## Supabase MCP

The Supabase MCP allows Claude to:

- Execute SQL queries against your database
- Apply schema migrations
- Deploy Edge Functions
- Manage database objects

---

## Option 1: Official Remote MCP (Recommended)

The simplest setup - uses Supabase's hosted MCP server.

### Configuration

Add to your MCP client config (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

### Scoping to a Specific Project

To limit access to one project:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=your-project-ref"
    }
  }
}
```

**Find your project ref:** Dashboard → Project Settings → General → Reference ID

### Enabling Specific Features

Control which tools Claude can access:

```
https://mcp.supabase.com/mcp?features=database,docs
```

Available feature groups:

- `database` - SQL queries and schema operations
- `docs` - Documentation access
- `functions` - Edge Function deployment
- `storage` - File storage operations

---

## Option 2: PostgREST MCP (Direct API Access)

For direct REST API access without the full MCP:

```json
{
  "mcpServers": {
    "origin-transport": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-postgrest@latest",
        "--apiUrl",
        "https://your-project-ref.supabase.co/rest/v1",
        "--apiKey",
        "your-anon-key",
        "--schema",
        "public"
      ]
    }
  }
}
```

**Get your API credentials:**

1. Dashboard → Project Settings → API
2. Copy "Project URL" and "anon/public" key

---

## Option 3: Local MCP Server (Advanced)

For development or custom modifications:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--project-ref",
        "your-project-ref"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "your-personal-access-token"
      }
    }
  }
}
```

**Get Personal Access Token:**

1. Supabase Dashboard → Account → Access Tokens
2. Generate new token
3. Store securely (shown only once)

---

## Available Tools

### execute_sql

Run standard SQL queries (SELECT, INSERT, UPDATE, DELETE):

```sql
SELECT * FROM transactions WHERE entity = 'Origin';
```

**Note:** Does NOT track migrations. Use for data operations only.

### apply_migration

Apply DDL changes (CREATE, ALTER, DROP):

```sql
CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);
```

**Note:** Changes are tracked in Supabase migration history.

### deploy_edge_function

Deploy serverless functions:

```typescript
export async function onRequest(request: Request) {
  return new Response("Hello from Edge!");
}
```

---

## Sample Claude Queries

Once configured, Claude can execute:

```sql
-- Check if merchant exists (prevents duplicates)
SELECT EXISTS(
  SELECT 1 FROM merchant_rules
  WHERE merchant_normalized = 'lexington law'
);

-- Find transactions by partial merchant match
SELECT * FROM transactions
WHERE merchant ILIKE '%penske%'
ORDER BY date DESC;

-- Get categorization stats
SELECT
  entity,
  COUNT(*) as count,
  SUM(amount) as total
FROM transactions
GROUP BY entity
ORDER BY count DESC;

-- Bulk update by criteria
UPDATE transactions
SET entity = 'Origin'
WHERE merchant ILIKE '%kenworth%'
AND entity = 'NEEDS REVIEW';

-- Insert new merchant rule
INSERT INTO merchant_rules (merchant, entity_default, origin_qb_account)
VALUES ('New Merchant', 'Origin', 'Equipment Expense:Repair & Maintenance');

-- Find duplicates
SELECT merchant, COUNT(*)
FROM merchant_rules
GROUP BY LOWER(TRIM(merchant))
HAVING COUNT(*) > 1;
```

---

## Security Best Practices

### 1. Use Project Scoping

Always scope to a specific project in production:

```
?project_ref=your-project-ref
```

### 2. Limit Feature Access

Only enable needed features:

```
?features=database
```

### 3. Use Service Role Key Sparingly

The `service_role` key bypasses RLS. Prefer `anon` key when possible.

### 4. Review Query Logs

Monitor queries in Supabase Dashboard → Logs → Postgres

---

## Troubleshooting

### "Permission denied" errors

- Check API key permissions
- Verify RLS policies allow the operation
- Try with `service_role` key to isolate RLS issues

### "Connection refused" errors

- Verify project ref is correct
- Check if project is paused (free tier)
- Verify network connectivity

### Slow queries

- Check for missing indexes
- Use `EXPLAIN ANALYZE` to debug:

```sql
EXPLAIN ANALYZE SELECT * FROM transactions WHERE merchant ILIKE '%test%';
```

---

## Environment Setup for Origin Transport

### Recommended Configuration

```json
{
  "mcpServers": {
    "origin-supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&features=database"
    }
  }
}
```

### Required Tables

- `merchant_rules` - Merchant to QB account mappings
- `transactions` - All transactions with auto-computed QB accounts

### Required Triggers

- `trg_auto_qb_account` - Auto-assigns QB account based on entity + merchant

---

_Source: Context7 - supabase-community/supabase-mcp_
