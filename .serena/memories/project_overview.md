# OpenCode Project Overview

## Purpose
OpenCode is an AI coding agent built for the terminal. It's a 100% open-source alternative to Claude Code with the following key features:
- Provider-agnostic (works with Anthropic, OpenAI, Google, or local models)
- Terminal User Interface (TUI) focused
- Client/server architecture
- Built by neovim users with focus on terminal experience

## Key Differentiators from Claude Code
- Completely open source
- Not tied to any specific AI provider
- Focus on Terminal UI/UX
- Client/server architecture allowing remote control

## Tech Stack
- **Runtime**: Bun (package manager and runtime)
- **Language**: TypeScript 
- **Framework**: Hono (web framework)
- **AI Integration**: ai library (5.0.8)
- **Build Tool**: Bun with workspaces
- **Infrastructure**: SST (Serverless Stack) for deployment

## Architecture
- Monorepo with workspaces structure
- Main packages:
  - `packages/opencode` - Core CLI application
  - `packages/tui` - Terminal UI components  
  - `packages/web` - Web interface
  - `packages/sdk` - SDK for integrations
  - `packages/plugin` - Plugin system
- Cloud deployment packages in `cloud/` directory
- SDKs for different platforms in `sdks/` directory

## Key Dependencies
- Hono 4.7.10 (web framework)
- ai 5.0.8 (AI SDK)
- zod 3.25.76 (schema validation)
- TypeScript 5.8.2
- Various AI provider SDKs (@ai-sdk/amazon-bedrock, etc.)
- Tree-sitter for code parsing
- MCP (Model Context Protocol) support