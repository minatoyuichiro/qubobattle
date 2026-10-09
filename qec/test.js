// Node self-test: node qec/test.js
require('./core.js');
const Q = globalThis.QEC;
let fail = 0;
const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } };
for (const id of Object.keys(Q.CODES)) {
  const c = Q.getCode(id);
  const bad = c.commutationErrors();
  ok(bad.length === 0, id + ' stabilisers commute');
  ok(c.k === c.params[1], `${id} k=${c.k} expected ${c.params[1]}`);
  ok(c.n === c.params[0], `${id} n=${c.n} expected ${c.params[0]}`);
  const L = c.logicals();
  ok(L.length === c.k, id + ' logical pairs');
  // logical pairs: commute with stabilisers, symplectic orthonormal
  L.forEach((a, i) => {
    ok(Q.isZero(c.syndrome(a.X)) && Q.isZero(c.syndrome(a.Z)), id + ' logical in normaliser');
    L.forEach((b, j) => {
      ok(Q.symp(a.X, b.Z) === (i === j ? 1 : 0), id + ' XZ pairing');
      ok(Q.symp(a.X, b.X) === 0 && Q.symp(a.Z, b.Z) === 0, id + ' XX/ZZ commute');
    });
  });
  // min logical weight lower bound sanity (shortened reps must be >= d) for small codes
  if (c.n <= 25 && !c.protects) {
    const minW = Math.min(...L.map(p => Math.min(Q.pauliWeight(p.X), Q.pauliWeight(p.Z))));
    ok(minW >= c.params[2], `${id} logical weight ${minW} >= d`);
  }
  // decoder: random errors of weight <= t are always corrected for small codes
  const t = Math.floor((c.params[2] - 1) / 2);
  const model = { type: c.protects || 'depol', p: 0.05 };
  let fails = 0, trials = c.n > 60 ? 30 : 60;
  const rng = Q.rngFrom(42);
  for (let k = 0; k < trials; k++) {
    const e = Q.sampleCount(c.n, t, model, rng);
    const r = Q.decode(c, c.syndrome(e), model);
    const res = c.classify(Q.pauliMul(e, r.correction));
    if (!res.ok) fails++;
  }
  console.log(`${id.padEnd(7)} [[${c.n},${c.k},${c.params[2]}]] m=${c.m} css=${c.css} weight<=t=${t} decoder fails ${fails}/${trials}`);
  if (c.n <= 49) ok(fails === 0, id + ' decoder corrects t errors');
}
// distance brute force for the small codes (min weight non-trivial logical)
for (const id of ['shor9', 'five', 'steane', 'surf3', 'color5', 'surf5', 'xzzx5']) {
  const c = Q.getCode(id), n = c.n, d = c.params[2];
  let found = null;
  const e = Q.pauliVec(n);
  function rec(start, w) {
    if (found) return;
    if (w > 0 && Q.isZero(c.syndrome(e)) && !c.isStabilizer(e)) { found = w; return; }
    if (w === d - 1) return;
    for (let i = start; i < n; i++) for (let p = 1; p <= 3; p++) { Q.pauliApply(e, i, p); rec(i + 1, w + 1); Q.pauliApply(e, i, p); }
  }
  rec(0, 0);
  ok(found === null, `${id}: no logical of weight < ${d} (found ${found})`);
}
// colour-code faces: proper 3-colouring (faces sharing a qubit differ in colour)
for (const id of ['steane', 'color5', 'color7']) {
  const F = Q.getCode(id).faces;
  for (let a = 0; a < F.length; a++) for (let b = a + 1; b < F.length; b++)
    if (F[a].sup.some(q => F[b].sup.includes(q))) ok(F[a].color !== F[b].color, `${id} faces ${a},${b} same colour`);
}
// spacetime
const rng = Q.rngFrom(7);
let stf = 0;
for (let k = 0; k < 200; k++) {
  const st = Q.spacetimeSample(5, 4, 0, 0, rng, { data: 1, meas: 1 });
  const m = Q.spacetimeMWPM(st);
  const res = Q.xorInto(Uint8Array.from(st.finalData), m.correction);
  if (Q.weightOf(res) !== 0) stf++;
}
console.log('spacetime d=5 1 data + 1 meas fault: fails', stf, '/200');
ok(stf === 0, 'spacetime decoder');
console.log(fail ? `${fail} FAILURES` : 'ALL OK');
process.exit(fail ? 1 : 0);
