/**
 * Origin Transport - Google Apps Script
 * Syncs Google Sheets edits to Supabase in real-time
 *
 * SETUP:
 * 1. Open your Google Sheet
 * 2. Extensions > Apps Script
 * 3. Paste this code
 * 4. Update SUPABASE_URL and SUPABASE_KEY below
 * 5. Save and authorize
 * 6. Run > setupTrigger (one time)
 */

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================
const SUPABASE_URL = "https://kqwbjrhxnlbpnzssilww.supabase.co";
// IMPORTANT: Use the JWT-format service_role key (starts with "eyJ...")
// Get from: https://supabase.com/dashboard/project/kqwbjrhxnlbpnzssilww/settings/api
const SUPABASE_KEY = "YOUR_SERVICE_ROLE_JWT_KEY_HERE"; // Replace with eyJ... key

// Sheet name to table mapping
const SHEET_TABLE_MAP = {
  "Merchant Rules": "merchant_rules",
  "All Transactions": "transactions",
  "Merchant Alias": "merchant_aliases",
};

// Column mapping: Sheet column -> DB column
const MERCHANT_RULES_COLUMNS = {
  Merchant: "merchant",
  "Current Entity": "entity_default",
  Notes: "notes",
  "OpenHaul QBO Account": "openhaul_qb_account",
  "Origin QBO Account": "origin_qb_account",
};

const TRANSACTIONS_COLUMNS = {
  Entity: "entity",
  Notes: "notes",
};

// ============================================
// TRIGGERS
// ============================================

/**
 * Run this function ONCE to set up the edit trigger
 */
function setupTrigger() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach((trigger) => ScriptApp.deleteTrigger(trigger));

  // Create new onEdit trigger
  ScriptApp.newTrigger("onEditSync")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();

  Logger.log("Trigger installed successfully");
}

/**
 * Main edit handler - fires on every cell edit
 */
function onEditSync(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();

    // Only process mapped sheets
    if (!SHEET_TABLE_MAP[sheetName]) {
      return;
    }

    const range = e.range;
    const row = range.getRow();
    const col = range.getColumn();

    // Skip header row
    if (row === 1) return;

    // Get column name
    const headers = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    const columnName = headers[col - 1];

    // Route to appropriate handler
    if (sheetName === "Merchant Rules") {
      syncMerchantRule(sheet, row, columnName, e.value);
    } else if (sheetName === "All Transactions") {
      syncTransaction(sheet, row, columnName, e.value);
    }
  } catch (error) {
    Logger.log("Error in onEditSync: " + error.message);
  }
}

// ============================================
// SYNC FUNCTIONS
// ============================================

/**
 * Sync merchant rule edit to Supabase
 */
function syncMerchantRule(sheet, row, columnName, newValue) {
  // Only sync editable columns
  if (!MERCHANT_RULES_COLUMNS[columnName]) {
    return;
  }

  // Get merchant name (unique identifier)
  const merchant = sheet.getRange(row, 1).getValue();
  if (!merchant) return;

  const dbColumn = MERCHANT_RULES_COLUMNS[columnName];

  // Build update payload
  const payload = {};
  payload[dbColumn] = newValue || null;
  payload["sheets_synced_at"] = new Date().toISOString();

  // Update via Supabase REST API
  const response = supabaseUpdate("merchant_rules", payload, {
    merchant: `eq.${encodeURIComponent(merchant)}`,
  });

  Logger.log(`Synced merchant_rules: ${merchant}.${dbColumn} = ${newValue}`);
}

/**
 * Sync transaction edit to Supabase
 */
function syncTransaction(sheet, row, columnName, newValue) {
  Logger.log(
    `syncTransaction called: row=${row}, column=${columnName}, value=${newValue}`,
  );

  // Only sync editable columns
  if (!TRANSACTIONS_COLUMNS[columnName]) {
    Logger.log(`Column "${columnName}" not in sync list, skipping`);
    return;
  }

  const dbColumn = TRANSACTIONS_COLUMNS[columnName];
  Logger.log(`Mapping column "${columnName}" to DB field "${dbColumn}"`);

  // Build update payload
  const payload = {};
  payload[dbColumn] = newValue || null;
  // Note: Don't set sheets_synced_at here - let trigger handle computed fields

  // Update via sheets_row_id
  Logger.log(`Updating transactions where sheets_row_id = ${row}`);
  const response = supabaseUpdate("transactions", payload, {
    sheets_row_id: `eq.${row}`,
  });

  const code = response.getResponseCode();
  const body = response.getContentText();
  Logger.log(`Response: ${code} - ${body}`);
  Logger.log(`Synced transactions row ${row}: ${dbColumn} = ${newValue}`);
}

// ============================================
// SUPABASE API HELPERS
// ============================================

/**
 * Update records in Supabase
 */
function supabaseUpdate(table, payload, filters) {
  const url = buildSupabaseUrl(table, filters);

  const options = {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code >= 400) {
    Logger.log(`Supabase error ${code}: ${response.getContentText()}`);
  }

  return response;
}

/**
 * Insert record into Supabase
 */
function supabaseInsert(table, payload) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;

  const options = {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  return UrlFetchApp.fetch(url, options);
}

/**
 * Build Supabase URL with filters
 */
function buildSupabaseUrl(table, filters) {
  let url = `${SUPABASE_URL}/rest/v1/${table}`;

  if (filters && Object.keys(filters).length > 0) {
    const params = Object.entries(filters)
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    url += `?${params}`;
  }

  return url;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Test function - verify Supabase connection (READ)
 */
function testConnection() {
  Logger.log("Testing READ access...");
  const url = `${SUPABASE_URL}/rest/v1/merchant_rules?select=count&limit=1`;

  const options = {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log("READ test: " + response.getResponseCode());
  Logger.log("Response: " + response.getContentText());
}

/**
 * Test function - verify Supabase WRITE access
 * Updates a known row to test write permissions
 */
function testWrite() {
  Logger.log("Testing WRITE access...");

  // Update row 2 (first data row) with current timestamp in notes
  const testPayload = {
    notes: `Test write at ${new Date().toISOString()}`,
  };

  const url = `${SUPABASE_URL}/rest/v1/transactions?sheets_row_id=eq.2`;

  const options = {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation", // Return the updated row
    },
    payload: JSON.stringify(testPayload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const body = response.getContentText();

  Logger.log("WRITE test response code: " + code);
  Logger.log("WRITE test response body: " + body);

  if (code === 200 || code === 204) {
    Logger.log("✅ WRITE ACCESS CONFIRMED!");
  } else {
    Logger.log("❌ WRITE FAILED - Check your API key");
  }
}

/**
 * Manual sync - sync all merchant rules (use sparingly)
 */
function fullSyncMerchantRules() {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Merchant Rules");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  let synced = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const merchant = row[0];
    if (!merchant) continue;

    const payload = {
      merchant: merchant,
      entity_default: row[headers.indexOf("Current Entity")] || "NEEDS REVIEW",
      notes: row[headers.indexOf("Notes")] || null,
      openhaul_qb_account: row[headers.indexOf("OpenHaul QBO Account")] || null,
      origin_qb_account: row[headers.indexOf("Origin QBO Account")] || null,
      sheets_row_id: i + 1,
      sheets_synced_at: new Date().toISOString(),
    };

    supabaseUpdate("merchant_rules", payload, {
      merchant: `eq.${encodeURIComponent(merchant)}`,
    });
    synced++;
  }

  Logger.log(`Full sync complete: ${synced} merchant rules`);
}
