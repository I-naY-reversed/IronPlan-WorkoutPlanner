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
INK, MUTED = "#1a1a1a", "#666666"
ARMS = {
    "app": ("App", "#1a1a1a", "-"),
    "double": ("Double progression", "#555555", "--"),
    "linear": ("Linear progression", "#8a8a8a", ":"),
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

runs = {arm: json.loads((HERE / f"results-{arm}.json").read_text())["people"] for arm in ARMS}
FIGURES.mkdir(exist_ok=True)


def weekly(people, key):
    return 100 * np.array([[w[key] for w in p["weekly"]] for p in people]).mean(axis=0)


fig, axes = plt.subplots(1, 3, figsize=(7.0, 2.4), gridspec_kw={"wspace": 0.45})
for arm, (label, colour, ls) in ARMS.items():
    weeks = [w["week"] for w in runs[arm][0]["weekly"]]
    on, failed = weekly(runs[arm], "on_target"), weekly(runs[arm], "failed")
    axes[0].plot(weeks, on, color=colour, ls=ls, lw=1.1, label=label)
    axes[1].plot(weeks, failed, color=colour, ls=ls, lw=1.1, label=label)
    reached = next((w for w, v in zip(weeks, on) if v >= 50), None)
    print(arm, "on target %.0f%%, failed %.0f%% (weeks 13-26), half on target by week %s" % (on[12:].mean(), failed[12:].mean(), reached))
app_gain = {p["id"]: p["strength_gain_pct"] for p in runs["app"]}
diffs = [[p["strength_gain_pct"] - app_gain[p["id"]] for p in runs[arm]] for arm in ["double", "linear"]]
box = axes[2].boxplot(diffs, widths=0.5, patch_artist=True, flierprops={"marker": "o", "ms": 2, "mfc": MUTED, "mec": "none"})
for patch, arm in zip(box["boxes"], ["double", "linear"]):
    patch.set_facecolor("white")
    patch.set_edgecolor(ARMS[arm][1])
    patch.set_linewidth(0.8)
for part in ["whiskers", "caps", "medians"]:
    for line in box[part]:
        line.set_color(INK)
        line.set_linewidth(0.6 if part != "medians" else 1.1)
for arm, d in zip(["double", "linear"], diffs):
    print(arm, "gain minus app, median %+.2f pts" % np.median(d))
axes[2].axhline(0, color=MUTED, lw=0.6, ls=":")
axes[2].set_xticks([1, 2], ["Double", "Linear"])
axes[0].set_ylabel("Sets within 1 rep of target effort (%)")
axes[1].set_ylabel("Failed sets (%)")
axes[2].set_ylabel("Gain minus app, week 26 (pts)")
for ax in axes[:2]:
    ax.set_xlabel("Week")
    ax.set_ylim(0, 100)
axes[1].legend(loc="upper center", bbox_to_anchor=(0.5, -0.3), ncol=3, handlelength=2.2, columnspacing=1.2)
fig.savefig(FIGURES / "versus.png")
