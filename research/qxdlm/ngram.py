"""Interpolated Kneser-Ney character n-gram model (reference AR model and sample scorer)."""
import math
from collections import defaultdict


class KneserNey:
    def __init__(self, order=5, V=32, d=0.75):
        self.n, self.V, self.d = order, V, d

    def fit(self, stream):
        s = [int(x) for x in stream]
        n = self.n
        raw = [defaultdict(int) for _ in range(n + 1)]
        for k in range(1, n + 1):
            for i in range(len(s) - k + 1):
                raw[k][tuple(s[i:i + k])] += 1
        cont = [defaultdict(int) for _ in range(n + 1)]   # N1+(. g)
        for k in range(2, n + 1):
            for g in raw[k]:
                cont[k - 1][g[1:]] += 1
        self.tables = {}
        for kind, src in (("raw", raw), ("cont", cont)):
            for k in range(1, n + 1):
                tot, typ = defaultdict(int), defaultdict(int)
                for g, v in src[k].items():
                    tot[g[:-1]] += v
                    typ[g[:-1]] += 1
                self.tables[kind, k] = (src[k], tot, typ)
        return self

    def prob(self, ctx, w):
        ctx = tuple(ctx[len(ctx) - (self.n - 1):]) if len(ctx) > self.n - 1 else tuple(ctx)
        top = len(ctx) + 1
        p = 1.0 / self.V
        for k in range(1, top + 1):
            cnt, tot, typ = self.tables["raw" if k == top else "cont", k]
            h = ctx[len(ctx) - (k - 1):] if k > 1 else ()
            T = tot.get(h, 0)
            if T == 0:
                continue
            p = max(cnt.get(h + (w,), 0) - self.d, 0) / T + self.d * typ[h] / T * p
        return p

    def bpc(self, stream):
        s = [int(x) for x in stream]
        lp = 0.0
        for i in range(len(s)):
            lp -= math.log2(self.prob(s[max(0, i - self.n + 1):i], s[i]))
        return lp / len(s)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, __file__.rsplit("/qxdlm", 1)[0])
    from qxdlm.data import load_fortunes
    tr, va, te = load_fortunes()
    for order in (1, 2, 3, 5, 7):
        m = KneserNey(order).fit(tr)
        print(order, "sum p =", sum(m.prob([3, 7, 1, 0, 12, 4][:order - 1], w) for w in range(32)), "test bpc", round(m.bpc(te[:30000]), 4))
