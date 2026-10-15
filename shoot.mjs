import { chromium } from "playwright-core";
const base = process.env.BASE ?? "http://localhost:4173/";
const shots = process.env.SHOTS ? JSON.parse(process.env.SHOTS) : [
  ["muritz-0m", "route=komoot-3190822911&d=0"],
  ["muritz-6500m", "route=komoot-3190822911&d=6500"],
  ["muritz-17800m-malchow", "route=komoot-3190822911&d=17800"],
  ["muritz-6500m-satellite", "route=komoot-3190822911&d=6500&imagery=satellite"],
  ["stelvio-3000m", "route=stelvio-bormio&d=3000"],
  ["stelvio-15000m", "route=stelvio-bormio&d=15000"],
  ["stelvio-3000m-chase", "route=stelvio-bormio&d=3000&cam=chase"],
  ["stelvio-20500m-satellite-chase", "route=stelvio-bormio&d=20500&imagery=satellite&cam=chase"],
  ["muritz-17800m-malchow-chase", "route=komoot-3190822911&d=17800&cam=chase"],
  ["stelvio-15000m-satellite", "route=stelvio-bormio&d=15000&imagery=satellite"],
];
const only = process.argv[2];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
let failures = 0;
for (const [name, query] of shots) {
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") { if (!/layers\[.*\]\.filter/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); }; });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && errors.push("requestfailed: " + r.url() + " " + r.failure()?.errorText));
  await page.goto(`${base}?test=1&${query}`);
  await page.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 45000 }).catch(() => errors.push("error: map load event never fired"));
  // let tiles load (idle event approximated by network idle + extra time)
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `../shots/${name}.png` });
  console.log(name, errors.length ? "ISSUES:\n  " + errors.join("\n  ") : "no console errors");
  if (errors.some((e) => !e.startsWith("warning"))) failures++;
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
