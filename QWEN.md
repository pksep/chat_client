# Qwen Configuration

This project uses custom rules located in `.meta/rules/` that should be followed when contributing to the codebase.

## Rules Directory

The following rules are defined in the `.meta/rules/` directory:

- [commit.md](.meta/rules/commit.md) - Guidelines for commit messages
- [dataTestid.md](.meta/rules/dataTestid.md) - Standards for data-testid attributes
- [monorepo-structure.md](.meta/rules/monorepo-structure.md) - Monorepo structural guidelines
- [project-rules.md](.meta/rules/project-rules.md) - General project rules

## Instructions

When working on this project, please familiarize yourself with these rules and follow them in your contributions.

## Project Specifics

This project uses bun as the package manager instead of npm. Use bun commands (e.g., `bun install`, `bun run dev`) instead of npm equivalents.

## Rules Directory

The following additional rules are defined in the `.meta/rules/` directory:

- [code-comments.md](.meta/rules/code-comments.md) - Guidelines for code comments policy

## Code Comments Policy

This project follows a minimal comments policy as outlined in [code-comments.md](.meta/rules/code-comments.md). When working on this codebase:

- Minimize comments and focus on self-explanatory code through good naming
- Only add comments to explain the "why" not the "what"
- Focus comments on complex business logic that isn't immediately obvious
- Avoid redundant comments that just repeat what the code does
- Prioritize clean, readable code over commented code