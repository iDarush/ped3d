// Quality presets for the procedural scene. "med" is tuned for integrated laptop GPUs.
export type Quality = "low" | "med" | "high";

export interface QualityPreset {
  /** cap for devicePixelRatio */
  pixelRatio: number;
  /** Drawing-buffer pixel budget, independent of CSS window size. */
  maxPixels: number;
  birchDetailCount: number;
  birchSimpleCount: number;
  birchShadows: boolean;
  birchCardNear: number;
  birchCardFar: number;
  birchCardFade: number;
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
  /** two segments = 3 triangles/blade, three segments = 5 */
  grassSegments: 2 | 3;
  /** grass uses baked canopy/contact shade when false */
  grassShadows: boolean;
  /** fewer crown cards per detailed tree */
  liteTrees: boolean;
  /** forest fog: fully opaque at this distance, m */
  forestFogFar: number;
  antialias: boolean;
  /** normal-mapped ground layers in the terrain shader (3 extra texture samples per pixel) */
  groundNormals: boolean;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 1, maxPixels: 921600, birchDetailCount: 2, birchSimpleCount: 4, birchCardNear: 25, birchCardFar: 180, birchCardFade: 3, birchShadows: false, shadows: false, shadowMap: 1024, shadowHalf: 40, detailR: 45, cardR: 900, grassR: 22, grassDensity: 28, grassSegments: 2, grassShadows: false, liteTrees: true, forestFogFar: 110, antialias: false, groundNormals: false },
  med: { pixelRatio: 1.25, maxPixels: 1440000, birchDetailCount: 3, birchSimpleCount: 8, birchCardNear: 40, birchCardFar: 300, birchCardFade: 4, birchShadows: false, shadows: true, shadowMap: 1024, shadowHalf: 45, detailR: 70, cardR: 1600, grassR: 32, grassDensity: 32, grassSegments: 2, grassShadows: false, liteTrees: true, forestFogFar: 140, antialias: true, groundNormals: true },
  high: { pixelRatio: 2, maxPixels: 8294400, birchDetailCount: 8, birchSimpleCount: 16, birchCardNear: 60, birchCardFar: 400, birchCardFade: 6, birchShadows: true, shadows: true, shadowMap: 2048, shadowHalf: 90, detailR: 120, cardR: 2600, grassR: 60, grassDensity: 55, grassSegments: 3, grassShadows: true, liteTrees: false, forestFogFar: 190, antialias: true, groundNormals: true },
};

export function parseQuality(v: string | null | undefined): Quality {
  return v === "low" || v === "high" ? v : "med";
}

export function renderPixelRatio(width: number, height: number, deviceRatio: number, preset: QualityPreset): number {
  return Math.min(deviceRatio, preset.pixelRatio, Math.sqrt(preset.maxPixels / Math.max(1, width * height)));
}
