/**
 * Origin Transport - Supabase to Google Sheets Sync
 *
 * This Edge Function syncs computed columns from Supabase back to Sheets.
 * Direction: Supabase → Sheets (computed values)
 *
 * Runs on a cron schedule (every 1-2 minutes).
 * Finds rows where sheets_synced_at IS NULL and updates Google Sheets.
 *
 * Deploy:
 *   supabase functions deploy sync-to-sheets
 *
 * Set secrets:
 *   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
 *   supabase secrets set GOOGLE_SHEET_ID='your-sheet-id'
 *
 * Schedule cron in Supabase Dashboard:
 *   - Go to Database → Extensions → Enable pg_cron
 *   - Go to SQL Editor and run:
 *     SELECT cron.schedule('sync-to-sheets', '*/2 * * * *',
 *       $$SELECT net.http_post(
 *         'https://your-project.supabase.co/functions/v1/sync-to-sheets',
 *         '{}',
 *         'application/json',
 *         ARRAY[http_header('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))]
 *       )$$
 *     );
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { JWT } from "https://esm.sh/google-auth-library@9";

// Types
interface Transaction {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  entity: string;
  qb_account: string;
  status: string;
  sheet_row_id: number | null;
}

interface MerchantRule {
  id: string;
  merchant: string;
  txn_count: number;
  total_amount: number;
  sheet_row_id: number | null;
}

// Configuration
const CONFIG = {
  TRANSACTIONS_SHEET: "Transactions",
  MERCHANT_RULES_SHEET: "Merchant Rules",
  BATCH_SIZE: 100,

  // Column positions in Sheets (0-indexed for API)
  TRANSACTIONS: {
    QB_ACCOUNT_COL: 6, // Column G
    STATUS_COL: 7, // Column H
  },
  MERCHANT_RULES: {
    TXN_COUNT_COL: 8, // Column I
    TOTAL_AMOUNT_COL: 9, // Column J
  },
};

Deno.serve(async (req) => {
  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize Google Sheets client
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!;
    const sheetId = Deno.env.get("GOOGLE_SHEET_ID")!;
    const sheetsClient = await getSheetsClient(serviceAccountJson);

    // Sync transactions
    const txnResult = await syncTransactions(supabase, sheetsClient, sheetId);

    // Sync merchant rules
    const rulesResult = await syncMerchantRules(
      supabase,
      sheetsClient,
      sheetId
    );

    return new Response(
      JSON.stringify({
        success: true,
        transactions_synced: txnResult.count,
        merchant_rules_synced: rulesResult.count,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ============================================
// GOOGLE SHEETS CLIENT
// ============================================

async function getSheetsClient(serviceAccountJson: string) {
  const credentials = JSON.parse(serviceAccountJson);

  const auth = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();
  return auth;
}

async function batchUpdateSheets(
  auth: JWT,
  sheetId: string,
  updates: { range: string; values: any[][] }[]
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.credentials.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: updates,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sheets API error: ${error}`);
  }

  return response.json();
}

// ============================================
// SYNC TRANSACTIONS
// ============================================

async function syncTransactions(
  supabase: any,
  sheetsClient: JWT,
  sheetId: string
) {
  // Find dirty rows
  const { data: dirtyRows, error } = await supabase
    .from("transactions")
    .select("id, qb_account, status, sheet_row_id")
    .is("sheets_synced_at", null)
    .not("sheet_row_id", "is", null)
    .limit(CONFIG.BATCH_SIZE);

  if (error) throw error;
  if (!dirtyRows?.length) return { count: 0 };

  // Build batch update
  const updates = dirtyRows.map((row: Transaction) => ({
    range: `'${CONFIG.TRANSACTIONS_SHEET}'!G${row.sheet_row_id}:H${row.sheet_row_id}`,
    values: [[row.qb_account || "", row.status || ""]],
  }));

  // Update Sheets
  await batchUpdateSheets(sheetsClient, sheetId, updates);

  // Mark as synced
  const ids = dirtyRows.map((r: Transaction) => r.id);
  await supabase
    .from("transactions")
    .update({ sheets_synced_at: new Date().toISOString() })
    .in("id", ids);

  return { count: dirtyRows.length };
}

// ============================================
// SYNC MERCHANT RULES
// ============================================

async function syncMerchantRules(
  supabase: any,
  sheetsClient: JWT,
  sheetId: string
) {
  // Find dirty rows
  const { data: dirtyRows, error } = await supabase
    .from("merchant_rules")
    .select("id, txn_count, total_amount, sheet_row_id")
    .is("sheets_synced_at", null)
    .not("sheet_row_id", "is", null)
    .limit(CONFIG.BATCH_SIZE);

  if (error) throw error;
  if (!dirtyRows?.length) return { count: 0 };

  // Build batch update (only updating computed columns)
  const updates = dirtyRows.map((row: MerchantRule) => ({
    range: `'${CONFIG.MERCHANT_RULES_SHEET}'!I${row.sheet_row_id}:J${row.sheet_row_id}`,
    values: [[row.txn_count || 0, row.total_amount || 0]],
  }));

  // Update Sheets
  await batchUpdateSheets(sheetsClient, sheetId, updates);

  // Mark as synced
  const ids = dirtyRows.map((r: MerchantRule) => r.id);
  await supabase
    .from("merchant_rules")
    .update({ sheets_synced_at: new Date().toISOString() })
    .in("id", ids);

  return { count: dirtyRows.length };
}
