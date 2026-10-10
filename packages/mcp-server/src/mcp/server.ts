import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { buildMcpToolList, isToolName } from "@cafe-listo/shared";
import type { UseCases } from "../container";
import { logError } from "../lib/log";
import { buildDispatchTable, ToolError } from "./dispatch";

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
    { capabilities: { tools: {} } },
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

  return server;
}
