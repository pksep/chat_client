# Monorepo Structure Rules

## Package Organization

- All packages are located in the `packages/` directory
- Each package follows the Bun workspace pattern
- Package names should be prefixed appropriately for their scope
- Common prefix for internal packages: `@pksep/`

## Package Dependencies

- Use `workspace:*` for internal package dependencies
- Maintain clear dependency boundaries between packages
- The `chat-core` package serves as the foundation library
- The `chat-tauri` package depends on `chat-core` for functionality

## Package Scripts

- Common scripts across packages:
  - `start:dev`: Development server
  - `build`: Production build
  - `start`: Preview production build
- Libraries should have `build:lib` script for library builds
- Each package maintains its own package.json with specific dependencies

## Cross-Package Communication

- Use well-defined APIs for communication between packages
- Avoid circular dependencies
- Share types and interfaces through core packages when needed
- Maintain clear separation of concerns between packages

## Building and Publishing

- Use `bun run build` at root to build all packages
- Use `bun run lint` at root to lint all packages
- Publish only the necessary packages to npm
- Libraries should output both JavaScript and TypeScript declaration files

## Shared Configuration

- ESLint and Prettier configuration is shared across all packages
- TypeScript configuration may be shared or package-specific
- Build tools like Vite should be configured per package as needed
- Maintain consistent code style across all packages

## Development

- Use `bun run start:dev` in root for local development
- Run a package script from its package directory when targeting one package
- Each package can be developed independently
- Changes in one package may affect others - test accordingly
