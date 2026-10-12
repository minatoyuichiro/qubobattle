/*
 * Exchange-only Quantum Discrete Diffusion Language Model (QDLM)
 *
 * - 1文字 = V 量子ビットの one-hot (単一励起) 状態 |k> = |0..010..0>
 * - 使うゲートは交換相互作用 U(θ) = exp(-iθ·SWAP) のみ (単一量子ビットゲートなし)
 *   交換は励起数を保存するので、状態は常に V 次元の単一励起部分空間に留まる
 *   → 古典的に厳密シミュレーション可能 (O(1) / ゲート)
 * - 前向き拡散: 確率 β_t で励起量子ビットと一様ランダムな量子ビットを完全 SWAP
 *   (= 一様遷移の離散拡散 D3PM, Q̄_t = ᾱ_t I + (1-ᾱ_t)/V 11ᵀ)
 * - 逆拡散: 文脈 (ノイズの乗った周囲の文字と時刻 t) から交換角 θ を決め、
 *   |x_t> に交換回路を作用 → 測定で x̂_0 をサンプル → 事後分布 q(x_{t-1}|x_t, x̂_0)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QDLM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VOCAB = "abcdefghijklmnopqrstuvwxyz .,'?!"; // 32 tokens = 32 qubits

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function encode(text) {
    const out = [];
    const s = text.toLowerCase().replace(/[\s\n\r\t]+/g, ' ');
    for (const ch of s) {
      const k = VOCAB.indexOf(ch);
      if (k >= 0) out.push(k);
    }
    return out;
  }
  function decode(tokens) { return tokens.map(k => VOCAB[k]).join(''); }

  // バタフライ型の交換ゲート配置: 層ごとに i と i^(2^s) を交換 → log2 V 層で全結合
  function butterflyPairs(V, blocks) {
    const bits = Math.log2(V);
    if (!Number.isInteger(bits)) throw new Error('V must be a power of 2');
    const pa = [], pb = [];
    for (let b = 0; b < blocks; b++) {
      for (let s = 0; s < bits; s++) {
        const stride = 1 << s;
        for (let i = 0; i < V; i++) if ((i & stride) === 0) { pa.push(i); pb.push(i + stride); }
      }
    }
    return { pa: Int32Array.from(pa), pb: Int32Array.from(pb) };
  }

  class Model {
    constructor(opts = {}) {
      this.V = VOCAB.length;
      this.T = opts.T || 32;            // 拡散ステップ数
      this.w = opts.window || 4;        // 左右の文脈幅
      // 'additive': θ = Σ_f W[f,:] を 1 本の回路に (安定, 既定)
      // 'reupload': 各特徴が自分の交換パルス列を順に打つ (データ再アップロード)
      this.mode = opts.mode || 'additive';
      this.blocks = opts.blocks || (this.mode === 'additive' ? 3 : 1); // バタフライブロック数
      this.timeBuckets = opts.timeBuckets || 8;
      this.rand = mulberry32(opts.seed || 1234);

      const { pa, pb } = butterflyPairs(this.V, this.blocks);
      this.pa = pa; this.pb = pb; this.G = pa.length;

      // 特徴: 位置オフセット(-w..w) × (V + PAD) の one-hot, 時刻バケット, バイアス
      this.tokF = this.V + 1;
      // 隣接ペア特徴 (x_{i-1},x_{i+1}), (x_{i-2},x_{i-1}), (x_{i+1},x_{i+2}), (x_{i-1},x_i), (x_i,x_{i+1})
      this.pairOffs = opts.pairs === false ? [] : [[-1, 1], [-2, -1], [1, 2], [-1, 0], [0, 1]];
      this.pairBase = (2 * this.w + 1) * this.tokF;
      this.timeBase = this.pairBase + this.pairOffs.length * this.tokF * this.tokF;
      this.biasF = this.timeBase + this.timeBuckets;
      this.F = this.biasF + 1;

      // additive: U(ctx) = U_circ(Σ_k W[f_k, :])
      // reupload: U(ctx) = Π_k U_circ(W[f_k, :])   (非可換な積 → 文脈の組合せに非線形に依存)
      this.W = new Float32Array(this.F * this.G);
      const r = this.rand;
      if (this.mode === 'additive') {
        for (let g = 0; g < this.G; g++) this.W[this.biasF * this.G + g] = (r() * 2 - 1) * 0.8;
      } else {
        for (let k = 0; k < this.W.length; k++) this.W[k] = (r() * 2 - 1) * (opts.initScale ?? 0.02);
      }

      // ノイズスケジュール (cosine): ᾱ_t
      this.abar = new Float64Array(this.T + 1);
      for (let t = 0; t <= this.T; t++) {
        const f = Math.cos(((t / this.T) + 0.008) / 1.008 * Math.PI / 2);
        const f0 = Math.cos(0.008 / 1.008 * Math.PI / 2);
        this.abar[t] = Math.max(0, Math.min(1, (f * f) / (f0 * f0)));
      }
      this.abar[this.T] = 0;

      // 作業バッファ
      this.maxSeg = 2 * this.w + 3 + this.pairOffs.length;
      this.theta = new Float64Array(this.maxSeg * this.G);
      this.gTheta = new Float64Array(this.maxSeg * this.G);
      this.nGates = 0;
      this.re = new Float64Array(this.V); this.im = new Float64Array(this.V);
      this.lre = new Float64Array(this.V); this.lim = new Float64Array(this.V);
      this.feat = new Int32Array(this.maxSeg);

      // Adam
      this.mW = new Float32Array(this.W.length);
      this.vW = new Float32Array(this.W.length);
      this.gW = new Float32Array(this.W.length);
      this.touched = new Uint8Array(this.F);   // このバッチで使われた特徴行 (lazy Adam)
      this.rowStep = new Int32Array(this.F);   // 行ごとの更新回数 (バイアス補正)
    }

    // ---- 前向き拡散: 交換チャネル (確率 1-ᾱ_t で励起をランダムな量子ビットへ SWAP) ----
    noise(x0, t) {
      const a = this.abar[t], V = this.V, r = this.rand;
      const xt = new Int32Array(x0.length);
      for (let i = 0; i < x0.length; i++) xt[i] = r() < a ? x0[i] : (r() * V) | 0;
      return xt;
    }

    features(xt, i, t) {
      const w = this.w, L = xt.length, feat = this.feat;
      let n = 0;
      for (let o = -w; o <= w; o++) {
        const j = i + o;
        const tok = (j >= 0 && j < L) ? xt[j] : this.V; // PAD
        feat[n++] = (o + w) * this.tokF + tok;
      }
      const at = j => (j >= 0 && j < L) ? xt[j] : this.V;
      for (let p = 0; p < this.pairOffs.length; p++) {
        const [o1, o2] = this.pairOffs[p];
        feat[n++] = this.pairBase + (p * this.tokF + at(i + o1)) * this.tokF + at(i + o2);
      }
      feat[n++] = this.timeBase + Math.min(this.timeBuckets - 1, ((t - 1) * this.timeBuckets / this.T) | 0);
      feat[n++] = this.biasF;
      return n;
    }

    computeTheta(nf) {
      const G = this.G, W = this.W, th = this.theta, feat = this.feat;
      if (this.mode === 'additive') {
        th.fill(0, 0, G);
        for (let k = 0; k < nf; k++) {
          const base = feat[k] * G;
          for (let g = 0; g < G; g++) th[g] += W[base + g];
        }
        this.nGates = G;
        return;
      }
      for (let k = 0; k < nf; k++) {
        const base = feat[k] * G, off = k * G;
        for (let g = 0; g < G; g++) th[off + g] = W[base + g];
      }
      this.nGates = nf * G;
    }

    // 交換ゲート exp(-iθ SWAP) (大域位相を除く) を単一励起部分空間に作用
    // 対 (a,b) のブロック: [[u, v],[v, u]], u = e^{iθ}cosθ, v = -i e^{iθ} sinθ
    run(input) {
      const re = this.re, im = this.im, pa = this.pa, pb = this.pb, th = this.theta;
      re.fill(0); im.fill(0); re[input] = 1;
      for (let g = 0, j = 0; g < this.nGates; g++, j = (j + 1 === this.G ? 0 : j + 1)) {
        const c = Math.cos(th[g]), s = Math.sin(th[g]);
        const ur = c * c, ui = s * c, vr = s * s, vi = -s * c;
        const a = pa[j], b = pb[j];
        const ar = re[a], ai = im[a], br = re[b], bi = im[b];
        re[a] = ur * ar - ui * ai + vr * br - vi * bi;
        im[a] = ur * ai + ui * ar + vr * bi + vi * br;
        re[b] = vr * ar - vi * ai + ur * br - ui * bi;
        im[b] = vr * ai + vi * ar + ur * bi + ui * br;
      }
    }

    // p(x0 | 文脈) = |<x0|U|x_t>|^2 (ボルン則)
    probs(xt, i, t, out) {
      const nf = this.features(xt, i, t);
      this.computeTheta(nf);
      this.run(xt[i]);
      for (let k = 0; k < this.V; k++) out[k] = this.re[k] * this.re[k] + this.im[k] * this.im[k];
      return out;
    }

    // 1 サンプルの損失 -log p(x0) と θ の勾配 (随伴法, 可逆なので中間状態を保存しない)
    lossGrad(xt, i, t, target) {
      const nf = this.features(xt, i, t);
      this.computeTheta(nf);
      this.run(xt[i]);
      const re = this.re, im = this.im, lre = this.lre, lim = this.lim;
      const ar = re[target], ai = im[target];
      const p = ar * ar + ai * ai, eps = 1e-6;
      const loss = -Math.log(p + eps);
      lre.fill(0); lim.fill(0); lre[target] = 1;
      const pa = this.pa, pb = this.pb, th = this.theta, gT = this.gTheta;
      const scale = -2 / (p + eps);
      for (let g = this.nGates - 1; g >= 0; g--) {
        const j = g % this.G, a = pa[j], b = pb[j];
        // da/dθ = i (λa - λb)^* (ψa - ψb)
        const dlr = lre[a] - lre[b], dli = -(lim[a] - lim[b]); // conj
        const dpr = re[a] - re[b], dpi = im[a] - im[b];
        const pr = dlr * dpr - dli * dpi, pi = dlr * dpi + dli * dpr;
        const dar = -pi, dai = pr; // × i
        gT[g] = scale * (ar * dar + ai * dai); // Re(conj(a) da)
        // 逆ゲート M^† = conj(M) を ψ と λ に適用
        const c = Math.cos(th[g]), s = Math.sin(th[g]);
        const ur = c * c, ui = -s * c, vr = s * s, vi = s * c;
        let xr = re[a], xi = im[a], yr = re[b], yi = im[b];
        re[a] = ur * xr - ui * xi + vr * yr - vi * yi;
        im[a] = ur * xi + ui * xr + vr * yi + vi * yr;
        re[b] = vr * xr - vi * xi + ur * yr - ui * yi;
        im[b] = vr * xi + vi * xr + ur * yi + ui * yr;
        xr = lre[a]; xi = lim[a]; yr = lre[b]; yi = lim[b];
        lre[a] = ur * xr - ui * xi + vr * yr - vi * yi;
        lim[a] = ur * xi + ui * xr + vr * yi + vi * yr;
        lre[b] = vr * xr - vi * xi + ur * yr - ui * yi;
        lim[b] = vr * xi + vi * xr + ur * yi + ui * yr;
      }
      const G = this.G, gW = this.gW, feat = this.feat;
      for (let k = 0; k < nf; k++) {
        const base = feat[k] * G, off = this.mode === 'additive' ? 0 : k * G;
        this.touched[feat[k]] = 1;
        for (let g = 0; g < G; g++) gW[base + g] += gT[off + g];
      }
      return loss;
    }

    // ミニバッチ学習 (Adam)
    trainBatch(corpus, opts = {}) {
      const B = opts.batch || 64, len = opts.seqLen || 32, lr = opts.lr || 0.002;
      const r = this.rand;
      let total = 0;
      for (let bi = 0; bi < B; bi++) {
        const start = (r() * (corpus.length - len)) | 0;
        const x0 = corpus.subarray(start, start + len);
        const t = 1 + ((r() * this.T) | 0);
        const xt = this.noise(x0, t);
        const npos = opts.posPerSeq || 8;
        for (let q = 0; q < npos; q++) {
          const i = (r() * len) | 0;
          total += this.lossGrad(xt, i, t, x0[i]);
        }
      }
      const n = B * (opts.posPerSeq || 8);
      // lazy Adam: このバッチで出現した特徴の行だけ更新 (疎な one-hot 特徴向け)
      const b1 = 0.9, b2 = 0.999, G = this.G, W = this.W, m = this.mW, v = this.vW, gW = this.gW;
      for (let f = 0; f < this.F; f++) {
        if (!this.touched[f]) continue;
        this.touched[f] = 0;
        const st = ++this.rowStep[f];
        const c1 = 1 - Math.pow(b1, st), c2 = 1 - Math.pow(b2, st);
        for (let k = f * G, e = k + G; k < e; k++) {
          const g = gW[k] / n;
          gW[k] = 0;
          m[k] = b1 * m[k] + (1 - b1) * g;
          v[k] = b2 * v[k] + (1 - b2) * g * g;
          W[k] -= lr * (m[k] / c1) / (Math.sqrt(v[k] / c2) + 1e-8);
        }
      }
      return total / n;
    }

    // ---- 逆拡散サンプリング ----
    // 各位置で: 交換回路を走らせ測定 → x̂0, その後 q(x_{t-1}|x_t, x̂0) からサンプル
    initSample(len) {
      const x = new Int32Array(len);
      for (let i = 0; i < len; i++) x[i] = (this.rand() * this.V) | 0;
      return x;
    }

    sampleCat(p) {
      let u = this.rand(), acc = 0;
      for (let k = 0; k < p.length; k++) { acc += p[k]; if (u < acc) return k; }
      return p.length - 1;
    }

    denoiseStep(xt, t, opts = {}) {
      const V = this.V, L = xt.length, temp = opts.temperature || 1;
      const p = new Float64Array(V), q = new Float64Array(V);
      const next = new Int32Array(L), x0hat = new Int32Array(L);
      const a_t = this.abar[t] / Math.max(1e-12, this.abar[t - 1]); // 1ステップの保持確率
      const ab1 = this.abar[t - 1];
      for (let i = 0; i < L; i++) {
        this.probs(xt, i, t, p);
        if (temp !== 1) { let z = 0; for (let k = 0; k < V; k++) { p[k] = Math.pow(p[k], 1 / temp); z += p[k]; } for (let k = 0; k < V; k++) p[k] /= z; }
        const x0 = this.sampleCat(p); // 射影測定
        x0hat[i] = x0;
        if (t === 1) { next[i] = x0; continue; }
        let z = 0;
        for (let k = 0; k < V; k++) {
          const fwd = a_t * (k === xt[i] ? 1 : 0) + (1 - a_t) / V;   // q(x_t | x_{t-1}=k)
          const prior = ab1 * (k === x0 ? 1 : 0) + (1 - ab1) / V;    // q(x_{t-1}=k | x0)
          q[k] = fwd * prior; z += q[k];
        }
        for (let k = 0; k < V; k++) q[k] /= z;
        next[i] = this.sampleCat(q);
      }
      return { next, x0hat };
    }

    generate(len, opts = {}) {
      let x = this.initSample(len);
      const frames = [decode(Array.from(x))];
      for (let t = this.T; t >= 1; t--) {
        x = this.denoiseStep(x, t, opts).next;
        frames.push(decode(Array.from(x)));
      }
      return frames;
    }

    evalLoss(corpus, n = 2000, len = 32) {
      const p = new Float64Array(this.V);
      let tot = 0;
      for (let k = 0; k < n; k++) {
        const start = (this.rand() * (corpus.length - len)) | 0;
        const x0 = corpus.subarray(start, start + len);
        const t = 1 + ((this.rand() * this.T) | 0);
        const xt = this.noise(x0, t);
        const i = (this.rand() * len) | 0;
        this.probs(xt, i, t, p);
        tot += -Math.log(p[x0[i]] + 1e-6);
      }
      return tot / n;
    }

    // 単一励起部分空間を外れないこと (ノルム保存) の確認用
    norm() { let s = 0; for (let k = 0; k < this.V; k++) s += this.re[k] ** 2 + this.im[k] ** 2; return s; }
  }

  return { VOCAB, Model, encode, decode, butterflyPairs };
});
