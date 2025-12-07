# Origin Transport Data Infrastructure

PostgreSQL query layer for Claude AI with two-way Google Sheets sync.

## Problem Solved

Google Sheets MCP cannot search, filter, or check for duplicates. This causes:

- Duplicate merchant rules
- Slow categorization (45+ min for 500 txns)
- Wasted tokens scanning entire ranges

## Solution

```
┌─────────────────┐                      ┌─────────────────┐
│  GOOGLE SHEETS  │                      │    SUPABASE     │
│   (Team edits)  │                      │  (Claude edits) │
└────────┬────────┘                      └────────┬────────┘
         │                                        │
         │ Apps Script                            │ Triggers set
         │ onEdit (~1-2s)                         │ sheets_synced_at = NULL
         ▼                                        ▼
┌─────────────────┐                      ┌─────────────────┐
│  APPS SCRIPT    │───── REST API ──────►│  SUPABASE API   │
└─────────────────┘                      └────────┬────────┘
                                                  │
         ┌────────────────────────────────────────┘
         │ Edge Function cron (every 1-2 min)
         ▼
┌─────────────────┐
│  EDGE FUNCTION  │───── Sheets API ────► Updates Sheet
└─────────────────┘
```

## Key Features

- **Full SQL queries** - Search, filter, aggregate, bulk update
- **Auto QB account assignment** - Triggers compute based on merchant + entity
- **Two-way sync** - Team edits in Sheets, Claude queries via SQL
- **Zero duplicates** - `EXISTS` checks before inserts
- **No vendor lock-in** - Custom sync using free-tier services

## Sync Timing

| Direction         | Method             | Delay             |
| ----------------- | ------------------ | ----------------- |
| Sheets → Supabase | Apps Script onEdit | ~1-2 seconds      |
| Supabase → Sheets | Edge Function cron | Up to 1-2 minutes |

## Quick Start

### 1. Create Supabase Project

- Go to [supabase.com](https://supabase.com)
- Create new project
- Note your project ref

### 2. Run Database Setup

Execute SQL files in order in Supabase SQL Editor:

```bash
database/schema/01_tables.sql
database/schema/02_indexes.sql
database/triggers/auto_assign_qb.sql
database/triggers/merchant_stats.sql
database/triggers/cascade_rules.sql
database/triggers/mark_sheets_dirty.sql
```

### 3. Configure Two-Way Sync

See [Sync Setup Guide](docs/sync-setup.md) for:

- Google Apps Script deployment (Sheets → Supabase)
- Supabase Edge Function setup (Supabase → Sheets)
- GCP Service Account configuration

### 4. Enable Claude MCP

Add to your MCP config:

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

## Project Structure

```
origin-data-infra/
├── docs/                    # Setup guides
│   ├── PRD.md              # Engineering requirements
│   ├── sync-setup.md       # Two-way sync configuration
│   └── mcp-configuration.md
├── database/
│   ├── schema/             # Tables & indexes
│   ├── triggers/           # Auto-compute functions
│   ├── seed/               # Sample data
│   └── migrations/         # Schema changes
├── sync/
│   ├── apps-script/        # Google Apps Script (Sheets → Supabase)
│   └── edge-functions/     # Supabase Edge Functions (Supabase → Sheets)
├── scripts/                # Utility queries
└── .github/                # Issue templates
```

## Sample Claude Queries

```sql
-- Check merchant exists (prevents duplicates)
SELECT EXISTS(SELECT 1 FROM merchant_rules WHERE merchant_normalized = 'lexington law');

-- Bulk categorize
UPDATE transactions SET entity = 'Origin' WHERE merchant ILIKE '%kenworth%';

-- Stats
SELECT entity, COUNT(*), SUM(amount) FROM transactions GROUP BY entity;
```

## Dependencies

| Service             | Cost | Purpose                              |
| ------------------- | ---- | ------------------------------------ |
| Supabase            | Free | PostgreSQL database + Edge Functions |
| Google Sheets       | Free | Team interface                       |
| Google Apps Script  | Free | Sheets → Supabase sync               |
| GCP Service Account | Free | Sheets API auth                      |

**Total cost: $0/month** (all free tier)

## Documentation

- [Engineering PRD](docs/PRD.md)
- [Sync Setup Guide](docs/sync-setup.md)
- [MCP Configuration](docs/mcp-configuration.md)
- [Triggers Reference](docs/triggers-reference.md)

## Success Metrics

| Metric              | Before      | After    |
| ------------------- | ----------- | -------- |
| Duplicate rules     | Frequent    | Zero     |
| Categorize 500 txns | 45+ min     | <10 min  |
| Query capability    | Pull & scan | Full SQL |
| Sync cost           | $150+/mo    | $0/mo    |
