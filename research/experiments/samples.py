"""Sample quality of trained diffusion LMs. Writes results/samples.json.

Metrics on N unconditional samples of length L (T reverse steps, measurement-based ancestral sampling):
  gen_bpc   bits/char of the samples under a Kneser-Ney 5-gram model fit on the training split
  word_ok   fraction of generated words (length >= 2) that occur in the training vocabulary
  uni_H     unigram entropy of the samples in bits (collapse check; data value reported as 'data')
"""
import glob
import json
import os
import sys

import numpy as np
import torch

ROOT = __file__.rsplit("/experiments", 1)[0]
sys.path.insert(0, ROOT)
from qxdlm.data import V, decode, load_fortunes
from qxdlm.ngram import KneserNey
from qxdlm.train import load

torch.set_num_threads(int(os.environ.get("THREADS", 4)))
N, L = int(os.environ.get("N", 256)), 64
tr, va, te = load_fortunes()
lm = KneserNey(5).fit(tr)
vocab = set(decode(tr).split(" "))


def metrics(seqs):
    txt = [decode(s) for s in seqs]
    gb = float(np.mean([lm.bpc(s) for s in seqs]))
    words = [w.strip(".,'?!") for t in txt for w in t.split(" ")[1:-1]]  # drop edge fragments
    words = [w for w in words if len(w) >= 2]
    ok = float(np.mean([w in vocab for w in words])) if words else 0.0
    cnt = np.bincount(np.concatenate(seqs), minlength=V) / (len(seqs) * L)
    H = float(-(cnt[cnt > 0] * np.log2(cnt[cnt > 0])).sum())
    return {"gen_bpc": gb, "word_ok": ok, "uni_H": H, "examples": txt[:6]}


res = {}
rng = np.random.default_rng(0)
starts = rng.integers(0, len(te) - L, N)
res["data"] = metrics([te[s:s + L] for s in starts])
res["unigram_iid"] = metrics([rng.choice(V, L, p=np.bincount(tr, minlength=V) / len(tr)) for _ in range(N)])
print("data", {k: v for k, v in res["data"].items() if k != "examples"}, flush=True)
pattern = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "results/main/ckpt/*_s0.pt")
for ck in sorted(glob.glob(pattern)):
    model, diff = load(ck)
    tag = os.path.basename(ck)[:-3]
    for temp in (1.0, 0.8):
        gen = torch.Generator().manual_seed(0)
        x = diff.sample(model, N, L, gen=gen, temperature=temp)
        r = metrics(list(x.numpy()))
        res[f"{tag}@T{temp}"] = r
        print(tag, temp, {k: v for k, v in r.items() if k != "examples"}, r["examples"][0], flush=True)
    # denoising trajectory for the figure
    gen = torch.Generator().manual_seed(1)
    _, traj = diff.sample(model, 1, L, gen=gen, return_traj=True)
    res[f"{tag}@traj"] = [decode(t[0]) for t in traj]
with open(os.path.join(ROOT, "results", "samples.json"), "w") as f:
    json.dump(res, f, indent=1)
