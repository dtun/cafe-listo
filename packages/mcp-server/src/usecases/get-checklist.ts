import type {
  CategoryId,
  ChecklistRepository,
  PrepItem,
} from "@cafe-listo/shared";
import { ok, type Catalog, type UseCaseResult } from "./types";

export interface Progress {
  done: number;
  total: number;
  percent: number;
}

export interface ChecklistView {
  items: Array<PrepItem & { done: boolean }>;
  progress: Progress;
  categories: Array<{
    id: CategoryId;
    label: string;
    emoji: string;
    done: number;
    total: number;
  }>;
}

function progressOf(done: number, total: number): Progress {
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export class GetChecklist {
  constructor(
    private readonly repo: ChecklistRepository,
    private readonly catalog: Catalog,
  ) {}

  async execute(input: {
    userId: string;
  }): Promise<UseCaseResult<ChecklistView>> {
    const entries = await this.repo.getEntries(input.userId);
    const doneIds = new Set(
      entries.filter((e) => e.status === "packed").map((e) => e.itemId),
    );

    const items = this.catalog.items.map((item) => ({
      ...item,
      done: doneIds.has(item.id),
    }));
    const categories = this.catalog.categories.map((category) => {
      const inCategory = items.filter((i) => i.categoryId === category.id);
      return {
        ...category,
        done: inCategory.filter((i) => i.done).length,
        total: inCategory.length,
      };
    });

    return ok({
      items,
      progress: progressOf(items.filter((i) => i.done).length, items.length),
      categories,
    });
  }
}
