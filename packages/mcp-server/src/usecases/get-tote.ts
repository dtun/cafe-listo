import {
  expiringSoon,
  getRegion,
  hazardCoverage,
  HDX_27_GAL_TOTE,
  packTote,
  readinessPercent,
  resolveKit,
  statusCounts,
  toPackItems,
  type ChecklistRepository,
  type Container,
  type ExpiringItem,
  type FemaRegion,
  type HazardCoverage,
  type PackResult,
  type ProfileRepository,
  type StatusCounts,
  type ToteLine,
} from "@cafe-listo/shared";
import { fail, ok, type Clock, type UseCaseResult } from "./types";

export interface ToteView {
  region: FemaRegion;
  /** The resolved kit, in kit order, each with the user's entry if any. */
  lines: ToteLine[];
  counts: StatusCounts;
  /** See `readinessPercent`. */
  readinessPercent: number;
  container: Container;
  /** `packTote` over the whole planned kit, not only what is packed. */
  pack: PackResult;
  expiring: ExpiringItem[];
  hazards: HazardCoverage[];
}

export const NO_PROFILE_MESSAGE =
  "No household profile saved yet, so there is no kit to track. Call set_household first with the user's state or ZIP and who is in the household (ask the user rather than guessing), then call get_tote again.";

/**
 * The user's tote: the kit for their saved profile joined with each item's
 * status, plus readiness, fit, expiring items and hazard coverage. Read-only.
 *
 * Fit is planned: `packTote` runs over every kit item at its full `units`,
 * so `fillPercent` is how full the tote will be once everything is packed
 * and `overflow` is what will have to live beside it. What is packed so far
 * is what readiness measures.
 */
export class GetTote {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly checklist: ChecklistRepository,
    private readonly clock: Clock,
    private readonly container: Container = HDX_27_GAL_TOTE,
  ) {}

  async execute(input: { userId: string }): Promise<UseCaseResult<ToteView>> {
    const [profile, entries] = await Promise.all([
      this.profiles.get(input.userId),
      this.checklist.getEntries(input.userId),
    ]);
    if (!profile) return fail("not_found", NO_PROFILE_MESSAGE);

    const region = getRegion(profile.region);
    const kit = resolveKit(region, profile.household, {
      state: profile.state,
    });
    const byItem = new Map(entries.map((entry) => [entry.itemId, entry]));
    const lines: ToteLine[] = kit.map((item) => ({
      item,
      entry: byItem.get(item.id),
    }));

    return ok({
      region,
      lines,
      counts: statusCounts(lines),
      readinessPercent: readinessPercent(lines),
      container: this.container,
      pack: packTote(toPackItems(kit), this.container),
      expiring: expiringSoon(lines, this.clock.now()),
      hazards: hazardCoverage(region.hazards, lines),
    });
  }
}
