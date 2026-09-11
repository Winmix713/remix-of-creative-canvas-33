# Operations Runbook
**WinMix TipsterHub – Build, Run, Deploy, Troubleshoot**

---

## Table of Contents
1. [Local Development](#1-local-development)
2. [Building & Testing](#2-building--testing)
3. [Database Operations](#3-database-operations)
4. [Edge Functions Management](#4-edge-functions-management)
5. [Deployment](#5-deployment)
6. [Monitoring & Observability](#6-monitoring--observability)
7. [Troubleshooting](#7-troubleshooting)
8. [Maintenance & Support](#8-maintenance--support)

---

## 1. Local Development

### 1.1 Initial Setup

**Prerequisites:**
- Node.js 18+ (check: `node --version`)
- npm 8+ or bun 1+ (check: `npm --version`)
- Supabase CLI (optional, for local functions): `npm install -g supabase`
- Git (check: `git --version`)

**Clone Repository:**
```bash
git clone <repository-url>
cd winmix-tipsterhub
```

**Install Dependencies:**
```bash
npm ci  # Clean install (recommended for consistent builds)
# OR
npm install  # Regular install
```

**Configure Environment:**
```bash
# Copy example to create your local .env
cp .env.example .env

# Edit .env with your Supabase credentials
# Get credentials from: https://supabase.com/dashboard/project/wclutzbojatqtxwlvtab
nano .env  # or use your preferred editor
```

**Required `.env` values:**
```bash
VITE_SUPABASE_PROJECT_ID="wclutzbojatqtxwlvtab"
VITE_SUPABASE_URL="https://wclutzbojatqtxwlvtab.supabase.co"
VITE_SUPABASE_ANON_KEY="<your_anon_key_from_dashboard>"
VITE_SUPABASE_PUBLISHABLE_KEY="<same_as_anon_key>"
```

### 1.2 Start Development Server

**Standard Mode:**
```bash
npm run dev
```

**Output:**
```
VITE v5.4.19  ready in 450 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

**Access Application:**
- Open browser: `http://localhost:5173`
- Hot reload enabled (changes reflect immediately)

**Common Ports:**
- **Frontend (Vite):** `5173`
- **Supabase Local API:** `54321` (if running local Supabase)
- **Postgres:** `54322` (if running local Supabase)

### 1.3 Local Supabase (Optional)

**Start Local Supabase Stack:**
```bash
supabase start
```

**Output:**
```
API URL: http://localhost:54321
DB URL: postgresql://postgres:postgres@localhost:54322/postgres
Studio URL: http://localhost:54323
Anon key: eyJhbGc...
Service role key: eyJhbGc...
```

**Update `.env` for local development:**
```bash
VITE_SUPABASE_URL="http://localhost:54321"
VITE_SUPABASE_ANON_KEY="<local_anon_key_from_above>"
```

**Stop Local Supabase:**
```bash
supabase stop
```

### 1.4 Development Workflow

**Typical Development Flow:**
1. Start dev server: `npm run dev`
2. Make changes to files in `src/`
3. Browser auto-refreshes
4. Check console for errors
5. Test changes manually
6. Run linter: `npm run lint`
7. Commit changes: `git commit -am "Description"`

**File Watching:**
- Vite watches: `src/**/*`, `index.html`, `vite.config.ts`
- Auto-reload on changes
- Hot Module Replacement (HMR) for React components

---

## 2. Building & Testing

### 2.1 Linting

**Run ESLint:**
```bash
npm run lint
```

**Fix Auto-fixable Issues:**
```bash
npx eslint . --fix
```

**Common Lint Errors:**
- `react-refresh/only-export-components`: Separate component exports from utilities
- `@typescript-eslint/no-explicit-any`: Replace `any` with specific types
- `react-hooks/exhaustive-deps`: Add missing dependencies to useEffect

### 2.2 Type Checking

**Run TypeScript Compiler:**
```bash
npx tsc --noEmit
```

**Output:**
- ✅ Success: No output
- ❌ Errors: List of type errors with file locations

**Common Type Errors:**
- `Type 'X' is not assignable to type 'Y'`: Check type definitions
- `Property 'foo' does not exist on type 'Bar'`: Add property to interface
- `Cannot find module 'X'`: Check import paths

### 2.3 Building for Production

**Development Build:**
```bash
npm run build:dev
```

**Production Build:**
```bash
npm run build
```

**Build Output:**
```
vite v5.4.19 building for production...
✓ 2986 modules transformed.
dist/index.html                    1.18 kB
dist/assets/index-1rD2WQkg.css    97.43 kB │ gzip: 15.63 kB
dist/assets/index-CxW7HinB.js  1,302.02 kB │ gzip: 361.15 kB
✓ built in 14.77s
```

**Build Artifacts:**
- Location: `dist/` folder
- Contents: HTML, CSS, JS, assets
- Ready for deployment to static hosting

**Preview Production Build:**
```bash
npm run preview
```
- Serves `dist/` folder at `http://localhost:4173`
- Test production build locally before deploying

### 2.4 Testing

**Run All Tests:**
```bash
npm test
```

**Run Specific Test Suite:**
```bash
npm test -- Phase9        # Phase 9 tests
npm test -- auth          # Authentication tests
npm test -- <pattern>     # Any test file matching pattern
```

**Watch Mode:**
```bash
npm test -- --watch
```

**Test Coverage:**
```bash
npm test -- --coverage
```

### 2.5 Security Audit

**Run npm Audit:**
```bash
npm audit
```

**Fix Vulnerabilities:**
```bash
npm audit fix          # Auto-fix if available
npm audit fix --force  # Force major version updates (use with caution)
```

**Custom Security Test Script:**
```bash
npm run test:security
```

**Output:**
- Vulnerability count by severity
- Recommendations for fixes
- Affected packages

---

## 3. Database Operations

### 3.1 Viewing Schema

**Via Supabase Dashboard:**
1. Go to [Dashboard](https://supabase.com/dashboard/project/wclutzbojatqtxwlvtab)
2. Navigate to **Table Editor**
3. View tables, columns, relationships

**Via SQL Editor:**
1. Dashboard > **SQL Editor**
2. Run: `\dt` or `SELECT * FROM information_schema.tables WHERE table_schema = 'public';`

**Via CLI:**
```bash
supabase db dump --project-ref wclutzbojatqtxwlvtab > schema.sql
cat schema.sql | grep "CREATE TABLE"
```

### 3.2 Running Migrations

**Check Migration Status:**
```bash
supabase migration list --project-ref wclutzbojatqtxwlvtab
```

**Apply All Pending Migrations:**
```bash
supabase db push --project-ref wclutzbojatqtxwlvtab
```

**Expected Output:**
```
Applying migrations...
  20251031233306_6ef40928... ✓ Applied
  20251102152000_phase_3... ✓ Applied
  20251106000000_add_user_profiles... ✓ Applied
```

**Create New Migration:**
```bash
supabase migration new add_new_feature
```

**Edit Migration:**
```bash
# File created: supabase/migrations/YYYYMMDDHHMMSS_add_new_feature.sql
nano supabase/migrations/<timestamp>_add_new_feature.sql
```

**Apply New Migration:**
```bash
supabase db push --project-ref wclutzbojatqtxwlvtab
```

### 3.3 Seeding Data

**Run Seed Script:**
```bash
# Seed data is typically in migration files
# For manual seeding, use SQL Editor in Dashboard or:
psql "postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres" -f seed.sql
```

**Common Seed Operations:**
```sql
-- Insert test leagues
INSERT INTO leagues (name, country, season) VALUES ('Premier League', 'England', '2024/25');

-- Insert test teams
INSERT INTO teams (name, league_id) VALUES ('Test Team', (SELECT id FROM leagues LIMIT 1));

-- Create admin user (after first signup)
UPDATE user_profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

### 3.4 Backup & Restore

**Backup Database:**
```bash
supabase db dump --project-ref wclutzbojatqtxwlvtab > backup_$(date +%Y%m%d).sql
```

**Restore from Backup:**
```bash
# WARNING: This will overwrite existing data
psql "postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres" < backup_20251105.sql
```

**Automated Backups:**
Supabase automatically backs up daily. Access from:
- Dashboard > **Settings** > **Database** > **Backups**

### 3.5 Direct Database Access

**Via psql:**
```bash
psql "postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres"
```

**Via GUI Tools:**
- **pgAdmin:** Use connection string from Dashboard > Settings > Database
- **DBeaver:** Same connection details
- **Postico (Mac):** Same connection details

**Connection Details:**
- Host: `db.wclutzbojatqtxwlvtab.supabase.co`
- Port: `5432` (session mode) or `6543` (transaction mode)
- Database: `postgres`
- User: `postgres`
- Password: Get from Dashboard > Settings > Database

---

## 4. Edge Functions Management

### 4.1 List Functions

**Via CLI:**
```bash
supabase functions list --project-ref wclutzbojatqtxwlvtab
```

**Via Dashboard:**
1. Go to [Dashboard](https://supabase.com/dashboard/project/wclutzbojatqtxwlvtab)
2. Navigate to **Edge Functions**
3. View deployed functions

**Local List:**
```bash
ls -la supabase/functions/
```

### 4.2 Testing Functions Locally

**Serve Single Function:**
```bash
supabase functions serve <function-name> --no-verify-jwt
```

**Example:**
```bash
supabase functions serve get-predictions --no-verify-jwt
```

**Output:**
```
Serving functions on http://localhost:54321/functions/v1/
  - get-predictions
```

**Test Function:**
```bash
curl -X POST http://localhost:54321/functions/v1/get-predictions \
  -H "Content-Type: application/json" \
  -d '{"match_id": "abc123"}'
```

**Serve All Functions:**
```bash
supabase functions serve
```

### 4.3 Deploying Functions

**Deploy All Functions:**
```bash
supabase functions deploy --project-ref wclutzbojatqtxwlvtab
```

**Deploy Single Function:**
```bash
supabase functions deploy <function-name> --project-ref wclutzbojatqtxwlvtab
```

**Example:**
```bash
supabase functions deploy phase9-temporal-decay --project-ref wclutzbojatqtxwlvtab
```

**Expected Output:**
```
Deploying function: phase9-temporal-decay
  ✓ Function deployed successfully
  URL: https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/phase9-temporal-decay
```

**Verify Deployment:**
```bash
curl https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/phase9-temporal-decay \
  -H "Authorization: Bearer <anon_key>"
```

### 4.4 Managing Secrets

**List Secrets:**
```bash
supabase secrets list --project-ref wclutzbojatqtxwlvtab
```

**Set Secret:**
```bash
supabase secrets set API_KEY=your_secret_value --project-ref wclutzbojatqtxwlvtab
```

**Unset Secret:**
```bash
supabase secrets unset API_KEY --project-ref wclutzbojatqtxwlvtab
```

**Via Dashboard:**
1. Dashboard > **Edge Functions** > **Secrets**
2. Add/Edit/Delete secrets

### 4.5 Viewing Logs

**Stream Logs:**
```bash
supabase functions logs <function-name> --project-ref wclutzbojatqtxwlvtab
```

**Example:**
```bash
supabase functions logs jobs-trigger --project-ref wclutzbojatqtxwlvtab
```

**View Last N Lines:**
```bash
supabase functions logs jobs-trigger --project-ref wclutzbojatqtxwlvtab --tail 100
```

**Via Dashboard:**
1. Dashboard > **Edge Functions**
2. Click function name
3. View **Logs** tab

---

## 5. Deployment

### 5.1 Pre-Deployment Checklist

**Code Quality:**
- [ ] `npm run lint` passes (or only warnings)
- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` passes
- [ ] All tests pass: `npm test`
- [ ] Code reviewed and approved

**Configuration:**
- [ ] `.env` updated with production values
- [ ] Supabase secrets configured
- [ ] Edge Functions JWT verification enabled (production)
- [ ] CORS configured for production domain
- [ ] RLS policies enabled on sensitive tables

**Database:**
- [ ] Migrations applied: `supabase db push`
- [ ] Seed data loaded
- [ ] First admin user created
- [ ] Database backup taken

**Security:**
- [ ] JWT verification configured: `./scripts/verify-jwt-config.sh`
- [ ] Security posture verified: `./scripts/verify-security.sh`
- [ ] RLS policies verified: `./scripts/verify-sensitive-rls.sh`
- [ ] Feature flags configured: `./scripts/setup-feature-flags.sh`

**Testing:**
- [ ] Staging environment tested
- [ ] Critical user flows verified (signup, login, predictions)
- [ ] Performance tested (Lighthouse score)
- [ ] Security scan completed
- [ ] JWT verification tested (see JWT_VERIFICATION_TESTING.md)

### 5.2 Deploying Frontend

**Build Production Assets:**
```bash
npm ci
npm run build
```

**Deploy to Vercel:**
```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Deploy to Netlify:**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod --dir=dist
```

**Deploy to GitHub Pages:**
```bash
# Install gh-pages
npm install --save-dev gh-pages

# Add to package.json scripts:
# "deploy": "gh-pages -d dist"

# Deploy
npm run deploy
```

**Environment Variables (Platform-Specific):**

**Vercel:**
1. Dashboard > Project > Settings > Environment Variables
2. Add all `VITE_*` variables
3. Redeploy

**Netlify:**
1. Dashboard > Site > Settings > Environment Variables
2. Add all `VITE_*` variables
3. Redeploy

### 5.3 Deploying Edge Functions

**Deploy All Functions:**
```bash
supabase functions deploy --project-ref wclutzbojatqtxwlvtab
```

**Verify Deployment:**
```bash
# Test a public function
curl https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/get-predictions \
  -H "Content-Type: application/json" \
  -d '{"limit": 10}'
```

### 5.4 Database Migrations (Production)

**Backup Before Migration:**
```bash
supabase db dump --project-ref wclutzbojatqtxwlvtab > pre_migration_backup.sql
```

**Apply Migrations:**
```bash
supabase db push --project-ref wclutzbojatqtxwlvtab
```

**Verify Tables:**
```bash
# Via SQL Editor in Dashboard
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
```

### 5.5 Post-Deployment Verification

**Security Verification:**
```bash
# Verify JWT configuration
./scripts/verify-jwt-config.sh

# Verify overall security posture
./scripts/verify-security.sh

# Verify RLS policies
./scripts/verify-sensitive-rls.sh
```

**Smoke Tests:**
```bash
# Test homepage
curl -I https://yourdomain.com/

# Test public function (should work without auth)
curl https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/get-predictions \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"limit": 10}'

# Test protected function WITHOUT auth (should return 401)
curl https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/analyze-match \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -d '{"matchId": "123"}'

# Test protected function WITH auth (should work if authorized)
curl https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/jobs-list \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <valid_user_token>"
```

**Manual Testing:**
1. Open production URL
2. Sign up with test account
3. Log in
4. Navigate to protected routes
5. Test critical features (predictions, analytics)
6. Check browser console for errors

**Performance Check:**
```bash
# Run Lighthouse
npx lighthouse https://yourdomain.com --view
```

---

## 6. Monitoring & Observability

### 6.1 Application Monitoring

**Built-in Monitoring Dashboard:**
- URL: `https://yourdomain.com/monitoring`
- Features:
  - System health metrics
  - Data freshness checks
  - Computation logs
  - Anomaly alerts

**Supabase Dashboard:**
1. [Dashboard](https://supabase.com/dashboard/project/wclutzbojatqtxwlvtab)
2. Navigate to:
   - **API** tab: Request logs
   - **Database** tab: Query performance
   - **Edge Functions** tab: Function logs and performance
   - **Auth** tab: User activity

### 6.2 Error Tracking

**Recommended: Sentry Integration**

**Setup:**
```bash
npm install @sentry/react @sentry/tracing
```

**Configure:**
```typescript
// In src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: 'https://your-dsn@sentry.io/project-id',
  environment: import.meta.env.MODE,
  tracesSampleRate: 1.0,
});
```

**Test Error Tracking:**
```typescript
// Trigger test error
Sentry.captureException(new Error('Test error'));
```

### 6.3 Performance Monitoring

**Web Vitals:**
```bash
npm install web-vitals
```

```typescript
// In src/main.tsx
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';

getCLS(console.log);
getFID(console.log);
getFCP(console.log);
getLCP(console.log);
getTTFB(console.log);
```

**Lighthouse CI:**
```bash
npm install -g @lhci/cli

# Run audit
lhci autorun --upload.target=temporary-public-storage
```

### 6.4 Log Aggregation

**Supabase Function Logs:**
```bash
# Stream all logs
supabase functions logs --project-ref wclutzbojatqtxwlvtab

# Filter by function
supabase functions logs jobs-trigger --project-ref wclutzbojatqtxwlvtab
```

**External Log Aggregation (Recommended for Production):**
- **Loggly:** Real-time log aggregation
- **Datadog:** Full observability platform
- **New Relic:** APM with logs

### 6.5 Uptime Monitoring

**Recommended Services:**
- **UptimeRobot:** Free tier available, checks every 5 minutes
- **Pingdom:** Detailed performance metrics
- **StatusCake:** Multi-location checks

**Setup UptimeRobot:**
1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Add monitor for `https://yourdomain.com`
3. Configure alerts (email, Slack, etc.)
4. Monitor response time and uptime percentage

**Health Check Endpoint:**
Create dedicated health check function:
```typescript
// supabase/functions/health/index.ts
Deno.serve(() => {
  return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

---

## 7. Troubleshooting

### 7.1 Common Build Issues

**Problem: `npm ci` fails**
```
Error: Cannot find module 'X'
```

**Solution:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Problem: Build fails with "Out of memory"**
```
FATAL ERROR: Reached heap limit Allocation failed
```

**Solution:**
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

**Problem: TypeScript errors in build**
```
error TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
```

**Solution:**
```bash
# Check TypeScript errors
npx tsc --noEmit

# Fix type errors in reported files
# Then rebuild
npm run build
```

### 7.2 Runtime Errors

**Problem: "Supabase client not initialized"**
```
Error: supabase is undefined
```

**Solution:**
1. Check `.env` file exists and has correct values
2. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
3. Restart dev server: `npm run dev`

**Problem: "Failed to fetch" on API calls**
```
TypeError: Failed to fetch
```

**Solution:**
1. Check network tab in browser DevTools
2. Verify Supabase URL is correct
3. Check CORS configuration
4. Verify Edge Function is deployed:
   ```bash
   supabase functions list --project-ref wclutzbojatqtxwlvtab
   ```

**Problem: "401 Unauthorized" on protected routes**
```
Error: User not authenticated
```

**Solution:**
1. Check if user is logged in: `localStorage.getItem('supabase.auth.token')`
2. Verify token is valid:
   ```typescript
   const { data, error } = await supabase.auth.getSession();
   console.log(data, error);
   ```
3. Try logging out and back in
4. Check if session expired

### 7.3 Authentication Issues

**Problem: User can't sign up**
```
Error: Email already registered
```

**Solution:**
1. Check if email exists in `auth.users` table (via SQL Editor)
2. If test user, delete and recreate:
   ```sql
   DELETE FROM auth.users WHERE email = 'test@example.com';
   ```

**Problem: Email verification not working**
```
User signed up but can't log in
```

**Solution:**
1. Check Supabase Dashboard > Auth > Settings > Email Templates
2. Verify SMTP configuration
3. For development, disable email verification:
   ```sql
   UPDATE auth.config SET confirm_email_before_login = false;
   ```

**Problem: Role-based access not working**
```
Admin user can't access /jobs route
```

**Solution:**
1. Verify user profile exists:
   ```sql
   SELECT * FROM user_profiles WHERE email = 'admin@example.com';
   ```
2. Check role:
   ```sql
   UPDATE user_profiles SET role = 'admin' WHERE email = 'admin@example.com';
   ```
3. Log out and back in to refresh token

### 7.4 Edge Function Issues

**Problem: Function returns 500 error**
```
Internal Server Error
```

**Solution:**
1. Check function logs:
   ```bash
   supabase functions logs <function-name> --project-ref wclutzbojatqtxwlvtab
   ```
2. Look for error messages
3. Common causes:
   - Missing environment variables
   - Database connection issues
   - Invalid input data
4. Test locally:
   ```bash
   supabase functions serve <function-name>
   curl -X POST http://localhost:54321/functions/v1/<function-name> -d '{}'
   ```

**Problem: Function not found (404)**
```
Function <name> not found
```

**Solution:**
1. Verify function is deployed:
   ```bash
   supabase functions list --project-ref wclutzbojatqtxwlvtab
   ```
2. If not listed, deploy:
   ```bash
   supabase functions deploy <function-name> --project-ref wclutzbojatqtxwlvtab
   ```

**Problem: Function times out**
```
Error: Request timeout
```

**Solution:**
1. Optimize function logic (reduce DB queries)
2. Increase timeout in function config (max 150 seconds)
3. Consider async processing for long tasks

### 7.5 Database Issues

**Problem: Migration fails**
```
Error: relation "X" already exists
```

**Solution:**
1. Check migration history:
   ```bash
   supabase migration list --project-ref wclutzbojatqtxwlvtab
   ```
2. If migration was partially applied, manually fix in SQL Editor
3. Use `CREATE TABLE IF NOT EXISTS` in migrations

**Problem: RLS blocks query**
```
Error: new row violates row-level security policy
```

**Solution:**
1. Check RLS policies for table:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'your_table';
   ```
2. Verify user has correct role
3. Test with service role (bypasses RLS):
   ```bash
   # In Edge Function with service role key
   const supabase = createClient(url, serviceRoleKey);
   ```

**Problem: Connection pool exhausted**
```
Error: remaining connection slots are reserved
```

**Solution:**
1. Use transaction mode port (6543) instead of session mode (5432)
2. Close connections properly in code
3. Upgrade Supabase plan for more connections

### 7.6 Performance Issues

**Problem: Slow page load**
```
Lighthouse score < 50
```

**Solution:**
1. Implement code splitting (see Section 8.1 in System Audit)
2. Optimize images (use WebP format)
3. Enable caching:
   ```typescript
   // In TanStack Query
   queryClient.setDefaultOptions({
     queries: {
       staleTime: 5 * 60 * 1000, // 5 minutes
     },
   });
   ```
4. Use React.lazy() for route-level components

**Problem: Slow database queries**
```
Query takes > 1 second
```

**Solution:**
1. Add indexes:
   ```sql
   CREATE INDEX idx_matches_date ON matches(match_date);
   ```
2. Optimize query (use EXPLAIN ANALYZE)
3. Use materialized views for complex aggregations

---

## 8. Maintenance & Support

### 8.1 Regular Maintenance Tasks

**Daily:**
- [ ] Monitor error logs (Sentry or equivalent)
- [ ] Check uptime status (UptimeRobot)
- [ ] Review Edge Function logs for anomalies

**Weekly:**
- [ ] Run `npm audit` and review vulnerabilities
- [ ] Check database storage usage (Supabase Dashboard)
- [ ] Review performance metrics (Lighthouse)
- [ ] Backup database:
   ```bash
   supabase db dump --project-ref wclutzbojatqtxwlvtab > backup_$(date +%Y%m%d).sql
   ```

**Monthly:**
- [ ] Update dependencies:
   ```bash
   npm outdated
   npm update
   ```
- [ ] Review and rotate API keys
- [ ] Check security advisories for dependencies
- [ ] Review user feedback and bug reports

**Quarterly:**
- [ ] Full security audit
- [ ] Performance optimization review
- [ ] Database cleanup (archive old data)
- [ ] Update documentation

### 8.2 Scaling Considerations

**Horizontal Scaling:**
- Frontend: Deploy to CDN (Vercel, Netlify)
- Edge Functions: Auto-scale with Supabase (up to 500 concurrent requests)
- Database: Upgrade Supabase plan for more connections

**Vertical Scaling:**
- Database: Upgrade to larger instance (Pro plan or Enterprise)
- Compute: Optimize queries, add indexes

**Caching Strategy:**
- Browser caching: Set appropriate cache headers
- CDN caching: Use Vercel/Netlify edge caching
- Application caching: TanStack Query with longer staleTime

### 8.3 Backup & Disaster Recovery

**Backup Strategy:**
1. **Database:** Daily automatic backups by Supabase (7-day retention on Free plan)
2. **Code:** Git repository (GitHub)
3. **Configuration:** Document all `.env` values in secure vault (1Password, etc.)

**Manual Backup:**
```bash
# Database
supabase db dump --project-ref wclutzbojatqtxwlvtab > backup.sql

# Edge Functions (code is in repo, but document secrets separately)
supabase secrets list --project-ref wclutzbojatqtxwlvtab > secrets_backup.txt
```

**Disaster Recovery Procedure:**
1. Provision new Supabase project (if primary is down)
2. Restore database from backup:
   ```bash
   psql "postgresql://..." < backup.sql
   ```
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy --project-ref <new-project-id>
   ```
4. Update `.env` with new project credentials
5. Deploy frontend with updated config
6. Update DNS (if domain changed)
7. Test all critical flows

**Recovery Time Objective (RTO):** 4 hours  
**Recovery Point Objective (RPO):** 24 hours (daily backups)

### 8.4 Support Contacts

**Internal Team:**
- **Product Owner:** [Name] - product-owner@example.com
- **Tech Lead:** [Name] - tech-lead@example.com
- **Security Lead:** [Name] - security@example.com

**External Services:**
- **Supabase Support:** support@supabase.io (or Dashboard support chat)
- **Hosting (Vercel/Netlify):** Use in-dashboard support
- **Sentry:** support@sentry.io

**Documentation Resources:**
- **Project README:** `/README.md`
- **This Runbook:** `/docs/OPERATIONS_RUNBOOK.md`
- **System Audit:** `/docs/SYSTEM_AUDIT_2025-11.md`
- **Configuration:** `/docs/CONFIGURATION_REFERENCE.md`
- **Authentication:** `/AUTHENTICATION.md`

### 8.5 Incident Response

**Severity Levels:**
- **P0 (Critical):** Service down, data loss risk - Response time: 15 minutes
- **P1 (High):** Core features broken - Response time: 1 hour
- **P2 (Medium):** Minor features broken - Response time: 4 hours
- **P3 (Low):** Cosmetic issues - Response time: 24 hours

**Incident Response Steps:**
1. **Detect:** Monitor alerts (Sentry, UptimeRobot)
2. **Assess:** Determine severity and impact
3. **Notify:** Alert on-call engineer and stakeholders
4. **Investigate:** Check logs, error traces, recent deployments
5. **Mitigate:** Implement temporary fix or rollback
6. **Resolve:** Deploy permanent fix
7. **Document:** Write postmortem with root cause and prevention steps

**Rollback Procedure:**
```bash
# Revert frontend deployment (Vercel example)
vercel rollback

# Revert Edge Function
supabase functions deploy <function-name> --project-ref <project-id> --import-map <previous-version>

# Revert database (use backup)
# WARNING: This will lose recent data
psql "postgresql://..." < backup.sql
```

---

## Quick Reference Commands

```bash
# Development
npm run dev                           # Start dev server
npm run build                         # Build for production
npm run lint                          # Run linter
npm test                              # Run tests

# Database
supabase db push                      # Apply migrations
supabase db dump > backup.sql        # Backup database
supabase migration new <name>        # Create migration

# Edge Functions
supabase functions serve <name>      # Test locally
supabase functions deploy <name>     # Deploy function
supabase functions logs <name>       # View logs
supabase secrets set KEY=VALUE       # Add secret

# Deployment
npm run build && vercel --prod       # Deploy to Vercel
supabase functions deploy --project-ref <id>  # Deploy all functions

# Troubleshooting
supabase functions logs --project-ref <id>    # View all logs
npm audit                                      # Security audit
npx tsc --noEmit                              # Type check
```

---

**Last Updated:** November 5, 2025  
**Maintained By:** Operations Team  
**On-Call Rotation:** See internal wiki
