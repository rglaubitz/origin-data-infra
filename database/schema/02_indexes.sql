-- ============================================
-- Origin Transport Data Infrastructure
-- Indexes: Optimize common query patterns
-- ============================================

-- merchant_rules indexes
CREATE INDEX IF NOT EXISTS idx_merchant_rules_normalized
    ON merchant_rules(merchant_normalized);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_category
    ON merchant_rules(category);

CREATE INDEX IF NOT EXISTS idx_merchant_rules_entity_default
    ON merchant_rules(entity_default);

-- transactions indexes
CREATE INDEX IF NOT EXISTS idx_transactions_merchant
    ON transactions(LOWER(TRIM(merchant)));

CREATE INDEX IF NOT EXISTS idx_transactions_entity
    ON transactions(entity);

CREATE INDEX IF NOT EXISTS idx_transactions_status
    ON transactions(status);

CREATE INDEX IF NOT EXISTS idx_transactions_date
    ON transactions(date);

CREATE INDEX IF NOT EXISTS idx_transactions_date_entity
    ON transactions(date, entity);

-- Partial index for uncategorized only (high-value query)
CREATE INDEX IF NOT EXISTS idx_transactions_needs_review
    ON transactions(date, merchant)
    WHERE status = '⚠️';
