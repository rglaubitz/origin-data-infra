# Two-Way Sync Setup Guide

Custom sync between Google Sheets and Supabase using Apps Script + Edge Functions.

**Cost: $0/month** (all free tier)

## Architecture

```
Sheets → Supabase:  Apps Script onEdit trigger (~1-2 sec delay)
Supabase → Sheets:  Edge Function cron job (up to 2 min delay)
```

## Prerequisites

- Supabase project with tables created
- Google Sheet with matching structure
- GCP project (for service account)

---

## Part 1: Sheets → Supabase (Apps Script)

### Step 1: Open Apps Script Editor

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**

### Step 2: Add the Code

1. Delete any existing code in `Code.gs`
2. Copy contents from `sync/apps-script/Code.gs`
3. Paste into the editor

### Step 3: Configure Script Properties

1. Click **Project Settings** (gear icon)
2. Scroll to **Script Properties**
3. Add these properties:

| Property            | Value                                        |
| ------------------- | -------------------------------------------- |
| `SUPABASE_URL`      | `https://your-project-ref.supabase.co`       |
| `SUPABASE_ANON_KEY` | Your anon/public key from Supabase dashboard |

### Step 4: Set Up Trigger

1. Click **Triggers** (clock icon) in left sidebar
2. Click **+ Add Trigger**
3. Configure:
   - Function: `onEdit`
   - Event source: `From spreadsheet`
   - Event type: `On edit`
4. Click **Save**
5. Authorize when prompted

### Step 5: Adjust Column Mappings

Edit the `CONFIG` object in `Code.gs` to match your sheet layout:

```javascript
TRANSACTIONS: {
  ID_COL: 1,        // Column A: Supabase UUID
  DATE_COL: 2,      // Column B: Date
  MERCHANT_COL: 3,  // etc...
}
```

### Step 6: Test

1. Edit a cell in the `Entity` column
2. Check Apps Script logs (View → Logs)
3. Verify the change appears in Supabase

---

## Part 2: Supabase → Sheets (Edge Function)

### Step 1: Create GCP Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Google Sheets API**
4. Go to **IAM & Admin → Service Accounts**
5. Click **Create Service Account**
   - Name: `supabase-sheets-sync`
   - Click **Create and Continue**
   - Skip granting roles
   - Click **Done**
6. Click on the service account
7. Go to **Keys → Add Key → Create New Key**
8. Choose **JSON** and download

### Step 2: Share Sheet with Service Account

1. Open the downloaded JSON file
2. Copy the `client_email` value
3. Open your Google Sheet
4. Click **Share**
5. Paste the service account email
6. Grant **Editor** access

### Step 3: Deploy Edge Function

```bash
cd "/Users/richardglaubitz/Downloads/Financials AI project"

# Login to Supabase CLI
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy the function
supabase functions deploy sync-to-sheets
```

### Step 4: Set Secrets

```bash
# Set the service account JSON (paste entire file content)
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"..."}'

# Set your Sheet ID (from the URL)
# https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
supabase secrets set GOOGLE_SHEET_ID='your-sheet-id'
```

### Step 5: Schedule Cron Job

Run this SQL in Supabase SQL Editor:

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule sync every 2 minutes
SELECT cron.schedule(
  'sync-to-sheets',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://your-project-ref.supabase.co/functions/v1/sync-to-sheets',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Step 6: Verify

1. Update a transaction's entity in Supabase (triggers qb_account recompute)
2. Wait up to 2 minutes
3. Check that the QB Account column updates in Sheets

---

## Part 3: Database Setup

Run the dirty-row trigger to flag rows needing sync:

```bash
# In Supabase SQL Editor, run:
database/triggers/mark_sheets_dirty.sql
```

This creates triggers that set `sheets_synced_at = NULL` whenever computed columns change.

---

## Sync Direction Rules

| Column            | Direction         | Editable In        |
| ----------------- | ----------------- | ------------------ |
| `entity`          | Sheets → Supabase | Sheets             |
| `notes`           | Sheets → Supabase | Sheets             |
| `merchant` (txns) | Sheets → Supabase | Sheets             |
| `qb_account`      | Supabase → Sheets | Neither (computed) |
| `status`          | Supabase → Sheets | Neither (computed) |
| `txn_count`       | Supabase → Sheets | Neither (computed) |

---

## Troubleshooting

### Apps Script not triggering

1. Check trigger is set up (Triggers → should show `onEdit`)
2. Check logs (View → Execution log)
3. Verify Script Properties are set correctly

### Edge Function not syncing

1. Check function logs: `supabase functions logs sync-to-sheets`
2. Verify secrets are set: `supabase secrets list`
3. Check cron is scheduled: `SELECT * FROM cron.job;`

### Sheets API errors

1. Verify service account has Editor access to sheet
2. Check Sheets API is enabled in GCP
3. Verify GOOGLE_SHEET_ID is correct

### Rows not marked dirty

1. Check `sheets_synced_at` column exists
2. Verify trigger `trg_mark_transaction_sheets_dirty` exists
3. Test: `UPDATE transactions SET entity = entity WHERE id = 'some-id';`

---

## Monitoring

### Check pending syncs

```sql
-- Transactions waiting for Sheets sync
SELECT COUNT(*) FROM transactions WHERE sheets_synced_at IS NULL;

-- Merchant rules waiting for Sheets sync
SELECT COUNT(*) FROM merchant_rules WHERE sheets_synced_at IS NULL;
```

### Check cron job history

```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

---

## Environment Variables Reference

### Apps Script (Script Properties)

| Property            | Description               |
| ------------------- | ------------------------- |
| `SUPABASE_URL`      | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon/public key  |

### Edge Function (Supabase Secrets)

| Secret                        | Description                              |
| ----------------------------- | ---------------------------------------- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON content of service account key |
| `GOOGLE_SHEET_ID`             | ID from Google Sheet URL                 |
