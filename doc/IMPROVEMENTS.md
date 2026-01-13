# Improvement Recommendations

This document outlines potential improvements for the Chat Client application based on code review.

## Critical Issues Fixed

### 1. Vue Lifecycle Warning (Fixed)
**Problem**: `useUnreadMessagePolling` was called inside async `onMounted` callback after `await` statements, causing Vue lifecycle hooks to be registered outside of setup context.

**Solution**: Refactored to call composable synchronously in setup, with manual `startPolling()` after initialization.

### 2. Type Safety for API Responses (Fixed)
**Problem**: The `User` and `BaseEntity` types did not account for nullable fields and string dates returned by the API.

**Solution**: Updated types to allow `null` for optional fields and `string | Date` for date fields.

### 3. Null Check in createGroup (Fixed)
**Problem**: `createGroup` did not validate SDK response, causing "cannot access property 'id' of undefined" error.

**Solution**: Added guard clause to throw meaningful error when SDK returns invalid response.

---

## Recommended Improvements

### High Priority

#### 1. Date Handling Standardization
**Problem**: Dates come from API as ISO strings but type expects `Date` objects. This causes runtime type mismatches.

**Recommendation**: Create a utility function to normalize dates consistently:
```typescript
// utils/dateUtils.ts
export function normalizeDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}
```

Apply this when mapping API responses to internal types.

#### 2. Error Boundary Implementation
**Problem**: Unhandled errors can crash the entire application.

**Recommendation**: Add Vue error boundary component:
```vue
<template>
  <slot v-if="!hasError" />
  <ErrorFallback v-else :error="error" @retry="reset" />
</template>

<script setup>
import { onErrorCaptured, ref } from 'vue'
const hasError = ref(false)
const error = ref(null)

onErrorCaptured((err) => {
  hasError.value = true
  error.value = err
  return false
})
</script>
```

#### 3. Type-Safe Props with Runtime Validation
**Problem**: Vue prop type warnings indicate runtime type mismatches that could be caught earlier.

**Recommendation**: Consider using `zod` or `valibot` for runtime schema validation of API responses:
```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  initials: z.string(),
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  lastOnline: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

// In API response handling
const user = UserSchema.parse(apiResponse);
```

### Medium Priority

#### 4. Centralized State Management
**Problem**: State is scattered across multiple services with different patterns (ref, shallowRef, reactive). This makes debugging and testing harder.

**Recommendation**: Consider consolidating state management:
- Option A: Use Pinia for centralized, typed stores with devtools support
- Option B: Create a unified state module that wraps all reactive state with consistent patterns

#### 5. WebSocket Reconnection Strategy
**Problem**: Current implementation may not handle WebSocket disconnections gracefully.

**Recommendation**: Implement exponential backoff reconnection:
```typescript
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

async function connectWithRetry(attempt = 0) {
  try {
    await connect();
  } catch (error) {
    if (attempt >= MAX_RETRIES) throw error;
    const delay = BASE_DELAY * Math.pow(2, attempt);
    await sleep(delay);
    return connectWithRetry(attempt + 1);
  }
}
```

#### 6. Message Queue Persistence
**Problem**: Outgoing messages in queue are lost on page refresh.

**Recommendation**: Persist message queue to IndexedDB:
```typescript
// On send
await db.outgoingQueue.put(message);

// On successful send
await db.outgoingQueue.delete(message.id);

// On app load
const pending = await db.outgoingQueue.toArray();
pending.forEach(retryMessage);
```

#### 7. Lazy Loading Optimization
**Problem**: All components are loaded upfront even if not needed.

**Recommendation**: Use Vue's `defineAsyncComponent` for modals and less-used features:
```typescript
const NewGroupModal = defineAsyncComponent(() =>
  import('./NewChat/NewGroupModal.vue')
);
```

### Low Priority

#### 8. Unit Test Coverage
**Problem**: No unit tests visible for services and composables.

**Recommendation**: Add Vitest tests for critical business logic:
```typescript
// tests/services/useChat.test.ts
import { describe, it, expect, vi } from 'vitest';
import { sendMessageChat } from '../src/services/useChat';

describe('useChat', () => {
  it('should add message to queue before sending', async () => {
    // ...
  });
});
```

#### 9. Logging and Monitoring
**Problem**: Console.log statements scattered throughout code without structure.

**Recommendation**: Implement structured logging:
```typescript
// utils/logger.ts
export const logger = {
  info: (module: string, message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${module}] ${message}`, data);
    }
  },
  error: (module: string, message: string, error?: Error) => {
    console.error(`[${module}] ${message}`, error);
    // Send to monitoring service in production
  }
};
```

#### 10. Accessibility Improvements
**Problem**: Some components may lack proper ARIA attributes.

**Recommendation**: Audit with axe-core and add missing attributes:
- Add `aria-label` to icon-only buttons
- Ensure proper heading hierarchy
- Add keyboard navigation support for custom dropdowns

---

## Code Quality Suggestions

### Consistent Naming
- Use consistent naming for event emitters (currently mix of `unmount-*` and other patterns)
- Standardize on either `handle*` or `on*` for event handler methods

### TypeScript Strictness
Enable stricter TypeScript options:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true
  }
}
```

### Code Documentation
Add JSDoc comments to public service functions and composables for better IDE support and documentation generation.

---

## Performance Optimizations

### 1. Virtual Scrolling for Message List
For conversations with many messages, implement virtual scrolling to render only visible messages.

### 2. Image Lazy Loading
Use `loading="lazy"` attribute or Intersection Observer for avatar images in contact lists.

### 3. Debounced Search
Add debouncing to search inputs to reduce API calls.

### 4. Memoization
Use `computed` with caching for expensive derived state calculations.

---

## Security Considerations

1. **Token Storage**: Consider using HttpOnly cookies instead of localStorage for tokens
2. **XSS Prevention**: Ensure user-generated content is properly sanitized before rendering
3. **CORS Configuration**: Verify API has proper CORS headers configured
4. **Input Validation**: Validate file uploads on client side before sending to S3
