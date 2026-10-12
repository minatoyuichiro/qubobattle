"""Usage: python experiments/run.py NAME SEED STEPS OUTDIR [key=value ...]   (model kwargs)"""
import ast
import sys
import torch

sys.path.insert(0, __file__.rsplit("/experiments", 1)[0])
from qxdlm.train import train

torch.set_num_threads(1)
name, seed, steps, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
kw, tkw = {}, {}
for a in sys.argv[5:]:
    if a.startswith("loss="):
        tkw["loss"] = a.split("=", 1)[1]
        continue
    k, v = a.split("=", 1)
    try:
        kw[k] = ast.literal_eval(v)
    except (ValueError, SyntaxError):
        kw[k] = v
train(name, out, steps=steps, seed=seed, lr=float(__import__("os").environ.get("LR", 2e-3)), model_kw=kw, **tkw, eval_every=max(500, steps // 10), log=lambda m: print(m, flush=True))
