// Start an isolated local Vite server and run the screenshot checks against it.
// Example (PowerShell): $env:DS='3700,4530'; $env:EXTRA='&q=low'; node tools/check-scene.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5193", "--strictPort"], { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Vite startup timed out")), 30000);
    server.stdout.on("data", (d) => {
      if (d.toString().includes("Local:")) { clearTimeout(timer); resolve(); }
    });
    server.stderr.on("data", (d) => process.stderr.write(d));
    server.on("error", (e) => { clearTimeout(timer); reject(e); });
    server.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Vite exited: ${code}`)); });
  });
  const check = spawn(process.execPath, ["shoot-proc.mjs"], { cwd, windowsHide: true, stdio: "inherit", env: { ...process.env, BASE: "http://127.0.0.1:5193/" } });
  process.exitCode = await new Promise((resolve, reject) => {
    check.on("error", reject);
    check.on("exit", (code) => resolve(code ?? 1));
  });
} finally {
  server.kill();
}
