# OpenCode Code Style and Conventions

## Editor Configuration (.editorconfig)
- Charset: UTF-8
- End of line: LF
- Insert final newline: true
- Indent style: spaces
- Indent size: 2 spaces
- Max line length: 80 characters

## Prettier Configuration (root package.json)
- Semi: false (no semicolons)  
- Print width: 120 characters
- Other defaults apply

## TypeScript Configuration
- Extends: @tsconfig/bun/tsconfig.json
- Custom conditions: ["development"]
- Target: Node 22 compatible

## ESLint Rules (VSCode extension)
- Import naming: camelCase or PascalCase
- Curly braces required: warn
- Strict equality (===): warn  
- No throw literal: warn
- Semicolons: warn (when missing)

## File Naming Conventions
- TypeScript files: kebab-case (e.g., `some-file.ts`)
- Directories: kebab-case
- Components/Classes: PascalCase in code
- Constants/Variables: camelCase

## Import/Export Patterns
- Named exports preferred over default exports
- Import grouping: external packages first, then relative imports
- Barrel exports used (index.ts files)

## Code Structure Patterns
- Monorepo with workspace structure
- Feature-based directory organization
- Separation of concerns (cli, server, util, etc.)
- Plugin architecture for extensibility

## Zod Schema Usage
- Heavy use of Zod for schema validation
- OpenAPI integration with zod-openapi
- Type-safe API definitions

## Error Handling
- Custom NamedError classes
- Structured logging with levels
- Process-level error handlers for uncaught exceptions

## Dependency Management
- Bun workspaces with catalog for version management
- Shared dependencies managed in root workspace catalog
- Private packages use workspace:* references