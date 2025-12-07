/**
 * Origin Transport - Google Sheets to Supabase Sync
 *
 * This Apps Script syncs edits from Google Sheets to Supabase.
 * Direction: Sheets → Supabase (team edits)
 *
 * Setup:
 * 1. Open your Google Sheet
 * 2. Extensions → Apps Script
 * 3. Paste this code
 * 4. Add Script Properties (Project Settings → Script Properties):
 *    - SUPABASE_URL: https://your-project.supabase.co
 *    - SUPABASE_ANON_KEY: your-anon-key
 * 5. Add triggers (Triggers → Add Trigger):
 *    - onEdit → From spreadsheet → On edit
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Sheet names (must match exactly)
  TRANSACTIONS_SHEET: 'Transactions',
  MERCHANT_RULES_SHEET: 'Merchant Rules',

  // Column mappings (1-indexed, A=1, B=2, etc.)
  // Adjust these to match your actual sheet layout
  TRANSACTIONS: {
    ID_COL: 1,           // Column A: Supabase UUID (hidden or first col)
    DATE_COL: 2,         // Column B: Date
    MERCHANT_COL: 3,     // Column C: Merchant
    DESCRIPTION_COL: 4,  // Column D: Description
    AMOUNT_COL: 5,       // Column E: Amount
    ENTITY_COL: 6,       // Column F: Entity (team edits this)
    QB_ACCOUNT_COL: 7,   // Column G: QB Account (read-only, from Supabase)
    STATUS_COL: 8,       // Column H: Status (read-only, from Supabase)
    SOURCE_COL: 9,       // Column I: Source Account
    NOTES_COL: 10,       // Column J: Notes (team edits this)
    HEADER_ROW: 1        // First row is header
  },

  MERCHANT_RULES: {
    ID_COL: 1,                  // Column A: Supabase UUID
    MERCHANT_COL: 2,            // Column B: Merchant
    ENTITY_DEFAULT_COL: 3,      // Column C: Default Entity
    ORIGIN_QB_COL: 4,           // Column D: Origin QB Account
    OPENHAUL_QB_COL: 5,         // Column E: OpenHaul QB Account
    PERSONAL_QB_COL: 6,         // Column F: Personal QB Account
    CATEGORY_COL: 7,            // Column G: Category
    NOTES_COL: 8,               // Column H: Notes
    TXN_COUNT_COL: 9,           // Column I: Txn Count (read-only)
    HEADER_ROW: 1
  },

  // Columns that team can edit (sync to Supabase)
  EDITABLE_TRANSACTION_COLS: [6, 10],  // entity, notes
  EDITABLE_MERCHANT_COLS: [2, 3, 4, 5, 6, 7, 8]  // all except id and txn_count
};


// ============================================
// MAIN TRIGGER
// ============================================

/**
 * Triggered on every edit in the spreadsheet
 */
function onEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const range = e.range;
    const row = range.getRow();
    const col = range.getColumn();

    // Skip header row
    if (row <= 1) return;

    // Route to appropriate handler
    if (sheetName === CONFIG.TRANSACTIONS_SHEET) {
      handleTransactionEdit(sheet, row, col, e.value);
    } else if (sheetName === CONFIG.MERCHANT_RULES_SHEET) {
      handleMerchantRuleEdit(sheet, row, col, e.value);
    }
  } catch (error) {
    console.error('onEdit error:', error);
  }
}


// ============================================
// TRANSACTION SYNC
// ============================================

function handleTransactionEdit(sheet, row, col, newValue) {
  // Only sync editable columns
  if (!CONFIG.EDITABLE_TRANSACTION_COLS.includes(col)) {
    return;
  }

  // Get the row's Supabase ID
  const id = sheet.getRange(row, CONFIG.TRANSACTIONS.ID_COL).getValue();
  if (!id) {
    console.log('No ID found for transaction row ' + row);
    return;
  }

  // Map column to field name
  const fieldMap = {
    [CONFIG.TRANSACTIONS.ENTITY_COL]: 'entity',
    [CONFIG.TRANSACTIONS.NOTES_COL]: 'notes'
  };

  const field = fieldMap[col];
  if (!field) return;

  // Update Supabase
  const success = updateSupabase('transactions', id, { [field]: newValue });

  if (success) {
    console.log(`Updated transaction ${id}: ${field} = ${newValue}`);
  }
}


// ============================================
// MERCHANT RULES SYNC
// ============================================

function handleMerchantRuleEdit(sheet, row, col, newValue) {
  // Only sync editable columns
  if (!CONFIG.EDITABLE_MERCHANT_COLS.includes(col)) {
    return;
  }

  // Get the row's Supabase ID
  const id = sheet.getRange(row, CONFIG.MERCHANT_RULES.ID_COL).getValue();

  // Map column to field name
  const fieldMap = {
    [CONFIG.MERCHANT_RULES.MERCHANT_COL]: 'merchant',
    [CONFIG.MERCHANT_RULES.ENTITY_DEFAULT_COL]: 'entity_default',
    [CONFIG.MERCHANT_RULES.ORIGIN_QB_COL]: 'origin_qb_account',
    [CONFIG.MERCHANT_RULES.OPENHAUL_QB_COL]: 'openhaul_qb_account',
    [CONFIG.MERCHANT_RULES.PERSONAL_QB_COL]: 'personal_qb_account',
    [CONFIG.MERCHANT_RULES.CATEGORY_COL]: 'category',
    [CONFIG.MERCHANT_RULES.NOTES_COL]: 'notes'
  };

  const field = fieldMap[col];
  if (!field) return;

  if (id) {
    // Update existing row
    const success = updateSupabase('merchant_rules', id, { [field]: newValue });
    if (success) {
      console.log(`Updated merchant_rule ${id}: ${field} = ${newValue}`);
    }
  } else {
    // New row - need to create in Supabase
    const rowData = getRowData(sheet, row, 'merchant_rules');
    const newId = insertSupabase('merchant_rules', rowData);
    if (newId) {
      // Write the new ID back to the sheet
      sheet.getRange(row, CONFIG.MERCHANT_RULES.ID_COL).setValue(newId);
      console.log(`Created new merchant_rule: ${newId}`);
    }
  }
}


// ============================================
// SUPABASE API
// ============================================

function getSupabaseConfig() {
  const props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty('SUPABASE_URL'),
    key: props.getProperty('SUPABASE_ANON_KEY')
  };
}

function updateSupabase(table, id, data) {
  const config = getSupabaseConfig();
  const url = `${config.url}/rest/v1/${table}?id=eq.${id}`;

  const options = {
    method: 'PATCH',
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code >= 200 && code < 300) {
    return true;
  } else {
    console.error(`Supabase update failed: ${code} - ${response.getContentText()}`);
    return false;
  }
}

function insertSupabase(table, data) {
  const config = getSupabaseConfig();
  const url = `${config.url}/rest/v1/${table}`;

  const options = {
    method: 'POST',
    headers: {
      'apikey': config.key,
      'Authorization': `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    payload: JSON.stringify(data),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code >= 200 && code < 300) {
    const result = JSON.parse(response.getContentText());
    return result[0]?.id;
  } else {
    console.error(`Supabase insert failed: ${code} - ${response.getContentText()}`);
    return null;
  }
}


// ============================================
// HELPERS
// ============================================

function getRowData(sheet, row, tableType) {
  if (tableType === 'merchant_rules') {
    const cfg = CONFIG.MERCHANT_RULES;
    return {
      merchant: sheet.getRange(row, cfg.MERCHANT_COL).getValue(),
      entity_default: sheet.getRange(row, cfg.ENTITY_DEFAULT_COL).getValue(),
      origin_qb_account: sheet.getRange(row, cfg.ORIGIN_QB_COL).getValue(),
      openhaul_qb_account: sheet.getRange(row, cfg.OPENHAUL_QB_COL).getValue(),
      personal_qb_account: sheet.getRange(row, cfg.PERSONAL_QB_COL).getValue(),
      category: sheet.getRange(row, cfg.CATEGORY_COL).getValue(),
      notes: sheet.getRange(row, cfg.NOTES_COL).getValue()
    };
  }
  return {};
}


// ============================================
// MANUAL SYNC (for testing)
// ============================================

/**
 * Manually trigger a full sync of current row
 * Run this from Apps Script editor for testing
 */
function testSync() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  console.log(`Testing sync for row ${row} in ${sheet.getName()}`);

  // Simulate an edit event
  onEdit({
    source: SpreadsheetApp.getActiveSpreadsheet(),
    range: sheet.getActiveRange()
  });
}
