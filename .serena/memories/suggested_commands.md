# OpenCode Development Commands

## Main Development Commands

### Running the Application
```bash
# Run in development mode
bun dev
# or
bun run dev

# Run OpenCode CLI directly (from packages/opencode)
bun run --conditions=development ./src/index.ts
```

### Type Checking
```bash
# Type check all packages
bun run typecheck

# Type check specific package (from within package directory)
tsc --noEmit
```

### Code Generation
```bash
# Generate SDK and stainless client
bun run generate
```

### Package Management
```bash
# Install dependencies
bun install

# Add dependency to workspace
bun add <package>

# Add dev dependency
bun add -D <package>
```

## Platform Specific Commands (macOS/Darwin)

### File Operations
```bash
# List files (macOS compatible)
ls -la

# Find files
find . -name "*.ts" -type f

# Grep with extended regex
grep -E "pattern" files

# Better search with ripgrep (if available)
rg "pattern"
```

### Git Operations
```bash
# Standard git commands work on Darwin
git status
git add .
git commit -m "message"
git push
```

## Package-Specific Commands

### VSCode Extension (sdks/vscode/)
```bash
# Compile and lint
bun run compile
bun run lint

# Package for production  
bun run package

# Run tests
bun run test
```

### Web Packages
```bash
# Astro (packages/web)
astro dev
astro build

# Vite (cloud/web)  
vite
vite build
```

## Testing
- Main project doesn't seem to have centralized test command
- Individual packages may have their own test scripts
- VSCode extension has `bun run test` using vscode-test

## No Central Lint/Format Commands
- Project uses Prettier configuration in root package.json
- ESLint configuration exists for VSCode extension only
- Individual packages handle their own linting if needed