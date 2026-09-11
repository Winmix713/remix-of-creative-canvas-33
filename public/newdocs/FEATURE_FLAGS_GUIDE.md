# Feature Flags Implementation Guide

## Overview

This document describes the implementation of feature flags for controlling Phase 5-9 backend and UI exposure in the WinMix TipsterHub platform.

## Architecture

The feature flags system consists of:

1. **Frontend Feature Flags** - Control UI exposure and route access
2. **Backend Feature Flags** - Control Edge Function availability  
3. **Environment Configuration** - Set flags via environment variables

## Frontend Implementation

### Provider and Hook

- `src/providers/FeatureFlagsProvider.tsx` - Main context provider
- `src/hooks/usePhaseFlags.tsx` - Convenience hook for phase-specific flags
- `src/components/AppRoutes.tsx` - Route protection based on flags

### Usage Examples

```typescript
// Access feature flags
import { usePhaseFlags } from '@/hooks/usePhaseFlags';

const MyComponent = () => {
  const { isPhase5Enabled, isPhase9Enabled } = usePhaseFlags();
  
  if (!isPhase5Enabled) {
    return <div>Feature not available</div>;
  }
  
  return <PatternDetectionComponent />;
};
```

```typescript
// Conditional rendering in navigation
{isPhase9Enabled && (
  <NavLink to="/phase9">
    <Brain />
  </NavLink>
)}
```

## Backend Implementation

### Edge Function Integration

Each Phase 5-9 Edge Function checks its corresponding feature flag:

```typescript
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
```

### Protected Functions

The following Edge Functions are feature-gated:

- `patterns-detect` → `PHASE5_ENABLED`
- `cross-league-analyze` → `PHASE7_ENABLED`
- `monitoring-health` → `PHASE8_ENABLED`
- `phase9-collaborative-intelligence` → `PHASE9_ENABLED`

## Configuration

### Frontend (.env)

```bash
# Feature Flags (Phase 5-9)
VITE_FEATURE_PHASE5="false"    # Advanced pattern detection
VITE_FEATURE_PHASE6="false"    # Model evaluation & feedback loop
VITE_FEATURE_PHASE7="false"    # Cross-league intelligence
VITE_FEATURE_PHASE8="false"    # Monitoring & visualization
VITE_FEATURE_PHASE9="false"    # Collaborative market intelligence
```

### Backend (Supabase Secrets)

```bash
# Set via script
./scripts/setup-feature-flags.sh

# Or manually
supabase secrets set PHASE5_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE6_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE7_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE8_ENABLED=false --project-ref wclutzbojatqtxwlvtab
supabase secrets set PHASE9_ENABLED=false --project-ref wclutzbojatqtxwlvtab
```

## Phase Mappings

| Phase | Feature | Frontend Flag | Backend Flag | Routes | Edge Functions |
|-------|---------|----------------|--------------|---------|----------------|
| 5 | Advanced Pattern Detection | `VITE_FEATURE_PHASE5` | `PHASE5_ENABLED` | `/patterns` | `patterns-detect`, `patterns-verify`, `patterns-team` |
| 6 | Model Evaluation & Feedback | `VITE_FEATURE_PHASE6` | `PHASE6_ENABLED` | `/models`, `/admin/models` | `models-*` functions |
| 7 | Cross-League Intelligence | `VITE_FEATURE_PHASE7` | `PHASE7_ENABLED` | `/crossleague` | `cross-league-*` functions |
| 8 | Monitoring & Visualization | `VITE_FEATURE_PHASE8` | `PHASE8_ENABLED` | `/analytics`, `/monitoring`, `/admin/monitoring` | `monitoring-*` functions |
| 9 | Collaborative Market Intelligence | `VITE_FEATURE_PHASE9` | `PHASE9_ENABLED` | `/phase9`, `/admin/phase9` | `phase9-*` functions |

## Deployment Guide

### 1. Local Development

1. Update `.env` file with desired flag values
2. Restart development server: `npm run dev`
3. Features will be available/disabled based on flags

### 2. Production Deployment

1. Set frontend flags in deployment environment variables
2. Set backend flags via Supabase secrets:
   ```bash
   ./scripts/setup-feature-flags.sh
   ```
3. Deploy Edge Functions:
   ```bash
   supabase functions deploy --project-ref wclutzbojatqtxwlvtab
   ```

### 3. Enabling Features

To enable Phase 9 features:

```bash
# Frontend
echo 'VITE_FEATURE_PHASE9="true"' >> .env

# Backend
PHASE9_ENABLED=true ./scripts/setup-feature-flags.sh

# Deploy
supabase functions deploy phase9-collaborative-intelligence --project-ref wclutzbojatqtxwlvtab
```

## Testing

### Frontend Tests

```bash
# Run feature flags tests
npm test -- feature-flags
```

### Backend Tests

```bash
# Run Edge Function tests
npm test -- edge-functions-feature-flags
```

### Manual Testing

1. Set flags to desired values
2. Navigate to gated routes (should return 404 or redirect)
3. Call Edge Functions directly (should return 503 when disabled)
4. Verify UI elements are hidden/show appropriately

## Security Considerations

1. **Default to Disabled**: All flags default to `false` for security
2. **Separate Frontend/Backend**: Independent flag systems for UI and API
3. **Environment Isolation**: Different flag values per environment
4. **Audit Trail**: Feature flag changes logged in deployment process

## Troubleshooting

### Common Issues

1. **Flags Not Working**: Ensure environment variables are properly set
2. **UI Still Shows**: Check that components use the `usePhaseFlags` hook
3. **API Still Accessible**: Verify Edge Functions have flag checks
4. **Route Not Found**: Ensure conditional routing in `AppRoutes.tsx`

### Debug Commands

```bash
# Check current secrets
supabase secrets list --project-ref wclutzbojatqtxwlvtab

# Test Edge Function locally
supabase functions serve --env-file .env

# Check frontend flags
console.log(import.meta.env.VITE_FEATURE_PHASE5);
```

## Future Enhancements

1. **Dynamic Flag Management**: Admin UI for toggling flags
2. **Feature Flag Analytics**: Track usage and performance
3. **Gradual Rollouts**: Percentage-based feature enablement
4. **A/B Testing Framework**: Integration with feature flags
5. **Environment Promotion**: Automated flag management across environments