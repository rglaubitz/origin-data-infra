-- ============================================
-- Trigger: mark_sheets_dirty
-- Purpose: Set sheets_synced_at = NULL when computed columns change
-- This flags rows that need to be synced back to Google Sheets
-- ============================================

-- Function to mark transactions as needing Sheets sync
CREATE OR REPLACE FUNCTION mark_transaction_sheets_dirty()
RETURNS TRIGGER AS $$
BEGIN
    -- Only mark dirty if computed columns actually changed
    IF (OLD.qb_account IS DISTINCT FROM NEW.qb_account) OR
       (OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.sheets_synced_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on transactions
DROP TRIGGER IF EXISTS trg_mark_transaction_sheets_dirty ON transactions;
CREATE TRIGGER trg_mark_transaction_sheets_dirty
    BEFORE UPDATE OF qb_account, status ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION mark_transaction_sheets_dirty();


-- Function to mark merchant_rules as needing Sheets sync
CREATE OR REPLACE FUNCTION mark_merchant_rule_sheets_dirty()
RETURNS TRIGGER AS $$
BEGIN
    -- Mark dirty if stats changed (txn_count, total_amount)
    IF (OLD.txn_count IS DISTINCT FROM NEW.txn_count) OR
       (OLD.total_amount IS DISTINCT FROM NEW.total_amount) THEN
        NEW.sheets_synced_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on merchant_rules
DROP TRIGGER IF EXISTS trg_mark_merchant_rule_sheets_dirty ON merchant_rules;
CREATE TRIGGER trg_mark_merchant_rule_sheets_dirty
    BEFORE UPDATE OF txn_count, total_amount ON merchant_rules
    FOR EACH ROW
    EXECUTE FUNCTION mark_merchant_rule_sheets_dirty();


-- Also mark new rows as needing sync (sheets_synced_at starts NULL by default)
-- No trigger needed - NULL default handles this

-- Index for efficient "find dirty rows" query
CREATE INDEX IF NOT EXISTS idx_transactions_needs_sheets_sync
    ON transactions(id)
    WHERE sheets_synced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_rules_needs_sheets_sync
    ON merchant_rules(id)
    WHERE sheets_synced_at IS NULL;
