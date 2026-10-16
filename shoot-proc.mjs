// Headless screenshots of the procedural scene: node shoot-proc.mjs [filter]
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
const base = process.env.BASE ?? "http://localhost:4173/";
const D = (process.env.DS ?? "3000,3700,4300,4900,5450,5850").split(",").map(Number);
const cams = (process.env.CAMS ?? "eye,chase").split(",");
const extra = process.env.EXTRA ?? "";
const floorStages=(process.env.FLOOR_STAGES??'').split(',').filter(Boolean);
const variants=floorStages.length?floorStages.map(stage=>`${extra}&floor=${stage}`):[extra];
const motionSeconds = Math.min(30, Math.max(0, Number(process.env.MOTION_SECONDS ?? 0) || 0));
const motionSpeed = Number(new URLSearchParams(extra).get("speed") ?? 25);
const warmupSeconds = Math.max(0, Math.min(30, Number(process.env.WARMUP_SECONDS ?? 2)));
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
for (const extra of variants)
 for (const d of D)
  for (const cam of cams) {
    const name = process.env.NAME ?? `proc-${d}m-${cam}${process.env.SUFFIX ?? ""}${floorStages.length?'-floor-'+new URLSearchParams(extra).get('floor'):''}`;
    if (process.argv[2] && !name.includes(process.argv[2])) continue;
    const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH ?? 1280), height: Number(process.env.HEIGHT ?? 720) }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
    page.setDefaultTimeout(240000);
    if(process.env.GROUND_PROBE==='1')await page.addInitScript(()=>{
      window.__groundPrograms=[];
      const original=WebGL2RenderingContext.prototype.linkProgram;
      WebGL2RenderingContext.prototype.linkProgram=function(program){
        original.call(this,program);
        const fragment=this.getAttachedShaders(program)?.find(s=>this.getShaderParameter(s,this.SHADER_TYPE)===this.FRAGMENT_SHADER);
        if(!fragment||!this.getShaderSource(fragment)?.includes('uSplat'))return;
        const linked=this.getProgramParameter(program,this.LINK_STATUS),samplers=[];
        if(linked)for(let i=0;i<this.getProgramParameter(program,this.ACTIVE_UNIFORMS);i++){
          const u=this.getActiveUniform(program,i);
          if([this.SAMPLER_2D,this.SAMPLER_CUBE,this.SAMPLER_2D_ARRAY,this.SAMPLER_2D_SHADOW,this.SAMPLER_CUBE_SHADOW,this.SAMPLER_2D_ARRAY_SHADOW].includes(u.type))samplers.push({name:u.name,type:u.type,size:u.size});
        }
        window.__groundPrograms.push({linked,samplers,count:samplers.reduce((a,u)=>a+u.size,0),fragmentLimit:this.getParameter(this.MAX_TEXTURE_IMAGE_UNITS),arrayLayerLimit:this.getParameter(this.MAX_ARRAY_TEXTURE_LAYERS),log:this.getProgramInfoLog(program)});
      };
    });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("requestfailed", (r) => errors.push("requestfailed: " + r.url()));
    const t0 = Date.now();
    // Hold position during loading: otherwise a slower-loading baseline starts
    // its ride measurement farther down the road than the optimized version.
    const query=new URLSearchParams(extra);
    query.set('view','proc');query.set('route','komoot-3190822911');query.set('d',String(d));query.set('cam',cam);
    if(motionSeconds){query.delete('test');query.set('speed','0');}else query.set('test','1');
    await page.goto(`${base}?${query}`);
    await page.waitForFunction(() => !document.querySelector(".loading"), null, { timeout: 120000 }).catch(() => errors.push("error: scene never became ready"));
    const tReady = Date.now() - t0;
    let motion = null;
    if (motionSeconds) {
      await page.waitForFunction(() => window.__rideInfo, null, { timeout: 120000 });
      motion = await page.evaluate(async ({ seconds, speed, warmup }) => {
        // Warm up at the requested location, then start the same ride each time.
        await new Promise((resolve) => setTimeout(resolve, warmup * 1000));
        const startDistanceM=window.__rideInfo.distanceM;
        const speedInput = document.querySelector('.panel input[type="range"]');
        if (!speedInput) throw new Error("Ride speed control not found");
        speedInput.value = String(speed);
        speedInput.dispatchEvent(new Event("input", { bubbles: true }));
        const times = [];
        await new Promise((resolve) => {
          let start = 0, last = 0;
          const frame = (now) => {
            if (!start) start = now;
            if (last) times.push(now - last);
            last = now;
            if (now - start < seconds * 1000) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        const sorted = [...times].sort((a, b) => a - b);
        const slowest = sorted.slice(-Math.max(1, Math.ceil(sorted.length * 0.01)));
        return { startDistanceM,endDistanceM:window.__rideInfo.distanceM,frames: times.length, medianMs: sorted[Math.floor(sorted.length * 0.5)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], onePercentLowFps: 1000 / (slowest.reduce((a, b) => a + b, 0) / slowest.length), meanFps: times.length * 1000 / times.reduce((a, b) => a + b, 0) };
      }, { seconds: motionSeconds, speed: motionSpeed, warmup: warmupSeconds });
    } else {
      await page.waitForFunction(() => window.__rideDone, null, { timeout: 240000, polling: 1000 }).catch(() => errors.push("error: frames never finished"));
    }
    await page.waitForTimeout(500);
    const ms = await page.evaluate(() => window.__rideFrameMs ?? []);
    const info = await page.evaluate(() => window.__rideInfo ?? null);
    const groundPrograms=await page.evaluate(()=>window.__groundPrograms??null);
    const gpu = await page.evaluate(() => {
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unavailable";
    });
    const fps = ms.length ? 1000 / ms[ms.length - 1] : null;
    await page.screenshot({ path: `${output}/${name}.png` });
    const timing = motion ? "ride mode" : `frame ${ms.map((m) => m.toFixed(0)).join("/")} ms ≈ ${fps?.toFixed(2)} fps`;
    console.log(`${name}: ready ${(tReady / 1000).toFixed(1)} s, headless (${software ? "forced SwiftShader" : "browser default GL"}) ${timing}; draw calls ${info?.calls}, triangles ${info?.triangles}${info?.blades != null ? `, grass blades ${info.blades}` : ""}`, errors.length ? "ISSUES:\n  " + errors.join("\n  ") : "no console errors");
    console.log("GPU:", gpu);
    if (info?.birches) console.log("Local birch instances:", JSON.stringify(info.birches));
    if (info?.render) console.log("Drawing buffer:", JSON.stringify(info.render));
    if (info?.textures != null) console.log("GPU texture objects:", info.textures);
    if (motion) console.log("Ride intervals (headless):", JSON.stringify(motion));
    if(groundPrograms)console.log('Ground programs:',JSON.stringify(groundPrograms));
    writeFileSync(`${output}/${name}.json`, JSON.stringify({ startDistanceM: d, camera: cam, extra, viewport: page.viewportSize(), dpr: Number(process.env.DPR ?? 1), warmupSeconds, motionSeconds, gpu, info, motion, groundPrograms, errors }, null, 2));
    if(groundPrograms?.some(p=>!p.linked||p.count>p.fragmentLimit))failures++;
    if (errors.some((e) => !e.startsWith("warning"))) failures++;
    await page.close();
  }
await browser.close();
process.exit(failures ? 1 : 0);
