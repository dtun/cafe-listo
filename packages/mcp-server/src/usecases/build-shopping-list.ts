import {
  buildShoppingList,
  HDX_27_GAL_TOTE,
  inferHasTote,
  packTote,
  toPackItems,
  type ChecklistRepository,
  type Container,
  type FemaRegion,
  type PackResult,
  type ProfileRepository,
  type ResolvedItem,
  type ShoppingList,
  type StoreCategory,
} from "@cafe-listo/shared";
import { loadTote } from "./load-tote";
import { ok, type UseCaseResult } from "./types";

export interface BuildShoppingListInput {
  userId: string;
  /** What the user said; omitted means inferred (see `inferHasTote`). */
  hasTote?: boolean;
  storePreference?: StoreCategory;
  budgetMode?: boolean;
  /** Plans for this many days instead of the profile's (1–14, validated by the tool schema). Not saved. */
  durationDays?: number;
}

export interface ShoppingListView {
  region: FemaRegion;
  /** Days the list is sized for: the override, else the profile's. */
  days: number;
  hasTote: boolean;
  /** True when `hasTote` was inferred rather than given. */
  hasToteInferred: boolean;
  storePreference: StoreCategory | null;
  budgetMode: boolean;
  list: ShoppingList;
  /** The whole resolved kit, in kit order. */
  kit: ResolvedItem[];
  container: Container;
  /** `packTote` over the whole planned kit, as in get_tote. */
  pack: PackResult;
}

/**
 * What the user still has to buy for their kit, grouped by store, plus the
 * planned fit. Read-only: nothing is saved, not even `durationDays`.
 */
export class BuildShoppingList {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly checklist: ChecklistRepository,
    private readonly container: Container = HDX_27_GAL_TOTE,
  ) {}

  async execute(
    input: BuildShoppingListInput,
  ): Promise<UseCaseResult<ShoppingListView>> {
    const loaded = await loadTote(
      this.profiles,
      this.checklist,
      input.userId,
      "build_shopping_list",
      { days: input.durationDays },
    );
    if (!loaded.ok) return loaded;
    const { profile, region, lines } = loaded.data;

    const kit = lines.map((line) => line.item);
    const hasTote = input.hasTote ?? inferHasTote(lines);
    const budgetMode = input.budgetMode ?? false;

    return ok({
      region,
      days: input.durationDays ?? profile.household.days,
      hasTote,
      hasToteInferred: input.hasTote === undefined,
      storePreference: input.storePreference ?? null,
      budgetMode,
      list: buildShoppingList(lines, {
        container: this.container,
        hasTote,
        storePreference: input.storePreference,
        budgetMode,
      }),
      kit,
      container: this.container,
      pack: packTote(toPackItems(kit), this.container),
    });
  }
}
