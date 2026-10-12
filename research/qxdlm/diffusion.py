"""Uniform-transition discrete diffusion (D3PM-uniform) realised as a random-SWAP exchange channel."""
import math
import torch


class UniformDiffusion:
    def __init__(self, V: int, T: int = 32, s: float = 0.008):
        self.V, self.T = V, T
        t = torch.arange(T + 1, dtype=torch.float64)
        f = torch.cos(((t / T) + s) / (1 + s) * math.pi / 2) ** 2
        abar = (f / f[0]).clamp(0, 1)
        abar[T] = 0.0
        self.abar = abar  # P(token untouched by time t)
        self.alpha = torch.ones(T + 1, dtype=torch.float64)
        self.alpha[1:] = abar[1:] / abar[:-1].clamp_min(1e-12)

    def q_sample(self, x0, t, gen=None):
        """x0: (B,L) long, t: (B,) long in 1..T.
        Physically: with prob 1-abar_t the excitation is SWAPped onto a uniformly random qubit."""
        a = self.abar.to(x0.device)[t].float().unsqueeze(1)
        keep = torch.rand(x0.shape, generator=gen, device=x0.device) < a
        rnd = torch.randint(0, self.V, x0.shape, generator=gen, device=x0.device)
        return torch.where(keep, x0, rnd)

    def reverse_probs(self, xt, p0, t):
        """p(x_{t-1}=k | x_t) = sum_{x0} p0(x0) q(x_{t-1}=k | x_t, x0)   (B,L,V), float64.
        This is exactly the law of 'measure x0_hat ~ p0, then sample the posterior'."""
        V = self.V
        p0 = p0.double()
        tt = t.view(-1, 1, 1)
        a_t = self.alpha.to(xt.device)[tt]
        ab_t = self.abar.to(xt.device)[tt]
        ab_1 = self.abar.to(xt.device)[tt - 1]
        onehot = torch.nn.functional.one_hot(xt, V).double()
        fwd = a_t * onehot + (1 - a_t) / V                     # q(x_t | x_{t-1}=k)
        z = ab_t * onehot + (1 - ab_t) / V                     # q(x_t | x0=j)
        r = p0 / z
        mix = ab_1 * r + (1 - ab_1) / V * r.sum(-1, keepdim=True)
        out = fwd * mix
        return out / out.sum(-1, keepdim=True)

    def posterior_true(self, xt, x0, t):
        V = self.V
        tt = t.view(-1, 1, 1)
        a_t = self.alpha.to(xt.device)[tt]
        ab_1 = self.abar.to(xt.device)[tt - 1]
        fwd = a_t * torch.nn.functional.one_hot(xt, V).double() + (1 - a_t) / V
        pri = ab_1 * torch.nn.functional.one_hot(x0, V).double() + (1 - ab_1) / V
        q = fwd * pri
        return q / q.sum(-1, keepdim=True)

    def loss_terms(self, logp0, xt, x0, t):
        """Per-token NELBO term L_{t-1} in nats: KL for t>=2, reconstruction for t=1. (B,L)"""
        p0 = logp0.exp()
        rec = -logp0.gather(-1, x0.unsqueeze(-1)).squeeze(-1).double()
        prev = self.reverse_probs(xt, p0, t)
        q = self.posterior_true(xt, x0, t)
        kl = (q * (q.clamp_min(1e-30).log() - prev.clamp_min(1e-30).log())).sum(-1)
        return torch.where((t == 1).view(-1, 1), rec, kl)

    @torch.no_grad()
    def sample(self, model, B, L, gen=None, device="cpu", temperature=1.0, return_traj=False):
        x = torch.randint(0, self.V, (B, L), generator=gen, device=device)
        traj = [x.clone()]
        for step in range(self.T, 0, -1):
            t = torch.full((B,), step, dtype=torch.long, device=device)
            logp0 = model(x, t)
            if temperature != 1.0:
                logp0 = torch.log_softmax(logp0 / temperature, -1)
            probs = self.reverse_probs(x, logp0.exp(), t)
            x = torch.multinomial(probs.reshape(-1, self.V).float(), 1, generator=gen).view(B, L)
            traj.append(x.clone())
        return (x, traj) if return_traj else x
