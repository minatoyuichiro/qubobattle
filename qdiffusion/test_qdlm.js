// node qdiffusion/test_qdlm.js — 勾配チェックとユニタリ性の確認
const { Model, encode } = require('./qdlm.js');
const m = new Model({ seed: 7 });
for (let k = 0; k < m.W.length; k++) m.W[k] += (Math.random() - 0.5) * 0.2;
const x = Int32Array.from(encode('the quick brown fox jumps over the lazy dog'));
const xt = m.noise(x, 10), i = 5, t = 10, target = x[i];

// ユニタリ性: 確率の和 = 1
const p = new Float64Array(m.V); m.probs(xt, i, t, p);
const sum = p.reduce((a, b) => a + b, 0);
console.log('sum p =', sum.toFixed(12));
if (Math.abs(sum - 1) > 1e-9) throw new Error('norm not preserved');

// 解析勾配 vs 数値微分
m.gW.fill(0); m.lossGrad(xt, i, t, target);
const nf = m.features(xt, i, t); const feats = Array.from(m.feat.slice(0, nf));
let maxErr = 0;
for (let trial = 0; trial < 30; trial++) {
  const f = feats[trial % feats.length], g = (Math.random() * m.G) | 0, idx = f * m.G + g;
  const h = 1e-3, w0 = m.W[idx];
  const L = () => { m.probs(xt, i, t, p); return -Math.log(p[target] + 1e-6); };
  m.W[idx] = w0 + h; const lp = L(); m.W[idx] = w0 - h; const lm = L(); m.W[idx] = w0;
  const num = (lp - lm) / (2 * h);
  maxErr = Math.max(maxErr, Math.abs(num - m.gW[idx]) / Math.max(1, Math.abs(num)));
}
console.log('max grad rel err =', maxErr.toExponential(2));
if (maxErr > 1e-2) throw new Error('gradient mismatch');
console.log('OK');
