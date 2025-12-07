-- ============================================
-- Trigger: cascade_rule_changes
-- Purpose: When merchant rule QB accounts change, recompute all transactions
-- Fires: AFTER UPDATE on merchant_rules
-- ============================================

CREATE OR REPLACE FUNCTION cascade_rule_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent infinite loops
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    -- When QB accounts change, trigger recomputation on matching transactions
    -- The dummy update triggers auto_assign_qb_account on each row
    UPDATE transactions
    SET updated_at = NOW()
    WHERE LOWER(TRIM(merchant)) = NEW.merchant_normalized;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_cascade_rule_changes ON merchant_rules;
CREATE TRIGGER trg_cascade_rule_changes
    AFTER UPDATE OF origin_qb_account, openhaul_qb_account, personal_qb_account
    ON merchant_rules
    FOR EACH ROW
    EXECUTE FUNCTION cascade_rule_changes();


-- ============================================
-- Trigger: updated_at_timestamp
-- Purpose: Auto-update updated_at on any row change
-- ============================================

CREATE OR REPLACE FUNCTION updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to merchant_rules
DROP TRIGGER IF EXISTS trg_merchant_rules_updated ON merchant_rules;
CREATE TRIGGER trg_merchant_rules_updated
    BEFORE UPDATE ON merchant_rules
    FOR EACH ROW
    EXECUTE FUNCTION updated_at_timestamp();
