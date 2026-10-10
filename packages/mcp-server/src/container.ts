import {
  CATEGORIES,
  PREP_ITEMS,
  type ChecklistRepository,
} from "@cafe-listo/shared";
import { GetChecklist } from "./usecases/get-checklist";
import { ListCategories } from "./usecases/list-categories";
import { ListItems } from "./usecases/list-items";
import { ResetChecklist } from "./usecases/reset-checklist";
import { SetItemDone } from "./usecases/set-item-done";
import { systemClock, type Catalog, type Clock } from "./usecases/types";

export interface UseCases {
  listCategories: ListCategories;
  listItems: ListItems;
  getChecklist: GetChecklist;
  setItemDone: SetItemDone;
  resetChecklist: ResetChecklist;
}

export interface ContainerDeps {
  checklistRepository: ChecklistRepository;
}

export interface ContainerOverrides {
  clock?: Clock;
  catalog?: Catalog;
}

/** Composition root: wires adapters into use cases. No DI library. */
export function buildContainer(
  deps: ContainerDeps,
  overrides: ContainerOverrides = {},
): UseCases {
  const clock = overrides.clock ?? systemClock;
  const catalog = overrides.catalog ?? {
    categories: CATEGORIES,
    items: PREP_ITEMS,
  };
  const repo = deps.checklistRepository;

  return Object.freeze({
    listCategories: new ListCategories(catalog.categories),
    listItems: new ListItems(catalog.items),
    getChecklist: new GetChecklist(repo, catalog),
    setItemDone: new SetItemDone(repo, catalog, clock),
    resetChecklist: new ResetChecklist(repo),
  });
}
