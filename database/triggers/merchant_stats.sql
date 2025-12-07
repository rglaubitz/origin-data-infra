-- ============================================
-- Trigger: update_merchant_stats
-- Purpose: Update txn_count and total_amount on merchant_rules
-- Fires: AFTER INSERT OR UPDATE OR DELETE on transactions
-- ============================================

CREATE OR REPLACE FUNCTION update_merchant_stats()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent infinite loops
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        UPDATE merchant_rules
        SET txn_count = txn_count + 1,
            total_amount = total_amount + ABS(COALESCE(NEW.amount, 0)),
            updated_at = NOW()
        WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));

    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE merchant_rules
        SET txn_count = GREATEST(txn_count - 1, 0),
            total_amount = GREATEST(total_amount - ABS(COALESCE(OLD.amount, 0)), 0),
            updated_at = NOW()
        WHERE merchant_normalized = LOWER(TRIM(OLD.merchant));

    ELSIF (TG_OP = 'UPDATE') THEN
        -- Only update if merchant changed
        IF OLD.merchant IS DISTINCT FROM NEW.merchant THEN
            -- Decrement old merchant
            UPDATE merchant_rules
            SET txn_count = GREATEST(txn_count - 1, 0),
                total_amount = GREATEST(total_amount - ABS(COALESCE(OLD.amount, 0)), 0),
                updated_at = NOW()
            WHERE merchant_normalized = LOWER(TRIM(OLD.merchant));

            -- Increment new merchant
            UPDATE merchant_rules
            SET txn_count = txn_count + 1,
                total_amount = total_amount + ABS(COALESCE(NEW.amount, 0)),
                updated_at = NOW()
            WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_merchant_stats ON transactions;
CREATE TRIGGER trg_merchant_stats
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_merchant_stats();
