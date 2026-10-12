"""Character-level corpus: the `fortunes` collection (public domain / freely redistributable quotes)."""
import os
import re
import numpy as np

VOCAB = "abcdefghijklmnopqrstuvwxyz .,'?!"
V = len(VOCAB)
_IDX = {c: i for i, c in enumerate(VOCAB)}
FORTUNE_DIR = "/usr/share/games/fortunes"
_EXCLUDE = {"ascii-art"}


def clean(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[;:]", ",", text)
    text = re.sub(r"[\"`]", "'", text)
    text = "".join(c if c in _IDX else " " for c in text)
    return re.sub(r"\s+", " ", text).strip()


def encode(text: str) -> np.ndarray:
    return np.array([_IDX[c] for c in text if c in _IDX], dtype=np.int64)


def decode(ids) -> str:
    return "".join(VOCAB[int(i)] for i in ids)


def load_fortunes(seed: int = 0, frac=(0.9, 0.05, 0.05)):
    """Returns (train, valid, test) int64 token streams, split by fortune entry."""
    entries = []
    for name in sorted(os.listdir(FORTUNE_DIR)):
        path = os.path.join(FORTUNE_DIR, name)
        if "." in name or name in _EXCLUDE or not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8", errors="ignore") as f:
            for e in f.read().split("\n%\n"):
                # drop attribution lines ("-- Author") to keep running prose
                e = "\n".join(l for l in e.splitlines() if not l.strip().startswith("--"))
                e = clean(e)
                if len(e) >= 20:
                    entries.append(e)
    rng = np.random.default_rng(seed)
    rng.shuffle(entries)
    n = len(entries)
    a, b = int(frac[0] * n), int((frac[0] + frac[1]) * n)
    join = lambda es: encode(" ".join(es))
    return join(entries[:a]), join(entries[a:b]), join(entries[b:])


if __name__ == "__main__":
    tr, va, te = load_fortunes()
    print(len(tr), len(va), len(te))
    print(decode(tr[:300]))
    cnt = np.bincount(tr, minlength=V) / len(tr)
    print("unigram entropy (bits):", -(cnt[cnt > 0] * np.log2(cnt[cnt > 0])).sum())
