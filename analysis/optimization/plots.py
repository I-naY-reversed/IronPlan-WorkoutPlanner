import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
import numpy as np

HERE = Path(__file__).resolve().parent
FIGURES = HERE / "figures"
FONTS = HERE.parent.parent / "mobile/node_modules/@expo-google-fonts/ibm-plex-sans"
LEVELS = [50, 68, 80, 90, 95]
INK, MUTED = "#1a1a1a", "#666666"
COHORTS = {
    "on_prior": {"label": "Typical", "colour": "#1a1a1a", "marker": "o"},
    "off_prior": {"label": "Atypical", "colour": "#7a7a7a", "marker": "^"},
}

for weight in ["400Regular", "600SemiBold"]:
    path = FONTS / weight / f"IBMPlexSans_{weight}.ttf"
    if path.exists():
        font_manager.fontManager.addfont(str(path))

plt.rcParams.update({
    "font.family": ["IBM Plex Sans", "DejaVu Sans"], "font.size": 7.5, "axes.labelsize": 7.5, "xtick.labelsize": 7,
    "ytick.labelsize": 7, "legend.fontsize": 6.5, "legend.frameon": False, "axes.linewidth": 0.6,
    "axes.spines.top": False, "axes.spines.right": False, "xtick.major.width": 0.6, "ytick.major.width": 0.6,
    "xtick.major.size": 2.5, "ytick.major.size": 2.5, "axes.grid": False, "text.color": INK, "axes.labelcolor": INK,
    "xtick.color": INK, "ytick.color": INK, "savefig.dpi": 300, "savefig.bbox": "tight",
})

people = json.loads((HERE / "results-app.json").read_text())["people"]
final = max(c["week"] for p in people for c in p["checkpoints"])
FIGURES.mkdir(exist_ok=True)


def last(p):
    return next(c for c in p["checkpoints"] if c["week"] == final)


def coverage(group, level):
    return 100 * np.mean([last(p)[f"lo{level}"] <= last(p)["optimum"] <= last(p)[f"hi{level}"] for p in group])


fig, ax = plt.subplots(figsize=(3.0, 3.0))
ax.plot([0, 100], [0, 100], color=MUTED, lw=0.8, ls=":", zorder=1)
ax.annotate("y = x", (97, 97), ha="right", va="top", xytext=(0, -6), textcoords="offset points", fontsize=6.5, color=MUTED)
for name, c in COHORTS.items():
    group = [p for p in people if p["cohort"] == name]
    empirical = [coverage(group, level) for level in LEVELS]
    ax.plot(LEVELS, empirical, marker=c["marker"], ms=3, color=c["colour"], lw=1.1, label=c["label"], zorder=3)
    print(name, "coverage", dict(zip(LEVELS, [round(v) for v in empirical])))
ax.set_xlim(40, 100)
ax.set_ylim(0, 100)
ax.set_xlabel("Nominal coverage (%)")
ax.set_ylabel("Empirical coverage (%)")
ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.24), ncol=2, handlelength=2.2, columnspacing=1.2)
fig.savefig(FIGURES / "calibration.png")
plt.close(fig)

double = {p["id"]: p for p in json.loads((HERE / "results-double.json").read_text())["people"]}


def failed(p):
    return 100 * np.mean([w["failed"] for w in p["weekly"] if w["week"] >= final // 2])


app_failed = [failed(p) for p in people]
double_failed = [failed(double[p["id"]]) for p in people]
print("median failed sets: app %.1f%%, double %.1f%%" % (np.median(app_failed), np.median(double_failed)))
fig, ax = plt.subplots(figsize=(3.2, 2.4))
bins = np.arange(0, max(double_failed) + 2.5, 2.5)
ax.hist(app_failed, bins, color=INK, edgecolor="white", lw=0.4, label="App")
ax.hist(double_failed, bins, histtype="step", color=MUTED, lw=0.9, label="Double progression")
ax.set_xlabel(f"Failed sets, weeks {final // 2}–{final} (%)")
ax.set_ylabel("Simulated users")
ax.legend(loc="upper right")
fig.savefig(FIGURES / "failed.png")
plt.close(fig)
