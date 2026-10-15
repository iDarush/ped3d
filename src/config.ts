// All data sources here work without an API key.
// Optional: VITE_MAPTILER_KEY enables MapTiler satellite imagery (higher quality, needs a free key).
// Experimental switches via URL: ?terrain=aws|mapterhorn  &sat=esri|eox|swissimage

const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();

export interface DemSource { tiles: string[]; tileSize: number; maxzoom: number; attribution: string }
const DEMS: Record<string, DemSource> = {
  // AWS Terrain Tiles (Mapzen/Tilezen), open data, ~30 m in Europe
  aws: { tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 15, attribution: "Terrain: AWS Terrain Tiles / Mapzen" },
  // Mapterhorn: 30 m global + 0.25–10 m national lidar DEMs (most of Europe), Terrarium 512px webp. Native max zoom varies by region (z17 404s in parts of DE), so cap at 16
  mapterhorn: { tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"], tileSize: 512, maxzoom: 16, attribution: '<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>' },
};
export const DEM: DemSource = DEMS[q.get("terrain") ?? "aws"] ?? DEMS.aws;

export interface ImagerySource { tiles: string[]; maxzoom: number; attribution: string }
const IMAGERY: Record<string, ImagerySource> = {
  // NOTE: Esri says this keyless endpoint requires an ArcGIS licence and is not for commercial use — dev/testing only.
  esri: { tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], maxzoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" },
  // EOxCloudless Sentinel-2 (10 m), free for non-commercial use, CC BY-NC-SA 4.0
  eox: { tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"], maxzoom: 15, attribution: "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)" },
  // swisstopo SWISSIMAGE (10–25 cm, Switzerland only), free OGD, fair use
  swissimage: { tiles: ["https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg"], maxzoom: 20, attribution: "© swisstopo" },
};
export const MAPTILER_KEY: string = (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? "";
export const SATELLITE: ImagerySource = MAPTILER_KEY
  ? { tiles: [`https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`], maxzoom: 20, attribution: "© MapTiler" }
  : (IMAGERY[q.get("sat") ?? "esri"] ?? IMAGERY.esri);

export const BASE_STYLE = "https://tiles.openfreemap.org/styles/liberty"; // OpenFreeMap (OpenMapTiles schema, OSM data), keyless
