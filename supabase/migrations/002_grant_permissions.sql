-- Grant API access to tables
-- Run after 001_initial_schema.sql

-- Grant to authenticated and service_role
GRANT ALL ON merchant_rules TO authenticated, service_role;
GRANT ALL ON transactions TO authenticated, service_role;
GRANT ALL ON merchant_aliases TO authenticated, service_role;

-- Grant to anon for read access (optional, remove if not needed)
GRANT SELECT ON merchant_rules TO anon;
GRANT SELECT ON transactions TO anon;
GRANT SELECT ON merchant_aliases TO anon;

-- Ensure sequences are accessible (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role, anon;
