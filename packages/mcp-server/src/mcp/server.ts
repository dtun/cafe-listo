import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  buildMcpPromptList,
  buildMcpResourceList,
  buildMcpToolList,
  isPromptName,
  isToolName,
  mcpServerInstructions,
  readMcpResource,
  renderMcpPrompt,
} from "@cafe-listo/shared";
import type { UseCases } from "../container";
import { logError } from "../lib/log";
import { buildDispatchTable, ToolError } from "./dispatch";

/** MCP's "resource not found" code; the SDK's ErrorCode enum has no name for it. */
const RESOURCE_NOT_FOUND = -32002;

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * One server per request (stateless transport). The low-level Server is used
 * because tools come from the shared registry and we validate arguments ourselves.
 */
export function createMcpServer(userId: string, usecases: UseCases): Server {
  const server = new Server(
    { name: "cafe-listo", version: "0.1.0" },
    {
      capabilities: { tools: {}, prompts: {}, resources: {} },
      instructions: mcpServerInstructions,
    },
  );
  const dispatch = buildDispatchTable(usecases);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildMcpToolList(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!isToolName(name)) return errorResult(`Unknown tool: ${name}`);
    try {
      const data = await dispatch[name](args, userId);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
      };
    } catch (error) {
      if (error instanceof ToolError) return errorResult(error.message);
      logError("tool_failed", {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      });
      return errorResult("Something went wrong. Please try again.");
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: buildMcpPromptList(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (!isPromptName(name)) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
    }
    const result = renderMcpPrompt(name, args);
    if (!result.ok) throw new McpError(ErrorCode.InvalidParams, result.message);
    const { description, messages } = result.prompt;
    return { description, messages };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: buildMcpResourceList(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const contents = readMcpResource(uri);
    if (!contents) {
      throw new McpError(RESOURCE_NOT_FOUND, `Resource not found: ${uri}`, {
        uri,
      });
    }
    return { contents: [contents] };
  });

  return server;
}
