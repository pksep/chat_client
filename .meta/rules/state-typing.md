# State Typing Rules

This document outlines the rules and best practices for typing state in the chat client application.

## General Rules

1. **All reactive state must have explicit TypeScript interfaces**:
   - Define interfaces for all reactive state objects
   - Use descriptive names that clearly indicate the state's purpose
   - Include proper null/undefined handling where appropriate

2. **Use specific types over generic types**:
   - Instead of `any`, use specific interfaces or types
   - Define custom interfaces for complex objects
   - Use union types for properties that can have multiple valid values

3. **Reactive state should be typed when declared**:
   ```typescript
   // Good
   const state = reactive<MyStateInterface>({
     // properties
   });
   
   // Avoid
   const state = reactive({
     // properties without explicit typing
   });
   ```

## Component State Rules

1. **Define state interface before the component logic**:
   - Place interfaces at the top of the script section
   - Use clear, descriptive names for state interfaces
   - Group related properties together in nested interfaces when appropriate

2. **Computed properties should have explicit return types**:
   ```typescript
   // Good
   const filteredContacts = computed<IUserProps[]>(() => {
     // computation
   });
   
   // Avoid
   const filteredContacts = computed(() => {
     // computation
   });
   ```

3. **Function parameters should be typed**:
   - All function parameters must have explicit types
   - Use interfaces for complex parameter objects
   - Include proper null/undefined handling in types

## Watcher Typing Rules

1. **Watchers should specify the type of the watched value**:
   ```typescript
   // Good
   watch<IUserProps[]>(
     () => getUsersList(),
     newUsers => {
       state.users = newUsers;
     }
   );
   
   // Avoid
   watch(
     () => getUsersList(),
     newUsers => {
       state.users = newUsers;
     }
   );
   ```

## Best Practices

1. **Use readonly for state that shouldn't be modified directly**:
   ```typescript
   const state = reactive<MyStateInterface>({
     // properties
   });
   
   // When passing state to other components or functions
   const readonlyState = readonly(state);
   ```

2. **Group related state properties**:
   - Organize state properties into logical groups
   - Use nested objects for related properties
   - Create separate interfaces for each group when needed

3. **Use proper null handling**:
   - Explicitly indicate when properties can be null
   - Use optional properties (`?`) when appropriate
   - Use union types for properties that can be multiple types

## Examples

### Good State Interface Definition
```typescript
interface ChatContainerState {
  ui: {
    isPwaModalOpen: boolean;
    isMenuDesktopOpen: boolean;
    isMenuMobileOpen: boolean;
    activeTabId: number | null;
  };
  contacts: {
    current: IContactProps | null;
    groupId: string | null;
  };
  data: {
    users: IUserProps[];
    groups: IContactProps[];
    conversations: IContactProps[];
  };
}
```

### Proper Reactive State Usage
```typescript
const state = reactive<ChatContainerState>({
  ui: {
    isPwaModalOpen: true,
    isMenuDesktopOpen: false,
    isMenuMobileOpen: false,
    activeTabId: null,
  },
  contacts: {
    current: null,
    groupId: null,
  },
  data: {
    users: getUsersList(),
    groups: getGroupList(),
    conversations: getConversationList(),
  }
});
```

## Enforcement

These rules should be enforced through:
- Code reviews
- TypeScript compilation errors
- ESLint rules (to be implemented)
- Documentation and team awareness