// Checks motion: simulated ride and live (mock backend) ride; samples HUD distance over time.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const [name, q] of [["sim-ride", "route=komoot-3190822911&d=12000&speed=30"], ["live-ride", "live=1"]]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/filter/.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:4173/?${q}`);
  await page.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 45000 });
  await page.waitForTimeout(8000);
  const samples = [];
  for (let i = 0; i < 4; i++) { samples.push(await page.textContent(".hud")); await page.waitForTimeout(2000); }
  await page.screenshot({ path: `../shots/${name}.png` });
  console.log(name, errors.length ? errors : "no console errors", "\n  " + samples.map((s) => s.replace(/\s+/g, " ").trim()).join("\n  "));
  await page.close();
}
await browser.close();
