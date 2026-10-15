// Headless screenshots of the procedural scene: node shoot-proc.mjs [filter]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:4173/";
const D = (process.env.DS ?? "3000,3700,4300,4900,5450,5850").split(",").map(Number);
const cams = (process.env.CAMS ?? "eye,chase").split(",");
const extra = process.env.EXTRA ?? "";
const executablePath = process.env.CHROME_PATH ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find(existsSync);
if (!executablePath) throw new Error("Set CHROME_PATH to a Chrome or Edge executable");
const software = process.env.SOFTWARE_GL === "1";
const output = process.env.SHOTS_DIR ?? "shots";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath, args: software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] : [] });
let failures = 0;
for (const d of D)
  for (const cam of cams) {
    const name = process.env.NAME ?? `proc-${d}m-${cam}${process.env.SUFFIX ?? ""}`;
    if (process.argv[2] && !name.includes(process.argv[2])) continue;
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.setDefaultTimeout(240000);
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
    const t0 = Date.now();
    await page.goto(`${base}?test=1&view=proc&route=komoot-3190822911&d=${d}&cam=${cam}${extra}`);
    await page.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 120000 }).catch(() => errors.push("error: scene never became ready"));
    const tReady = Date.now() - t0;
    await page.waitForFunction(() => window.__rideDone, null, { timeout: 240000, polling: 1000 }).catch(() => errors.push("error: frames never finished"));
    await page.waitForTimeout(500);
    const ms = await page.evaluate(() => window.__rideFrameMs ?? []);
    const info = await page.evaluate(() => window.__rideInfo ?? null);
    const fps = ms.length ? 1000 / ms[ms.length - 1] : null;
    await page.screenshot({ path: `${output}/${name}.png` });
    console.log(`${name}: ready ${(tReady / 1000).toFixed(1)} s, headless (${software ? "forced SwiftShader" : "browser default GL"}) frame ${ms.map((m) => m.toFixed(0)).join("/")} ms ≈ ${fps?.toFixed(2)} fps; draw calls ${info?.calls}, triangles ${info?.triangles}${info?.blades != null ? `, grass blades ${info.blades}` : ""}`, errors.length ? "ISSUES:\n  " + errors.join("\n  ") : "no console errors");
    if (errors.some((e) => !e.startsWith("warning"))) failures++;
    await page.close();
  }
await browser.close();
process.exit(failures ? 1 : 0);
