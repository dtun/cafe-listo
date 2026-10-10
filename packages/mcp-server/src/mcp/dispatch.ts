import { toolSchemas, type ToolName } from "@cafe-listo/shared";
import type { z } from "zod";
import type { UseCases } from "../container";
import { checklistDto, itemDto } from "../dto/checklist";
import { logInfo } from "../lib/log";
import type { UseCaseErrorCode, UseCaseResult } from "../usecases/types";

export type ToolHandler = (
  rawArgs: unknown,
  userId: string,
) => Promise<unknown>;

/** Thrown for failures whose message is safe to show the model. */
export class ToolError extends Error {}

function defineTool<S extends z.ZodType>(
  name: ToolName,
  schema: S,
  run: (args: z.output<S>, userId: string) => Promise<unknown>,
): ToolHandler {
  return async (rawArgs, userId) => {
    const parsed = schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      throw new ToolError(`Invalid arguments for ${name}: ${details}`);
    }
    return run(parsed.data, userId);
  };
}

function unwrap<T>(
  result: UseCaseResult<T>,
  messages: Partial<Record<UseCaseErrorCode, string>> = {},
): T {
  if (result.ok) return result.data;
  throw new ToolError(messages[result.error.code] ?? result.error.message);
}

export function buildDispatchTable(
  usecases: UseCases,
): Record<ToolName, ToolHandler> {
  return {
    list_categories: defineTool(
      "list_categories",
      toolSchemas.list_categories,
      async () => unwrap(await usecases.listCategories.execute()),
    ),
    list_items: defineTool("list_items", toolSchemas.list_items, async (args) =>
      unwrap(
        await usecases.listItems.execute({
          categoryId: args.category_id,
          essentialOnly: args.essential_only,
        }),
      ).map(itemDto),
    ),
    get_checklist: defineTool(
      "get_checklist",
      toolSchemas.get_checklist,
      async (_args, userId) =>
        checklistDto(unwrap(await usecases.getChecklist.execute({ userId }))),
    ),
    set_item_done: defineTool(
      "set_item_done",
      toolSchemas.set_item_done,
      async (args, userId) => {
        const data = unwrap(
          await usecases.setItemDone.execute({
            userId,
            itemId: args.item_id,
            done: args.done,
          }),
        );
        return { item_id: data.itemId, done: data.done };
      },
    ),
    reset_checklist: defineTool(
      "reset_checklist",
      toolSchemas.reset_checklist,
      async (_args, userId) =>
        unwrap(await usecases.resetChecklist.execute({ userId })),
    ),
    submit_feedback: defineTool(
      "submit_feedback",
      toolSchemas.submit_feedback,
      async (args, userId) => {
        const data = unwrap(
          await usecases.submitFeedback.execute({
            userId,
            kind: args.kind,
            summary: args.summary,
            details: args.details,
            toolName: args.tool_name,
            itemId: args.item_id,
            userQuote: args.user_quote,
          }),
        );
        // Never log the feedback text; it can contain whatever the user said.
        logInfo("feedback_submitted", { id: data.id, kind: args.kind });
        return { id: data.id, received_at: data.receivedAt.toISOString() };
      },
    ),
  };
}
