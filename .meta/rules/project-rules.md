# Project Rules for Chat Client

## Project Overview
- Multi-package monorepo using pnpm workspaces
- TypeScript-based Vue 3 application
- Tauri desktop/mobile application
- CalVer versioning (YY.MM.PATCH format)
- Node.js 22 (managed via mise)

## Architecture
- **chat-core**: Core chat functionality as a reusable library
- **chat-tauri**: Tauri-based desktop/mobile application
- Uses Vue 3 with Composition API
- TypeScript for type safety
- Prettier for code formatting
- ESLint for code quality

## Development Workflow
- Use pnpm for package management
- Run `pnpm start:dev` to develop all packages
- Use `pnpm build` to build the project
- Use `pnpm lint` to lint the code
- Git hooks enforced via lefthook

## Code Style & Formatting for Non-Comment Code
- Use Prettier for formatting with the following settings:
  - Single quotes for strings
  - No trailing commas
  - 2 space indentation
  - No tabs
  - 80 character print width
  - Semicolons enabled
  - Bracket spacing enabled
  - Arrow parentheses avoided when possible
  - Auto line endings
- Follow ESLint rules with Vue 3 and TypeScript recommendations
- Use PascalCase for Vue component names
- Use camelCase for JavaScript/TypeScript variables and functions

## TypeScript Guidelines for Non-Comment Code
- Target ESNext
- Use strict mode (though currently disabled in tsconfig)
- Enable allowJs for migration purposes
- Use moduleResolution: node
- Use jsx: preserve for Vue projects
- Skip library checks for faster compilation

## Vue.js Guidelines for Non-Comment Code
- Use Vue 3 Composition API
- Use PascalCase for component definitions
- Avoid duplicate keys in Vue components
- Use self-closing tags for components when appropriate
- Prefer const over var; avoid var entirely
- Single quotes in templates

## Testing & Quality
- All code must pass ESLint checks
- Format code using Prettier before committing
- Git hooks will prevent commits that don't pass linting
- Write unit tests for core functionality
- Components should have descriptive names (multi-word preferred)

## Git Workflow
- Use conventional commits format
- Protected branches: main and canary
- Lefthook enforces linting before push
- Only changed files should be committed (not all files)
- Commit messages should explain why changes were made and what's new

## Naming Conventions for Non-Comment Code
- Variables and functions: camelCase
- Components: PascalCase
- Data-testid attributes: `${props.dataTestid}-Element-Modifier` format
- CSS classes: Use BEM methodology where appropriate
- Files: kebab-case for non-component files

## Dependencies
- Group related packages in the packages directory
- Use workspace:* for internal dependencies
- Keep dependencies up to date
- Use overrides for peer dependencies when necessary

## Versioning
- Use Calendar Versioning (CalVer): YY.MM.PATCH
- Increment PATCH for bug fixes
- Increment MONTH for features
- Increment YEAR for major changes

## Environment
- Node.js version: 22 (enforced via mise)
- Package manager: pnpm
- Build system: Vite
- Type checker: TypeScript
- Linting: ESLint + Prettier

## Focus on Non-Comment Code
When working on non-comment code, ensure to:
- Follow all the coding standards, TypeScript guidelines, Vue.js guidelines and naming conventions mentioned above
- Maintain consistency with existing codebase patterns
- Apply proper type annotations to function parameters and return values
- Use proper interfaces and types for complex data structures
- Follow Vue 3 Composition API best practices with `setup` syntax
- Apply proper error handling and validation in business logic
- Maintain clean architecture separating concerns between components, services and utilities