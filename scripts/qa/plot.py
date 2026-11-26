"""Generate the four rendering charts from the two measured JSON traces."""
import json
from pathlib import Path
from statistics import median

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

root = Path(__file__).resolve().parents[2] / "docs/evidence/rebuild"
data = {name: json.loads((root / "data" / f"{name}-numbers.json").read_text())
        for name in ("baseline", "candidate")}
out = root / "charts"
out.mkdir(exist_ok=True)
colors = {"baseline": "#5e6875", "candidate": "#087c73"}
plt.rcParams.update({"axes.spines.top": False, "axes.spines.right": False,
                     "axes.grid": True, "grid.alpha": .18, "figure.dpi": 130,
                     "font.size": 10, "savefig.bbox": "tight"})

def save(fig, name):
    fig.tight_layout()
    fig.savefig(out / (name + ".png"))
    plt.close(fig)

def col(rows, index):
    return [r[index] for r in rows]

fig, ax = plt.subplots(figsize=(8.0, 3.5))
for name, sample in data.items():
    trace = col(sample["route"]["High"], 0)
    ax.plot(range(1, len(trace)+1), trace, label=name.title(), color=colors[name], lw=1.5)
ax.set(title="Portal Valley · matched camera route, High", xlabel="Route sample", ylabel="Frame interval (ms)")
ax.legend()
save(fig, "1-frame-time")

fig, axes = plt.subplots(1, 2, figsize=(9.2, 3.8))
ids = [s["id"] for s in data["baseline"]["scenes"]]
y = np.arange(len(ids))
for i, (name, sample) in enumerate(data.items()):
    pos = y+(i-.5)*.37
    for ax, key, divisor in zip(axes, ["firstFrameMs", "transfer"], [1, 1024]):
        ax.barh(pos, [s[key]/divisor for s in sample["scenes"]], .34,
                label=name.title(), color=colors[name])
for ax in axes:
    ax.set_yticks(y, ids)
    ax.invert_yaxis()
axes[0].set(title="Cold navigation to first scene frame", xlabel="Elapsed time (ms)")
axes[1].set(title="Cold visit, HTTP transfer", xlabel="Transferred KiB (including headers)")
axes[0].legend()
save(fig, "2-loading")

fig, axes = plt.subplots(1, 2, figsize=(8.4, 3.6))
names = ["Low", "Balanced", "High"]
for i, (name, sample) in enumerate(data.items()):
    for ax, n in zip(axes, [1, 2]):
        tiers = [q for q in names if q in sample["tiers"]]
        ax.bar([names.index(q)+(i-.5)*.36 for q in tiers],
               [median(col(sample["tiers"][q], n)) for q in tiers],
               .34, label=name.title(), color=colors[name])
for ax, measure in zip(axes, ["Draw calls / frame", "Triangles / frame"]):
    ax.set_xticks(range(3), names)
    ax.set_ylabel(measure)
axes[0].legend()
fig.suptitle("Portal Valley · median GL workload, entrance view")
save(fig, "3-workload")

fig, ax = plt.subplots(figsize=(8, 3.5))
for name, sample in data.items():
    rows=sample["stress"]
    origin=rows[0][6]
    buckets={}
    for row in rows:
        sec=(row[6]-origin)//3000
        buckets.setdefault(sec, []).append(row[0])
    ax.plot([3*k+1.5 for k in buckets], [median(v) for v in buckets.values()],
            marker=".", color=colors[name], label=name.title())
ax.set(title="Portal Valley · continuous Low-quality session", xlabel="Elapsed seconds (3-second windows)", ylabel="Median frame interval (ms)")
ax.legend()
save(fig, "5-sustained")

# Pair actual screenshots at their original aspect ratio.
from PIL import Image, ImageDraw, ImageFont
try:
    font=ImageFont.truetype("DejaVuSans.ttf",19)
except OSError:
    font=ImageFont.load_default()
pair=Image.new("RGB",(1280,440),"#11212a")
pen=ImageDraw.Draw(pair)
for i, (folder,title) in enumerate([("before","Before · 4bb8b0e"),("after","After · feature branch")]):
    frame=Image.open(root/folder/"valley-desktop.jpg").convert("RGB")
    pair.paste(frame.resize((640,400),Image.Resampling.LANCZOS),(640*i,40))
    pen.text((640*i+14,8),title,font=font,fill="white")
pair.save(root/"valley-comparison.jpg",quality=85)
