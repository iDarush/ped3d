import { expect, it } from "vitest";
import { QUALITY, renderPixelRatio } from "../lib/quality";

it("caps the actual pixel work on a large laptop window, including high DPI", () => {
  for (const preset of Object.values(QUALITY)) {
    for (const [w, h, dpr] of [[2880, 1450, 2], [1920, 1080, 1.25], [1080, 1920, 2]]) {
      const scale = renderPixelRatio(w, h, dpr, preset);
      expect(Math.floor(w * scale) * Math.floor(h * scale)).toBeLessThanOrEqual(preset.maxPixels);
      expect(scale).toBeLessThanOrEqual(dpr);
      expect(scale).toBeLessThanOrEqual(preset.pixelRatio);
      expect(scale).toBeGreaterThan(0);
    }
  }
});

it("keeps native resolution for a small low-DPI window and handles a hidden view", () => {
  expect(renderPixelRatio(800, 600, 1, QUALITY.med)).toBe(1);
  expect(Number.isFinite(renderPixelRatio(0, 0, 2, QUALITY.med))).toBe(true);
});
