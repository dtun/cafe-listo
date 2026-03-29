export type CategoryId =
  | "water"
  | "food"
  | "medical"
  | "shelter"
  | "tools"
  | "comms"
  | "documents"
  | "morale";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
}

export interface PrepItem {
  id: string;
  name: string;
  categoryId: CategoryId;
  essential: boolean;
  quantity: string;
  regionNote: string | null;
}

export type ChecklistState = Record<string, boolean>;
