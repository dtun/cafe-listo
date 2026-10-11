/**
 * Storage containers a kit can be packed into.
 *
 * All figures are approximate. Interior dimensions and usable volume are
 * what fit inside once the lid is on, not what the label says.
 */

export interface InteriorDimensionsCm {
  length: number;
  width: number;
  height: number;
}

export interface Container {
  id: string;
  name: string;
  /** Approximate interior dimensions (cm), measured inside the walls. */
  interiorDimensionsCm: InteriorDimensionsCm;
  /** Capacity printed on the label (L). For reference only. */
  nominalVolumeL: number;
  /**
   * Volume you can actually fill with gear (L). Lower than nominal to allow
   * for tapered walls, the lid recess and packing gaps. `packTote` uses this.
   */
  usableVolumeL: number;
  /** Heaviest load (kg) one adult should be expected to lift and carry. */
  maxCarryWeightKg: number;
  /** True while the specs are estimates awaiting confirmation. */
  provisional: boolean;
}

/**
 * PROVISIONAL specs for the HDX 27 Gal tote.
 *
 * These are estimates, kept here in one place so research issue #40 can
 * confirm or replace them with a single edit:
 * - 27 US gal ≈ 102 L nominal.
 * - Interior dimensions estimated from the exterior footprint minus walls
 *   and taper.
 * - Usable volume ≈ 85% of nominal to allow for taper, lid and packing gaps.
 * - Max carry weight uses the common 23 kg (≈ 50 lb) single-person lift
 *   guideline.
 */
export const HDX_27_GAL_PROVISIONAL_SPECS = {
  interiorDimensionsCm: { length: 66, width: 43, height: 34 },
  nominalVolumeL: 102,
  usableVolumeL: 87,
  maxCarryWeightKg: 23,
} as const;

export const HDX_27_GAL_TOTE: Container = {
  id: "hdx-27-gal-tote",
  name: "HDX 27 Gal Tote",
  interiorDimensionsCm: {
    ...HDX_27_GAL_PROVISIONAL_SPECS.interiorDimensionsCm,
  },
  nominalVolumeL: HDX_27_GAL_PROVISIONAL_SPECS.nominalVolumeL,
  usableVolumeL: HDX_27_GAL_PROVISIONAL_SPECS.usableVolumeL,
  maxCarryWeightKg: HDX_27_GAL_PROVISIONAL_SPECS.maxCarryWeightKg,
  provisional: true,
};

export const CONTAINERS: readonly Container[] = [HDX_27_GAL_TOTE];
