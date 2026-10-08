# Edge Functions RBAC Implementation

## Overview

This document describes the implementation of Role-Based Access Control (RBAC) for Edge Functions in the WinMix TipsterHub project. The implementation provides centralized authentication, authorization, and audit logging for all protected Edge Functions.

## Architecture

### Shared Auth Utilities (`supabase/functions/_shared/auth.ts`)

The shared auth module provides the following key components:

#### Core Functions

- **`createServiceClient()`**: Creates a Supabase client with service role key for privileged operations
- **`createUserClient(authHeader)`**: Creates a Supabase client authenticated with user's JWT token
- **`authenticateRequest(authHeader)`**: Validates JWT token and fetches user profile
- **`protectEndpoint(authHeader, roleChecker)`**: Combines authentication and role checking
- **`logAuditAction(...)`**: Centralized audit logging to `admin_audit_log` table

#### Role Checkers

- **`requireRole(allowedRoles)`**: Generic role checker for any combination of roles
- **`requireAdmin`**: Admin-only access
- **`requireAdminOrAnalyst`**: Admin or Analyst access (most common)
- **`requireAuthenticatedUser`**: Any authenticated user access

#### Utilities

- **`createAuthErrorResponse(error)`**: Standardized error responses
- **`handleCorsPreflight()`**: CORS preflight handling
- **`corsHeaders`**: Standard CORS headers

### Refactored Edge Functions

The following Edge Functions have been refactored to use the shared auth utilities:

#### 1. `analyze-match`
- **Role Requirement**: Admin or Analyst
- **Action**: Creates match predictions
- **Audit Log**: Records prediction details, confidence, patterns detected

#### 2. `jobs-trigger`
- **Role Requirement**: Admin or Analyst  
- **Action**: Triggers scheduled job execution
- **Audit Log**: Records job trigger details, success/failure status

#### 3. `submit-feedback`
- **Role Requirement**: Admin or Analyst
- **Action**: Submits match results and updates predictions
- **Audit Log**: Records feedback submission, prediction accuracy

#### 4. `patterns-detect`
- **Role Requirement**: Admin or Analyst
- **Action**: Detects team patterns (Phase 5 feature)
- **Audit Log**: Records pattern detection results
- **Feature Flag**: Requires `PHASE5_ENABLED=true`

#### 5. `patterns-verify`
- **Role Requirement**: Admin or Analyst
- **Action**: Verifies and updates existing team patterns
- **Audit Log**: Records pattern verification results

#### 6. `models-auto-prune`
- **Role Requirement**: Admin only
- **Action**: Deactivates underperforming pattern templates
- **Audit Log**: Records model pruning details

## Security Features

### Authentication
- JWT token validation using Supabase Auth
- Automatic token refresh handling
- Invalid token rejection with 401 status

### Authorization
- Role-based access control using `user_profiles.role`
- Granular role requirements per function
- Consistent 403 responses for insufficient permissions

### Audit Logging
- All privileged actions logged to `admin_audit_log`
- Structured logging with action, resource, and metadata
- User attribution and timestamp tracking
- Non-blocking audit failures (won't break main operation)

### Input Validation
- Integration with existing validation schemas
- Role checking before business logic execution
- Consistent error response format

## Usage Patterns

### Standard Function Template

```typescript
import { 
  protectEndpoint, 
  requireAdminOrAnalyst, 
  createAuthErrorResponse, 
  logAuditAction,
  handleCorsPreflight 
} from "../_shared/auth.ts";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCorsPreflight();
  }

  try {
    // Authenticate and authorize
    const authResult = await protectEndpoint(
      req.headers.get('Authorization'),
      requireAdminOrAnalyst  // Or other role checker
    );

    if ('error' in authResult) {
      return createAuthErrorResponse(authResult.error);
    }

    const { context } = authResult;
    const { serviceClient: supabase, user, profile } = context;

    // Business logic here...
    
    // Log the action
    await logAuditAction(
      context.supabaseClient,
      context.user.id,
      'action_name',
      'resource_type',
      resourceId,
      { /* metadata */ },
      context.user.email
    );

    return new Response(
      JSON.stringify({ result: 'success' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Role-Specific Access

```typescript
// Admin only
const authResult = await protectEndpoint(
  req.headers.get('Authorization'),
  requireAdmin
);

// Admin or Analyst
const authResult = await protectEndpoint(
  req.headers.get('Authorization'),
  requireAdminOrAnalyst
);

// Any authenticated user
const authResult = await protectEndpoint(
  req.headers.get('Authorization'),
  requireAuthenticatedUser
);

// Custom role combination
const authResult = await protectEndpoint(
  req.headers.get('Authorization'),
  requireRole(['admin', 'analyst', 'moderator'])
);
```

## Error Handling

### Standardized Error Responses

All auth-related errors return consistent JSON responses:

```json
{
  "error": "Error message"
}
```

### HTTP Status Codes

- **401 Unauthorized**: Missing, invalid, or expired JWT token
- **403 Forbidden**: Valid token but insufficient role permissions
- **500 Internal Server Error**: Auth system failure (rare)

## Testing

### Unit Tests
- Comprehensive test suite in `auth.test.ts`
- Mock Supabase clients for isolated testing
- Coverage for all role checkers and error scenarios

### Integration Tests
- Refactoring validation script: `scripts/verify-auth-refactoring.js`
- Auth utilities validation: `scripts/test-auth-utilities.js`
- Runtime testing with real JWT tokens

## Environment Variables

Required environment variables for all Edge Functions:

```bash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

Feature flags (where applicable):

```bash
PHASE5_ENABLED=true  # For patterns-detect function
```

## Benefits

### Security
- Centralized auth logic reduces security bugs
- Consistent JWT validation across all functions
- Comprehensive audit trail for privileged operations
- Role-based access prevents privilege escalation

### Maintainability
- Single source of truth for auth logic
- Easy to update security requirements
- Reduced code duplication
- Standardized error handling

### Developer Experience
- Simple, declarative API for auth requirements
- Clear separation of concerns
- Consistent patterns across functions
- Comprehensive TypeScript types

## Migration Notes

### Before Refactoring
- Duplicate auth code in each function
- Inconsistent error handling
- Manual audit logging implementation
- Scattered role checking logic

### After Refactoring
- Centralized auth utilities
- Consistent behavior across functions
- Standardized audit logging
- Clear role-based access control

## Future Enhancements

### Potential Improvements
1. **Rate Limiting**: Add rate limiting per user/role
2. **Permission Caching**: Cache user roles for performance
3. **Multi-tenant Support**: Extend for organization-based access
4. **API Key Authentication**: Support for service-to-service calls
5. **Role Hierarchy**: Implement role inheritance (admin > analyst > user)

### Monitoring
- Add metrics for auth success/failure rates
- Monitor audit log volume and patterns
- Alert on unusual access patterns
- Track role-based usage analytics

## Troubleshooting

### Common Issues

1. **"Missing Supabase credentials"**
   - Ensure environment variables are set
   - Check Edge Function deployment configuration

2. **"User profile not found"**
   - Verify user_profiles table exists
   - Check profile creation trigger

3. **"Insufficient permissions"**
   - Verify user role in user_profiles table
   - Check role requirements match function needs

4. **Audit logging failures**
   - Check admin_audit_log table permissions
   - Verify RLS policies allow service role access

### Debug Steps

1. Check Edge Function logs for detailed error messages
2. Verify JWT token validity with Supabase Auth
3. Test with different user roles
4. Check environment variable configuration
5. Review audit log entries for successful operations