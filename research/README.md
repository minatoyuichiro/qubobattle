# Exchange-Only Quantum Discrete Diffusion (QXDM) — 研究コードと論文

交換相互作用 `exp(-iθ·SWAP)` だけで構成した量子離散拡散言語モデルの、Python による
厳密シミュレーション・ベースライン比較・ハードウェアノイズ解析と、その論文 (`paper/`) です。
ブラウザ版のデモは `../qdiffusion/` にあります。

## 構成

| パス | 内容 |
|---|---|
| `qxdlm/circuits.py` | 単一励起部分空間での交換ゲート厳密シミュレータ（バッチ, 実数演算, butterfly / 1D chain） |
| `qxdlm/diffusion.py` | 一様遷移 D3PM（= ランダム SWAP 交換チャネル）, 逆過程, NELBO |
| `qxdlm/models.py` | 量子交換デノイザ（線形 / MLP コントローラ, 再アップロード）, 古典ベースライン（log-linear, MLP, Transformer） |
| `qxdlm/train.py` | 学習（D3PM hybrid 損失）と全 t 和による NELBO 評価 [bits/char] |
| `qxdlm/ngram.py` | Kneser–Ney 文字 n-gram（AR 参照モデル・生成サンプル採点） |
| `experiments/verify.py` | 2^n 全空間との一致, Lie 代数次元, W 状態, パラメータシフト, 到達可能性 |
| `experiments/noise.py` | 電荷ノイズ, 位相緩和, 緩和 (T1) + 重みチェック, 読み出し誤り (one-hot vs binary) |
| `experiments/samples.py`, `per_t.py` | 生成品質, ステップ別 NELBO |
| `experiments/make_figs.py` | 図と LaTeX 表を結果 JSON から直接生成 |
| `results/` | 全実験の JSON 結果とログ |
| `paper/` | LaTeX 原稿 (`main.tex`) と PDF |

## 再現手順

```sh
python3 -m venv .venv && .venv/bin/pip install torch numpy scipy matplotlib
sudo apt-get install fortunes fortunes-min        # コーパス (/usr/share/games/fortunes)
cd research
../.venv/bin/python experiments/verify.py
experiments/run_queue.sh experiments/jobs_main.txt   # 4 並列, CPU で数時間
../.venv/bin/python experiments/noise.py
../.venv/bin/python experiments/per_t.py
../.venv/bin/python experiments/samples.py
../.venv/bin/python experiments/make_figs.py
cd paper && latexmk -pdf main.tex
```

## 主な結果（テスト NELBO, bits/文字, 3 seed の平均 ± 標準偏差）

| デノイザ（同一特徴量） | パラメータ | NELBO |
|---|---|---|
| 交換回路（線形コントローラ） | 1.65M | 3.375 ± 0.006 |
| 交換回路（MLP コントローラ） | 1.76M | 3.177 ± 0.005 |
| 古典 log-linear softmax | 0.22M | 3.129 ± 0.001 |
| 古典 MLP softmax | 1.70M | 2.919 ± 0.003 |
| （参考）Kneser–Ney 5-gram 自己回帰 | – | 2.11 |

- 交換 Born 読み出しは同条件の softmax に約 0.25 bits/文字 劣る（到達可能性ではなくパラメータ化・最適化の差）。
- 一様 T1 緩和は重み 1 チェックで分布が厳密に不変（受理率のみ低下）。読み出し誤り 1% で one-hot+チェック +0.012 vs 2 進符号 +0.29 bits/文字。
- 交換角誤差 5%・位相雑音 0.1 rad/層まで実質無害。
- グローバル文脈の Transformer デノイザは CPU 予算内で「x_t コピー + unigram」解に停滞したため参照値から除外（`results/main_bad/` にログ）。
