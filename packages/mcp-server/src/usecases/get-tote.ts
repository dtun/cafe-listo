import {
  expiringSoon,
  hazardCoverage,
  HDX_27_GAL_TOTE,
  packTote,
  readinessPercent,
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
import { loadTote, noProfileMessage } from "./load-tote";
import { ok, type Clock, type UseCaseResult } from "./types";

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

export const NO_PROFILE_MESSAGE = noProfileMessage("get_tote");

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
    const loaded = await loadTote(
      this.profiles,
      this.checklist,
      input.userId,
      "get_tote",
    );
    if (!loaded.ok) return loaded;
    const { region, lines } = loaded.data;

    return ok({
      region,
      lines,
      counts: statusCounts(lines),
      readinessPercent: readinessPercent(lines),
      container: this.container,
      pack: packTote(
        toPackItems(lines.map((line) => line.item)),
        this.container,
      ),
      expiring: expiringSoon(lines, this.clock.now()),
      hazards: hazardCoverage(region.hazards, lines),
    });
  }
}
