"""Denoisers p(x0 | x_t, t). All local models share the same context featurizer;
they differ only in the read-out that maps summed feature embeddings to a distribution."""
import math
import torch
import torch.nn as nn
import torch.nn.functional as Fn

from .circuits import ExchangeCircuit, basis_states, make_layers

PAIR_OFFSETS = [(-1, 1), (-2, -1), (1, 2), (-1, 0), (0, 1)]


class Featurizer(nn.Module):
    """Sparse one-hot context features of the *noisy* sequence:
    tokens at offsets -w..w (incl. the token itself), neighbour pairs, time step, bias."""

    def __init__(self, V, T, window=4, pairs=True):
        super().__init__()
        self.V, self.T, self.w = V, T, window
        self.tokF = V + 1  # + PAD
        self.pairs = PAIR_OFFSETS if pairs else []
        self.n_win = 2 * window + 1
        self.pair_base = self.n_win * self.tokF
        self.time_base = self.pair_base + len(self.pairs) * self.tokF ** 2
        self.tself_base = self.time_base + T          # joint (t, x_t) feature
        self.bias = self.tself_base + T * self.tokF
        self.F = self.bias + 1
        self.nf = self.n_win + len(self.pairs) + 3

    def forward(self, xt, t):
        B, L = xt.shape
        w, P = self.w, self.V
        xp = Fn.pad(xt, (w, w), value=P)  # (B, L+2w)
        win = xp.unfold(1, 2 * w + 1, 1)  # (B, L, 2w+1)
        offs = torch.arange(self.n_win, device=xt.device) * self.tokF
        feats = [win + offs]
        for p, (o1, o2) in enumerate(self.pairs):
            a, b = win[..., o1 + w], win[..., o2 + w]
            feats.append((self.pair_base + (p * self.tokF + a) * self.tokF + b).unsqueeze(-1))
        tf = (self.time_base + t - 1).view(B, 1, 1).expand(B, L, 1)
        feats.append(tf)
        feats.append((self.tself_base + (t - 1).view(B, 1) * self.tokF + xt).unsqueeze(-1))
        feats.append(torch.full((B, L, 1), self.bias, device=xt.device, dtype=torch.long))
        return torch.cat(feats, -1)  # (B, L, nf)


class QuantumExchangeDenoiser(nn.Module):
    """Context -> exchange angles -> exchange-only circuit on |x_t> -> Born probabilities.

    mode='additive': theta = sum_f W_f, one circuit.
    mode='reupload': each active feature f drives its own circuit block U(W_f), applied in sequence.
    """

    def __init__(self, V, T, connectivity="butterfly", depth=3, mode="additive", window=4,
                 pairs=True, init_bias=0.8, init_scale=0.0, envelope=True, controller="linear", hidden=240):
        super().__init__()
        self.V, self.mode, self.envelope, self.controller = V, mode, envelope, controller
        self.feat = Featurizer(V, T, window, pairs)
        self.circ = ExchangeCircuit(V, make_layers(V, connectivity, depth))
        G = self.circ.n_gates
        if controller == "mlp":  # nonlinear classical controller -> angles (isolates the read-out)
            assert mode == "additive"
            self.emb = nn.EmbeddingBag(self.feat.F, hidden, mode="sum")
            nn.init.normal_(self.emb.weight, std=0.02)
            self.ctrl = nn.Sequential(nn.GELU(), nn.Linear(hidden, hidden), nn.GELU(), nn.Linear(hidden, G))
        else:
            self.emb = nn.EmbeddingBag(self.feat.F, G, mode="sum") if mode == "additive" else nn.Embedding(self.feat.F, G)
        # exchange-pulse envelope J_g(t): theta_g <- J_g(t) * theta_g  (J -> 0 gives U -> I, i.e. 'copy x_t')
        self.env = nn.Embedding(T + 1, G)
        nn.init.ones_(self.env.weight)
        with torch.no_grad():
            if controller == "mlp":
                pass
            elif mode == "additive":
                self.emb.weight.zero_()
                self.emb.weight[self.feat.bias].uniform_(-init_bias, init_bias)
            else:
                self.emb.weight.uniform_(-init_scale, init_scale)
                self.emb.weight[self.feat.bias].uniform_(-init_bias, init_bias)

    def amplitudes(self, xt, t, noise=None):
        B, L = xt.shape
        idx = self.feat(xt, t)                       # (B,L,nf)
        psi = basis_states(xt.reshape(-1), self.V)   # (BL, V)
        if self.mode == "additive":
            theta = self.emb(idx.reshape(B * L, -1))
            if self.controller == "mlp":
                theta = self.ctrl(theta)
            if self.envelope:
                theta = theta * self.env(t).repeat_interleave(L, 0)
            psi = self.circ(psi, theta, noise)
        else:
            th = self.emb(idx).reshape(B * L, idx.shape[-1], -1)
            if self.envelope:
                th = th * self.env(t).repeat_interleave(L, 0).unsqueeze(1)
            # bias block first, then time, then context features
            for k in reversed(range(idx.shape[-1])):
                psi = self.circ(psi, th[:, k], noise)
        return psi.view(B, L, self.V)

    def forward(self, xt, t, noise=None, postselect=True):
        psi = self.amplitudes(xt, t, noise)
        p = psi.real ** 2 + psi.imag ** 2
        if postselect:  # condition on the Hamming-weight-1 sector (only matters with damping)
            p = p / p.sum(-1, keepdim=True)
        return torch.log(p.clamp_min(1e-12))

    def n_params(self):
        return sum(p.numel() for p in self.parameters())


class LogLinearDenoiser(nn.Module):
    """Same features, softmax read-out (classical counterpart of the additive quantum model)."""

    def __init__(self, V, T, window=4, pairs=True):
        super().__init__()
        self.feat = Featurizer(V, T, window, pairs)
        self.emb = nn.EmbeddingBag(self.feat.F, V, mode="sum")
        nn.init.zeros_(self.emb.weight)
        self.env = nn.Embedding(T + 1, V)  # per-t logit scale (analogue of the quantum envelope)
        nn.init.ones_(self.env.weight)

    def forward(self, xt, t, **_):
        B, L = xt.shape
        z = self.emb(self.feat(xt, t).reshape(B * L, -1)) * self.env(t).repeat_interleave(L, 0)
        return torch.log_softmax(z, -1).view(B, L, -1)

    def n_params(self):
        return sum(p.numel() for p in self.parameters())


class MLPDenoiser(nn.Module):
    """Same features, H hidden units + nonlinearity + softmax (parameter-matched classical model)."""

    def __init__(self, V, T, hidden=240, window=4, pairs=True):
        super().__init__()
        self.feat = Featurizer(V, T, window, pairs)
        self.emb = nn.EmbeddingBag(self.feat.F, hidden, mode="sum")
        nn.init.normal_(self.emb.weight, std=0.02)
        self.out = nn.Sequential(nn.GELU(), nn.Linear(hidden, hidden), nn.GELU(), nn.Linear(hidden, V))

    def forward(self, xt, t, **_):
        B, L = xt.shape
        h = self.emb(self.feat(xt, t).reshape(B * L, -1))
        return torch.log_softmax(self.out(h), -1).view(B, L, -1)

    def n_params(self):
        return sum(p.numel() for p in self.parameters())


class TransformerDenoiser(nn.Module):
    """Classical D3PM reference with *global* (bidirectional) context."""

    def __init__(self, V, T, L=64, d=128, layers=4, heads=4):
        super().__init__()
        self.tok = nn.Embedding(V, d)
        self.pos = nn.Parameter(torch.randn(L, d) * 0.02)
        self.time = nn.Embedding(T + 1, d)
        layer = nn.TransformerEncoderLayer(d, heads, 4 * d, dropout=0.0, batch_first=True,
                                           norm_first=True, activation="gelu")
        self.enc = nn.TransformerEncoder(layer, layers)
        self.norm = nn.LayerNorm(d)
        self.head = nn.Linear(d, V)
        # GPT-style init: token/time embeddings on the same scale as the positional embedding,
        # otherwise position information is swamped and attention cannot locate neighbours.
        nn.init.normal_(self.tok.weight, std=0.02)
        nn.init.normal_(self.time.weight, std=0.02)

    def forward(self, xt, t, **_):
        h = self.tok(xt) + self.pos[: xt.shape[1]] + self.time(t).unsqueeze(1)
        return torch.log_softmax(self.head(self.norm(self.enc(h))), -1)

    def n_params(self):
        return sum(p.numel() for p in self.parameters())


def build(name, V, T, **kw):
    if name == "quantum":
        return QuantumExchangeDenoiser(V, T, **kw)
    if name == "loglinear":
        return LogLinearDenoiser(V, T, **kw)
    if name == "mlp":
        return MLPDenoiser(V, T, **kw)
    if name == "transformer":
        return TransformerDenoiser(V, T, **kw)
    raise ValueError(name)
