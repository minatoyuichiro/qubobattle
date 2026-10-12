"""Per-step NELBO decomposition L_{t-1} (bits/char) for seed-0 checkpoints. Writes results/per_t.json."""
import glob
import json
import math
import os
import sys

import torch

ROOT = __file__.rsplit("/experiments", 1)[0]
sys.path.insert(0, ROOT)
from qxdlm.data import load_fortunes
from qxdlm.train import load

torch.set_num_threads(int(os.environ.get("THREADS", 4)))
_, _, te = map(torch.from_numpy, load_fortunes())
L, n_seq = 64, 128
starts = torch.linspace(0, len(te) - L - 1, n_seq).long()
x0_all = te[starts.unsqueeze(1) + torch.arange(L)]
out = {}
for ck in sorted(glob.glob(os.path.join(ROOT, "results/main/ckpt/*_s0.pt"))):
    model, diff = load(ck)
    gen = torch.Generator().manual_seed(7)
    per = []
    with torch.no_grad():
        for step in range(1, diff.T + 1):
            tot = 0.0
            for i in range(0, n_seq, 64):
                x0 = x0_all[i:i + 64]
                t = torch.full((x0.shape[0],), step, dtype=torch.long)
                xt = diff.q_sample(x0, t, gen)
                tot += diff.loss_terms(model(xt, t), xt, x0, t).sum().item()
            per.append(tot / (n_seq * L) / math.log(2))
    tag = os.path.basename(ck)[:-3]
    out[tag] = per
    print(tag, round(sum(per), 4), [round(p, 3) for p in per[:6]], flush=True)
with open(os.path.join(ROOT, "results", "per_t.json"), "w") as f:
    json.dump(out, f, indent=1)
