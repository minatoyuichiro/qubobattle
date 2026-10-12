"""Figures (PDF) and LaTeX tables generated directly from results/*.json."""
import glob
import json
import os
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = __file__.rsplit("/experiments", 1)[0]
R = os.path.join(ROOT, "results")
FIG = os.path.join(ROOT, "paper", "figs")
TAB = os.path.join(ROOT, "paper", "tables")
os.makedirs(FIG, exist_ok=True)
os.makedirs(TAB, exist_ok=True)
plt.rcParams.update({"font.size": 8, "axes.spines.top": False, "axes.spines.right": False,
                     "figure.dpi": 150, "savefig.bbox": "tight", "legend.frameon": False})
C = {"quantum": "#1f77b4", "quantum_mlp": "#17becf", "loglinear": "#ff7f0e", "mlp": "#2ca02c",
     "transformer": "#7f7f7f"}
LABEL = {"quantum": "Exchange (linear ctrl.)", "quantum_mlp": "Exchange (MLP ctrl.)",
         "loglinear": "Log-linear softmax", "mlp": "MLP softmax", "transformer": "Transformer (global ctx.)"}


def load_runs(sub):
    runs = []
    for f in sorted(glob.glob(os.path.join(R, sub, "*.json"))):
        with open(f) as fh:
            r = json.load(fh)
        r["file"] = os.path.basename(f)
        runs.append(r)
    return runs


def key(r):
    if r["name"] == "quantum" and r["model_kw"].get("controller") == "mlp":
        return "quantum_mlp"
    return r["name"]


def fmt(m, s=None, d=3):
    return f"{m:.{d}f}" if s is None or np.isnan(s) else f"{m:.{d}f} $\\pm$ {s:.{d}f}"


main = load_runs("main")
groups = {}
for r in main:
    groups.setdefault(key(r), []).append(r)

samples = {}
if os.path.exists(os.path.join(R, "samples.json")):
    with open(os.path.join(R, "samples.json")) as fh:
        samples = json.load(fh)


def sample_row(k):
    tagmap = {"quantum": "quantum_default_hybrid_s0", "quantum_mlp": "quantum_controllermlp_hybrid_s0",
              "loglinear": "loglinear_default_hybrid_s0", "mlp": "mlp_default_hybrid_s0",
              "transformer": "transformer_default_hybrid_s0"}
    s = samples.get(tagmap.get(k, "") + "@T1.0")
    return s


# ---------------- Table: main results ----------------
order = ["quantum", "quantum_mlp", "loglinear", "mlp", "transformer"]
lines = []
for k in order:
    if k not in groups:
        continue
    b = np.array([r["test_bpc"] for r in groups[k]])
    sd = b.std(ddof=1) if len(b) > 1 else float("nan")
    p = groups[k][0]["params"]
    s = sample_row(k)
    gen = f"{s['gen_bpc']:.2f} & {100 * s['word_ok']:.1f}" if s else "-- & --"
    lines.append(f"{LABEL[k]} & {p / 1e6:.2f}M & {len(b)} & {fmt(b.mean(), sd)} & {gen} \\\\")
if samples:
    d = samples["data"]
    lines.append("\\midrule")
    lines.append(f"Held-out data & -- & -- & -- & {d['gen_bpc']:.2f} & {100 * d['word_ok']:.1f} \\\\")
    u = samples["unigram_iid"]
    lines.append(f"i.i.d.\\ unigram & -- & -- & -- & {u['gen_bpc']:.2f} & {100 * u['word_ok']:.1f} \\\\")
with open(os.path.join(TAB, "main.tex"), "w") as f:
    f.write("\n".join(lines) + "\n")

# ---------------- Figure: validation curves ----------------
fig, ax = plt.subplots(figsize=(3.4, 2.3))
for k in order:
    if k not in groups:
        continue
    for i, r in enumerate(groups[k]):
        st = [h["step"] for h in r["history"]]
        vb = [h["valid_bpc"] for h in r["history"]]
        ax.plot(st, vb, color=C[k], alpha=0.9 if i == 0 else 0.35, lw=1.2, label=LABEL[k] if i == 0 else None)
ax.set_xlabel("training step")
ax.set_ylabel("validation NELBO (bits/char)")
ax.set_ylim(top=4.5)
ax.legend(fontsize=6.5)
fig.savefig(os.path.join(FIG, "curves.pdf"))
plt.close(fig)

# ---------------- Table: ablations ----------------
abl = load_runs("ablation")
base = groups.get("quantum", [])
rows = []
if base:
    b = np.array([r["test_bpc"] for r in base])
    rows.append(("Default: butterfly, 3 blocks (15 layers, 240 gates)", base[0]["n_gates"], base[0]["circuit_depth"], b.mean()))


def describe(r):
    kw = dict(r["model_kw"])
    n = r["name"]
    if n == "loglinear":
        return "Log-linear, no pair features" if kw.get("pairs") is False else "Log-linear"
    if kw.get("mode") == "reupload":
        return f"Data re-uploading (1 block/feature, {r['steps']} steps)"
    if r.get("loss") == "ce":
        return "Trained with $x_0$ cross-entropy only"
    if kw.get("envelope") is False:
        return "No exchange-pulse envelope $J(t)$"
    if kw.get("pairs") is False:
        return "No pair features"
    if kw.get("connectivity") == "chain":
        return f"1D chain, {kw['depth']} brick-wall layers"
    return f"Butterfly, {kw.get('depth')} block(s)"


for r in sorted(abl, key=lambda r: (r["name"], describe(r))):
    rows.append((describe(r), r.get("n_gates", "--"), r.get("circuit_depth", "--"), r["test_bpc"]))
with open(os.path.join(TAB, "ablation.tex"), "w") as f:
    for d, g, dep, b in rows:
        f.write(f"{d} & {g} & {dep} & {b:.3f} \\\\\n")

# ---------------- Noise figure ----------------
nf = os.path.join(R, "noise.json")
if os.path.exists(nf):
    with open(nf) as fh:
        nz = json.load(fh)
    clean = nz["clean"]["bpc"]
    fig, axs = plt.subplots(1, 4, figsize=(7.0, 1.9))
    xs = sorted(float(s) for s in nz["angle"])
    axs[0].plot(xs, [nz["angle"][str(s)]["bpc"] for s in xs], "o-", color=C["quantum"], ms=3)
    axs[0].set_xscale("log"); axs[0].set_xlabel(r"rel. exchange error $\sigma_J$"); axs[0].set_title("(a) charge noise")
    xs = sorted(float(s) for s in nz["dephase"])
    axs[1].plot(xs, [nz["dephase"][str(s)]["bpc"] for s in xs], "o-", color=C["quantum"], ms=3)
    axs[1].set_xscale("log"); axs[1].set_xlabel(r"phase noise $\sigma_\phi$ / layer"); axs[1].set_title("(b) dephasing")
    xs = sorted(float(s) for s in nz["damping"])
    D = nz["damping"]
    axs[2].plot(xs, [D[str(s)]["postselect"]["bpc"] for s in xs], "o-", color=C["quantum"], ms=3, label="weight check")
    axs[2].plot(xs, [D[str(s)]["no_check"]["bpc"] for s in xs], "s--", color="#d62728", ms=3, label="no check")
    ax2 = axs[2].twinx()
    ax2.plot(xs, [D[str(s)]["postselect"]["accept"] for s in xs], ":", color="k", lw=1, label="acceptance")
    ax2.set_ylim(0, 1.05); ax2.spines["top"].set_visible(False); ax2.tick_params(labelsize=6)
    axs[2].set_xscale("log"); axs[2].set_xlabel(r"damping $\bar\gamma$ / layer"); axs[2].set_title("(c) relaxation")
    h1, l1 = axs[2].get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
    axs[2].legend(h1 + h2, l1 + l2, fontsize=5.5, loc="center left")
    xs = sorted(float(s) for s in nz["readout"])
    Rd = nz["readout"]
    axs[3].plot(xs, [Rd[str(s)]["onehot_postselect"]["bpc"] for s in xs], "o-", color=C["quantum"], ms=3, label="one-hot + check")
    axs[3].plot(xs, [Rd[str(s)]["binary"]["bpc"] for s in xs], "s--", color="#d62728", ms=3, label="binary code")
    axs[3].set_xscale("log"); axs[3].set_xlabel("readout flip prob. $q$"); axs[3].set_title("(d) readout")
    ax3 = axs[3].twinx()
    ax3.plot(xs, [Rd[str(s)]["onehot_postselect"]["accept"] for s in xs], ":", color="k", lw=1, label="acceptance")
    ax3.set_ylim(0, 1.05); ax3.spines["top"].set_visible(False); ax3.set_ylabel("acceptance", fontsize=7)
    ax3.tick_params(labelsize=6)
    h1, l1 = axs[3].get_legend_handles_labels(); h2, l2 = ax3.get_legend_handles_labels()
    axs[3].legend(h1 + h2, l1 + l2, fontsize=5.5, loc="upper left")
    for a in axs:
        a.axhline(clean, color="gray", lw=0.6, ls=":")
    axs[0].set_ylabel("test NELBO (bits/char)")
    fig.tight_layout()
    fig.savefig(os.path.join(FIG, "noise.pdf"))
    plt.close(fig)

# ---------------- Verification table ----------------
vf = os.path.join(R, "verify.json")
if os.path.exists(vf):
    with open(vf) as fh:
        v = json.load(fh)
    with open(os.path.join(TAB, "lie.tex"), "w") as f:
        for k, d in v["lie_algebra"].items():
            conn, VV = k.split("_V")
            f.write(f"{conn} & {VV} & {d['dim']} & {d['u(V-1)']} & {d['u(V)']} \\\\\n")
    with open(os.path.join(TAB, "reach.tex"), "w") as f:
        for k, d in v["column_reachability"].items():
            dirc, arch = k.split("_")
            f.write(f"{arch.replace('butterfly', 'butterfly ').replace('chain', 'chain ')} & {dirc[3:]} & "
                    f"{d['median_kl_nats']:.1e} & {d['max_kl_nats']:.1e} \\\\\n")
# ---------------- Per-step NELBO decomposition ----------------
pf = os.path.join(R, "per_t.json")
if os.path.exists(pf):
    with open(pf) as fh:
        pt = json.load(fh)
    tagk = {"quantum_default_hybrid_s0": "quantum", "quantum_controllermlp_hybrid_s0": "quantum_mlp",
            "loglinear_default_hybrid_s0": "loglinear", "mlp_default_hybrid_s0": "mlp",
            "transformer_default_hybrid_s0": "transformer"}
    fig, ax = plt.subplots(figsize=(3.4, 2.2))
    for tag, k in tagk.items():
        if tag in pt:
            y = pt[tag]
            ax.plot(range(1, len(y) + 1), y, color=C[k], lw=1.2, label=f"{LABEL[k]} ({sum(y):.2f})")
    ax.set_yscale("log")
    ax.set_xlabel("diffusion step $t$")
    ax.set_ylabel(r"$\mathcal{L}_{t-1}$ (bits/char)")
    ax.legend(fontsize=6)
    fig.savefig(os.path.join(FIG, "per_t.pdf"))
    plt.close(fig)
print("figures and tables written")
