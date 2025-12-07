-- ============================================
-- Origin Transport Data Infrastructure
-- Tables: merchant_rules, transactions
-- ============================================

-- merchant_rules: Merchant-to-QB-account mappings
CREATE TABLE IF NOT EXISTS merchant_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Merchant name (exact match required)
    merchant TEXT NOT NULL UNIQUE,

    -- Auto-computed normalized version for lookups
    merchant_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(merchant))) STORED,

    -- Default entity assignment for new transactions
    entity_default TEXT DEFAULT 'NEEDS REVIEW',

    -- QuickBooks account mappings per entity
    origin_qb_account TEXT,
    openhaul_qb_account TEXT,
    personal_qb_account TEXT,

    -- Categorization
    category TEXT,
    notes TEXT,

    -- Stats (updated by trigger)
    txn_count INTEGER DEFAULT 0,
    total_amount DECIMAL(12,2) DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Sheets sync tracking
    sheet_row_id INTEGER,              -- Row number in Google Sheet
    sheets_synced_at TIMESTAMPTZ       -- NULL = needs sync to Sheets
);

COMMENT ON TABLE merchant_rules IS 'Merchant-to-QuickBooks account mapping rules';
COMMENT ON COLUMN merchant_rules.merchant_normalized IS 'Auto-computed lowercase trimmed merchant name for consistent lookups';
COMMENT ON COLUMN merchant_rules.sheets_synced_at IS 'NULL means row needs to be synced to Google Sheets';


-- transactions: All transactions with auto-computed QB accounts
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Transaction details
    date DATE NOT NULL,
    merchant TEXT,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,

    -- Categorization
    entity TEXT DEFAULT 'NEEDS REVIEW',
    qb_account TEXT,  -- Computed by trigger
    status TEXT DEFAULT '⚠️',

    -- Source tracking
    source_account TEXT,
    bank_reference TEXT,

    -- Notes
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Sheets sync tracking
    sheet_row_id INTEGER,              -- Row number in Google Sheet
    sheets_synced_at TIMESTAMPTZ,      -- NULL = needs sync to Sheets

    -- Constraints
    CONSTRAINT valid_entity CHECK (
        entity IN ('Origin', 'OpenHaul', 'Personal', 'NEEDS REVIEW', 'BOTH')
    ),
    CONSTRAINT valid_status CHECK (
        status IN ('✓', '⚠️', '❌', 'REVIEW')
    )
);

COMMENT ON TABLE transactions IS 'All transactions with auto-computed QB account assignments';
COMMENT ON COLUMN transactions.qb_account IS 'Auto-computed by trigger based on merchant + entity';
COMMENT ON COLUMN transactions.status IS '✓ = categorized, ⚠️ = needs attention, ❌ = error';
COMMENT ON COLUMN transactions.sheets_synced_at IS 'NULL means row needs to be synced to Google Sheets';
