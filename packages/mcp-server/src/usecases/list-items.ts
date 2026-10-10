import type { CategoryId, PrepItem } from "@cafe-listo/shared";
import { ok, type UseCaseResult } from "./types";

export interface ListItemsInput {
  categoryId?: CategoryId;
  essentialOnly?: boolean;
}

export class ListItems {
  constructor(private readonly items: readonly PrepItem[]) {}

  async execute(input: ListItemsInput): Promise<UseCaseResult<PrepItem[]>> {
    return ok(
      this.items.filter(
        (item) =>
          (input.categoryId === undefined ||
            item.categoryId === input.categoryId) &&
          (!input.essentialOnly || item.essential),
      ),
    );
  }
}
