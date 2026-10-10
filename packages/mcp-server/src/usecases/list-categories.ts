import type { Category } from "@cafe-listo/shared";
import { ok, type UseCaseResult } from "./types";

export class ListCategories {
  constructor(private readonly categories: readonly Category[]) {}

  async execute(): Promise<UseCaseResult<readonly Category[]>> {
    return ok(this.categories);
  }
}
