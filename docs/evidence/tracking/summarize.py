"""Run next to measurements.json with Python 3 and matplotlib installed."""
import json
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

folder = Path(__file__).resolve().parent
results = json.loads((folder / "measurements.json").read_text())
fig, axes = plt.subplots(1, 2, figsize=(10, 4), layout="constrained")
for delegate, run in results["runs"].items():
    frames = run["samples"]
    if not frames:
        print(delegate, run.get("error") or run["checks"])
        continue
    times = [f["inferenceMs"] for f in frames]
    transitions = [s["time"] for s in run["switches"] if s["mode"] == "hand"]
    actions = [g["time"] for g in run["gestures"] if g["gesture"] == "Open"]
    responses = [g - s for g, s in zip(actions, transitions)]
    def frequency(t):
        return (len(t)-1)*1000/(t[-1]-t[0]) if len(t)>1 else 0
    print(delegate, "captured samples",len(times), "cycles",len(responses),
          "median inference",median(times),
          "bitmap",median([f["bitmapMs"] for f in frames]),
          "worker round-trip",median([f["roundTripMs"] for f in frames]),
          "callback latency",responses,
          "initMs",run["initMs"],
          "source fps",frequency([t for t in run["sourceFrames"] if frames[0]["frame"]<=t<=frames[-1]["frame"]]),
          "sample fps",frequency([f["frame"] for f in frames]))
    axes[0].plot(range(1,len(times)+1),times,marker=".",label=delegate)
    if responses:
        axes[1].plot(range(1,len(responses)+1),responses,marker="o",label=delegate)
for ax,title,xlabel in zip(axes,["Worker inference","Open-hand response"],["Processed frame","Blank → hand transition"]):
    ax.set(title=title,xlabel=xlabel,ylabel="Milliseconds",ylim=(0,None))
    ax.grid(True,alpha=.22)
    if ax.lines:
        ax.legend()
axes[0].set_yscale("log")
axes[0].set_ylim(50, 1.3 * max(f["inferenceMs"] for r in results["runs"].values() for f in r["samples"]))
axes[0].set_ylabel("Milliseconds · logarithmic scale")
axes[1].set_xticks([1,2,3])
fig.suptitle("Gesture lab · synthetic camera · software-rendered Chromium")
fig.savefig(folder / "latency.png",dpi=120)
