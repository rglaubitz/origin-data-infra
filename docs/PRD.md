# Engineering PRD: Origin Transport Data Infrastructure

## Supabase + Custom Sync + Google Sheets

**Version:** 3.0
**Owner:** G
**Date:** December 7, 2025
**Status:** DRAFT

---

## 1. Executive Summary

### The Problem (One Sentence)

The Google Sheets MCP cannot search, filter, or check for duplicates—Claude must pull entire ranges and scan manually, causing duplicate entries, wasted tokens, and slow workflows.

### The Solution (One Sentence)

Add PostgreSQL (Supabase) as a query layer with custom two-way sync (Apps Script + Edge Functions) to Google Sheets, giving Claude full SQL power while keeping Sheets as the team interface.

### Success Metrics

| Metric                      | Current     | Target   |
| --------------------------- | ----------- | -------- |
| Duplicate merchant rules    | Frequent    | Zero     |
| Time to categorize 500 txns | 45+ min     | <10 min  |
| Query capability            | Pull & scan | Full SQL |
| Token waste per operation   | High        | Minimal  |

---

## 2. Problem Statement

### What Claude Can Do Today (Google Sheets MCP)

```
✅ Read range A1:H100
✅ Write to cells
✅ List sheets
```

### What Claude Cannot Do

```
❌ Search: "Find rows where merchant = 'Lexington Law'"
❌ Filter: "Get all transactions where entity = 'Personal'"
❌ Exists check: "Does this merchant already have a rule?"
❌ Aggregate: "Count transactions by entity"
❌ Conditional update: "Update all rows where X = Y"
```

### Real-World Consequence

```
Claude created duplicate "Lexington Law" entries because it couldn't
check if the merchant already existed before inserting a new row.
```

### Research Findings (Completed)

We exhaustively researched alternatives:

| Approach                    | Finding                                                 |
| --------------------------- | ------------------------------------------------------- |
| Google Sheets REST API      | DataFilter only filters by RANGE, not VALUE             |
| Existing MCPs (5+ reviewed) | ALL have same limitation—no search/filter               |
| gspread find()              | Downloads everything first, then filters locally        |
| Apps Script TextFinder      | Only true server-side search, but requires custom build |
| SQL conversion (PostgreSQL) | Full query power—this is the enterprise pattern         |

**Conclusion:** SQL layer is the proven solution. Apps Script is niche. All other MCPs have identical limitations.

---

## 3. Solution Architecture

### High-Level Flow

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

         │
         │ Claude queries via SQL
         ▼
┌─────────────────┐
│  SUPABASE MCP   │
│   (Official)    │
└─────────────────┘
```

### Why This Stack

| Component          | Why                                                              |
| ------------------ | ---------------------------------------------------------------- |
| **Supabase**       | Official MCP exists, free tier sufficient, PostgreSQL = full SQL |
| **Apps Script**    | Native to Sheets, instant onEdit triggers, free                  |
| **Edge Functions** | Serverless, cron-scheduled, free tier                            |
| **Google Sheets**  | Team already uses it, no retraining needed                       |

### What Changes for Each User

| User         | Before                     | After                      |
| ------------ | -------------------------- | -------------------------- |
| **Claude**   | Pull ranges, scan manually | Full SQL queries           |
| **Team**     | Edit in Sheets             | Edit in Sheets (unchanged) |
| **Formulas** | In Sheets (VLOOKUP chains) | In Supabase (triggers)     |

---

## 4. Database Schema

### Table: merchant_rules

```sql
CREATE TABLE merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant TEXT NOT NULL UNIQUE,
  merchant_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(merchant))) STORED,
  entity_default TEXT DEFAULT 'NEEDS REVIEW',
  origin_qb_account TEXT,
  openhaul_qb_account TEXT,
  personal_qb_account TEXT,
  category TEXT,
  notes TEXT,
  txn_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_merchant_normalized ON merchant_rules(merchant_normalized);
```

### Table: transactions

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  merchant TEXT,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  entity TEXT DEFAULT 'NEEDS REVIEW',
  qb_account TEXT,  -- Computed by trigger
  status TEXT DEFAULT '⚠️',
  source_account TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_entity CHECK (
    entity IN ('Origin', 'OpenHaul', 'Personal', 'NEEDS REVIEW')
  )
);

CREATE INDEX idx_txn_merchant ON transactions(LOWER(merchant));
CREATE INDEX idx_txn_entity ON transactions(entity);
CREATE INDEX idx_txn_status ON transactions(status);
```

### Trigger: Auto-Assign QB Account

```sql
CREATE OR REPLACE FUNCTION auto_assign_qb_account()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
BEGIN
  -- Lookup merchant rule
  SELECT * INTO rule FROM merchant_rules
  WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));

  IF FOUND THEN
    -- Assign QB account based on entity
    NEW.qb_account := CASE NEW.entity
      WHEN 'Origin' THEN rule.origin_qb_account
      WHEN 'OpenHaul' THEN rule.openhaul_qb_account
      WHEN 'Personal' THEN rule.personal_qb_account
      ELSE 'NEEDS ASSIGNMENT'
    END;

    -- Update status
    NEW.status := CASE
      WHEN NEW.qb_account IS NOT NULL AND NEW.qb_account != 'N/A'
      THEN '✓' ELSE '⚠️'
    END;
  ELSE
    NEW.qb_account := 'UNKNOWN MERCHANT';
    NEW.status := '⚠️';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_qb_account
  BEFORE INSERT OR UPDATE OF merchant, entity ON transactions
  FOR EACH ROW EXECUTE FUNCTION auto_assign_qb_account();
```

---

## 5. Custom Sync Configuration

### Sync Timing

| Direction         | Method             | Delay           |
| ----------------- | ------------------ | --------------- |
| Sheets → Supabase | Apps Script onEdit | ~1-2 seconds    |
| Supabase → Sheets | Edge Function cron | Up to 2 minutes |

### Sync Direction Matrix

**Team edits in Sheets (Apps Script syncs to Supabase):**
| Column | Editable | Notes |
|--------|----------|-------|
| entity | ✅ Yes | Team assigns entity |
| notes | ✅ Yes | Team adds notes |
| merchant (rules) | ✅ Yes | Team can add/edit rules |
| QB account mappings | ✅ Yes | Team sets mappings |

**Computed in Supabase (Edge Function syncs to Sheets):**
| Column | Editable | Notes |
|--------|----------|-------|
| qb_account | ❌ No | Computed by trigger |
| status | ❌ No | Computed by trigger |
| txn_count | ❌ No | Computed by trigger |

### How It Works

1. **Team edits cell in Sheets** → Apps Script `onEdit` fires → REST API call to Supabase
2. **Supabase trigger runs** → Computes qb_account → Sets `sheets_synced_at = NULL`
3. **Edge Function cron** → Finds dirty rows → Updates Sheets → Sets `sheets_synced_at = NOW()`

### Conflict Resolution

- **Strategy:** Clear ownership (team owns Sheets columns, triggers own computed columns)
- **Computed columns:** Always Supabase authoritative
- **Sync latency:** Sheets→Supa: ~2s, Supa→Sheets: up to 2min

---

## 6. Claude Query Examples

Once implemented, Claude can execute:

```sql
-- Check if merchant exists before creating
SELECT EXISTS(
  SELECT 1 FROM merchant_rules
  WHERE merchant_normalized = 'lexington law'
);

-- Find all transactions for a merchant (partial match)
SELECT * FROM transactions
WHERE merchant ILIKE '%penske%';

-- Get uncategorized transactions
SELECT * FROM transactions
WHERE entity = 'NEEDS REVIEW'
ORDER BY date DESC;

-- Categorization stats
SELECT entity, COUNT(*) as count, SUM(amount) as total
FROM transactions
GROUP BY entity;

-- Bulk update by criteria
UPDATE transactions
SET entity = 'Origin'
WHERE merchant ILIKE '%kenworth%'
AND entity = 'NEEDS REVIEW';

-- Find duplicate-risk merchants
SELECT merchant, COUNT(*)
FROM merchant_rules
GROUP BY LOWER(TRIM(merchant))
HAVING COUNT(*) > 1;
```

---

## 7. Implementation Plan

### Phase 1: Foundation (Day 1-2)

| Task                                   | Owner      | Hours |
| -------------------------------------- | ---------- | ----- |
| Create Supabase project                | G          | 0.5   |
| Create merchant_rules table            | G + Claude | 1     |
| Create transactions table              | G + Claude | 1     |
| Write & test triggers                  | G + Claude | 2     |
| Test SQL queries in Supabase dashboard | G          | 1     |

### Phase 2: Sync Setup (Day 2-3)

| Task                        | Owner      | Hours |
| --------------------------- | ---------- | ----- |
| Deploy Apps Script to Sheet | G          | 0.5   |
| Create GCP Service Account  | G          | 0.5   |
| Deploy Edge Function        | G + Claude | 1     |
| Configure cron job          | G          | 0.5   |
| Test two-way sync           | G          | 1     |

### Phase 3: Claude Integration (Day 3-4)

| Task                             | Owner      | Hours |
| -------------------------------- | ---------- | ----- |
| Enable Supabase MCP              | G          | 0.25  |
| Test queries via Claude          | G + Claude | 1     |
| Test INSERT/UPDATE via Claude    | G + Claude | 1     |
| Verify trigger firing            | G + Claude | 1     |
| Verify sync after Claude changes | G          | 0.5   |

### Phase 4: Data Migration (Day 4-5)

| Task                          | Owner      | Hours |
| ----------------------------- | ---------- | ----- |
| Export current Merchant Rules | G          | 0.5   |
| Clean/normalize data          | G + Claude | 2     |
| Import to Supabase            | G + Claude | 1     |
| Export current Transactions   | G          | 0.5   |
| Import transactions           | G + Claude | 1     |
| Verify integrity              | G + Claude | 1     |

### Phase 5: Cutover (Day 5-6)

| Task                    | Owner      | Hours |
| ----------------------- | ---------- | ----- |
| Parallel testing        | G          | 2     |
| Remove Sheets formulas  | G          | 0.5   |
| Document Claude queries | G + Claude | 1     |
| Team communication      | G          | 0.5   |

**Total: ~22 hours over 6 days**

---

## 8. Costs

### Monthly

| Item                    | Cost      |
| ----------------------- | --------- |
| Supabase (Free tier)    | $0        |
| Google Apps Script      | $0        |
| Supabase Edge Functions | $0        |
| Google Sheets           | $0        |
| **Total**               | **$0/mo** |

### If Supabase Upgrade Needed

| Item            | Cost       |
| --------------- | ---------- |
| Supabase Pro    | $25        |
| Everything else | $0         |
| **Total**       | **$25/mo** |

---

## 9. Risks & Mitigations

| Risk                         | Likelihood | Impact | Mitigation                                                                |
| ---------------------------- | ---------- | ------ | ------------------------------------------------------------------------- |
| Sync conflicts               | Low        | Medium | Clear ownership: team edits Sheets columns, triggers own computed columns |
| Apps Script quota limits     | Low        | Medium | 6min timeout per execution, 90min/day total - sufficient for cell edits   |
| Edge Function failures       | Low        | Medium | Cron retries every 2min; dirty rows stay flagged until synced             |
| Trigger performance at scale | Low        | Medium | Indexes in place; async stats if needed                                   |
| Team confusion               | Medium     | Low    | Sheets looks identical; clear docs                                        |

---

## 10. Out of Scope (V1)

- Replace QuickBooks (this feeds INTO QB)
- Custom UI (Sheets remains interface)
- Real-time dashboards (future phase)
- Multi-user permissions (RLS - future)
- Historical data beyond active sheets

---

## 11. Success Criteria

### Launch Gate

- [ ] Claude can query by any field
- [ ] Claude can check merchant existence
- [ ] Trigger computes qb_account correctly
- [ ] Sheets→Supabase sync <5 sec
- [ ] Supabase→Sheets sync <3 min
- [ ] Team can view/edit in Sheets normally
- [ ] Zero data loss in migration

### 30-Day Success

- [ ] Zero duplicate merchant rules created
- [ ] Transaction categorization <10 min for 500 txns
- [ ] Team reports no workflow disruption
- [ ] QB account accuracy >95%

---

_Updated: December 7, 2025 - Replaced Whalesync with custom sync (Apps Script + Edge Functions)_
