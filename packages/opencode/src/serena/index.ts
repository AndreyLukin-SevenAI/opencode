import { SerenaMCPClient } from "../../../../serena-client"
import { App } from "../app/app"
import { Log } from "../util/log"

export namespace Serena {
  const log = Log.create({ service: "serena" })
  
  let client: SerenaMCPClient | undefined

  export async function init() {
    if (client) return client
    
    try {
      log.info("initializing serena client")
      
      // Create Serena client with default port 9121
      client = new SerenaMCPClient({
        baseUrl: `http://localhost:9121`,
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 1000,
      })

      // Initialize the MCP connection
      await client.initialize()
      
      // Activate the current project directory
      const app = App.info()
      await client.activateProject(app.path.cwd)
      
      log.info("serena client initialized and project activated", {
        cwd: app.path.cwd,
      })
      
      return client
    } catch (error) {
      log.error("failed to initialize serena client", { error })
      throw error
    }
  }

  export async function getClient(): Promise<SerenaMCPClient> {
    if (!client) {
      await init()
    }
    if (!client) {
      throw new Error("Failed to initialize Serena client")
    }
    return client
  }

  export function close() {
    if (client) {
      log.info("closing serena client")
      client.close()
      client = undefined
    }
  }

  // Convenience methods that delegate to the client
  export async function readFile(path: string): Promise<any> {
    const c = await getClient()
    return await c.readFile(path)
  }

  export async function writeFile(path: string, content: string): Promise<any> {
    const c = await getClient()
    return await c.writeFile(path, content)
  }

  export async function listDirectory(path: string = ".", recursive: boolean = false): Promise<any> {
    const c = await getClient()
    return await c.listDirectory(path, recursive)
  }

  export async function findFile(pattern: string, path: string = "."): Promise<any> {
    const c = await getClient()
    return await c.findFile(pattern, path)
  }

  export async function searchPattern(pattern: string, path: string = "", options: any = {}): Promise<any> {
    const c = await getClient()
    return await c.searchPattern(pattern, path, options)
  }

  export async function replaceRegex(path: string, regex: string, replacement: string, allowMultiple: boolean = false): Promise<any> {
    const c = await getClient()
    return await c.replaceRegex(path, regex, replacement, allowMultiple)
  }

  export async function executeShellCommand(command: string, cwd?: string): Promise<any> {
    const c = await getClient()
    return await c.executeShellCommand(command, cwd)
  }
}