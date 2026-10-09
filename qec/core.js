/*
 * QEC core: GF(2) linear algebra, stabilizer codes, decoders.
 * Works in the browser (window.QEC) and in Node (globalThis.QEC) for tests.
 *
 * Pauli operators on n qubits are stored in the binary symplectic form
 * (x | z), each half a Uint8Array of length n.  Two Paulis commute iff
 * x1·z2 + z1·x2 = 0 (mod 2).  Syndrome bit i of error E is the symplectic
 * product of stabilizer generator i with E.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------
  // GF(2) helpers (rows are Uint8Array of 0/1)
  // ------------------------------------------------------------------
  const zeros = n => new Uint8Array(n);
  const xorInto = (a, b) => { for (let i = 0; i < a.length; i++) a[i] ^= b[i]; return a; };
  const weightOf = v => { let w = 0; for (let i = 0; i < v.length; i++) w += v[i]; return w; };
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s ^= a[i] & b[i]; return s; };
  const isZero = v => { for (let i = 0; i < v.length; i++) if (v[i]) return false; return true; };

  // Row-reduce a copy; returns {rows, pivots, rank}
  function rref(M, ncols) {
    const rows = M.map(r => Uint8Array.from(r));
    const n = ncols ?? (rows[0] ? rows[0].length : 0);
    const pivots = [];
    let rk = 0;
    for (let c = 0; c < n && rk < rows.length; c++) {
      let p = -1;
      for (let r = rk; r < rows.length; r++) if (rows[r][c]) { p = r; break; }
      if (p < 0) continue;
      if (p !== rk) { const t = rows[p]; rows[p] = rows[rk]; rows[rk] = t; }
      for (let r = 0; r < rows.length; r++) if (r !== rk && rows[r][c]) xorInto(rows[r], rows[rk]);
      pivots.push(c);
      rk++;
    }
    return { rows: rows.slice(0, rk), pivots, rank: rk };
  }
  const rank = M => (M.length ? rref(M).rank : 0);

  // Incremental span membership: keeps an echelon basis.
  class Span {
    constructor(len) { this.len = len; this.basis = []; this.piv = []; }
    reduce(v) {
      const w = Uint8Array.from(v);
      for (let i = 0; i < this.basis.length; i++) if (w[this.piv[i]]) xorInto(w, this.basis[i]);
      return w;
    }
    contains(v) { return isZero(this.reduce(v)); }
    add(v) {
      const w = this.reduce(v);
      const p = w.indexOf(1);
      if (p < 0) return false;
      for (let i = 0; i < this.basis.length; i++) if (this.basis[i][p]) xorInto(this.basis[i], w);
      this.basis.push(w); this.piv.push(p);
      return true;
    }
  }

  // Kernel (null space) basis of M (rows) with ncols columns.
  function kernel(M, ncols) {
    const { rows, pivots } = rref(M, ncols);
    const isPiv = new Uint8Array(ncols);
    pivots.forEach(c => (isPiv[c] = 1));
    const basis = [];
    for (let f = 0; f < ncols; f++) {
      if (isPiv[f]) continue;
      const v = zeros(ncols);
      v[f] = 1;
      for (let r = 0; r < rows.length; r++) if (rows[r][f]) v[pivots[r]] = 1;
      basis.push(v);
    }
    return basis;
  }

  // ------------------------------------------------------------------
  // Pauli helpers
  // ------------------------------------------------------------------
  const P = { I: 0, X: 1, Z: 2, Y: 3 }; // bit0 = x, bit1 = z
  const PNAME = ['I', 'X', 'Z', 'Y'];
  function pauliVec(n) { return { x: zeros(n), z: zeros(n) }; }
  function pauliGet(e, i) { return e.x[i] | (e.z[i] << 1); }
  function pauliApply(e, i, p) { e.x[i] ^= p & 1; e.z[i] ^= (p >> 1) & 1; }
  function pauliWeight(e) { let w = 0; for (let i = 0; i < e.x.length; i++) w += (e.x[i] | e.z[i]); return w; }
  function pauliClone(e) { return { x: Uint8Array.from(e.x), z: Uint8Array.from(e.z) }; }
  function pauliMul(a, b) { return { x: xorInto(Uint8Array.from(a.x), b.x), z: xorInto(Uint8Array.from(a.z), b.z) }; }
  const symp = (a, b) => dot(a.x, b.z) ^ dot(a.z, b.x);
  const toFlat = e => { const n = e.x.length, v = zeros(2 * n); v.set(e.x, 0); v.set(e.z, n); return v; };
  const fromFlat = v => { const n = v.length / 2; return { x: v.slice(0, n), z: v.slice(n) }; };
  function pauliString(e) { let s = ''; for (let i = 0; i < e.x.length; i++) s += PNAME[pauliGet(e, i)]; return s; }
  function parsePauli(str) {
    const e = pauliVec(str.length);
    for (let i = 0; i < str.length; i++) pauliApply(e, i, P[str[i]] || 0);
    return e;
  }

  // ------------------------------------------------------------------
  // Stabilizer code object
  // ------------------------------------------------------------------
  // stabs: [{x, z, kind:'X'|'Z'|'M', pos:[x,y], poly?:[[x,y],..], face?:int}]
  // qubits: [{pos:[x,y], label?}]
  class Code {
    constructor(opts) {
      Object.assign(this, opts);
      this.n = this.qubits.length;
      this.m = this.stabs.length;
      const S = this.stabs.map(s => toFlat(s));
      this.stabSpan = new Span(2 * this.n);
      S.forEach(v => this.stabSpan.add(v));
      this.rankS = this.stabSpan.basis.length;
      this.k = this.n - this.rankS;
      this.css = this.stabs.every(s => isZero(s.x) || isZero(s.z));
      // adjacency: qubit -> stabilizer indices
      this.qubitStabs = Array.from({ length: this.n }, () => []);
      this.stabSupport = this.stabs.map((s, j) => {
        const sup = [];
        for (let i = 0; i < this.n; i++) if (s.x[i] || s.z[i]) { sup.push(i); this.qubitStabs[i].push(j); }
        return sup;
      });
      // binary parity-check for decoding: syndrome = Hdec · [ex | ez]
      // stab (sx|sz) anticommutes with (ex|ez) iff sx·ez + sz·ex = 1
      this.Hdec = this.stabs.map(s => { const r = zeros(2 * this.n); r.set(s.z, 0); r.set(s.x, this.n); return r; });
      this._logicals = null;
    }
    commutationErrors() {
      const bad = [];
      for (let i = 0; i < this.m; i++) for (let j = i + 1; j < this.m; j++) if (symp(this.stabs[i], this.stabs[j])) bad.push([i, j]);
      return bad;
    }
    syndrome(e) {
      const s = zeros(this.m);
      for (let j = 0; j < this.m; j++) {
        const st = this.stabs[j];
        let b = 0;
        for (const i of this.stabSupport[j]) b ^= (st.x[i] & e.z[i]) ^ (st.z[i] & e.x[i]);
        s[j] = b;
      }
      return s;
    }
    isStabilizer(e) { return this.stabSpan.contains(toFlat(e)); }
    // Symplectic basis of logical operators: [{X: pauli, Z: pauli}] (length k)
    logicals() {
      if (this._logicals) return this._logicals;
      const n = this.n;
      let L = [];
      if (this.css) {
        const Hx = this.stabs.filter(s => !isZero(s.x)).map(s => s.x);
        const Hz = this.stabs.filter(s => !isZero(s.z)).map(s => s.z);
        const pick = (ker, rowsp) => {
          const sp = new Span(n); rowsp.forEach(r => sp.add(r));
          const out = [];
          for (const v of ker) if (sp.add(v)) out.push(v);
          return out;
        };
        const lx = pick(kernel(Hz, n), Hx).map(v => ({ x: v, z: zeros(n) }));
        const lz = pick(kernel(Hx, n), Hz).map(v => ({ x: zeros(n), z: v }));
        L = symplecticPairs(lx, lz);
      } else {
        // normalizer = kernel of swapped stabilizer matrix
        const Sw = this.stabs.map(s => { const r = zeros(2 * n); r.set(s.z, 0); r.set(s.x, n); return r; });
        const N = kernel(Sw, 2 * n);
        const sp = new Span(2 * n); this.stabs.forEach(s => sp.add(toFlat(s)));
        const extra = [];
        for (const v of N) if (sp.add(v)) extra.push(fromFlat(v));
        L = symplecticPairs(extra, []);
      }
      // shorten each logical by greedy multiplication with stabilizers (display only)
      for (const pr of L) { pr.X = this.reduceWeight(pr.X); pr.Z = this.reduceWeight(pr.Z); }
      this._logicals = L;
      return L;
    }
    reduceWeight(op) {
      let cur = pauliClone(op), w = pauliWeight(cur), improved = true, guard = 0;
      while (improved && guard++ < 50) {
        improved = false;
        for (const s of this.stabs) {
          const t = pauliMul(cur, s), tw = pauliWeight(t);
          if (tw < w) { cur = t; w = tw; improved = true; }
        }
      }
      return cur;
    }
    // Classify residual R = E·C:  {ok, syndromeClear, logicalFlips:[{q, X:bool, Z:bool}]}
    classify(residual) {
      const syn = this.syndrome(residual);
      if (!isZero(syn)) return { ok: false, syndromeClear: false, flips: [] };
      if (this.isStabilizer(residual)) return { ok: true, syndromeClear: true, flips: [] };
      const flips = [];
      this.logicals().forEach((pr, q) => {
        const fx = symp(residual, pr.Z), fz = symp(residual, pr.X); // anticommute with Z̄ => X̄ flip
        if (fx || fz) flips.push({ q, X: !!fx, Z: !!fz });
      });
      return { ok: false, syndromeClear: true, flips };
    }
  }

  // Given candidate logicals A (X-like) and B (Z-like) (may be mixed lists),
  // produce k symplectic pairs via Gram–Schmidt.
  function symplecticPairs(A, B) {
    let pool = A.concat(B).map(pauliClone);
    const pairs = [];
    while (pool.length) {
      // prefer an X-type first element (for CSS readability)
      let ai = pool.findIndex(v => isZero(v.z));
      if (ai < 0) ai = 0;
      const a = pool.splice(ai, 1)[0];
      const bi = pool.findIndex(v => symp(a, v));
      if (bi < 0) continue; // should not happen for a valid logical set
      const b = pool.splice(bi, 1)[0];
      pool = pool.map(c => {
        let r = c;
        if (symp(r, b)) r = pauliMul(r, a);
        if (symp(r, a)) r = pauliMul(r, b);
        return r;
      });
      pairs.push({ X: a, Z: b });
    }
    return pairs;
  }

  // ------------------------------------------------------------------
  // Code constructions (all from the literature; see refs in levels.js)
  // ------------------------------------------------------------------
  function stabFrom(n, xs, zs, extra) {
    const s = { x: zeros(n), z: zeros(n) };
    (xs || []).forEach(i => (s.x[i] = 1));
    (zs || []).forEach(i => (s.z[i] = 1));
    s.kind = xs && xs.length && zs && zs.length ? 'M' : (xs && xs.length ? 'X' : 'Z');
    return Object.assign(s, extra || {});
  }
  const centroid = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

  // Repetition code: d qubits on a line. basis 'Z' => Z_iZ_{i+1} checks (bit-flip code)
  function repetition(d, basis = 'Z') {
    const qubits = Array.from({ length: d }, (_, i) => ({ pos: [i * 2, 0] }));
    const stabs = [];
    for (let i = 0; i < d - 1; i++) {
      const sup = [i, i + 1];
      stabs.push(stabFrom(d, basis === 'X' ? sup : [], basis === 'Z' ? sup : [], { pos: [i * 2 + 1, 1.1], style: 'node' }));
    }
    // classical distance d against one error type only (quantum distance is 1)
    return new Code({ id: `rep${basis}${d}`, name: `${d}量子ビット${basis === 'Z' ? 'ビット反転' : '位相反転'}反復符号`, params: [d, 1, d], qubits, stabs, layout: 'line', protects: basis === 'Z' ? 'X' : 'Z' });
  }

  // Shor [[9,1,3]] (Shor 1995)
  function shor9() {
    const n = 9, qubits = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) qubits.push({ pos: [c * 2.2, r * 2.4] });
    const stabs = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
      const a = r * 3 + c;
      stabs.push(stabFrom(n, [], [a, a + 1], { pos: [c * 2.2 + 1.1, r * 2.4 + 0.75], style: 'node' }));
    }
    for (let r = 0; r < 2; r++) {
      const sup = []; for (let c = 0; c < 3; c++) sup.push(r * 3 + c, (r + 1) * 3 + c);
      stabs.push(stabFrom(n, sup, [], { pos: [-1.6, r * 2.4 + 1.2], style: 'node' }));
    }
    return new Code({ id: 'shor9', name: 'Shor 9量子ビット符号', params: [9, 1, 3], qubits, stabs });
  }

  // [[5,1,3]] perfect code: cyclic shifts of XZZXI (Laflamme et al. 1996; Bennett et al. 1996)
  function fiveQubit() {
    const n = 5, R = 2.6;
    const qubits = Array.from({ length: n }, (_, i) => {
      const t = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { pos: [R * Math.cos(t), R * Math.sin(t)] };
    });
    const base = 'XZZXI', stabs = [];
    for (let s = 0; s < 4; s++) {
      const str = base.slice(n - s) + base.slice(0, n - s);
      const st = parsePauli(str);
      const t = -Math.PI / 2 + (2 * Math.PI * (s + 1.5)) / n;
      stabs.push(Object.assign(st, { kind: 'M', label: str, pos: [0.95 * Math.cos(t), 0.95 * Math.sin(t)], style: 'node' }));
    }
    return new Code({ id: 'five', name: '[[5,1,3]] 完全符号', params: [5, 1, 3], qubits, stabs });
  }

  // Triangular 6.6.6 colour code of distance d (Bombin & Martin-Delgado 2006).
  // d=3 is the Steane [[7,1,3]] code.
  function colorCode(d) {
    const N = (3 * (d - 1)) / 2;
    const col = (a, b) => ((((a - b + 1) % 3) + 3) % 3);
    const pos = (a, b) => [(a + b / 2) * 1.6, -(b * Math.sqrt(3) / 2) * 1.6];
    const qkey = new Map(), qubits = [];
    for (let b = N; b >= 0; b--) for (let a = 0; a + b <= N; a++) if (col(a, b) !== 0) { qkey.set(a + ',' + b, qubits.length); qubits.push({ pos: pos(a, b), ab: [a, b] }); }
    const nb = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
    const faces = [];
    for (let b = N; b >= 0; b--) for (let a = 0; a + b <= N; a++) {
      if (col(a, b) !== 0) continue;
      const sup = nb.map(([da, db]) => qkey.get(a + da + ',' + (b + db))).filter(v => v !== undefined);
      if (sup.length < 4) continue;
      // polygon ordered by angle around the face centre
      const c = pos(a, b);
      const ordered = sup.slice().sort((i, j) => Math.atan2(qubits[i].pos[1] - c[1], qubits[i].pos[0] - c[0]) - Math.atan2(qubits[j].pos[1] - c[1], qubits[j].pos[0] - c[0]));
      const poly = ordered.map(i => qubits[i].pos);
      // face colour: proper 3-colouring of the colour-0 sublattice (neighbours differ in b by ±1, ±2)
      faces.push({ sup, poly, centre: centroid(poly), color: ['r', 'g', 'b'][b % 3] });
    }
    const n = qubits.length, stabs = [];
    faces.forEach((f, fi) => {
      const [cx, cy] = f.centre, off = 0.32;
      stabs.push(stabFrom(n, f.sup, [], { pos: [cx - off, cy], face: fi, style: 'face' }));
      stabs.push(stabFrom(n, [], f.sup, { pos: [cx + off, cy], face: fi, style: 'face' }));
    });
    const name = d === 3 ? 'Steane [[7,1,3]] (d=3 カラーコード)' : `6.6.6 カラーコード d=${d}`;
    return new Code({ id: 'color' + d, name, params: [n, 1, d], qubits, stabs, faces });
  }

  // Rotated surface code distance d (Bombin & Martin-Delgado 2007; Horsman et al. 2012)
  function rotatedSurface(d) {
    const n = d * d, qubits = [];
    const q = (r, c) => r * d + c;
    for (let r = 0; r < d; r++) for (let c = 0; c < d; c++) qubits.push({ pos: [c * 2, r * 2], rc: [r, c] });
    const stabs = [];
    for (let r = -1; r < d; r++) for (let c = -1; c < d; c++) {
      const isX = ((r + c) % 2 + 2) % 2 === 0;
      const cells = [[r, c], [r, c + 1], [r + 1, c + 1], [r + 1, c]].filter(([a, b]) => a >= 0 && a < d && b >= 0 && b < d);
      const topBottom = r === -1 || r === d - 1, leftRight = c === -1 || c === d - 1;
      if (cells.length === 4) {/* bulk */} else if (cells.length === 2) {
        if (topBottom && !isX) continue; // X-type boundary checks on top/bottom
        if (leftRight && isX) continue; // Z-type boundary checks on left/right
      } else continue;
      const sup = cells.map(([a, b]) => q(a, b));
      let poly = cells.map(([a, b]) => [b * 2, a * 2]);
      if (cells.length === 2) {
        // half-disc bulge outward
        const [p1, p2] = poly, mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        const out = r === -1 ? [0, -1] : r === d - 1 ? [0, 1] : c === -1 ? [-1, 0] : [1, 0];
        // half-disc bulging outward: quadratic Bézier with control point 2 units out
        const ctrl = [mid[0] + out[0] * 2, mid[1] + out[1] * 2];
        poly = [p1, ctrl, p2];
        poly.curve = true;
      }
      const pos = cells.length === 4 ? [c * 2 + 1, r * 2 + 1] : [(poly[0][0] + poly[2][0]) / 2 + (poly[1][0] - (poly[0][0] + poly[2][0]) / 2) * 0.45, (poly[0][1] + poly[2][1]) / 2 + (poly[1][1] - (poly[0][1] + poly[2][1]) / 2) * 0.45];
      stabs.push(stabFrom(n, isX ? sup : [], isX ? [] : sup, { pos, poly, curve: !!poly.curve, style: 'plaq' }));
    }
    return new Code({ id: 'surf' + d, name: `回転サーフェスコード d=${d}`, params: [n, 1, d], qubits, stabs });
  }

  // XZZX surface code (Bonilla Ataides et al. 2021): Hadamard on one checkerboard
  // sublattice of the rotated surface code -> every bulk check reads XZZX.
  function xzzxSurface(d) {
    const base = rotatedSurface(d);
    const stabs = base.stabs.map(s => {
      const t = { x: Uint8Array.from(s.x), z: Uint8Array.from(s.z), pos: s.pos, poly: s.poly, curve: s.curve, style: 'plaq', kind: 'M' };
      for (let i = 0; i < base.n; i++) {
        const [r, c] = base.qubits[i].rc;
        if ((r + c) % 2 === 1) { const a = t.x[i]; t.x[i] = t.z[i]; t.z[i] = a; }
      }
      return t;
    });
    return new Code({ id: 'xzzx' + d, name: `XZZX サーフェスコード d=${d}`, params: [d * d, 1, d], qubits: base.qubits, stabs });
  }

  // Hypergraph product (Tillich & Zémor 2009): Hx=[H1⊗I | I⊗H2^T], Hz=[I⊗H2 | H1^T⊗I]
  function hypergraphProduct(H1, H2, meta) {
    const m1 = H1.length, n1 = H1[0].length, m2 = H2.length, n2 = H2[0].length;
    const nA = n1 * n2, n = nA + m1 * m2;
    const qA = (a, b) => a * n2 + b, qB = (c, e) => nA + c * m2 + e;
    const qubits = [];
    for (let a = 0; a < n1; a++) for (let b = 0; b < n2; b++) qubits.push({ pos: [b * 1.6, a * 1.6] });
    for (let c = 0; c < m1; c++) for (let e = 0; e < m2; e++) qubits.push({ pos: [(n2 + e) * 1.6 + 0.8, (n1 + c) * 1.6 + 0.8] });
    const stabs = [];
    for (let c = 0; c < m1; c++) for (let b = 0; b < n2; b++) {
      const sup = [];
      for (let a = 0; a < n1; a++) if (H1[c][a]) sup.push(qA(a, b));
      for (let e = 0; e < m2; e++) if (H2[e][b]) sup.push(qB(c, e));
      stabs.push(stabFrom(n, sup, [], { pos: [b * 1.6, (n1 + c) * 1.6 + 0.8], style: 'node' }));
    }
    for (let a = 0; a < n1; a++) for (let e = 0; e < m2; e++) {
      const sup = [];
      for (let b = 0; b < n2; b++) if (H2[e][b]) sup.push(qA(a, b));
      for (let c = 0; c < m1; c++) if (H1[c][a]) sup.push(qB(c, e));
      stabs.push(stabFrom(n, [], sup, { pos: [(n2 + e) * 1.6 + 0.8, a * 1.6], style: 'node' }));
    }
    return new Code(Object.assign({ qubits, stabs, sparseEdges: true }, meta));
  }

  // Bivariate bicycle codes (Bravyi et al., Nature 627, 778 (2024)).
  // x = S_l ⊗ I_m, y = I_l ⊗ S_m ; A, B = sums of three monomials ; Hx=[A|B], Hz=[B^T|A^T]
  function bivariateBicycle(l, m, Aterms, Bterms, meta) {
    const L = l * m, n = 2 * L;
    const idx = (i, j) => (((i % l) + l) % l) * m + (((j % m) + m) % m);
    // monomial x^a y^b maps basis (i,j) -> (i+a, j+b)
    const matOf = terms => { // returns list of columns hit for each row r: row r=(i,j) has 1 at column (i+a,j+b)
      return Array.from({ length: L }, (_, r) => {
        const i = Math.floor(r / m), j = r % m;
        return terms.map(([a, b]) => idx(i + a, j + b));
      });
    };
    const A = matOf(Aterms), B = matOf(Bterms);
    const qubits = [];
    // layout as in Bravyi et al.: each torus cell holds X-check, L, R, Z-check (x index horizontal)
    const cell = 2.2;
    for (let r = 0; r < L; r++) { const i = Math.floor(r / m), j = r % m; qubits.push({ pos: [i * cell * 2 + cell, j * cell * 2], label: 'L' }); }
    for (let r = 0; r < L; r++) { const i = Math.floor(r / m), j = r % m; qubits.push({ pos: [i * cell * 2, j * cell * 2 + cell], label: 'R' }); }
    const stabs = [];
    // X checks: row r of [A|B]
    for (let r = 0; r < L; r++) {
      const i = Math.floor(r / m), j = r % m;
      const sup = A[r].map(c => c).concat(B[r].map(c => L + c));
      stabs.push(stabFrom(n, sup, [], { pos: [i * cell * 2, j * cell * 2], style: 'node' }));
    }
    // Z checks: row r of [B^T | A^T]  -> (B^T)[r][c] = B[c][r]
    const BT = Array.from({ length: L }, () => []), AT = Array.from({ length: L }, () => []);
    for (let r = 0; r < L; r++) { B[r].forEach(c => BT[c].push(r)); A[r].forEach(c => AT[c].push(r)); }
    for (let r = 0; r < L; r++) {
      const i = Math.floor(r / m), j = r % m;
      const sup = BT[r].concat(AT[r].map(c => L + c));
      stabs.push(stabFrom(n, [], sup, { pos: [i * cell * 2 + cell, j * cell * 2 + cell], style: 'node' }));
    }
    return new Code(Object.assign({ qubits, stabs, sparseEdges: true, torus: { l, m, cell } }, meta));
  }

  const HAMMING = [
    [1, 0, 1, 0, 1, 0, 1],
    [0, 1, 1, 0, 0, 1, 1],
    [0, 0, 0, 1, 1, 1, 1],
  ];

  const CODES = {
    rep3: () => repetition(3, 'Z'),
    rep5: () => repetition(5, 'Z'),
    rep7: () => repetition(7, 'Z'),
    phase3: () => repetition(3, 'X'),
    phase5: () => repetition(5, 'X'),
    shor9,
    five: fiveQubit,
    steane: () => colorCode(3),
    color5: () => colorCode(5),
    color7: () => colorCode(7),
    surf3: () => rotatedSurface(3),
    surf5: () => rotatedSurface(5),
    surf7: () => rotatedSurface(7),
    xzzx5: () => xzzxSurface(5),
    xzzx7: () => xzzxSurface(7),
    hgpHam: () => hypergraphProduct(HAMMING, HAMMING, { id: 'hgpHam', name: 'ハイパーグラフ積符号 HGP(Hamming⊗Hamming)', params: [58, 16, 3] }),
    hgpRep: () => hypergraphProduct([[1, 1, 0], [0, 1, 1]], [[1, 1, 0], [0, 1, 1]], { id: 'hgpRep', name: 'HGP(反復符号⊗反復符号) = サーフェスコード', params: [13, 1, 3] }),
    bb72: () => bivariateBicycle(6, 6, [[3, 0], [0, 1], [0, 2]], [[0, 3], [1, 0], [2, 0]], { id: 'bb72', name: '二変数バイシクル符号 [[72,12,6]]', params: [72, 12, 6] }),
    bb90: () => bivariateBicycle(15, 3, [[9, 0], [0, 1], [0, 2]], [[0, 0], [2, 0], [7, 0]], { id: 'bb90', name: '二変数バイシクル符号 [[90,8,10]]', params: [90, 8, 10] }),
    bb108: () => bivariateBicycle(9, 6, [[3, 0], [0, 1], [0, 2]], [[0, 3], [1, 0], [2, 0]], { id: 'bb108', name: '二変数バイシクル符号 [[108,8,10]]', params: [108, 8, 10] }),
    gross: () => bivariateBicycle(12, 6, [[3, 0], [0, 1], [0, 2]], [[0, 3], [1, 0], [2, 0]], { id: 'gross', name: 'グロス符号 [[144,12,12]]', params: [144, 12, 12] }),
  };
  const codeCache = {};
  function getCode(id) { return codeCache[id] || (codeCache[id] = CODES[id]()); }

  // ------------------------------------------------------------------
  // Noise
  // ------------------------------------------------------------------
  // model: {type:'X'|'Z'|'depol'|'biasZ', p, eta?}
  function pauliProbs(model) {
    const p = model.p;
    switch (model.type) {
      case 'X': return { X: p, Y: 0, Z: 0 };
      case 'Z': return { X: 0, Y: 0, Z: p };
      case 'biasZ': { const eta = model.eta ?? 100; const pz = p * eta / (eta + 1), px = p / (2 * (eta + 1)); return { X: px, Y: px, Z: pz }; }
      default: return { X: p / 3, Y: p / 3, Z: p / 3 };
    }
  }
  function samplePauli(probs, rng) {
    const u = rng() * (probs.X + probs.Y + probs.Z);
    return u < probs.X ? P.X : u < probs.X + probs.Y ? P.Y : P.Z;
  }
  function sampleIID(n, model, rng = Math.random) {
    const e = pauliVec(n), pr = pauliProbs(model), tot = pr.X + pr.Y + pr.Z;
    for (let i = 0; i < n; i++) if (rng() < tot) pauliApply(e, i, samplePauli(pr, rng));
    return e;
  }
  function sampleCount(n, count, model, rng = Math.random) {
    const e = pauliVec(n), pr = pauliProbs(Object.assign({}, model, { p: 0.3 }));
    const idx = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(rng() * (n - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
      pauliApply(e, idx[i], samplePauli(pr, rng));
    }
    return e;
  }

  // ------------------------------------------------------------------
  // Decoders
  // ------------------------------------------------------------------
  // Binary BP (normalised min-sum) + OSD-CS  (Panteleev & Kalachev 2021; Roffe et al. 2020)
  // H: array of Uint8Array rows (m x N), s: syndrome, prior: Float64Array of per-bit flip probabilities.
  function makeTanner(H) {
    const m = H.length, N = H[0].length;
    const chk = [], vars = Array.from({ length: N }, () => []);
    for (let c = 0; c < m; c++) {
      const row = [];
      for (let v = 0; v < N; v++) if (H[c][v]) { vars[v].push([c, row.length]); row.push(v); }
      chk.push(row);
    }
    return { m, N, chk, vars, H };
  }

  function bpDecode(T, s, prior, maxIter = 40, alpha = 0.625) {
    const { m, N, chk, vars } = T;
    const llr0 = new Float64Array(N);
    for (let v = 0; v < N; v++) { const p = Math.min(Math.max(prior[v], 1e-12), 0.5 - 1e-9); llr0[v] = Math.log((1 - p) / p); }
    const v2c = chk.map(row => Float64Array.from(row, v => llr0[v]));
    const c2v = chk.map(row => new Float64Array(row.length));
    const post = new Float64Array(N), hard = new Uint8Array(N);
    for (let it = 0; it < maxIter; it++) {
      for (let c = 0; c < m; c++) {
        const row = v2c[c], L = row.length;
        let sgn = s[c] ? -1 : 1, min1 = Infinity, min2 = Infinity, mi = -1;
        for (let k = 0; k < L; k++) {
          const a = row[k]; if (a < 0) sgn = -sgn;
          const b = Math.abs(a);
          if (b < min1) { min2 = min1; min1 = b; mi = k; } else if (b < min2) min2 = b;
        }
        for (let k = 0; k < L; k++) {
          const a = row[k], sk = a < 0 ? -1 : 1;
          c2v[c][k] = alpha * sgn * sk * (k === mi ? min2 : min1);
        }
      }
      for (let v = 0; v < N; v++) {
        let t = llr0[v];
        for (const [c, k] of vars[v]) t += c2v[c][k];
        post[v] = t; hard[v] = t < 0 ? 1 : 0;
      }
      if (checkSyn(T, hard, s)) return { e: hard, post, converged: true, iters: it + 1 };
      for (let c = 0; c < m; c++) { const row = chk[c]; for (let k = 0; k < row.length; k++) v2c[c][k] = post[row[k]] - c2v[c][k]; }
    }
    return { e: hard, post, converged: false, iters: maxIter };
  }
  function checkSyn(T, e, s) {
    for (let c = 0; c < T.m; c++) { let b = 0; for (const v of T.chk[c]) b ^= e[v]; if (b !== s[c]) return false; }
    return true;
  }

  // OSD with combination sweep of order lambda.
  function osd(T, s, post, prior, lambda = 8) {
    const { m, N, H } = T;
    const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => post[a] - post[b]);
    // eliminate on permuted columns; augmented with syndrome
    const rows = H.map((r, i) => { const a = new Uint8Array(N + 1); for (let j = 0; j < N; j++) a[j] = r[order[j]]; a[N] = s[i]; return a; });
    const piv = [];
    let rk = 0;
    for (let c = 0; c < N && rk < m; c++) {
      let p = -1;
      for (let r = rk; r < m; r++) if (rows[r][c]) { p = r; break; }
      if (p < 0) continue;
      if (p !== rk) { const t = rows[p]; rows[p] = rows[rk]; rows[rk] = t; }
      for (let r = 0; r < m; r++) if (r !== rk && rows[r][c]) xorInto(rows[r], rows[rk]);
      piv.push(c); rk++;
    }
    const isPiv = new Uint8Array(N); piv.forEach(c => (isPiv[c] = 1));
    const nonPiv = []; for (let c = 0; c < N && nonPiv.length < lambda; c++) if (!isPiv[c]) nonPiv.push(c);
    const cost = new Float64Array(N);
    for (let j = 0; j < N; j++) { const p = Math.min(Math.max(prior[order[j]], 1e-12), 0.5); cost[j] = Math.log((1 - p) / p); }
    const evalCand = flips => {
      const e = new Uint8Array(N);
      for (const f of flips) e[f] = 1;
      for (let r = 0; r < rk; r++) {
        let b = rows[r][N];
        for (const f of flips) b ^= rows[r][f];
        e[piv[r]] = b;
      }
      let w = 0; for (let j = 0; j < N; j++) if (e[j]) w += cost[j];
      return { e, w };
    };
    let best = evalCand([]);
    for (let a = 0; a < nonPiv.length; a++) {
      const c1 = evalCand([nonPiv[a]]); if (c1.w < best.w) best = c1;
      for (let b = a + 1; b < nonPiv.length; b++) { const c2 = evalCand([nonPiv[a], nonPiv[b]]); if (c2.w < best.w) best = c2; }
    }
    const out = new Uint8Array(N);
    for (let j = 0; j < N; j++) if (best.e[j]) out[order[j]] = 1;
    return out;
  }

  function bposd(T, s, prior, opts = {}) {
    if (isZero(s)) return { e: new Uint8Array(T.N), method: 'trivial' };
    const bp = bpDecode(T, s, prior, opts.maxIter ?? 40, opts.alpha ?? 0.625);
    if (bp.converged) return { e: bp.e, method: 'BP' };
    return { e: osd(T, s, bp.post, prior, opts.lambda ?? 8), method: 'BP+OSD' };
  }

  // Exhaustive minimum-cost Pauli search (exact for small codes / few errors)
  function exhaustive(code, s, probs, maxW, budget = 800000) {
    const n = code.n;
    const cst = { 1: -Math.log(Math.max(probs.X, 1e-12)), 2: -Math.log(Math.max(probs.Z, 1e-12)), 3: -Math.log(Math.max(probs.Y, 1e-12)) };
    const allowed = [1, 2, 3].filter(p => cst[p] < 25);
    // per-qubit, per-Pauli syndrome masks as arrays of 32-bit words
    const W = Math.ceil(code.m / 32);
    const mask = Array.from({ length: n }, () => ({}));
    for (let i = 0; i < n; i++) for (const p of allowed) {
      const e = pauliVec(n); pauliApply(e, i, p);
      const sy = code.syndrome(e), w = new Uint32Array(W);
      for (let j = 0; j < code.m; j++) if (sy[j]) w[j >> 5] |= 1 << (j & 31);
      mask[i][p] = w;
    }
    const target = new Uint32Array(W);
    for (let j = 0; j < code.m; j++) if (s[j]) target[j >> 5] |= 1 << (j & 31);
    let best = null, bestCost = Infinity, count = 0;
    const cur = new Uint32Array(W), chosen = [];
    const eq = () => { for (let k = 0; k < W; k++) if (cur[k] !== target[k]) return false; return true; };
    function rec(start, depth, costSoFar) {
      if (count++ > budget) return;
      if (costSoFar >= bestCost) return;
      if (eq()) { bestCost = costSoFar; best = chosen.slice(); return; }
      if (depth === maxW) return;
      for (let i = start; i < n; i++) for (const p of allowed) {
        const mk = mask[i][p];
        for (let k = 0; k < W; k++) cur[k] ^= mk[k];
        chosen.push([i, p]);
        rec(i + 1, depth + 1, costSoFar + cst[p]);
        chosen.pop();
        for (let k = 0; k < W; k++) cur[k] ^= mk[k];
      }
    }
    rec(0, 0, 0);
    if (!best) return null;
    const e = pauliVec(n); best.forEach(([i, p]) => pauliApply(e, i, p));
    return { e, complete: count <= budget };
  }

  // Generic decoder: returns {correction (pauli), method}
  function decode(code, syndrome, model) {
    const probs = pauliProbs(Object.assign({}, model, { p: Math.min(Math.max(model.p || 0.05, 0.005), 0.3) }));
    if (isZero(syndrome)) return { correction: pauliVec(code.n), method: '自明' };
    const t = Math.max(1, Math.floor((code.params[2] - 1) / 2));
    const nAllowed = [probs.X, probs.Y, probs.Z].filter(x => x > 1e-9).length;
    const cost = W => { let est = 0, comb = 1; for (let w = 1; w <= W; w++) { comb = comb * (code.n - w + 1) / w; est += comb * Math.pow(nAllowed, w); } return est; };
    const W = cost(t + 1) < 400000 ? t + 1 : cost(t) < 400000 ? t : 0;
    // exact search: optimal for fixed-count puzzles (weight <= t); for i.i.d. noise BP+OSD
    // (which accounts for degeneracy better than a single min-weight Pauli) is used on larger codes
    const exactOK = model.mode !== 'iid' || code.n <= 13;
    if (model.type !== 'biasZ' && W > 0 && exactOK) {
      const r = exhaustive(code, syndrome, probs, W, 600000);
      if (r && r.complete) return { correction: r.e, method: '最小重み全探索 (厳密)' };
    }
    // binary BP+OSD on [ex | ez]
    if (!code._tanner) code._tanner = makeTanner(code.Hdec);
    const n = code.n, prior = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) { prior[i] = probs.X + probs.Y; prior[n + i] = probs.Z + probs.Y; }
    const r = bposd(code._tanner, syndrome, prior);
    return { correction: { x: r.e.slice(0, n), z: r.e.slice(n) }, method: r.method === 'BP' ? 'BP (確率伝播)' : 'BP+OSD' };
  }

  // ------------------------------------------------------------------
  // Space-time repetition code with measurement errors
  // (cf. Google Quantum AI, Nature 595, 383 (2021))
  // ------------------------------------------------------------------
  function spacetimeSample(d, rounds, p, q, rng = Math.random, forceCounts) {
    // data errors occur before each round; measurement flips per round; final round = perfect data readout
    const dataFlips = [], measFlips = [];
    const data = new Uint8Array(d);
    const synHist = [];
    for (let t = 0; t < rounds; t++) {
      const df = new Uint8Array(d), mf = new Uint8Array(d - 1);
      for (let i = 0; i < d; i++) if (rng() < p) df[i] = 1;
      if (t < rounds - 1) for (let i = 0; i < d - 1; i++) if (rng() < q) mf[i] = 1;
      dataFlips.push(df); measFlips.push(mf);
    }
    if (forceCounts) {
      // place exact counts of data / measurement faults at random space-time locations
      dataFlips.forEach(r => r.fill(0)); measFlips.forEach(r => r.fill(0));
      const place = (arrs, cnt, maxT, width) => {
        let k = 0, g = 0;
        while (k < cnt && g++ < 1000) { const t = Math.floor(rng() * maxT), i = Math.floor(rng() * width); if (!arrs[t][i]) { arrs[t][i] = 1; k++; } }
      };
      place(dataFlips, forceCounts.data, rounds, d);
      place(measFlips, forceCounts.meas, rounds - 1, d - 1);
    }
    for (let t = 0; t < rounds; t++) {
      xorInto(data, dataFlips[t]);
      const s = new Uint8Array(d - 1);
      for (let i = 0; i < d - 1; i++) s[i] = data[i] ^ data[i + 1] ^ measFlips[t][i];
      synHist.push(s);
    }
    const det = synHist.map((s, t) => t === 0 ? Uint8Array.from(s) : xorInto(Uint8Array.from(s), synHist[t - 1]));
    return { d, rounds, dataFlips, measFlips, synHist, det, finalData: data };
  }

  // Exact minimum-weight perfect matching on detection events (bitmask DP).
  function spacetimeMWPM(st) {
    const ev = [];
    st.det.forEach((row, t) => row.forEach((b, i) => b && ev.push([t, i])));
    const K = ev.length, d = st.d;
    if (K > 18) return null;
    const bdist = i => Math.min(i + 1, d - 1 - i);
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    const memo = new Map();
    function solve(mask) {
      if (mask === 0) return { c: 0, pairs: [] };
      if (memo.has(mask)) return memo.get(mask);
      let i = 0; while (!(mask & (1 << i))) i++;
      const rest = mask & ~(1 << i);
      let best = { c: bdist(ev[i][1]) + solve(rest).c, pairs: [[i, -1]].concat(solve(rest).pairs) };
      for (let j = i + 1; j < K; j++) if (rest & (1 << j)) {
        const sub = solve(rest & ~(1 << j)), c = dist(ev[i], ev[j]) + sub.c;
        if (c < best.c) best = { c, pairs: [[i, j]].concat(sub.pairs) };
      }
      memo.set(mask, best);
      return best;
    }
    const sol = solve((1 << K) - 1);
    const corr = new Uint8Array(d);
    for (const [a, b] of sol.pairs) {
      if (b < 0) {
        const i = ev[a][1];
        if (i + 1 <= d - 1 - i) for (let q = 0; q <= i; q++) corr[q] ^= 1;
        else for (let q = i + 1; q < d; q++) corr[q] ^= 1;
      } else {
        const i = Math.min(ev[a][1], ev[b][1]), j = Math.max(ev[a][1], ev[b][1]);
        for (let q = i + 1; q <= j; q++) corr[q] ^= 1;
      }
    }
    return { correction: corr, pairs: sol.pairs.map(([a, b]) => [ev[a], b < 0 ? null : ev[b]]), weight: sol.c };
  }

  // mulberry32 PRNG for reproducible simulations
  function rngFrom(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  root.QEC = Object.assign(root.QEC || {}, {
    zeros, xorInto, weightOf, dot, isZero, rref, rank, kernel, Span,
    P, PNAME, pauliVec, pauliGet, pauliApply, pauliWeight, pauliClone, pauliMul, pauliString, parsePauli, symp,
    Code, CODES, getCode, repetition, shor9, fiveQubit, colorCode, rotatedSurface, xzzxSurface, hypergraphProduct, bivariateBicycle,
    pauliProbs, sampleIID, sampleCount, makeTanner, bpDecode, osd, bposd, exhaustive, decode,
    spacetimeSample, spacetimeMWPM, rngFrom,
  });
})(typeof window !== 'undefined' ? window : globalThis);
