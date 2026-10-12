"""Training (x0 cross-entropy) and exact-in-t NELBO evaluation in bits per character."""
import json
import math
import os
import time

import numpy as np
import torch

from .data import V, load_fortunes
from .diffusion import UniformDiffusion
from .models import build

LN2 = math.log(2)


def batches(stream, B, L, gen):
    n = len(stream) - L
    while True:
        s = torch.randint(0, n, (B,), generator=gen)
        yield stream[s.unsqueeze(1) + torch.arange(L)]


def make_optim(model, lr):
    return [torch.optim.Adam(model.parameters(), lr=lr)]


@torch.no_grad()
def evaluate(model, diff, stream, L=64, n_seq=256, passes=1, seed=123, noise=None, bs=64):
    """Returns NELBO in bits/char, summing L_{t-1} over *all* t (no Monte-Carlo over t)."""
    model.eval()
    gen = torch.Generator().manual_seed(seed)
    starts = torch.linspace(0, len(stream) - L - 1, n_seq).long()
    total, count = 0.0, 0
    for _ in range(passes):
        for i in range(0, n_seq, bs):
            x0 = stream[starts[i:i + bs].unsqueeze(1) + torch.arange(L)]
            B = x0.shape[0]
            acc = torch.zeros(B, L, dtype=torch.float64)
            for step in range(1, diff.T + 1):
                t = torch.full((B,), step, dtype=torch.long)
                xt = diff.q_sample(x0, t, gen)
                kw = {"noise": noise} if noise is not None else {}
                acc += diff.loss_terms(model(xt, t, **kw), xt, x0, t)
            total += acc.sum().item()
            count += B * L
    model.train()
    return total / count / LN2


def train(name, out_dir, steps=20000, B=64, L=64, lr=2e-3, T=32, seed=0, eval_every=2000,
          log=print, model_kw=None, data=None, eval_seq=256, loss="hybrid", lam=0.01):
    torch.manual_seed(seed)
    gen = torch.Generator().manual_seed(seed)
    tr, va, te = data or load_fortunes()
    tr, va, te = map(torch.from_numpy, (tr, va, te))
    diff = UniformDiffusion(V, T)
    model_kw = dict(model_kw or {})
    model = build(name, V, T, **model_kw)
    opts = make_optim(model, lr)
    hist = []
    t0 = time.time()
    it = batches(tr, B, L, gen)
    run = 0.0
    for s in range(1, steps + 1):
        frac = s / steps
        cur = lr * min(1.0, s / 200) * 0.5 * (1 + math.cos(math.pi * frac))
        for o in opts:
            for g in o.param_groups:
                g["lr"] = cur
        x0 = next(it)
        t = torch.randint(1, T + 1, (B,), generator=gen)
        xt = diff.q_sample(x0, t, gen)
        logp = model(xt, t)
        ce = torch.nn.functional.nll_loss(logp.reshape(-1, V), x0.reshape(-1))
        if loss == "ce":
            obj = ce
        else:  # D3PM hybrid: unbiased one-t estimate of NELBO (T * L_{t-1}) + lam * CE
            obj = T * diff.loss_terms(logp, xt, x0, t).mean().float() + lam * ce
        for o in opts:
            o.zero_grad()
        obj.backward()
        for o in opts:
            o.step()
        run = 0.98 * run + 0.02 * ce.item() if s > 1 else ce.item()
        if s % eval_every == 0 or s == steps:
            vb = evaluate(model, diff, va, L, n_seq=128)
            hist.append({"step": s, "train_ce": run, "valid_bpc": vb, "time": time.time() - t0})
            log(f"[{name} seed{seed}] step {s} ce {run:.3f} valid {vb:.4f} bpc ({time.time() - t0:.0f}s)")
    test = evaluate(model, diff, te, L, n_seq=eval_seq, seed=7)
    res = {"name": name, "seed": seed, "model_kw": model_kw, "loss": loss, "lam": lam, "steps": steps, "B": B, "L": L, "lr": lr, "T": T,
           "params": model.n_params(), "test_bpc": test, "history": hist, "train_time": time.time() - t0}
    if name == "quantum":
        res["n_gates"] = model.circ.n_gates
        res["circuit_depth"] = model.circ.depth
    os.makedirs(out_dir, exist_ok=True)
    tag = f"{name}_{model_kw_tag(model_kw)}_{loss}_s{seed}"
    with open(os.path.join(out_dir, tag + ".json"), "w") as f:
        json.dump(res, f, indent=1)
    os.makedirs(os.path.join(out_dir, "ckpt"), exist_ok=True)
    torch.save({"state": model.state_dict(), "name": name, "model_kw": model_kw, "T": T},
               os.path.join(out_dir, "ckpt", tag + ".pt"))
    log(f"[{tag}] TEST {test:.4f} bpc, params {res['params']}")
    return model, res


def model_kw_tag(kw):
    return "-".join(f"{k}{v}" for k, v in sorted(kw.items())) or "default"


def load(path):
    ck = torch.load(path, weights_only=False)
    m = build(ck["name"], V, ck["T"], **ck["model_kw"])
    m.load_state_dict(ck["state"])
    m.eval()
    return m, UniformDiffusion(V, ck["T"])
