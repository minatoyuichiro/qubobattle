"""Exchange-only circuits on the single-excitation (one-hot) subspace.

Gate: U_ab(theta) = exp(-i theta SWAP_ab) = cos(theta) I - i sin(theta) SWAP_ab.
On the span of one-hot states |e_k>, after removing the global phase e^{-i theta},
it acts on the pair {a, b} as
    [[u, v], [v, u]],  u = e^{i theta} cos theta,  v = -i e^{i theta} sin theta
and as the identity on every other component.
Equivalently U~_ab(theta) = exp(i theta L_ab) with the edge Laplacian
L_ab = (e_a - e_b)(e_a - e_b)^T, so the uniform (W) state is an exact fixed point.
"""
import math
import torch


def butterfly_layers(V: int, blocks: int):
    bits = int(round(math.log2(V)))
    assert 1 << bits == V, "V must be a power of two for butterfly connectivity"
    layers = []
    for _ in range(blocks):
        for s in range(bits):
            st = 1 << s
            a = [i for i in range(V) if not i & st]
            layers.append((a, [i + st for i in a]))
    return layers


def chain_layers(V: int, n_layers: int):
    """Brick-wall nearest-neighbour exchange on an open 1D chain (spin-qubit array)."""
    layers = []
    for l in range(n_layers):
        a = list(range(l % 2, V - 1, 2))
        layers.append((a, [i + 1 for i in a]))
    return layers


def make_layers(V: int, connectivity: str, depth: int):
    if connectivity == "butterfly":
        return butterfly_layers(V, depth)
    if connectivity == "chain":
        return chain_layers(V, depth)
    raise ValueError(connectivity)


class ExchangeCircuit(torch.nn.Module):
    """Batched simulator on real/imag parts. psi: (N, V) complex; theta: (N, n_gates) real.

    With d = psi_a - psi_b, s2 = sin^2(theta), sc = sin(theta)cos(theta) the gate is
        Delta = s2 * d - i * sc * d  (componentwise: Dr = s2 dr + sc di, Di = s2 di - sc dr)
        psi_a <- psi_a - Delta,  psi_b <- psi_b + Delta.
    Butterfly and brick-wall layers are applied through reshape views (no gathers).
    """

    def __init__(self, V: int, layers):
        super().__init__()
        self.V = V
        self.layers = [(list(a), list(b)) for a, b in layers]
        self.layer_sizes = [len(a) for a, _ in layers]
        self.n_gates = sum(self.layer_sizes)
        self.depth = len(layers)
        self.kinds = [self._kind(a, b) for a, b in self.layers]

    def _kind(self, a, b):
        V = self.V
        st = b[0] - a[0]
        if all(y - x == st for x, y in zip(a, b)) and a == [i for i in range(V) if not i & st] and st & (st - 1) == 0:
            return ("stride", st)
        if a == list(range(0, V - 1, 2)) and all(y == x + 1 for x, y in zip(a, b)):
            return ("even", None)
        if a == list(range(1, V - 1, 2)) and all(y == x + 1 for x, y in zip(a, b)):
            return ("odd", None)
        raise ValueError("unsupported layer pattern")

    def pairs(self):
        return self.layers

    @staticmethod
    def _gate(ar, ai, br, bi, th):
        s2 = torch.sin(th) ** 2
        sc = 0.5 * torch.sin(2 * th)
        dr, di = ar - br, ai - bi
        Dr = s2 * dr + sc * di
        Di = s2 * di - sc * dr
        return ar - Dr, ai - Di, br + Dr, bi + Di

    def _layer(self, re, im, th, kind):
        N, V = re.shape
        k, st = kind
        if k == "stride":
            shp = (N, V // (2 * st), 2, st)
            r4, i4 = re.reshape(shp), im.reshape(shp)
            t3 = th.reshape(N, V // (2 * st), st)
            ar, ai, br, bi = self._gate(r4[:, :, 0], i4[:, :, 0], r4[:, :, 1], i4[:, :, 1], t3)
            return torch.stack([ar, br], 2).reshape(N, V), torch.stack([ai, bi], 2).reshape(N, V)
        if k == "even":
            r3, i3 = re.reshape(N, V // 2, 2), im.reshape(N, V // 2, 2)
            ar, ai, br, bi = self._gate(r3[..., 0], i3[..., 0], r3[..., 1], i3[..., 1], th)
            return torch.stack([ar, br], 2).reshape(N, V), torch.stack([ai, bi], 2).reshape(N, V)
        # odd: pairs (1,2),(3,4),...,(V-3,V-2); qubits 0 and V-1 idle
        m = (V - 2) // 2
        r3, i3 = re[:, 1:V - 1].reshape(N, m, 2), im[:, 1:V - 1].reshape(N, m, 2)
        ar, ai, br, bi = self._gate(r3[..., 0], i3[..., 0], r3[..., 1], i3[..., 1], th)
        mid_r = torch.stack([ar, br], 2).reshape(N, 2 * m)
        mid_i = torch.stack([ai, bi], 2).reshape(N, 2 * m)
        return (torch.cat([re[:, :1], mid_r, re[:, V - 1:]], 1),
                torch.cat([im[:, :1], mid_i, im[:, V - 1:]], 1))

    def forward(self, psi, theta, noise=None):
        """noise: optional dict with keys
        'angle_rel' (relative quasi-static angle error sigma, per gate and shot),
        'dephase'   (Gaussian Z-phase sigma per qubit per layer),
        'damp'      (tensor (V,): per-layer amplitude-damping probability; the returned state is the
                     unnormalised no-jump branch, whose squared norm is the post-selection acceptance).
        """
        re, im = psi.real.contiguous(), psi.imag.contiguous()
        if noise and noise.get("angle_rel", 0) > 0:
            theta = theta * (1 + noise["angle_rel"] * torch.randn_like(theta))
        off = 0
        for m, kind in zip(self.layer_sizes, self.kinds):
            re, im = self._layer(re, im, theta[:, off:off + m], kind)
            off += m
            if noise:
                if noise.get("dephase", 0) > 0:
                    phi = noise["dephase"] * torch.randn_like(re)
                    c, s = torch.cos(phi), torch.sin(phi)
                    re, im = re * c - im * s, re * s + im * c
                if noise.get("damp") is not None:
                    f = torch.sqrt(1 - noise["damp"]).to(re.dtype)
                    re, im = re * f, im * f
        return torch.complex(re, im)


def basis_states(idx, V, dtype=torch.complex64):
    psi = torch.zeros(idx.numel(), V, dtype=dtype, device=idx.device)
    psi[torch.arange(idx.numel(), device=idx.device), idx.reshape(-1)] = 1
    return psi
