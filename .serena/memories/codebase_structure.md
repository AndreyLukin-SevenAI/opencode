# OpenCode Codebase Structure

## Root Directory Structure
```
opencode/
├── packages/           # Main application packages
├── cloud/             # Cloud deployment packages  
├── sdks/              # Platform-specific SDKs
├── infra/             # Infrastructure code
├── script/            # Build and utility scripts
├── .github/           # GitHub workflows and templates
├── package.json       # Root workspace configuration
├── sst.config.ts      # SST deployment configuration
└── tsconfig.json      # Root TypeScript configuration
```

## Core Packages (`packages/`)
- **opencode/** - Main CLI application and core logic
- **tui/** - Terminal User Interface components
- **web/** - Web interface (Astro-based)
- **sdk/** - TypeScript SDK for integrations
- **plugin/** - Plugin system and architecture
- **identity/** - Authentication and identity management
- **function/** - Serverless function utilities

## Cloud Packages (`cloud/`)
- **core/** - Core cloud infrastructure and database
- **app/** - Cloud application (SolidJS-based)
- **web/** - Cloud web interface (Vite-based)

## SDKs (`sdks/`)
- **vscode/** - Visual Studio Code extension

## Main Application Structure (`packages/opencode/src/`)
```
src/
├── cli/               # Command-line interface
├── server/            # Web server and API
├── agent/             # AI agent functionality  
├── provider/          # AI provider integrations
├── tool/              # Built-in tools
├── mcp/               # Model Context Protocol
├── lsp/               # Language Server Protocol
├── plugin/            # Plugin system
├── auth/              # Authentication
├── config/            # Configuration management
├── storage/           # Data persistence
├── util/              # Shared utilities
├── bus/               # Event system
├── file/              # File operations
├── format/            # Code formatting
├── session/           # Session management
└── index.ts           # Main entry point
```

## Key Architecture Patterns
- **Monorepo**: Uses Bun workspaces for package management
- **Plugin System**: Extensible architecture with plugin support
- **Client/Server**: Separated frontend and backend concerns
- **Provider Agnostic**: Abstracted AI provider integrations
- **Event-Driven**: Bus system for inter-component communication

## Configuration Files
- **sst.config.ts**: SST deployment and infrastructure
- **bunfig.toml**: Bun runtime configuration
- **opencode.json**: OpenCode-specific configuration
- **.editorconfig**: Editor formatting rules
- **tsconfig.json**: TypeScript compiler options

## Entry Points
- **CLI**: `packages/opencode/src/index.ts`
- **Web**: `packages/web/src/pages/`
- **VSCode Extension**: `sdks/vscode/src/extension.ts`
- **Cloud App**: `cloud/app/src/`