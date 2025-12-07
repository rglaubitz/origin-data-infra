-- ============================================
-- Trigger: auto_assign_qb_account
-- Purpose: Auto-compute QB account based on merchant + entity
-- Fires: BEFORE INSERT OR UPDATE on transactions
-- ============================================

CREATE OR REPLACE FUNCTION auto_assign_qb_account()
RETURNS TRIGGER AS $$
DECLARE
    rule RECORD;
BEGIN
    -- Skip if no merchant provided
    IF NEW.merchant IS NULL OR TRIM(NEW.merchant) = '' THEN
        NEW.qb_account := 'NO MERCHANT';
        NEW.status := '⚠️';
        NEW.updated_at := NOW();
        RETURN NEW;
    END IF;

    -- Lookup merchant rule
    SELECT * INTO rule
    FROM merchant_rules
    WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));

    IF FOUND THEN
        -- Assign QB account based on entity
        NEW.qb_account := CASE NEW.entity
            WHEN 'Origin' THEN COALESCE(rule.origin_qb_account, 'NOT MAPPED')
            WHEN 'OpenHaul' THEN COALESCE(rule.openhaul_qb_account, 'NOT MAPPED')
            WHEN 'Personal' THEN COALESCE(rule.personal_qb_account, 'NOT MAPPED')
            WHEN 'NEEDS REVIEW' THEN 'ENTITY NOT SET'
            WHEN 'BOTH' THEN 'REQUIRES SPLIT'
            ELSE 'UNKNOWN ENTITY'
        END;

        -- Set status based on result
        NEW.status := CASE
            WHEN NEW.qb_account IS NOT NULL
                 AND NEW.qb_account NOT IN ('N/A', 'NOT MAPPED', 'ENTITY NOT SET', 'REQUIRES SPLIT', 'UNKNOWN ENTITY')
            THEN '✓'
            ELSE '⚠️'
        END;
    ELSE
        NEW.qb_account := 'UNKNOWN MERCHANT';
        NEW.status := '⚠️';
    END IF;

    -- Always update timestamp
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_auto_qb_account ON transactions;
CREATE TRIGGER trg_auto_qb_account
    BEFORE INSERT OR UPDATE OF merchant, entity ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_qb_account();
