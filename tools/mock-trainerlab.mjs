// Emulates TrainerLab's GET /api/events WebSocket (state pushed every 500 ms) for testing ?live=1
// without the Windows backend or a trainer. Run: node tools/mock-trainerlab.mjs  (listens on :8767)
import { WebSocketServer } from "ws";
import http from "node:http";
const server = http.createServer((_, res) => { res.writeHead(404); res.end(); });
const wss = new WebSocketServer({ server, path: "/api/events" });
const route = { id: "komoot-3190822911", name: "Müritz-Tour Teil 1", mode: "profile", lengthKm: 18.85961, elevationSpanM: 32.2, points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] };
const start = Date.now();
let distanceM = Number(process.env.START_M ?? 17000), last = Date.now();
setInterval(() => {
  const now = Date.now(), speedKph = 28 + 4 * Math.sin((now - start) / 4000);
  distanceM += (speedKph / 3.6) * ((now - last) / 1000); last = now;
  const state = { mode: "bluetooth", connected: true, metrics: { powerW: 180, cadenceRpm: 85, speedKph }, workout: { running: true, name: route.name, distanceM, grade: 0, elapsedS: (now - start) / 1000, laps: 0, route } };
  for (const c of wss.clients) c.send(JSON.stringify({ type: "state", state }));
}, 500);
server.listen(8767, () => console.log("mock TrainerLab on :8767"));
