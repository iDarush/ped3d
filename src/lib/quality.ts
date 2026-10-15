// Quality presets for the procedural scene. "med" is tuned for integrated laptop GPUs.
export type Quality = "low" | "med" | "high";

export interface QualityPreset {
  /** cap for devicePixelRatio */
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  /** half-size of the sun's shadow box around the rider, m */
  shadowHalf: number;
  /** detailed (card-crown, shadow-casting) trees within this distance, m */
  detailR: number;
  /** cheap crossed-card trees up to this distance in open terrain, m (in forest: up to the fog distance) */
  cardR: number;
  /** grass tufts within this distance, m */
  /** grass blade field radius [m] (blades thin out from 30 % of it and shrink into the ground at the edge) */
  grassR: number;
  /** grass blades per m² at full density */
  grassDensity: number;
  /** fewer crown cards per detailed tree */
  liteTrees: boolean;
  /** forest fog: fully opaque at this distance, m */
  forestFogFar: number;
  antialias: boolean;
  /** normal-mapped ground layers in the terrain shader (3 extra texture samples per pixel) */
  groundNormals: boolean;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 1024, shadowHalf: 40, detailR: 45, cardR: 900, grassR: 25, grassDensity: 35, liteTrees: true, forestFogFar: 110, antialias: false, groundNormals: false },
  med: { pixelRatio: 1.25, shadows: true, shadowMap: 1024, shadowHalf: 45, detailR: 70, cardR: 1600, grassR: 40, grassDensity: 40, liteTrees: true, forestFogFar: 140, antialias: true, groundNormals: true },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, shadowHalf: 90, detailR: 120, cardR: 2600, grassR: 60, grassDensity: 55, liteTrees: false, forestFogFar: 190, antialias: true, groundNormals: true },
};

export function parseQuality(v: string | null | undefined): Quality {
  return v === "low" || v === "high" ? v : "med";
}
