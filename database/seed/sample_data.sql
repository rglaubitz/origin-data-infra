-- ============================================
-- Sample Data for Testing
-- Run AFTER tables and triggers are created
-- ============================================

-- Insert sample merchant rules
INSERT INTO merchant_rules (merchant, entity_default, origin_qb_account, openhaul_qb_account, personal_qb_account, category)
VALUES
    ('Penske Truck Rental', 'Origin', 'Equipment Expense:Equipment Short-Term Rentals', 'N/A', 'N/A', 'Equipment'),
    ('Claude.ai', 'OpenHaul', 'N/A', 'Office expenses:Software & apps', 'N/A', 'Software'),
    ('Kenworth Sales', 'Origin', 'Equipment Expense:Repair & Maintenance', 'N/A', 'N/A', 'Repairs'),
    ('Lexington Law', 'Personal', 'N/A', 'N/A', 'Loans to officers', 'Personal'),
    ('Samsara', 'Origin', 'Equipment Expense:Safety & Compliance:Dues & subscriptions', 'N/A', 'N/A', 'Compliance'),
    ('DAT Freight', 'OpenHaul', 'N/A', 'Office expenses:Software & apps', 'N/A', 'Software'),
    ('United Healthcare', 'Origin', 'Payroll Expenses:Health Insurance', 'N/A', 'N/A', 'Benefits')
ON CONFLICT (merchant) DO NOTHING;

-- Insert sample transactions (triggers will auto-compute qb_account)
INSERT INTO transactions (date, merchant, amount, entity, source_account)
VALUES
    ('2025-01-01', 'Penske Truck Rental', -1500.00, 'Origin', 'US Bank'),
    ('2025-01-02', 'Claude.ai', -20.00, 'OpenHaul', 'Amex'),
    ('2025-01-03', 'Kenworth Sales', -450.00, 'Origin', 'US Bank'),
    ('2025-01-04', 'Unknown Vendor', -100.00, 'NEEDS REVIEW', 'Bill.com'),
    ('2025-01-05', 'Lexington Law', -99.00, 'Personal', 'Amex');

-- Verify triggers worked
SELECT
    t.merchant,
    t.entity,
    t.qb_account,
    t.status,
    mr.txn_count
FROM transactions t
LEFT JOIN merchant_rules mr ON LOWER(TRIM(t.merchant)) = mr.merchant_normalized
ORDER BY t.date;
