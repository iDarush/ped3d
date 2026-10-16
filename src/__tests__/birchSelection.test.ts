import { expect, it } from "vitest";
import { BirchSelection, birchBlend } from "../lib/birchSelection";

it("retains model IDs and LOD when distance order and the 20 m boundary change", () => {
  const s = new BirchSelection([1, 1], 42);
  s.update([{ i: 1, dd: 19 ** 2 }, { i: 2, dd: 21 ** 2 }], 0);
  s.update([{ i: 2, dd: 18 ** 2 }, { i: 3, dd: 10 ** 2 }, { i: 1, dd: 23 ** 2 }], 1);
  expect([...s.states.keys()]).toEqual([1, 2]);
  expect(s.states.get(1)!.level).toBe(0);
  expect(s.states.get(2)!.level).toBe(1);
});

it("holds outgoing slots through a complementary fade without exceeding either budget", () => {
  const s = new BirchSelection([1, 1], 42);
  s.update([{ i: 1, dd: 10 }, { i: 2, dd: 500 }], 0);
  s.update([{ i: 3, dd: 10 }, { i: 4, dd: 500 }], 1);
  expect(s.states.size).toBe(2);
  expect(birchBlend(s.states.get(1)!, 1)).toBe(1);
  expect(birchBlend(s.states.get(1)!, 1.2)).toBeCloseTo(0.5);
  s.update([{ i: 3, dd: 10 }, { i: 4, dd: 500 }], 1.5);
  expect([...s.states.keys()]).toEqual([3, 4]);
  expect(birchBlend(s.states.get(3)!, 1.5)).toBe(0);
  for (let level = 0; level < 2; level++) expect([...s.states.values()].filter(v => v.level === level)).toHaveLength(1);
});

it("uses an exit margin and reverses a fade without a coverage jump", () => {
  const s = new BirchSelection([1, 0], 42);
  s.update([{ i: 1, dd: 100 }], 0);
  s.update([{ i: 1, dd: 47 ** 2 }], 1);
  expect(s.states.get(1)!.to).toBe(1);
  s.update([], 2);
  const before = birchBlend(s.states.get(1)!, 2.2);
  s.update([{ i: 1, dd: 40 ** 2 }], 2.2);
  expect(birchBlend(s.states.get(1)!, 2.2)).toBeCloseTo(before);
  expect(birchBlend(s.states.get(1)!, 3)).toBe(1);
});

it("uses a shrub-specific detail boundary instead of the tree's 20 metres", () => {
  const s=new BirchSelection([6,20],30,12);
  s.update([{i:1,dd:15**2}],0);
  expect(s.states.get(1)!.level).toBe(1);
});

it("does not exchange visible cards/models at the radius boundary or when slots free", () => {
  const s=new BirchSelection([1,1],42);
  s.update([{i:1,dd:100},{i:2,dd:500}],0);
  const visible=new Set([1,3]);
  s.update([{i:1,dd:90**2},{i:3,dd:25}],1,visible);
  s.update([{i:1,dd:90**2},{i:3,dd:25}],2,visible);
  expect(s.states.get(1)!.to).toBe(1);
  expect(s.states.has(3)).toBe(false);
  expect(s.states.size).toBe(1);
  s.update([{i:3,dd:25}],3,new Set());
  s.update([{i:3,dd:25}],4,new Set());
  expect([...s.states.keys()]).toEqual([3]);
  expect(s.states.get(3)!.level).toBe(1); // LOD0 was still fading at admission.
});

it("prepares distant encounters within the same budgets and then locks their LOD",()=>{
  const s=new BirchSelection([1,1],42);
  s.update([{i:1,dd:70**2,admit:true},{i:2,dd:80**2,admit:true},{i:3,dd:90**2,admit:true}],0,new Set());
  expect(s.states.size).toBe(2);
  expect(s.states.get(1)!.level).toBe(1);
  expect(s.states.get(2)!.level).toBe(0);
  s.update([{i:1,dd:10**2},{i:2,dd:15**2}],1,new Set([1,2]));
  expect(s.states.get(1)!.level).toBe(1);
  expect(s.states.get(2)!.to).toBe(1);
});
