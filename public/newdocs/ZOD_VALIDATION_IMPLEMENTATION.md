# Zod Validation Implementation for Edge Functions

This document describes the comprehensive Zod validation implementation added to WinMix TipsterHub Edge Functions to standardize input validation and provide graceful error handling for malformed payloads.

## Overview

All Edge Functions now use standardized Zod validation to:
- Validate input payloads before processing
- Return consistent 400 error responses with detailed field-level error information
- Ensure type safety throughout function logic
- Remove redundant runtime checks

## Implementation

### Shared Validation Utilities

**File**: `supabase/functions/_shared/validation.ts`

This file contains:
- **Common schemas**: Reusable validation patterns (UUID, positive numbers, scores, etc.)
- **Function-specific schemas**: Complete input validation for each Edge Function
- **Helper functions**: Standardized validation and error formatting
- **CORS headers**: Centralized CORS configuration

#### Key Schemas

```typescript
// Common validation patterns
export const UuidSchema = z.string().uuid("Invalid UUID format");
export const PositiveNumberSchema = z.number().positive("Must be a positive number");
export const ScoreSchema = z.number().int().min(0, "Score must be a non-negative integer");
export const ConfidenceScoreSchema = z.number().min(0).max(100, "Confidence score must be between 0 and 100");

// Function-specific schemas
export const JobTriggerSchema = z.object({
  jobId: UuidSchema,
  force: z.boolean().optional().default(false),
});

export const PredictionInputSchema = z.object({
  matchId: UuidSchema,
  predictedOutcome: z.enum(["home_win", "away_win", "draw"]),
  confidenceScore: ConfidenceScoreSchema,
  // ... other fields with appropriate validation
});
```

#### Validation Helper

```typescript
export function validateRequest<T>(schema: z.ZodSchema<T>, body: unknown): { success: true; data: T } | { success: false; error: string; details: unknown } {
  const result = schema.safeParse(body);
  
  if (!result.success) {
    const errorDetails = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
      code: issue.code
    }));
    
    return {
      success: false,
      error: "Invalid input data",
      details: errorDetails
    };
  }
  
  return {
    success: true,
    data: result.data
  };
}
```

## Updated Edge Functions

### Priority Functions Updated

1. **jobs-trigger**: Validates jobId (UUID) and optional force flag
2. **models-auto-prune**: Validates threshold (0-100) and min_sample_size (positive number)
3. **predictions-track**: Validates complete prediction input with type safety
4. **analyze-match**: Validates matchId (UUID)
5. **submit-feedback**: Validates match scores and optional halftime scores
6. **patterns-detect**: Validates team identification and pattern type selection
7. **patterns-verify**: Validates team identification for pattern verification

### Implementation Pattern

Each updated Edge Function follows this pattern:

```typescript
// 1. Import validation utilities
import { validateRequest, FunctionSchema, corsHeaders } from "../_shared/validation.ts";

// 2. Replace manual validation with schema validation
const body = await req.json();
const validation = validateRequest(FunctionSchema, body);

if (!validation.success) {
  return new Response(
    JSON.stringify({ error: validation.error, details: validation.details }),
    {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

const { validatedField1, validatedField2 } = validation.data;

// 3. Use type-safe validated data in function logic
// No more runtime type checking needed!
```

## Error Response Format

### Validation Error Response

```json
{
  "error": "Invalid input data",
  "details": [
    {
      "field": "jobId",
      "message": "Invalid UUID format",
      "code": "invalid_string"
    },
    {
      "field": "confidenceScore", 
      "message": "Number must be less than or equal to 100",
      "code": "too_big"
    }
  ]
}
```

### Success Response

Unchanged - successful responses continue to work as before.

## Benefits

### 1. Type Safety
- All input data is validated against TypeScript interfaces
- No more `any` types or manual type assertions
- Compile-time and runtime type checking

### 2. Consistent Error Handling
- Standardized 400 responses across all functions
- Detailed field-level error information
- User-friendly error messages

### 3. Reduced Code Duplication
- Shared validation schemas
- Centralized error formatting
- Common validation patterns

### 4. Better Developer Experience
- Clear validation requirements
- Helpful error messages for API consumers
- Type hints in IDEs

### 5. Security
- Input sanitization before processing
- Prevention of malformed data reaching business logic
- Early rejection of invalid requests

## Testing

### Unit Tests

**File**: `supabase/functions/_shared/validation.test.ts`

Comprehensive tests covering:
- Valid input acceptance
- Invalid input rejection
- Edge cases (null, undefined, wrong types)
- Error message formatting
- Default value handling

### Integration Tests

**File**: `supabase/functions/_shared/edge-function-validation.test.ts`

Integration tests demonstrating:
- End-to-end validation in actual Edge Functions
- HTTP response format validation
- Error response structure verification

### Pattern Tests

**File**: `src/test/validation-patterns.test.ts`

Tests for validation patterns without Zod dependencies:
- UUID validation patterns
- Score range validation
- Error formatting logic
- Response standardization

## Running Tests

```bash
# Run validation pattern tests
npx vitest run src/test/validation-patterns.test.ts

# Run existing Edge Function tests
npx vitest run src/test/edge-functions-feature-flags.test.ts

# Run all tests
npx vitest run
```

## Migration Guide

### For Existing Functions

1. **Import validation utilities**:
   ```typescript
   import { validateRequest, corsHeaders } from "../_shared/validation.ts";
   ```

2. **Define schema** (or reuse existing):
   ```typescript
   const FunctionSchema = z.object({
     // Define your validation rules
   });
   ```

3. **Replace manual validation**:
   ```typescript
   // Before
   const { field1, field2 } = await req.json();
   if (!field1) {
     return new Response(JSON.stringify({ error: "field1 required" }), { status: 400 });
   }
   
   // After
   const validation = validateRequest(FunctionSchema, await req.json());
   if (!validation.success) {
     return new Response(
       JSON.stringify({ error: validation.error, details: validation.details }),
       { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
     );
   }
   const { field1, field2 } = validation.data;
   ```

4. **Remove redundant type checks** - Zod handles all validation

### For New Functions

Follow the implementation pattern shown above, creating appropriate schemas in the shared validation file or function-specific schemas for complex validation logic.

## Schema Reference

### Common Validation Patterns

| Schema | Purpose | Validation Rules |
|--------|---------|------------------|
| `UuidSchema` | UUID fields | Valid UUID v4 format |
| `PositiveNumberSchema` | Count/size fields | > 0 |
| `NonNegativeIntegerSchema` | Scores/counts | ≥ 0, integer |
| `ScoreSchema` | Match scores | ≥ 0, integer |
| `ConfidenceScoreSchema` | Confidence values | 0-100, number |

### Function-Specific Schemas

| Function | Schema | Key Fields |
|----------|--------|------------|
| `jobs-trigger` | `JobTriggerSchema` | `jobId` (UUID), `force` (boolean) |
| `models-auto-prune` | `ModelPruneSchema` | `threshold` (0-100), `min_sample_size` (> 0) |
| `predictions-track` | `PredictionInputSchema` | Complete prediction data with type validation |
| `analyze-match` | `MatchIdSchema` | `matchId` (UUID) |
| `submit-feedback` | `FeedbackInputSchema` | Match scores with halftime validation |
| `patterns-detect` | `PatternsDetectSchema` | Team ID/name + pattern types |
| `patterns-verify` | `PatternsVerifySchema` | Team ID/name for verification |

## Security Considerations

1. **Input Sanitization**: All inputs are validated before processing
2. **Type Enforcement**: Strong typing prevents injection attacks
3. **Early Rejection**: Invalid requests are rejected before business logic
4. **Error Information**: Detailed but safe error messages (no sensitive data exposure)

## Performance Impact

- **Minimal**: Zod validation is fast and efficient
- **Early Exit**: Invalid requests rejected before expensive operations
- **Reduced Compute**: No redundant validation in business logic
- **Memory Efficient**: Shared schemas reduce duplication

## Future Enhancements

1. **Response Schema Validation**: Add Zod validation for API responses
2. **Middleware Integration**: Create validation middleware for common patterns
3. **Schema Evolution**: Versioned schemas for API evolution
4. **Custom Validators**: Domain-specific validation rules
5. **Validation Caching**: Cache compiled schemas for better performance

## Dependencies

- **zod**: `https://deno.land/x/zod@v3.22.4/mod.ts`
- **Existing Edge Function dependencies**: No additional dependencies required

## Conclusion

The Zod validation implementation provides a robust, type-safe, and consistent approach to input validation across all Edge Functions. It improves security, developer experience, and API reliability while maintaining backward compatibility with existing functionality.