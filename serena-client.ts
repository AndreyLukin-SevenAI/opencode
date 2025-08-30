#!/usr/bin/env node

import { spawn } from 'child_process';

// ============================================================================
// INTERFACES & TYPES
// ============================================================================

export interface SerenaMCPClientConfig {
  baseUrl?: string;
  port?: number;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface MCPRequest {
  jsonrpc: string;
  id: string;
  method: string;
  params?: any;
}

export interface MCPResponse {
  jsonrpc: string;
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface SerenaCommand {
  name: string;
  description: string;
  usage: string;
  handler: (args: string[], options: CLIOptions) => Promise<void>;
}

export interface CLIOptions {
  endpoint?: string;
  port?: number;
  timeout?: number;
  format?: 'json' | 'text';
  verbose?: boolean;
  help?: boolean;
}

// ============================================================================
// MAIN CLIENT CLASS
// ============================================================================

export class SerenaMCPClient {
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;
  private requestCounter = 0;
  private sessionId: string | null = null;
  private sseReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }> = new Map();
  private sseProcess: any = null;

  constructor(config: SerenaMCPClientConfig = {}) {
    this.baseUrl = config.baseUrl || `http://localhost:${config.port || 9121}`;
    this.timeout = config.timeout || 30000; // 30 seconds
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000; // 1 second
  }

  private generateRequestId(): string {
    return `serena-cli-${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Ensure we have an active SSE connection and session ID
   */
  private async ensureConnection(): Promise<void> {
    if (!this.sessionId) {
      await this.establishSSESession();
    }
  }

  /**
   * Establish SSE session using curl for reliability
   */
  private async establishSSESession(): Promise<void> {
    if (this.sessionId) return;

    console.log(`DEBUG: Connecting to SSE at ${this.baseUrl}/sse`);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.sseProcess) this.sseProcess.kill();
        reject(new Error('SSE connection timeout'));
      }, 10000);

      this.sseProcess = spawn('curl', [
        '-N',
        '-H', 'Accept: text/event-stream',
        '-H', 'Cache-Control: no-cache',
        `${this.baseUrl}/sse`
      ]);

      let buffer = '';
      let sessionExtracted = false;

      this.sseProcess.stdout.on('data', (data: any) => {
        buffer += data.toString();
        
        // Extract session ID if not done yet
        if (!sessionExtracted && buffer.includes('session_id=')) {
          const match = buffer.match(/session_id=([a-f0-9]+)/);
          if (match) {
            this.sessionId = match[1];
            console.log(`DEBUG: Extracted session ID: ${this.sessionId}`);
            sessionExtracted = true;
            clearTimeout(timeout);
            resolve();
          }
        }

        // Look for complete JSON responses in buffer
        let dataStart = buffer.indexOf('data: {');
        while (dataStart !== -1) {
          let dataEnd = buffer.indexOf('\n', dataStart);
          if (dataEnd === -1) break;
          
          const dataLine = buffer.slice(dataStart, dataEnd);
          const jsonData = dataLine.slice(6); // Remove 'data: '
          
          try {
            const response = JSON.parse(jsonData);
            
            if (response.jsonrpc && response.id) {
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                this.pendingRequests.delete(response.id);
                if (response.error) {
                  pending.reject(new Error(response.error.message || 'MCP Error'));
                } else {
                  pending.resolve(response.result);
                }
              }
            }
          } catch (parseError) {
            // Failed to parse JSON response
          }
          
          buffer = buffer.slice(dataEnd + 1);
          dataStart = buffer.indexOf('data: {');
        }
      });

      this.sseProcess.stderr.on('data', (data: any) => {
        // Ignore curl progress
      });

      this.sseProcess.on('close', () => {
        this.sseProcess = null;
        this.sessionId = null;
      });

      this.sseProcess.on('error', (error: any) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Core MCP request method - sends HTTP POST and listens for SSE response
   */
  private async sendMCPRequest<T = any>(method: string, params?: any): Promise<T> {
    await this.ensureConnection();

    const requestId = this.generateRequestId();
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const responsePromise = this.waitForSSEResponse(requestId, controller.signal);

      const response = await fetch(`${this.baseUrl}/messages/?session_id=${this.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await responsePromise;
      clearTimeout(timeoutId);
      return result as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Wait for SSE response with matching request ID
   */
  private async waitForSSEResponse<T>(requestId: string, signal: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      
      signal.addEventListener('abort', () => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request aborted'));
      });
    });
  }

  /**
   * Initialize connection with MCP handshake
   */
  async initialize(): Promise<void> {
    await this.sendMCPRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "serena-cli",
        version: "1.0.0",
      },
    });
    
    // Send initialized notification
    await this.sendInitializedNotification();
  }

  /**
   * Send initialized notification after successful initialize
   */
  private async sendInitializedNotification(): Promise<void> {
    const request = {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    };

    const response = await fetch(`${this.baseUrl}/messages/?session_id=${this.sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to send initialized notification: ${response.status}\n${text}`);
    }
  }

  /**
   * Call any Serena MCP tool
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    const params: any = { name };
    
    if (Object.keys(args).length > 0) {
      params.arguments = args;
    }
    
    return await this.sendMCPRequest("tools/call", params);
  }

  /**
   * Close connection and cleanup
   */
  close(): void {
    if (this.sseProcess) {
      this.sseProcess.kill();
      this.sseProcess = null;
    }
    if (this.sseReader) {
      this.sseReader.releaseLock();
      this.sseReader = null;
    }
    this.sessionId = null;
    this.pendingRequests.clear();
  }

  // ============================================================================
  // CONVENIENCE METHODS FOR ALL SERENA MCP TOOLS
  // ============================================================================

  // File Operations
  async listDirectory(path: string = ".", recursive: boolean = false): Promise<any> {
    return await this.callTool("list_dir", { relative_path: path, recursive });
  }

  async readFile(path: string): Promise<any> {
    return await this.callTool("read_file", { relative_path: path });
  }

  async writeFile(path: string, content: string): Promise<any> {
    return await this.callTool("create_text_file", { relative_path: path, content });
  }

  async findFile(pattern: string, path: string = "."): Promise<any> {
    return await this.callTool("find_file", { file_mask: pattern, relative_path: path });
  }

  async searchPattern(pattern: string, path: string = "", options: any = {}): Promise<any> {
    return await this.callTool("search_for_pattern", { 
      substring_pattern: pattern, 
      relative_path: path,
      ...options
    });
  }

  async replaceRegex(path: string, regex: string, replacement: string, allowMultiple: boolean = false): Promise<any> {
    return await this.callTool("replace_regex", { 
      relative_path: path, 
      regex, 
      repl: replacement,
      allow_multiple_occurrences: allowMultiple
    });
  }

  // Symbol Operations
  async getSymbolsOverview(path: string): Promise<any> {
    return await this.callTool("get_symbols_overview", { relative_path: path });
  }

  async findSymbol(namePath: string, relativePath: string = "", options: any = {}): Promise<any> {
    return await this.callTool("find_symbol", { 
      name_path: namePath, 
      relative_path: relativePath,
      ...options 
    });
  }

  async findReferencingSymbols(namePath: string, relativePath: string): Promise<any> {
    return await this.callTool("find_referencing_symbols", { 
      name_path: namePath, 
      relative_path: relativePath 
    });
  }

  async replaceSymbolBody(namePath: string, relativePath: string, body: string): Promise<any> {
    return await this.callTool("replace_symbol_body", { 
      name_path: namePath, 
      relative_path: relativePath, 
      body 
    });
  }

  async insertAfterSymbol(namePath: string, relativePath: string, body: string): Promise<any> {
    return await this.callTool("insert_after_symbol", { 
      name_path: namePath, 
      relative_path: relativePath, 
      body 
    });
  }

  async insertBeforeSymbol(namePath: string, relativePath: string, body: string): Promise<any> {
    return await this.callTool("insert_before_symbol", { 
      name_path: namePath, 
      relative_path: relativePath, 
      body 
    });
  }

  // Memory Management
  async writeMemory(name: string, content: string): Promise<any> {
    return await this.callTool("write_memory", { memory_name: name, content });
  }

  async readMemory(name: string): Promise<any> {
    return await this.callTool("read_memory", { memory_file_name: name });
  }

  async listMemories(): Promise<any> {
    return await this.callTool("list_memories");
  }

  async deleteMemory(name: string): Promise<any> {
    return await this.callTool("delete_memory", { memory_file_name: name });
  }

  // Project Management
  async activateProject(project: string): Promise<any> {
    return await this.callTool("activate_project", { project });
  }

  async switchModes(modes: string[]): Promise<any> {
    return await this.callTool("switch_modes", { modes });
  }

  async checkOnboardingPerformed(): Promise<any> {
    return await this.callTool("check_onboarding_performed");
  }

  async onboarding(): Promise<any> {
    return await this.callTool("onboarding");
  }

  // Shell & Analysis
  async executeShellCommand(command: string, cwd?: string): Promise<any> {
    return await this.callTool("execute_shell_command", { command, cwd });
  }

  async thinkAboutCollectedInformation(): Promise<any> {
    return await this.callTool("think_about_collected_information");
  }

  async thinkAboutTaskAdherence(): Promise<any> {
    return await this.callTool("think_about_task_adherence");
  }

  async thinkAboutWhetherYouAreDone(): Promise<any> {
    return await this.callTool("think_about_whether_you_are_done");
  }

  async prepareForNewConversation(): Promise<any> {
    return await this.callTool("prepare_for_new_conversation");
  }
}

// ============================================================================
// CLI CLASS
// ============================================================================

export class SerenaCLI {
  private client: SerenaMCPClient;
  private commands: Map<string, SerenaCommand> = new Map();

  constructor(options: CLIOptions) {
    this.client = new SerenaMCPClient({
      baseUrl: options.endpoint || `http://localhost:${options.port || 9121}`,
      timeout: options.timeout || 30000
    });

    this.registerCommands();
  }

  private registerCommands() {
    // File Operations
    this.addCommand({
      name: 'read',
      description: 'Read file content',
      usage: 'read <path>',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Path required');
        const result = await this.client.readFile(args[0]);
        console.log(result.content || result);
      }
    });

    this.addCommand({
      name: 'write',
      description: 'Create/write file',
      usage: 'write <path> <content>',
      handler: async (args) => {
        if (args.length < 2) throw new Error('Path and content required');
        const path = args[0];
        const content = args.slice(1).join(' ');
        const result = await this.client.writeFile(path, content);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'list',
      description: 'List directory contents',
      usage: 'list [path] [--recursive]',
      handler: async (args) => {
        const path = args.find(arg => !arg.startsWith('--')) || '.';
        const recursive = args.includes('--recursive');
        const result = await this.client.listDirectory(path, recursive);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'find',
      description: 'Find files matching pattern',
      usage: 'find <pattern> [path]',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Pattern required');
        const pattern = args[0];
        const path = args[1] || '.';
        const result = await this.client.findFile(pattern, path);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'replace',
      description: 'Replace text using regex',
      usage: 'replace <path> <regex> <replacement> [--multiple]',
      handler: async (args) => {
        if (args.length < 3) throw new Error('Path, regex, and replacement required');
        const [path, regex, replacement] = args;
        const allowMultiple = args.includes('--multiple');
        const result = await this.client.replaceRegex(path, regex, replacement, allowMultiple);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    // Code Analysis
    this.addCommand({
      name: 'symbols',
      description: 'Get symbols overview',
      usage: 'symbols <path>',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Path required');
        const result = await this.client.getSymbolsOverview(args[0]);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'find-symbol',
      description: 'Find specific symbols',
      usage: 'find-symbol <name-path> [path] [--include-body] [--depth=N]',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Name path required');
        const namePath = args[0];
        const relativePath = args.find(arg => !arg.startsWith('--')) || '';
        const includeBody = args.includes('--include-body');
        const depthArg = args.find(arg => arg.startsWith('--depth='));
        const depth = depthArg ? parseInt(depthArg.split('=')[1]) : 0;
        
        const result = await this.client.findSymbol(namePath, relativePath, { 
          include_body: includeBody, 
          depth 
        });
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'find-refs',
      description: 'Find symbol references',
      usage: 'find-refs <name-path> <path>',
      handler: async (args) => {
        if (args.length < 2) throw new Error('Name path and file path required');
        const result = await this.client.findReferencingSymbols(args[0], args[1]);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'replace-symbol',
      description: 'Replace symbol body',
      usage: 'replace-symbol <name-path> <path> <body>',
      handler: async (args) => {
        if (args.length < 3) throw new Error('Name path, file path, and body required');
        const [namePath, path] = args;
        const body = args.slice(2).join(' ');
        const result = await this.client.replaceSymbolBody(namePath, path, body);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'insert-after',
      description: 'Insert after symbol',
      usage: 'insert-after <name-path> <path> <body>',
      handler: async (args) => {
        if (args.length < 3) throw new Error('Name path, file path, and body required');
        const [namePath, path] = args;
        const body = args.slice(2).join(' ');
        const result = await this.client.insertAfterSymbol(namePath, path, body);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'insert-before',
      description: 'Insert before symbol',
      usage: 'insert-before <name-path> <path> <body>',
      handler: async (args) => {
        if (args.length < 3) throw new Error('Name path, file path, and body required');
        const [namePath, path] = args;
        const body = args.slice(2).join(' ');
        const result = await this.client.insertBeforeSymbol(namePath, path, body);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    // Search
    this.addCommand({
      name: 'search',
      description: 'Search for patterns in code',
      usage: 'search <pattern> [path]',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Pattern required');
        const pattern = args[0];
        const path = args[1] || '';
        const result = await this.client.searchPattern(pattern, path);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    // Memory Management
    this.addCommand({
      name: 'write-memory',
      description: 'Write to memory',
      usage: 'write-memory <name> <content>',
      handler: async (args) => {
        if (args.length < 2) throw new Error('Name and content required');
        const name = args[0];
        const content = args.slice(1).join(' ');
        const result = await this.client.writeMemory(name, content);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'read-memory',
      description: 'Read from memory',
      usage: 'read-memory <name>',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Memory name required');
        const result = await this.client.readMemory(args[0]);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'list-memories',
      description: 'List all memories',
      usage: 'list-memories',
      handler: async () => {
        const result = await this.client.listMemories();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'delete-memory',
      description: 'Delete memory',
      usage: 'delete-memory <name>',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Memory name required');
        const result = await this.client.deleteMemory(args[0]);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    // Project Management
    this.addCommand({
      name: 'activate',
      description: 'Activate project',
      usage: 'activate <project>',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Project path required');
        const result = await this.client.activateProject(args[0]);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'switch-modes',
      description: 'Switch operation modes',
      usage: 'switch-modes <mode1> [mode2] [...]',
      handler: async (args) => {
        if (args.length < 1) throw new Error('At least one mode required');
        const result = await this.client.switchModes(args);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'check-onboarding',
      description: 'Check onboarding status',
      usage: 'check-onboarding',
      handler: async () => {
        const result = await this.client.checkOnboardingPerformed();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'onboard',
      description: 'Run onboarding',
      usage: 'onboard',
      handler: async () => {
        const result = await this.client.onboarding();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    // Shell & Analysis
    this.addCommand({
      name: 'shell',
      description: 'Execute shell command',
      usage: 'shell <command> [--cwd=path]',
      handler: async (args) => {
        if (args.length < 1) throw new Error('Command required');
        const cwdArg = args.find(arg => arg.startsWith('--cwd='));
        const cwd = cwdArg ? cwdArg.split('=')[1] : undefined;
        const command = args.filter(arg => !arg.startsWith('--cwd=')).join(' ');
        const result = await this.client.executeShellCommand(command, cwd);
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'think-info',
      description: 'Think about collected information',
      usage: 'think-info',
      handler: async () => {
        const result = await this.client.thinkAboutCollectedInformation();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'think-task',
      description: 'Think about task adherence',
      usage: 'think-task',
      handler: async () => {
        const result = await this.client.thinkAboutTaskAdherence();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'think-done',
      description: 'Think about completion status',
      usage: 'think-done',
      handler: async () => {
        const result = await this.client.thinkAboutWhetherYouAreDone();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    this.addCommand({
      name: 'prepare-new-conversation',
      description: 'Prepare for new conversation',
      usage: 'prepare-new-conversation',
      handler: async () => {
        const result = await this.client.prepareForNewConversation();
        console.log(JSON.stringify(result, null, 2));
      }
    });

    // Help command
    this.addCommand({
      name: 'help',
      description: 'Show help information',
      usage: 'help [command]',
      handler: async (args) => {
        if (args.length === 0) {
          this.showHelp();
        } else {
          const cmd = this.commands.get(args[0]);
          if (cmd) {
            console.log(`${cmd.name}: ${cmd.description}`);
            console.log(`Usage: serena-cli ${cmd.usage}`);
          } else {
            console.error(`Unknown command: ${args[0]}`);
            process.exit(1);
          }
        }
      }
    });
  }

  private addCommand(command: SerenaCommand) {
    this.commands.set(command.name, command);
  }

  private showHelp() {
    console.log('Serena CLI - Lightweight interface to Serena MCP server\n');
    console.log('Usage: serena-cli [options] <command> [args...]\n');
    console.log('Options:');
    console.log('  --endpoint <url>    Serena server endpoint (default: http://localhost:9121)');
    console.log('  --port <number>     Serena server port (default: 9121)');
    console.log('  --timeout <ms>      Request timeout (default: 30000)');
    console.log('  --format <type>     Output format: json, text (default: json)');
    console.log('  --verbose           Enable verbose logging');
    console.log('  --help              Show this help\n');
    console.log('Commands:');
    
    const categories = {
      'File Operations': ['read', 'write', 'list', 'find', 'replace'],
      'Code Analysis': ['symbols', 'find-symbol', 'find-refs', 'replace-symbol', 'insert-after', 'insert-before'],
      'Search': ['search'],
      'Memory Management': ['write-memory', 'read-memory', 'list-memories', 'delete-memory'],
      'Project Management': ['activate', 'switch-modes', 'check-onboarding', 'onboard'],
      'Shell & Analysis': ['shell', 'think-info', 'think-task', 'think-done', 'prepare-new-conversation'],
      'Utility': ['help']
    };

    for (const [category, commandNames] of Object.entries(categories)) {
      console.log(`\n${category}:`);
      for (const name of commandNames) {
        const cmd = this.commands.get(name);
        if (cmd) {
          console.log(`  ${name.padEnd(20)} ${cmd.description}`);
        }
      }
    }

    console.log('\nExamples:');
    console.log('  serena-cli list src');
    console.log('  serena-cli read src/main.ts');
    console.log('  serena-cli search "function.*export" src');
    console.log('  serena-cli symbols src/main.ts');
    console.log('  serena-cli find "*.ts" src');
  }

  async run(args: string[]): Promise<void> {
    try {
      const command = this.commands.get(args[0]);
      if (!command) {
        console.error(`Unknown command: ${args[0]}`);
        console.error('Use "serena-cli help" to see available commands');
        process.exit(1);
      }

      // Only initialize connection for commands that need it (not help)
      if (args[0] !== 'help') {
        await this.client.initialize();
      }

      await command.handler(args.slice(1), {});
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    } finally {
      this.client.close();
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function parseArgs(argv: string[]): { options: CLIOptions; command: string; args: string[] } {
  const options: CLIOptions = {};
  const args: string[] = [];
  
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.split('=');
      switch (key) {
        case '--endpoint':
          options.endpoint = value || argv[++i];
          break;
        case '--port':
          options.port = parseInt(value || argv[++i]);
          break;
        case '--timeout':
          options.timeout = parseInt(value || argv[++i]);
          break;
        case '--format':
          options.format = (value || argv[++i]) as 'json' | 'text';
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--help':
          options.help = true;
          break;
      }
    } else {
      args.push(arg);
    }
  }
  
  return { options, command: args[0], args };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const { options, args } = parseArgs(process.argv);
  
  if (options.help || args.length === 0) {
    const cli = new SerenaCLI(options);
    await cli.run(['help']);
    return;
  }
  
  const cli = new SerenaCLI(options);
  await cli.run(args);
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for programmatic usage
export default SerenaMCPClient;