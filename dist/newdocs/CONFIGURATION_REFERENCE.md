# Configuration Reference
**WinMix TipsterHub – Comprehensive Configuration Guide**

---

## Table of Contents
1. [Environment Variables](#1-environment-variables)
2. [Supabase Configuration](#2-supabase-configuration)
3. [Authentication Setup](#3-authentication-setup)
4. [Edge Functions Secrets](#4-edge-functions-secrets)
5. [Feature Flags](#5-feature-flags)
6. [Database Connection](#6-database-connection)
7. [CORS & Security Headers](#7-cors--security-headers)
8. [Development vs Production](#8-development-vs-production)

---

## 1. Environment Variables

### 1.1 Required Variables (Core)

Create a `.env` file in the project root (copy from `.env.example`):

```bash
# Supabase Core Configuration
VITE_SUPABASE_PROJECT_ID="wclutzbojatqtxwlvtab"
VITE_SUPABASE_URL="https://wclutzbojatqtxwlvtab.supabase.co"
VITE_SUPABASE_ANON_KEY="your_anon_key_here"
VITE_SUPABASE_PUBLISHABLE_KEY="your_anon_key_here"  # Same as anon key
```

**How to Get These Values:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `wclutzbojatqtxwlvtab`
3. Navigate to **Settings** > **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

**Security Notes:**
- ✅ **Safe to commit:** `.env.example` (with placeholder values)
- ❌ **Never commit:** `.env` (actual values)
- ✅ **Safe for frontend:** Anon key (public key)
- ❌ **Never expose:** Service role key (backend only)

### 1.2 Optional Variables (Phase 9)

```bash
# Phase 9: Market Intelligence Integration
VITE_ODDS_API_KEY="your_odds_api_key_here"
VITE_ODDS_API_BASE_URL="https://api.the-odds-api.com/v4"
VITE_ODDS_API_RATE_LIMIT="500"

# Phase 9: Feature Toggles
VITE_PHASE9_FEATURE_FLAGS="collaborative_intelligence:true,market_integration:true,temporal_decay:true,self_improving:true"

# Phase 9: Temporal Decay Configuration
VITE_DEFAULT_DECAY_RATE="0.1"
VITE_FRESHNESS_CHECK_INTERVAL="60000"
VITE_STALE_DATA_THRESHOLD_DAYS="7"

# Phase 9: Self-Improving System
VITE_MAX_CONCURRENT_EXPERIMENTS="10"
VITE_FEATURE_GENERATION_SAMPLE_SIZE="2000"
VITE_STATISTICAL_SIGNIFICANCE_THRESHOLD="0.05"
```

**The Odds API Setup:**
1. Sign up at [The Odds API](https://the-odds-api.com)
2. Get API key from dashboard
3. Add to `.env` file
4. Test with: `curl https://api.the-odds-api.com/v4/sports/ -H "x-api-key: YOUR_KEY"`

### 1.3 OAuth Provider Configuration (Optional)

```bash
# Google OAuth
VITE_GOOGLE_CLIENT_ID="your_google_client_id"

# GitHub OAuth
VITE_GITHUB_CLIENT_ID="your_github_client_id"
```

**Setup Process:**
1. Configure provider in **Supabase Dashboard** > **Authentication** > **Providers**
2. Follow Supabase's provider-specific setup guides
3. Add client IDs to `.env` if needed for frontend display
4. Secrets are managed in Supabase, not in `.env`

### 1.4 Variable Reference Table

| Variable | Type | Default | Required | Example |
|----------|------|---------|----------|---------|
| `VITE_SUPABASE_PROJECT_ID` | string | N/A | ✅ Yes | `wclutzbojatqtxwlvtab` |
| `VITE_SUPABASE_URL` | URL | N/A | ✅ Yes | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | string | N/A | ✅ Yes | `eyJhbGc...` (long token) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | string | Same as anon | ❌ No | Same as above |
| `VITE_ODDS_API_KEY` | string | N/A | ❌ No | `abc123...` |
| `VITE_ODDS_API_BASE_URL` | URL | `https://api.the-odds-api.com/v4` | ❌ No | Default works |
| `VITE_ODDS_API_RATE_LIMIT` | number | `500` | ❌ No | `500` |
| `VITE_PHASE9_FEATURE_FLAGS` | CSV | All enabled | ❌ No | `collaborative_intelligence:true,...` |
| `VITE_DEFAULT_DECAY_RATE` | number | `0.1` | ❌ No | `0.05` - `0.5` |
| `VITE_FRESHNESS_CHECK_INTERVAL` | number (ms) | `60000` | ❌ No | `30000` (30 sec) |
| `VITE_STALE_DATA_THRESHOLD_DAYS` | number | `7` | ❌ No | `3` - `14` |
| `VITE_MAX_CONCURRENT_EXPERIMENTS` | number | `10` | ❌ No | `5` - `20` |
| `VITE_FEATURE_GENERATION_SAMPLE_SIZE` | number | `2000` | ❌ No | `1000` - `5000` |
| `VITE_STATISTICAL_SIGNIFICANCE_THRESHOLD` | number | `0.05` | ❌ No | `0.01` - `0.10` |

---

## 2. Supabase Configuration

### 2.1 Project Configuration File

**File:** `supabase/config.toml`

```toml
project_id = "wclutzbojatqtxwlvtab"

# Edge Function JWT Verification Settings
[functions.analyze-match]
verify_jwt = false  # Public access for demo

[functions.submit-feedback]
verify_jwt = false

[functions.get-predictions]
verify_jwt = false

[functions.patterns-detect]
verify_jwt = false

[functions.patterns-team]
verify_jwt = false

[functions.patterns-verify]
verify_jwt = false
```

### 2.2 JWT Verification Strategy

**Development/Demo Mode (Current):**
```toml
[functions.<function-name>]
verify_jwt = false  # No authentication required
```

**Production Mode (Recommended):**
```toml
# Protected functions requiring authentication
[functions.jobs-toggle]
verify_jwt = true

[functions.jobs-trigger]
verify_jwt = true

[functions.models-auto-prune]
verify_jwt = true

[functions.phase9-self-improving-system]
verify_jwt = true

# Public read-only functions
[functions.get-predictions]
verify_jwt = false  # OK for public access

[functions.analyze-match]
verify_jwt = false  # OK for public access
```

**Function-Level Access Control:**

Even with `verify_jwt = false`, implement role checks in function code:

```typescript
// Example: jobs-trigger/index.ts
Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Invalid token', { status: 401 });
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!['admin', 'analyst'].includes(profile?.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  // Function logic
});
```

### 2.3 Database Configuration

**Connection Details:**
- **Project ID:** `wclutzbojatqtxwlvtab`
- **Region:** Auto-selected by Supabase
- **Postgres Version:** 15.x (managed by Supabase)

**Connection Methods:**

1. **Frontend (via Supabase JS SDK):**
   ```typescript
   import { createClient } from '@supabase/supabase-js';
   
   const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY
   );
   ```

2. **Direct Postgres Connection (for migrations):**
   ```bash
   # Via Supabase CLI
   supabase db push --project-ref wclutzbojatqtxwlvtab

   # Or direct psql (get connection string from dashboard)
   psql "postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres"
   ```

3. **Edge Functions (service role):**
   ```typescript
   // Automatic via Supabase context
   const supabase = createClient(
     Deno.env.get('SUPABASE_URL')!,
     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // Managed by Supabase
   );
   ```

---

## 3. Authentication Setup

### 3.1 Email/Password Configuration

**Supabase Dashboard Settings:**
1. Navigate to **Authentication** > **Settings**
2. **Email Auth:** Enabled by default
3. **Email Confirmation:** ✅ Recommended for production
4. **Password Requirements:**
   - Minimum length: 8 characters (configurable to 12+ for production)
   - Complexity: Optional (configure in dashboard)

**SQL Configuration (Optional):**
```sql
-- Enforce email verification
UPDATE auth.config SET confirm_email_before_login = true;

-- Set password requirements
UPDATE auth.config SET password_min_length = 12;
UPDATE auth.config SET password_require_lowercase = true;
UPDATE auth.config SET password_require_uppercase = true;
UPDATE auth.config SET password_require_numbers = true;
UPDATE auth.config SET password_require_symbols = false;
```

### 3.2 OAuth Provider Setup

#### Google OAuth

**Supabase Dashboard:**
1. Go to **Authentication** > **Providers** > **Google**
2. Toggle **Enable Google**
3. Add **Authorized Redirect URIs:**
   ```
   https://wclutzbojatqtxwlvtab.supabase.co/auth/v1/callback
   ```
4. Get credentials from [Google Cloud Console](https://console.cloud.google.com):
   - Create OAuth 2.0 Client ID
   - Add redirect URI from step 3
   - Copy Client ID and Client Secret
5. Paste into Supabase dashboard

**Frontend Integration:**
```typescript
// In Login.tsx or AuthProvider
const signInWithGoogle = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
};
```

#### GitHub OAuth

**Supabase Dashboard:**
1. Go to **Authentication** > **Providers** > **GitHub**
2. Toggle **Enable GitHub**
3. Add **Authorization callback URL:**
   ```
   https://wclutzbojatqtxwlvtab.supabase.co/auth/v1/callback
   ```
4. Get credentials from [GitHub Developer Settings](https://github.com/settings/developers):
   - Create OAuth App
   - Add callback URL from step 3
   - Copy Client ID and Client Secret
5. Paste into Supabase dashboard

**Frontend Integration:**
```typescript
const signInWithGitHub = async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: `${window.location.origin}/dashboard`,
    },
  });
};
```

### 3.3 Session Configuration

**Default Settings:**
- **Access Token Expiry:** 1 hour
- **Refresh Token Expiry:** 30 days
- **Auto-refresh:** Enabled (via AuthProvider)

**Customization:**
```sql
-- In Supabase SQL Editor
UPDATE auth.config SET jwt_exp = 3600;  -- 1 hour (in seconds)
UPDATE auth.config SET refresh_token_rotation_enabled = true;
```

**Frontend Token Refresh:**
```typescript
// Automatic in AuthProvider.tsx
useEffect(() => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed automatically');
      }
    }
  );
  return () => subscription.unsubscribe();
}, []);
```

### 3.4 Role Assignment

**Default Role on Signup:**
```sql
-- In 20251106000000_add_user_profiles.sql
CREATE TABLE public.user_profiles (
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'analyst', 'user')),
  ...
);
```

**Promote User to Admin:**
```sql
-- Run in Supabase SQL Editor
UPDATE user_profiles 
SET role = 'admin' 
WHERE email = 'admin@example.com';
```

**Promote User to Analyst:**
```sql
UPDATE user_profiles 
SET role = 'analyst' 
WHERE email = 'analyst@example.com';
```

**Bulk Role Update:**
```sql
-- Promote multiple users
UPDATE user_profiles 
SET role = 'analyst' 
WHERE email IN ('user1@example.com', 'user2@example.com', 'user3@example.com');
```

---

## 4. Edge Functions Secrets

### 4.1 Managing Secrets

**Add Secret via CLI:**
```bash
# Set a secret for all functions
supabase secrets set API_KEY=your_secret_key --project-ref wclutzbojatqtxwlvtab

# Verify secret was set
supabase secrets list --project-ref wclutzbojatqtxwlvtab
```

**Add Secret via Dashboard:**
1. Go to **Edge Functions** > **Secrets**
2. Click **Add New Secret**
3. Enter key/value pair
4. Click **Save**

### 4.2 Required Database Secrets

**⚠️ CRITICAL SECURITY: Never expose database credentials in frontend code!**

```bash
# Database Connection String (for Edge Functions only)
supabase secrets set DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres"

# Database Password (alternative approach)
supabase secrets set POSTGRES_PASSWORD="your_actual_postgres_password"

# Supabase Service Role Key (for privileged operations)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"

# Supabase URL (redundant but useful)
supabase secrets set SUPABASE_URL="https://wclutzbojatqtxwlvtab.supabase.co"
```

**🔒 Security Notes:**
- ✅ **Safe in Edge Functions:** Accessed via `Deno.env.get()` only
- ❌ **Never in Frontend:** No database credentials in `.env` or browser code
- ✅ **Use Service Role:** For privileged operations (admin functions)
- ✅ **Use Anon Key:** For user-authenticated operations

### 4.3 Optional Integration Secrets

```bash
# The Odds API Integration
supabase secrets set ODDS_API_KEY=your_odds_api_key_here

# External ML Service (future)
supabase secrets set ML_SERVICE_URL=https://ml.example.com
supabase secrets set ML_SERVICE_TOKEN=your_ml_token_here

# Email Service (if using custom provider)
supabase secrets set SENDGRID_API_KEY=your_sendgrid_key
```

### 4.4 Accessing Secrets in Functions

```typescript
// In any Edge Function index.ts
Deno.serve(async (req) => {
  const oddsApiKey = Deno.env.get('ODDS_API_KEY');
  if (!oddsApiKey) {
    return new Response('Configuration error', { status: 500 });
  }

  const response = await fetch('https://api.the-odds-api.com/v4/sports/', {
    headers: {
      'x-api-key': oddsApiKey,
    },
  });

  // Process response
});
```

### 4.5 Secret Rotation

**Rotation Process:**
1. Generate new secret (e.g., new API key)
2. Add new secret with temporary name:
   ```bash
   supabase secrets set ODDS_API_KEY_NEW=new_key_here
   ```
3. Update function code to use new secret
4. Deploy function
5. Test in production
6. Remove old secret:
   ```bash
   supabase secrets unset ODDS_API_KEY
   ```
7. Rename new secret:
   ```bash
   supabase secrets set ODDS_API_KEY=new_key_here
   supabase secrets unset ODDS_API_KEY_NEW
   ```

### 4.6 Edge Functions Security

**JWT Verification Configuration:**

Edge Functions that require authentication must have `verify_jwt = true` in `supabase/config.toml`:

```toml
# Public functions (read-only access)
[functions.get-predictions]
verify_jwt = false

# Protected functions (require authentication)
[functions.analyze-match]
verify_jwt = true

[functions.submit-feedback]
verify_jwt = true

[functions.patterns-detect]
verify_jwt = true

[functions.patterns-team]
verify_jwt = true

[functions.patterns-verify]
verify_jwt = true
```

**Authentication Pattern in Functions:**

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Validation schema
const RequestSchema = z.object({
  matchId: z.string().uuid(),
});

serve(async (req) => {
  // Create authenticated client
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  )

  // Check authentication
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Check role (if needed)
  const { data: profile } = await supabaseClient
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'analyst'].includes(profile.role)) {
    return new Response(
      JSON.stringify({ error: 'Insufficient permissions' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Validate input
  const body = await req.json()
  const validation = RequestSchema.safeParse(body)
  if (!validation.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: validation.error }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Use service role for privileged operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Function logic...
});
```

**Security Best Practices:**
- ✅ **Always validate input** with Zod schemas
- ✅ **Check authentication** for protected functions
- ✅ **Verify roles** for admin/analyst operations
- ✅ **Use service role** only for privileged database operations
- ✅ **Log actions** to `admin_audit_log` table
- ✅ **Enable JWT verification** in config.toml
- ❌ **Never expose** service role keys to frontend

---

## 5. Feature Flags

### 5.1 Phase 5-9 Backend & UI Feature Flags

**Configuration:**
```bash
# In .env file - Control Phase 5-9 availability
# Default: false (all features disabled)
VITE_FEATURE_PHASE5="false"    # Advanced pattern detection
VITE_FEATURE_PHASE6="false"    # Model evaluation & feedback loop
VITE_FEATURE_PHASE7="false"    # Cross-league intelligence
VITE_FEATURE_PHASE8="false"    # Monitoring & visualization
VITE_FEATURE_PHASE9="false"    # Collaborative market intelligence
```

**Frontend Implementation:**
```typescript
// In src/providers/FeatureFlagsProvider.tsx
interface FeatureFlag {
  phase5: boolean;    // Advanced pattern detection
  phase6: boolean;    // Model evaluation & feedback loop  
  phase7: boolean;    // Cross-league intelligence
  phase8: boolean;    // Monitoring & visualization
  phase9: boolean;    // Collaborative market intelligence
}

// Usage in components
import { usePhaseFlags } from '@/hooks/usePhaseFlags';

const MyComponent = () => {
  const { isPhase5Enabled, isPhase9Enabled } = usePhaseFlags();
  
  return (
    <div>
      {isPhase5Enabled && <PatternDetection />}
      {isPhase9Enabled && <CollaborativeIntelligence />}
    </div>
  );
};
```

**Route Protection:**
```typescript
// In src/components/AppRoutes.tsx
const AppRoutes = () => {
  const { isPhase5Enabled, isPhase9Enabled } = usePhaseFlags();

  return (
    <Routes>
      {/* Phase-gated routes */}
      {isPhase5Enabled && (
        <Route path="/patterns" element={<PatternDetection />} />
      )}
      {isPhase9Enabled && (
        <Route path="/phase9" element={<Phase9 />} />
      )}
    </Routes>
  );
};
```

### 5.2 Edge Function Feature Flags

**Backend Implementation:**
```typescript
// In Edge Functions (e.g., patterns-detect/index.ts)
serve(async (req) => {
  // Check Phase 5 feature flag
  const phase5Enabled = Deno.env.get('PHASE5_ENABLED') === 'true';
  if (!phase5Enabled) {
    return new Response(
      JSON.stringify({ 
        error: 'Feature disabled',
        message: 'Phase 5 pattern detection is currently disabled'
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Continue with function logic...
});
```

**Setting Backend Flags:**
```bash
# Set Phase 5-9 flags for Edge Functions
supabase secrets set PHASE5_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE6_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE7_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE8_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE9_ENABLED=false --project-ref wclutzbojatqtxwlvtab
```

### 5.3 Phase 9 Granular Feature Toggles

**Configuration:**
```bash
# In .env file - Phase 9 specific features
VITE_PHASE9_FEATURE_FLAGS="collaborative_intelligence:true,market_integration:false,temporal_decay:true,self_improving:true"
```

**Parsing in Code:**
```typescript
// In src/lib/phase9-api.ts or similar
const featureFlags = import.meta.env.VITE_PHASE9_FEATURE_FLAGS
  ?.split(',')
  .reduce((acc, flag) => {
    const [key, value] = flag.split(':');
    acc[key] = value === 'true';
    return acc;
  }, {} as Record<string, boolean>) || {};

export const isFeatureEnabled = (feature: string): boolean => {
  return featureFlags[feature] ?? false;
};

// Usage
if (isFeatureEnabled('collaborative_intelligence')) {
  // Load collaborative intelligence module
}
```

### 5.2 Component-Level Feature Flags

```typescript
// In Phase9.tsx or other components
import { isFeatureEnabled } from '@/lib/feature-flags';

const Phase9Page = () => {
  return (
    <div>
      {isFeatureEnabled('collaborative_intelligence') && (
        <CollaborativeIntelligence />
      )}
      {isFeatureEnabled('market_integration') && (
        <MarketIntegration />
      )}
      {isFeatureEnabled('temporal_decay') && (
        <TemporalDecay />
      )}
      {isFeatureEnabled('self_improving') && (
        <SelfImprovingSystem />
      )}
    </div>
  );
};
```

### 5.3 Runtime Feature Flag Management (Future)

**Database-Driven Flags (Recommended for Production):**

```sql
-- Create feature_flags table
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with Phase 9 features
INSERT INTO public.feature_flags (name, enabled, description) VALUES
  ('collaborative_intelligence', true, 'Phase 9: Collaborative predictions'),
  ('market_integration', true, 'Phase 9: Market odds integration'),
  ('temporal_decay', true, 'Phase 9: Temporal decay weighting'),
  ('self_improving', true, 'Phase 9: Self-improving ML system');
```

**React Hook:**
```typescript
// In src/hooks/useFeatureFlag.ts
export const useFeatureFlag = (flagName: string): boolean => {
  const { data } = useQuery({
    queryKey: ['feature_flags', flagName],
    queryFn: async () => {
      const { data } = await supabase
        .from('feature_flags')
        .select('enabled')
        .eq('name', flagName)
        .single();
      return data?.enabled ?? false;
    },
  });
  return data ?? false;
};

// Usage
const isCollaborativeEnabled = useFeatureFlag('collaborative_intelligence');
```

---

## 6. Database Connection

### 6.1 Connection Strings

**Get Connection String:**
1. Go to **Supabase Dashboard** > **Settings** > **Database**
2. Copy connection string for desired method

**Connection Types:**

| Type | Use Case | Example |
|------|----------|---------|
| **Transaction Mode** | Short-lived connections | `postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:6543/postgres` |
| **Session Mode** | Long-lived connections | `postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres` |
| **Direct Connection** | Admin/migration work | `postgresql://postgres:[PASSWORD]@db.wclutzbojatqtxwlvtab.supabase.co:5432/postgres` |

### 6.2 Connection Pooling

**Supabase Connection Pooler (PgBouncer):**
- **Port 6543:** Transaction mode (recommended for most queries)
- **Port 5432:** Session mode (for migrations, admin work)

**Frontend Connections:**
All handled via Supabase JS SDK (no direct Postgres connection needed).

**Backend/Edge Functions:**
Automatic connection pooling via Supabase SDK.

### 6.3 Database Migrations

**Apply Migrations:**
```bash
# Via Supabase CLI
supabase db push --project-ref wclutzbojatqtxwlvtab

# Check migration status
supabase migration list --project-ref wclutzbojatqtxwlvtab
```

**Create New Migration:**
```bash
# Generate migration file
supabase migration new my_migration_name

# Edit file in supabase/migrations/
# Then push
supabase db push --project-ref wclutzbojatqtxwlvtab
```

**Rollback (Manual):**
```sql
-- In Supabase SQL Editor, manually revert changes
-- Supabase doesn't support automatic rollbacks
-- Keep track of changes in each migration for manual reversion
```

---

## 7. CORS & Security Headers

### 7.1 CORS Configuration

**Current (Development):**
Default Supabase CORS policy allows all origins.

**Production Recommendation:**
```typescript
// In Edge Functions
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://yourdomain.com',  // Specific domain
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Max-Age': '86400',  // 24 hours
};

Deno.serve(async (req) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Main logic
  const data = { /* ... */ };

  return new Response(JSON.stringify(data), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
});
```

### 7.2 Security Headers

**Recommended Headers:**
```typescript
const securityHeaders = {
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Content Security Policy
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
};

return new Response(JSON.stringify(data), {
  headers: {
    ...corsHeaders,
    ...securityHeaders,
    'Content-Type': 'application/json',
  },
});
```

### 7.3 Rate Limiting

**Implementation (via Upstash or similar):**
```typescript
// Example with Upstash Redis
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_URL')!,
  token: Deno.env.get('UPSTASH_REDIS_TOKEN')!,
});

const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),  // 10 requests per 10 seconds
});

Deno.serve(async (req) => {
  const identifier = req.headers.get('x-forwarded-for') || 'anonymous';
  const { success } = await ratelimit.limit(identifier);
  
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 });
  }

  // Function logic
});
```

---

## 8. Development vs Production

### 8.1 Environment-Specific Configuration

**Development (.env.local):**
```bash
VITE_SUPABASE_PROJECT_ID="wclutzbojatqtxwlvtab"
VITE_SUPABASE_URL="https://wclutzbojatqtxwlvtab.supabase.co"
VITE_SUPABASE_ANON_KEY="dev_anon_key"

# Relaxed settings for local development
VITE_PHASE9_FEATURE_FLAGS="collaborative_intelligence:true,market_integration:true,temporal_decay:true,self_improving:true"
```

**Production (.env.production):**
```bash
VITE_SUPABASE_PROJECT_ID="prod_project_id"
VITE_SUPABASE_URL="https://prod_project_id.supabase.co"
VITE_SUPABASE_ANON_KEY="prod_anon_key"

# Selective feature rollout
VITE_PHASE9_FEATURE_FLAGS="collaborative_intelligence:true,market_integration:false,temporal_decay:true,self_improving:false"
```

### 8.2 Build Configuration

**Development Build:**
```bash
npm run build:dev
```

**Production Build:**
```bash
npm run build
```

**Vite Configuration (vite.config.ts):**
```typescript
export default defineConfig({
  build: {
    sourcemap: process.env.NODE_ENV === 'development',
    minify: process.env.NODE_ENV === 'production' ? 'esbuild' : false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
});
```

### 8.3 Deployment Checklist

**Before Deploying to Production:**

- [ ] Update `.env` with production Supabase credentials
- [ ] Enable JWT verification on protected Edge Functions
- [ ] Enable RLS on all user-generated content tables
- [ ] Configure CORS to allow only production domain
- [ ] Set strong password requirements (12+ characters)
- [ ] Enable email verification
- [ ] Rotate all API keys and secrets
- [ ] Test all critical user flows in staging
- [ ] Set up monitoring and alerting (Sentry, Uptime checks)
- [ ] Configure production CORS policies
- [ ] Enable rate limiting on public endpoints
- [ ] Create first admin user via SQL
- [ ] Document rollback procedures
- [ ] Train support team

**Deployment Commands:**
```bash
# Build frontend
npm ci
npm run build

# Deploy to hosting (e.g., Vercel)
vercel deploy --prod

# Deploy Edge Functions
supabase functions deploy --project-ref prod_project_id

# Apply migrations
supabase db push --project-ref prod_project_id
```

---

## Appendix: Quick Reference

### Environment Variable Priority
1. `.env.local` (local overrides, gitignored)
2. `.env.production` (production build)
3. `.env.development` (development build)
4. `.env` (base configuration, gitignored)

### Key Endpoints
- **Supabase API:** `https://wclutzbojatqtxwlvtab.supabase.co`
- **Edge Functions:** `https://wclutzbojatqtxwlvtab.supabase.co/functions/v1/<function-name>`
- **Dashboard:** `https://supabase.com/dashboard/project/wclutzbojatqtxwlvtab`

### Common Commands
```bash
# View configuration
cat .env

# Test Edge Function locally
supabase functions serve <function-name> --no-verify-jwt

# Check environment variables in build
npm run build && cat dist/index.html | grep VITE_
```

---

**Last Updated:** November 5, 2025  
**Maintained By:** Development Team  
**Next Review:** January 2026
