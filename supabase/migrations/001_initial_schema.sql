-- Origin Transport Data Infrastructure
-- Initial Schema Migration
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/kqwbjrhxnlbpnzssilww/sql

-- ============================================
-- 1. MERCHANT RULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant TEXT NOT NULL UNIQUE,
  merchant_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(merchant))) STORED,
  entity_default TEXT DEFAULT 'NEEDS REVIEW',
  origin_qb_account TEXT,
  openhaul_qb_account TEXT,
  personal_qb_account TEXT,
  notes TEXT,
  txn_count INTEGER DEFAULT 0,
  sheets_row_id INTEGER,
  sheets_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merchant_normalized ON merchant_rules(merchant_normalized);
CREATE INDEX IF NOT EXISTS idx_merchant_rules_sheets_sync ON merchant_rules(sheets_synced_at) WHERE sheets_synced_at IS NULL;

-- ============================================
-- 2. TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  raw_merchant TEXT,
  merchant TEXT,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  entity TEXT DEFAULT 'NEEDS REVIEW',
  qb_account TEXT,
  status TEXT DEFAULT '⚠️',
  source_account TEXT,
  card_number TEXT,
  notes TEXT,
  sheets_row_id INTEGER,
  sheets_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_txn_merchant ON transactions(LOWER(merchant));
CREATE INDEX IF NOT EXISTS idx_txn_entity ON transactions(entity);
CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_txn_sheets_sync ON transactions(sheets_synced_at) WHERE sheets_synced_at IS NULL;

-- ============================================
-- 3. MERCHANT ALIASES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS merchant_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_merchant TEXT NOT NULL,
  std_merchant TEXT NOT NULL,
  source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alias_raw ON merchant_aliases(LOWER(TRIM(raw_merchant)));
CREATE INDEX IF NOT EXISTS idx_alias_std ON merchant_aliases(LOWER(TRIM(std_merchant)));

-- ============================================
-- 4. AUTO-ASSIGN QB ACCOUNT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION auto_assign_qb_account()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
BEGIN
  -- Lookup merchant rule by normalized merchant name
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

    -- Update status based on QB account
    NEW.status := CASE
      WHEN NEW.qb_account IS NOT NULL
           AND NEW.qb_account != 'N/A'
           AND NEW.qb_account != 'NEEDS ASSIGNMENT'
      THEN '✓'
      ELSE '⚠️'
    END;
  ELSE
    NEW.qb_account := 'UNKNOWN MERCHANT';
    NEW.status := '⚠️';
  END IF;

  NEW.updated_at := NOW();
  NEW.sheets_synced_at := NULL;  -- Mark for sync back to Sheets
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists, then create
DROP TRIGGER IF EXISTS trg_auto_qb_account ON transactions;
CREATE TRIGGER trg_auto_qb_account
  BEFORE INSERT OR UPDATE OF merchant, entity ON transactions
  FOR EACH ROW EXECUTE FUNCTION auto_assign_qb_account();

-- ============================================
-- 5. UPDATE TIMESTAMP TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_merchant_rules_updated ON merchant_rules;
CREATE TRIGGER trg_merchant_rules_updated
  BEFORE UPDATE ON merchant_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 6. TXN COUNT UPDATE TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_merchant_txn_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update count for old merchant (on UPDATE or DELETE)
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.merchant IS NOT NULL THEN
    UPDATE merchant_rules
    SET txn_count = (
      SELECT COUNT(*) FROM transactions
      WHERE LOWER(TRIM(merchant)) = (
        SELECT merchant_normalized FROM merchant_rules WHERE merchant_normalized = LOWER(TRIM(OLD.merchant))
      )
    )
    WHERE merchant_normalized = LOWER(TRIM(OLD.merchant));
  END IF;

  -- Update count for new merchant (on INSERT or UPDATE)
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.merchant IS NOT NULL THEN
    UPDATE merchant_rules
    SET txn_count = (
      SELECT COUNT(*) FROM transactions
      WHERE LOWER(TRIM(merchant)) = (
        SELECT merchant_normalized FROM merchant_rules WHERE merchant_normalized = LOWER(TRIM(NEW.merchant))
      )
    )
    WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_txn_count ON transactions;
CREATE TRIGGER trg_update_txn_count
  AFTER INSERT OR UPDATE OF merchant OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_merchant_txn_count();

-- ============================================
-- 7. ENABLE ROW LEVEL SECURITY (Optional)
-- ============================================
-- Disabled for now, enable if needed later
-- ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE merchant_aliases ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these after migration to verify:
-- SELECT COUNT(*) FROM merchant_rules;
-- SELECT COUNT(*) FROM transactions;
-- SELECT COUNT(*) FROM merchant_aliases;
