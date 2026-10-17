# Row Level Security (RLS) Implementation

This document describes the comprehensive Row Level Security (RLS) implementation for the WinMix TipsterHub project.

## Overview

The RLS implementation enforces proper access control across all 25 database tables, moving from permissive "allow all" policies to a secure, role-based access control system with proper user data isolation.

## Security Architecture

### Role Hierarchy

1. **admin** - Full system access to all tables and operations
2. **analyst** - Read access to analytics, write access to experiments
3. **viewer** - Read-only access to public data
4. **demo** - Limited read-only access with rate limiting
5. **anonymous** - Read-only access to approved public tables only

### Table Classification

#### Public Reference Data (Read-only for anonymous users)
- `leagues` - League information
- `teams` - Team information  
- `matches` - Match data
- `pattern_templates` - Pattern configuration
- `predictions` - System predictions (read-only)
- `pattern_accuracy` - Pattern performance metrics
- `crowd_wisdom` - Aggregated user predictions
- `market_odds` - External odds data
- `value_bets` - Value bet calculations

#### User-Owned Data (Row-level security)
- `detected_patterns` - User's pattern detections
- `team_patterns` - User's team patterns
- `user_predictions` - User's predictions

#### Analytics Tables (Analyst read access)
- `model_performance` - Model performance metrics
- `model_comparison` - Model comparison data
- `cross_league_correlations` - Cross-league analytics
- `meta_patterns` - Meta pattern data
- `league_characteristics` - League analytics
- `system_health` - System monitoring
- `performance_metrics` - Performance data
- `feature_experiments` - ML experiments

#### System Tables (Service/Admin only)
- `scheduled_jobs` - Job registry
- `job_execution_logs` - Job execution history
- `pattern_definitions` - Pattern detection config
- `computation_graph` - Pipeline configuration
- `information_freshness` - Data freshness tracking

## Implementation Details

### 1. Foundation Migration (`20251205140000_secure_rls_baseline.sql`)

**Key Components:**
- **user_profiles table**: Manages user roles and permissions
- **created_by columns**: Added to user-owned tables for ownership tracking
- **Security helper functions**: `current_app_role()`, `is_admin()`, `is_analyst()`, `is_service_role()`
- **Triggers**: Automatic population of `created_by` fields
- **Backfill strategy**: Historical data assigned to service role

**Security Functions:**
```sql
-- Get current user's role
SELECT public.current_app_role();

-- Check if user is admin
SELECT public.is_admin();

-- Check if user is analyst or admin
SELECT public.is_analyst();

-- Check if request is from service role
SELECT public.is_service_role();
```

### 2. Policy Migration (`20251205140100_comprehensive_rls_policies.sql`)

**Policy Strategy:**
- **Deny-by-default**: All tables start with no access
- **Explicit allow policies**: Granular permissions per role
- **FORCE ROW LEVEL SECURITY**: Cannot be bypassed
- **Ownership-based isolation**: Users only see their own data

**Policy Examples:**
```sql
-- Public read access to leagues
CREATE POLICY "Public read access to leagues" ON public.leagues
  FOR SELECT USING (true);

-- Admin full access to leagues  
CREATE POLICY "Admin full access to leagues" ON public.leagues
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Users can only see their own detected patterns
CREATE POLICY "Users read own detected patterns" ON public.detected_patterns
  FOR SELECT USING (created_by = auth.uid() OR created_by IS NULL);

-- Analysts can read all analytics
CREATE POLICY "Analysts read model performance" ON public.model_performance
  FOR SELECT USING (public.is_analyst());
```

### 3. Security Tests (`test_rls_policies.sql`)

**Test Coverage:**
- ✅ RLS enabled on all tables
- ✅ FORCE ROW LEVEL SECURITY active
- ✅ Anonymous access restrictions
- ✅ Role-based access control
- ✅ User data isolation
- ✅ Service role access
- ✅ Policy completeness
- ✅ Helper functions

## Usage

### Running Security Tests

```bash
# Run all security tests
npm run test:security

# Run with detailed user context testing
./scripts/test-security.sh --with-user-contexts
```

### Manual Verification

```sql
-- Check RLS status
SELECT 
    schemaname,
    tablename,
    relrowsecurity as rls_enabled,
    forcerowsecurity as force_rls
FROM pg_tables t
JOIN pg_class c ON t.relname = t.tablename
WHERE t.schemaname = 'public';

-- Check policies per table
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Testing with Different Roles

```sql
-- Set user context for testing
SET LOCAL request.jwt.claims := '{
  "role": "service_role", 
  "aud": "authenticated", 
  "user_id": "00000000-0000-0000-0000-000000000003"
}';

-- Test current role
SELECT public.current_app_role();

-- Test access
SELECT COUNT(*) FROM public.detected_patterns; -- Should show user's data only
```

## Migration Process

### For New Environments

1. Apply baseline migration:
   ```sql
   -- Creates user_profiles, adds created_by columns, sets up security functions
   ```

2. Apply policies migration:
   ```sql
   -- Enables FORCE RLS, creates granular policies
   ```

3. Run security tests:
   ```bash
   npm run test:security
   ```

### For Existing Environments

1. **Backup**: Create database backup
2. **Review**: Check existing data and users
3. **Apply**: Run migrations in order
4. **Test**: Verify all security tests pass
5. **Monitor**: Watch for policy performance impact

### User Setup

1. Create user profiles for existing users:
   ```sql
   INSERT INTO public.user_profiles (user_id, role, is_active)
   VALUES ('user-uuid', 'viewer', true);
   ```

2. Assign appropriate roles:
   - `admin` for system administrators
   - `analyst` for data analysts
   - `viewer` for regular users
   - `demo` for demonstration accounts

## Performance Considerations

### Indexes
- `created_by` columns indexed for fast ownership checks
- Composite indexes on frequently queried columns
- Partial indexes for active data

### Policy Optimization
- Simple boolean expressions in policies
- Minimal function calls in policy conditions
- Efficient role checking with helper functions

### Monitoring
- Monitor policy evaluation overhead
- Track slow queries involving RLS
- Review policy performance regularly

## Troubleshooting

### Common Issues

1. **Policy too restrictive**: Users can't access their own data
   ```sql
   -- Check current user and role
   SELECT auth.uid(), public.current_app_role();
   
   -- Check if created_by matches
   SELECT * FROM detected_patterns WHERE created_by = auth.uid();
   ```

2. **Performance issues**: Slow queries after RLS
   ```sql
   -- Check query plan with RLS
   EXPLAIN ANALYZE SELECT * FROM detected_patterns;
   
   -- Add missing indexes
   CREATE INDEX CONCURRENTLY idx_detected_patterns_created_by 
   ON detected_patterns(created_by);
   ```

3. **Service role access**: Background jobs failing
   ```sql
   -- Verify service role permissions
   SELECT has_table_privilege('service_role', 'detected_patterns', 'INSERT');
   ```

### Debugging

```sql
-- Check effective policies for current user
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'your_table';

-- Test policy evaluation
SELECT * FROM your_table WHERE current_setting('request.jwt.claims', true)::jsonb->>'user_id' = created_by::text;
```

## Security Best Practices

1. **Principle of Least Privilege**: Users get minimum required access
2. **Regular Audits**: Review policies and user roles periodically
3. **Monitoring**: Track access patterns and policy violations
4. **Testing**: Comprehensive test coverage for all security scenarios
5. **Documentation**: Keep policy matrix and role definitions current

## Future Enhancements

1. **Column-level Security**: Restrict access to sensitive columns
2. **Time-based Access**: Temporary access for specific time periods
3. **Dynamic Policies**: Context-aware access control
4. **Audit Logging**: Comprehensive access audit trail
5. **Policy Performance**: Advanced optimization techniques

## Files Created

- `supabase/policies/POLICY_MATRIX.md` - Complete policy documentation
- `supabase/migrations/20251205140000_secure_rls_baseline.sql` - Foundation migration
- `supabase/migrations/20251205140100_comprehensive_rls_policies.sql` - Policies migration
- `supabase/tests/security/test_rls_policies.sql` - Security tests
- `scripts/test-security.sh` - Test runner script
- `SECURITY_IMPLEMENTATION.md` - This documentation

## Support

For questions or issues with the RLS implementation:

1. Check the security test output: `npm run test:security`
2. Review the policy matrix: `supabase/policies/POLICY_MATRIX.md`
3. Consult the troubleshooting section above
4. Check Supabase documentation for RLS best practices