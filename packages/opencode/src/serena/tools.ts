import { z } from "zod"
import * as path from "path"
import { Tool } from "../tool/tool"
import { App } from "../app/app"
import { Serena } from "./index"

// Serena Read Tool Adapter
export const SerenaReadTool = Tool.define("read", {
  description: "Reads a file from the local filesystem using Serena MCP",
  parameters: z.object({
    filePath: z.string().describe("The path to the file to read"),
    offset: z.coerce.number().describe("The line number to start reading from (0-based)").optional(),
    limit: z.coerce.number().describe("The number of lines to read").optional(),
  }),
  async execute(params, ctx) {
    let filepath = params.filePath
    if (!path.isAbsolute(filepath)) {
      filepath = path.join(process.cwd(), filepath)
    }

    try {
      // Use Serena to read the file
      const result = await Serena.readFile(path.relative(process.cwd(), filepath))
      
      // Handle Serena response format - it returns an array with content
      let content = ""
      if (Array.isArray(result) && result.length > 0 && result[0].text) {
        content = result[0].text
      } else if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        content = result.content[0].text
      } else if (typeof result === 'string') {
        content = result
      } else {
        content = JSON.stringify(result, null, 2)
      }
      
      // Apply offset and limit if specified
      if (params.offset !== undefined || params.limit !== undefined) {
        const lines = content.split('\n')
        const offset = params.offset || 0
        const limit = params.limit || lines.length - offset
        const selectedLines = lines.slice(offset, offset + limit)
        
        content = selectedLines.map((line: string, index: number) => {
          return `${(index + offset + 1).toString().padStart(5, "0")}| ${line}`
        }).join('\n')
        
        if (lines.length > offset + selectedLines.length) {
          content += `\n\n(File has more lines. Use 'offset' parameter to read beyond line ${offset + selectedLines.length})`
        }
      } else {
        // Format with line numbers for consistency
        const lines = content.split('\n')
        content = lines.map((line: string, index: number) => {
          return `${(index + 1).toString().padStart(5, "0")}| ${line}`
        }).join('\n')
      }

      const output = `<file>\n${content}\n</file>`
      
      return {
        title: path.relative(App.info().path.root, filepath),
        output,
        metadata: {
          preview: content.split('\n').slice(0, 20).join('\n'),
        },
      }
    } catch (error) {
      throw new Error(`Failed to read file ${filepath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Serena Write Tool Adapter
export const SerenaWriteTool = Tool.define("write", {
  description: "Writes a file to the local filesystem using Serena MCP",
  parameters: z.object({
    filePath: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  async execute(params, ctx) {
    let filepath = params.filePath
    if (!path.isAbsolute(filepath)) {
      filepath = path.join(process.cwd(), filepath)
    }

    try {
      const result = await Serena.writeFile(path.relative(process.cwd(), filepath), params.content)
      
      return {
        title: `Written ${path.relative(App.info().path.root, filepath)}`,
        output: `File written successfully: ${filepath}`,
        metadata: {
          path: filepath,
          size: params.content.length,
        },
      }
    } catch (error) {
      throw new Error(`Failed to write file ${filepath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Serena List Tool Adapter  
export const SerenaListTool = Tool.define("list", {
  description: "Lists directory contents using Serena MCP",
  parameters: z.object({
    path: z.string().describe("The directory path to list").optional().default("."),
  }),
  async execute(params, ctx) {
    try {
      const result = await Serena.listDirectory(params.path, false)
      
      let output = `Directory listing for: ${params.path}\n\n`
      
      // Handle Serena response format
      let parsedResult: any = {}
      if (result.structuredContent && result.structuredContent.result) {
        parsedResult = JSON.parse(result.structuredContent.result)
      } else if (result.content && Array.isArray(result.content) && result.content.length > 0) {
        parsedResult = JSON.parse(result.content[0].text)
      } else if (Array.isArray(result) && result.length > 0) {
        parsedResult = JSON.parse(result[0].text)
      } else {
        parsedResult = result
      }
      
      if (parsedResult.dirs && parsedResult.dirs.length > 0) {
        output += "Directories:\n"
        parsedResult.dirs.forEach((dir: string) => {
          output += `  📁 ${dir}/\n`
        })
        output += "\n"
      }
      
      if (parsedResult.files && parsedResult.files.length > 0) {
        output += "Files:\n"
        parsedResult.files.forEach((file: string) => {
          output += `  📄 ${file}\n`
        })
      }
      
      if ((!parsedResult.dirs || parsedResult.dirs.length === 0) && (!parsedResult.files || parsedResult.files.length === 0)) {
        output += "Directory is empty"
      }

      return {
        title: `List ${params.path}`,
        output,
        metadata: {
          path: params.path,
          dirCount: parsedResult.dirs?.length || 0,
          fileCount: parsedResult.files?.length || 0,
        },
      }
    } catch (error) {
      throw new Error(`Failed to list directory ${params.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Serena Glob Tool Adapter
export const SerenaGlobTool = Tool.define("glob", {
  description: "Find files matching patterns using Serena MCP",
  parameters: z.object({
    pattern: z.string().describe("The glob pattern to match files against"),
    path: z.string().describe("The directory to search in").optional().default("."),
  }),
  async execute(params, ctx) {
    try {
      const result = await Serena.findFile(params.pattern, params.path)
      
      let output = `Files matching pattern "${params.pattern}" in ${params.path}:\n\n`
      
      if (result.files && result.files.length > 0) {
        result.files.forEach((file: string) => {
          output += `  ${file}\n`
        })
        output += `\nFound ${result.files.length} file(s)`
      } else {
        output += "No files found matching the pattern"
      }

      return {
        title: `Glob ${params.pattern}`,
        output,
        metadata: {
          pattern: params.pattern,
          path: params.path,
          count: result.files?.length || 0,
        },
      }
    } catch (error) {
      throw new Error(`Failed to find files with pattern ${params.pattern}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Serena Grep Tool Adapter
export const SerenaGrepTool = Tool.define("grep", {
  description: "Search for patterns in files using Serena MCP",
  parameters: z.object({
    pattern: z.string().describe("The regular expression pattern to search for"),
    path: z.string().describe("The file or directory to search in").optional().default(""),
    contextBefore: z.coerce.number().describe("Number of lines to show before each match").optional(),
    contextAfter: z.coerce.number().describe("Number of lines to show after each match").optional(),
  }),
  async execute(params, ctx) {
    try {
      const options: any = {}
      if (params.contextBefore !== undefined) {
        options.context_lines_before = params.contextBefore
      }
      if (params.contextAfter !== undefined) {
        options.context_lines_after = params.contextAfter
      }
      
      const result = await Serena.searchPattern(params.pattern, params.path, options)
      
      let output = `Search results for pattern "${params.pattern}":\n\n`
      let totalMatches = 0
      
      if (result && typeof result === 'object') {
        Object.entries(result).forEach(([filepath, matches]) => {
          if (Array.isArray(matches) && matches.length > 0) {
            output += `📄 ${filepath}:\n`
            matches.forEach((match: any) => {
              if (typeof match === 'string') {
                output += `  ${match}\n`
                totalMatches++
              }
            })
            output += '\n'
          }
        })
      }
      
      if (totalMatches === 0) {
        output += "No matches found"
      } else {
        output += `Found ${totalMatches} match(es)`
      }

      return {
        title: `Grep ${params.pattern}`,
        output,
        metadata: {
          pattern: params.pattern,
          path: params.path,
          matches: totalMatches,
        },
      }
    } catch (error) {
      throw new Error(`Failed to search for pattern ${params.pattern}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Serena Edit Tool Adapter
export const SerenaEditTool = Tool.define("edit", {
  description: "Edit files using regex replacement via Serena MCP",
  parameters: z.object({
    filePath: z.string().describe("The path to the file to edit"),
    oldString: z.string().describe("The text to replace"),
    newString: z.string().describe("The text to replace it with"),
    replaceAll: z.boolean().describe("Replace all occurrences").optional().default(false),
  }),
  async execute(params, ctx) {
    let filepath = params.filePath
    if (!path.isAbsolute(filepath)) {
      filepath = path.join(process.cwd(), filepath)
    }

    try {
      // Escape special regex characters in oldString for literal matching
      const escapedOldString = params.oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      
      const result = await Serena.replaceRegex(
        path.relative(process.cwd(), filepath),
        escapedOldString,
        params.newString,
        params.replaceAll
      )
      
      return {
        title: `Edited ${path.relative(App.info().path.root, filepath)}`,
        output: `Successfully replaced text in ${filepath}`,
        metadata: {
          path: filepath,
          replaced: params.oldString,
          with: params.newString,
          replaceAll: params.replaceAll,
        },
      }
    } catch (error) {
      throw new Error(`Failed to edit file ${filepath}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})

// Serena Bash Tool Adapter
export const SerenaBashTool = Tool.define("bash", {
  description: "Execute shell commands using Serena MCP",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
    description: z.string().describe("A short description of what this command does").optional(),
    timeout: z.coerce.number().describe("Timeout in milliseconds").optional(),
  }),
  async execute(params, ctx) {
    try {
      const result = await Serena.executeShellCommand(params.command, process.cwd())
      
      let output = ""
      if (result.stdout) {
        output += result.stdout
      }
      if (result.stderr) {
        if (output) output += "\n"
        output += result.stderr
      }
      
      return {
        title: params.description || `Execute: ${params.command}`,
        output,
        metadata: {
          command: params.command,
          stdout: result.stdout || "",
          stderr: result.stderr || "",
        },
      }
    } catch (error) {
      throw new Error(`Failed to execute command ${params.command}: ${error instanceof Error ? error.message : String(error)}`)
    }
  },
})