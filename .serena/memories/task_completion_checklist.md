# Task Completion Checklist for OpenCode

## After Making Code Changes

### 1. Type Checking
```bash
# Always run type check after code changes
bun run typecheck
```

### 2. Code Style (Manual Check)
- Ensure 2-space indentation
- Max 120 character line length (Prettier)
- No semicolons (Prettier setting)
- Proper import organization
- Follow camelCase/PascalCase naming

### 3. Testing (Package-Specific)
- No central test command available
- Check individual package directories for test scripts
- For VSCode extension: `bun run test`

### 4. Linting (Limited)
- Only VSCode extension has ESLint configured
- Run `bun run lint` in `sdks/vscode/` if working on that package

### 5. Build Verification
```bash
# Verify main application still builds
bun dev --help

# For web packages, verify builds work
cd packages/web && astro build
cd cloud/web && vite build
```

### 6. Git Best Practices
- Follow conventional commits if established
- Ensure no sensitive data committed
- Check .gitignore coverage

## Important Notes
- Project doesn't have centralized formatting/linting
- Rely on editor configuration (.editorconfig) 
- Type checking is the primary validation step
- Individual packages may have their own quality gates

## Before Submitting PR
1. Run `bun run typecheck` successfully
2. Verify application starts without errors
3. Test affected functionality manually
4. Check that no new console errors/warnings
5. Ensure proper TypeScript types used (no `any`)

## Platform Considerations (macOS/Darwin)
- All commands should work on macOS
- Bun is the primary runtime (not Node.js)
- Use `bun` commands instead of `npm`/`yarn`