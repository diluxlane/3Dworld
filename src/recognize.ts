export type Landmark = { x: number; y: number; z: number };
const distance = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function recognize(p: Landmark[]) {
  const palm = Math.max(0.001, distance(p[0], p[9]));
  if (distance(p[4], p[8]) / palm < 0.31) return 4;
  const [index, middle, ring, little] = [8, 12, 16, 20].map(
    (t) => distance(p[t], p[0]) > 1.18 * distance(p[t - 2], p[0]),
  );
  if (index && middle && ring && little) return 1;
  if (index && middle && !ring && !little) return 3;
  if (index && !middle && !ring && !little) return 2;
  if (!index && !middle && !ring && !little) return 0;
  return -1;
}
