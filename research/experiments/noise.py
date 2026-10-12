"""Hardware-noise study for a trained exchange-only denoiser. Writes results/noise.json.

Channels (all exact within the 0/1-excitation sectors, so 32-qubit noisy simulation stays cheap):
  * quasi-static exchange-angle error  theta -> theta (1 + eps), eps ~ N(0, s^2)   (charge noise)
  * Z dephasing per qubit and layer    phase ~ N(0, s^2)                       (field gradients)
  * amplitude damping per layer, non-uniform gamma_k -> excitation lost to |0...0>;
    detected by the Hamming-weight check (post-selection) or, without the check, read out as a random token
  * readout bit flips with probability q on every qubit:
    one-hot + weight-1 post-selection vs. a dense binary (log2 V qubits) encoding of the same distribution
"""
import itertools
import json
import os
import sys

import numpy as np
import torch

ROOT = __file__.rsplit("/experiments", 1)[0]
sys.path.insert(0, ROOT)
from qxdlm.data import V, load_fortunes
from qxdlm.train import evaluate, load

torch.set_num_threads(int(os.environ.get("THREADS", 4)))
ck = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "results/main/ckpt/quantum_default_hybrid_s0.pt")
N_SEQ = int(os.environ.get("NSEQ", 64))
K = int(os.environ.get("K", 8))  # noise realisations averaged per forward (channel average)
model, diff = load(ck)
_, _, te = map(torch.from_numpy, load_fortunes())
bits = int(np.log2(V))
ham = torch.tensor([[bin(i ^ j).count("1") for j in range(V)] for i in range(V)], dtype=torch.float64)


class Noisy(torch.nn.Module):
    def __init__(self, noise=None, damp=None, postselect=True, readout_q=0.0, encoding="onehot"):
        super().__init__()
        self.noise, self.damp, self.post, self.q, self.enc = noise or {}, damp, postselect, readout_q, encoding
        self.accept = []

    def forward(self, xt, t):
        nz = dict(self.noise)
        reps = K if any(v > 0 for v in nz.values()) else 1
        if self.damp is not None:
            nz["damp"] = self.damp
        p = 0
        for _ in range(reps):
            psi = model.amplitudes(xt, t, nz or None)
            p = p + (psi.real ** 2 + psi.imag ** 2).double()
        p = p / reps
        acc = p.sum(-1, keepdim=True)  # probability that the excitation survived
        if self.post:
            p = p / acc
        else:  # lost excitation is mis-read as a uniformly random token
            p = p + (1 - acc) / V
        q = self.q
        if q > 0:
            if self.enc == "onehot":
                # P(observe weight-1 string e_j | true e_k): j=k: (1-q)^V ; j!=k: q^2 (1-q)^(V-2)
                keep, swap = (1 - q) ** V, q ** 2 * (1 - q) ** (V - 2)
                obs = p * keep + (p.sum(-1, keepdim=True) - p) * swap
                acc = acc * obs.sum(-1, keepdim=True) / p.sum(-1, keepdim=True)
                p = obs / obs.sum(-1, keepdim=True)
            else:  # binary code: every outcome is a valid token, no detection possible
                M = q ** ham * (1 - q) ** (bits - ham)
                p = p @ M
        self.accept.append(acc.mean().item())
        return torch.log(p.clamp_min(1e-12)).float()


def run(label, **kw):
    m = Noisy(**kw)
    b = evaluate(m, diff, te, n_seq=N_SEQ, seed=7)
    a = float(np.mean(m.accept))
    print(f"{label:40s} bpc {b:.4f} accept {a:.4f}", flush=True)
    return {"bpc": b, "accept": a}


res = {"checkpoint": os.path.basename(ck), "n_seq": N_SEQ, "K": K,
       "n_gates": model.circ.n_gates, "depth": model.circ.depth}
res["clean"] = run("clean")
res["angle"] = {s: run(f"angle_rel {s}", noise={"angle_rel": s}) for s in [0.005, 0.01, 0.02, 0.05, 0.1, 0.2]}
res["dephase"] = {s: run(f"dephase {s}", noise={"dephase": s}) for s in [0.003, 0.01, 0.03, 0.1, 0.3]}
gen = torch.Generator().manual_seed(0)
spread = 0.5 + torch.rand(V, generator=gen, dtype=torch.float64)  # non-uniform T1 across qubits
res["damping"] = {}
for g in [1e-3, 3e-3, 1e-2, 3e-2, 1e-1]:
    d = (g * spread).float()
    res["damping"][g] = {"postselect": run(f"damp {g} post", damp=d, postselect=True),
                         "no_check": run(f"damp {g} nocheck", damp=d, postselect=False),
                         "uniform_postselect": run(f"damp {g} uniform post", damp=torch.full((V,), g), postselect=True)}
res["readout"] = {}
for q in [1e-3, 3e-3, 1e-2, 3e-2, 5e-2]:
    res["readout"][q] = {"onehot_postselect": run(f"readout {q} onehot", readout_q=q),
                         "binary": run(f"readout {q} binary", readout_q=q, encoding="binary")}
os.makedirs(os.path.join(ROOT, "results"), exist_ok=True)
with open(os.path.join(ROOT, "results", "noise.json"), "w") as f:
    json.dump(res, f, indent=1)
