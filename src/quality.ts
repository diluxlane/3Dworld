export type Tier = "Low" | "Balanced" | "High";
export type Quality = Tier | "Auto";
const tiers: Tier[] = ["Low", "Balanced", "High"];
export const pixelRatioCap: Record<Tier, number> = {
  Low: 0.8,
  Balanced: 1.25,
  High: 1.7,
};

// Measure wall-clock windows. A throttled device still gets a chance to downshift.
export class QualityControl {
  mode: Quality = "Auto";
  tier: Tier;
  private elapsed = 0;
  private frames = 0;
  private slow = 0;
  private fast = 0;
  constructor(private coarse: boolean) {
    this.tier = coarse ? "Low" : "Balanced";
  }
  select(mode: Quality) {
    this.mode = mode;
    this.tier = mode === "Auto" ? (this.coarse ? "Low" : "Balanced") : mode;
    this.reset();
  }
  reset() {
    this.frames = this.elapsed = this.slow = this.fast = 0;
  }
  observe(seconds: number): boolean {
    if (this.mode !== "Auto" || seconds <= 0) return false;
    this.elapsed += Math.min(seconds, 1);
    this.frames++;
    if (this.elapsed < 1.5) return false;
    const mean = this.elapsed / this.frames;
    this.slow = mean > (this.coarse ? 0.033 : 0.024) ? this.slow + 1 : 0;
    this.fast = mean < 0.018 ? this.fast + 1 : 0;
    this.elapsed = this.frames = 0;
    const index = tiers.indexOf(this.tier);
    const step =
      this.slow >= 2 && index > 0 ? -1 : this.fast >= 6 && index < 2 ? 1 : 0;
    if (!step) return false;
    this.tier = tiers[index + step];
    this.reset();
    return true;
  }
}
