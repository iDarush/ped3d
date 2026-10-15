import type { GeoPoint } from "./geoTrack";
/** Minimal GPX → [lon, lat, ele] (trkpt, falling back to rtept). Browser DOMParser. */
export function parseGpx(xml: string): GeoPoint[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  let nodes = Array.from(doc.getElementsByTagName("trkpt"));
  if (!nodes.length) nodes = Array.from(doc.getElementsByTagName("rtept"));
  return nodes.map((n) => {
    const ele = n.getElementsByTagName("ele")[0]?.textContent;
    return [Number(n.getAttribute("lon")), Number(n.getAttribute("lat")), ele != null ? Number(ele) : undefined];
  });
}
