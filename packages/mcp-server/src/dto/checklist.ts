import type { PrepItem } from "@cafe-listo/shared";
import type { ChecklistView } from "../usecases/get-checklist";

export function itemDto(item: PrepItem) {
  return {
    id: item.id,
    name: item.name,
    category_id: item.categoryId,
    essential: item.essential,
    quantity: item.quantity,
    region_note: item.regionNote,
  };
}

export function checklistDto(view: ChecklistView) {
  return {
    progress: view.progress,
    categories: view.categories,
    items: view.items.map((item) => ({ ...itemDto(item), done: item.done })),
  };
}
