-- ============================================
-- Verification Queries
-- Run after setup to confirm everything works
-- ============================================

-- 1. Check all triggers exist
SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 2. Check all indexes exist
SELECT
    indexname,
    tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 3. Transaction stats by entity/status
SELECT
    entity,
    status,
    COUNT(*) as count,
    SUM(amount) as total
FROM transactions
GROUP BY entity, status
ORDER BY count DESC;

-- 4. Merchant stats
SELECT
    merchant,
    entity_default,
    txn_count,
    total_amount
FROM merchant_rules
WHERE txn_count > 0
ORDER BY txn_count DESC;

-- 5. Find uncategorized transactions
SELECT id, date, merchant, amount, status
FROM transactions
WHERE status = '⚠️'
ORDER BY date DESC
LIMIT 20;

-- 6. Find duplicate merchant rules (should be zero)
SELECT
    merchant_normalized,
    COUNT(*) as count
FROM merchant_rules
GROUP BY merchant_normalized
HAVING COUNT(*) > 1;

-- 7. Test merchant existence check
SELECT EXISTS(
    SELECT 1 FROM merchant_rules
    WHERE merchant_normalized = 'penske truck rental'
) as penske_exists;
