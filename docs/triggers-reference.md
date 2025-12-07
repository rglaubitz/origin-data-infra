# Supabase Triggers & Functions Reference
## PostgreSQL Trigger Patterns for Origin Transport

**Purpose:** Engineering reference for building database triggers  
**Source:** Context7 - Supabase & PostgreSQL Official Documentation

---

## Core Concepts

### Trigger Types

| Type | When It Runs | Use Case |
|------|--------------|----------|
| `BEFORE INSERT` | Before row is inserted | Validate/modify incoming data |
| `BEFORE UPDATE` | Before row is updated | Validate/modify changes |
| `AFTER INSERT` | After row is inserted | Audit logging, cascade updates |
| `AFTER UPDATE` | After row is updated | Audit logging, cascade updates |
| `AFTER DELETE` | After row is deleted | Cleanup, audit logging |

### Special Variables in Trigger Functions

| Variable | Description |
|----------|-------------|
| `NEW` | The new row (INSERT/UPDATE) |
| `OLD` | The old row (UPDATE/DELETE) |
| `TG_OP` | Operation: 'INSERT', 'UPDATE', 'DELETE' |
| `TG_TABLE_NAME` | Name of the table that fired trigger |
| `TG_TABLE_SCHEMA` | Schema of the table |

---

## Pattern 1: Validation & Auto-Population (BEFORE Trigger)

Use this pattern to validate data and auto-populate fields before insert/update.

```sql
CREATE OR REPLACE FUNCTION validate_and_stamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Validation
    IF NEW.merchant IS NULL THEN
        RAISE EXCEPTION 'merchant cannot be null';
    END IF;
    
    IF NEW.amount IS NULL OR NEW.amount = 0 THEN
        RAISE EXCEPTION 'amount must be non-zero';
    END IF;
    
    -- Auto-populate timestamp
    NEW.updated_at := NOW();
    
    -- Return modified row
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_stamp
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_and_stamp();
```

---

## Pattern 2: Lookup & Compute (BEFORE Trigger)

Use this pattern to lookup related data and compute derived fields.

```sql
CREATE OR REPLACE FUNCTION auto_assign_qb_account()
RETURNS TRIGGER AS $$
DECLARE
    rule RECORD;
BEGIN
    -- Lookup merchant rule
    SELECT * INTO rule 
    FROM merchant_rules
    WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));
    
    IF FOUND THEN
        -- Compute QB account based on entity
        NEW.qb_account := CASE NEW.entity
            WHEN 'Origin' THEN rule.origin_qb_account
            WHEN 'OpenHaul' THEN rule.openhaul_qb_account
            WHEN 'Personal' THEN rule.personal_qb_account
            ELSE 'NEEDS ASSIGNMENT'
        END;
        
        -- Set status based on result
        NEW.status := CASE 
            WHEN NEW.qb_account IS NOT NULL 
                 AND NEW.qb_account NOT IN ('N/A', 'NEEDS ASSIGNMENT')
            THEN '✓' 
            ELSE '⚠️' 
        END;
    ELSE
        NEW.qb_account := 'UNKNOWN MERCHANT';
        NEW.status := '⚠️';
    END IF;
    
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_qb_account
    BEFORE INSERT OR UPDATE OF merchant, entity ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION auto_assign_qb_account();
```

**Key Points:**
- `BEFORE` trigger so we can modify `NEW`
- `UPDATE OF merchant, entity` only fires when those columns change
- `DECLARE` block for local variables
- `SELECT INTO` for single-row lookups
- `FOUND` is TRUE if SELECT found a row

---

## Pattern 3: Counter Update (AFTER Trigger)

Use this pattern to update aggregate counters in related tables.

```sql
CREATE OR REPLACE FUNCTION update_merchant_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE merchant_rules
        SET txn_count = txn_count + 1,
            total_amount = total_amount + ABS(NEW.amount),
            updated_at = NOW()
        WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));
        
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE merchant_rules
        SET txn_count = txn_count - 1,
            total_amount = total_amount - ABS(OLD.amount),
            updated_at = NOW()
        WHERE merchant_normalized = LOWER(TRIM(OLD.merchant));
        
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Handle merchant change
        IF OLD.merchant IS DISTINCT FROM NEW.merchant THEN
            -- Decrement old merchant
            UPDATE merchant_rules
            SET txn_count = txn_count - 1,
                total_amount = total_amount - ABS(OLD.amount)
            WHERE merchant_normalized = LOWER(TRIM(OLD.merchant));
            
            -- Increment new merchant
            UPDATE merchant_rules
            SET txn_count = txn_count + 1,
                total_amount = total_amount + ABS(NEW.amount)
            WHERE merchant_normalized = LOWER(TRIM(NEW.merchant));
        END IF;
    END IF;
    
    RETURN NULL;  -- AFTER triggers return NULL
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_merchant_stats
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_merchant_stats();
```

**Key Points:**
- `AFTER` trigger because we're updating OTHER tables
- Return `NULL` for AFTER triggers (result is ignored)
- Use `OLD` for DELETE operations
- `IS DISTINCT FROM` handles NULL comparison correctly

---

## Pattern 4: Cascade Updates (AFTER Trigger)

When a merchant rule changes, update all affected transactions.

```sql
CREATE OR REPLACE FUNCTION cascade_rule_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- When QB accounts change, recalculate all transactions for this merchant
    UPDATE transactions
    SET entity = entity  -- Dummy update triggers auto_assign_qb_account
    WHERE LOWER(TRIM(merchant)) = NEW.merchant_normalized;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_rule_changes
    AFTER UPDATE OF origin_qb_account, openhaul_qb_account, personal_qb_account
    ON merchant_rules
    FOR EACH ROW
    EXECUTE FUNCTION cascade_rule_changes();
```

---

## Pattern 5: Audit Logging (AFTER Trigger)

Log all changes for audit trail.

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT DEFAULT current_user,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION audit_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (table_name, operation, old_data)
        VALUES (TG_TABLE_NAME, 'DELETE', to_jsonb(OLD));
        
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (table_name, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (table_name, operation, new_data)
        VALUES (TG_TABLE_NAME, 'INSERT', to_jsonb(NEW));
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply to multiple tables
CREATE TRIGGER trg_audit_transactions
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION audit_changes();

CREATE TRIGGER trg_audit_merchant_rules
    AFTER INSERT OR UPDATE OR DELETE ON merchant_rules
    FOR EACH ROW EXECUTE FUNCTION audit_changes();
```

---

## Generated Columns (Alternative to Triggers)

For simple computed values, use generated columns instead of triggers:

```sql
CREATE TABLE merchant_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant TEXT NOT NULL UNIQUE,
    -- Auto-computed normalized version
    merchant_normalized TEXT GENERATED ALWAYS AS (LOWER(TRIM(merchant))) STORED,
    entity_default TEXT,
    origin_qb_account TEXT,
    openhaul_qb_account TEXT,
    personal_qb_account TEXT
);
```

**Benefits:**
- No trigger needed
- Always in sync
- Can be indexed

**Limitations:**
- Can only reference columns in same row
- Cannot do lookups to other tables

---

## Common Gotchas

### 1. Infinite Loops
If trigger A updates table B, and trigger B updates table A, you get infinite recursion.

**Solution:** Use `pg_trigger_depth()` to detect recursion:
```sql
IF pg_trigger_depth() > 1 THEN
    RETURN NEW;  -- Skip if we're in a nested trigger
END IF;
```

### 2. Performance
Row-level triggers fire once per row. For bulk operations, consider statement-level triggers with transition tables.

### 3. Transaction Context
All trigger operations are in the same transaction as the original statement. If the trigger fails, the whole transaction rolls back.

### 4. NULL Handling
Use `IS DISTINCT FROM` instead of `!=` when comparing values that might be NULL:
```sql
-- WRONG: Returns NULL if either value is NULL
IF OLD.entity != NEW.entity THEN

-- RIGHT: Handles NULLs correctly
IF OLD.entity IS DISTINCT FROM NEW.entity THEN
```

---

## Testing Triggers

```sql
-- Insert test
INSERT INTO transactions (date, merchant, amount, entity)
VALUES ('2025-01-01', 'Test Merchant', 100.00, 'Origin');

-- Check result
SELECT * FROM transactions WHERE merchant = 'Test Merchant';

-- Update test
UPDATE transactions SET entity = 'OpenHaul' WHERE merchant = 'Test Merchant';

-- Check cascade
SELECT * FROM transactions WHERE merchant = 'Test Merchant';
```

---

*Source: Context7 - Supabase & PostgreSQL 17 Documentation*
