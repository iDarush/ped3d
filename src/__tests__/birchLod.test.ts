import { expect, it } from "vitest";
import { cardCoverage } from "../lib/birchLod";
import { QUALITY } from "../lib/quality";

it("keeps models visible near the camera and distant procedural trees beyond the card band", () => {
  for (const q of Object.values(QUALITY)) {
    expect(cardCoverage(0, q.birchCardNear, q.birchCardFar, q.birchCardFade)).toBe(0);
    expect(cardCoverage(q.birchCardNear + q.birchCardFade, q.birchCardNear, q.birchCardFar, q.birchCardFade)).toBe(1);
    expect(cardCoverage(q.birchCardFar, q.birchCardNear, q.birchCardFar, q.birchCardFade)).toBe(0);
  }
});

it("covers the CPU refill margin without gaps and bounds fade weights", () => {
  expect(cardCoverage(40, 40, 300, 4)).toBeCloseTo(0.5);
  expect(cardCoverage(290, 40, 300, 4)).toBeCloseTo(0.5);
  for (let d = 0; d < 330; d += 0.25) {
    const c = cardCoverage(d, 40, 300, 4);
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(1);
    if (d >= 46 && d <= 276) {
      expect(cardCoverage(d - 4, 40, 300, 4)).toBe(1);
      expect(cardCoverage(d + 4, 40, 300, 4)).toBe(1);
    }
  }
});
