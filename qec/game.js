/* QEC Puzzle — game UI */
(function () {
  'use strict';
  const Q = window.QEC;
  const { LEVELS, CHAPTERS, REFS, FREE_CODES, REF_PAGE } = window.QEC_LEVELS;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const PN = Q.PNAME;
  const PCLS = ['', 'X', 'Z', 'Y'];

  const CODE_REFS = {
    rep5: ['google21'], rep7: ['google21'], phase5: ['shor95'], shor9: ['shor95'], five: ['laflamme96', 'bennett96'],
    steane: ['steane96', 'cs96'], surf3: ['dennis02', 'bombin07', 'google25'], surf5: ['dennis02', 'google25'], surf7: ['google25'],
    xzzx5: ['xzzx21'], xzzx7: ['xzzx21'], color5: ['bombin06', 'lacroix25'], color7: ['bombin06', 'lacroix25'],
    hgpRep: ['tillich14'], hgpHam: ['tillich14'], bb72: ['bravyi24'], bb90: ['bravyi24'], bb108: ['bravyi24'], gross: ['bravyi24', 'yoder25'],
  };

  // ------------------------------------------------------------------ storage
  const STORE_KEY = 'qecPuzzle.v1';
  function loadProgress() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function saveProgress(p) { try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ } }
  let progress = loadProgress();

  // ------------------------------------------------------------------ state
  const S = {
    mode: 'levels', level: null, code: null, tool: 1,
    round: 0, results: [], error: null, syn0: null, corr: null, revealed: false,
    hintUsed: false, hintShown: false, dec: null, logShow: -1, matrixOn: false,
    hlQ: -1, hlS: -1, free: { ok: 0, total: 0 },
    st: null, // spacetime state
  };

  // ------------------------------------------------------------------ helpers
  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const fmt = (x, n = 2) => Number(x).toFixed(n);
  const stars = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  function noiseLabel(nz) {
    const t = { X: 'ビット反転 X', Z: '位相反転 Z', depol: '脱分極 X/Y/Z', biasZ: `Zバイアス η=${nz.eta ?? 100}` }[nz.type];
    return nz.mode === 'count' ? `${t} ・ エラー ${nz.count} 個` : `${t} ・ p = ${nz.p}`;
  }

  // ------------------------------------------------------------------ navigation
  function buildNav() {
    const nav = $('levelnav');
    nav.innerHTML = '';
    CHAPTERS.forEach((ch, ci) => {
      const box = document.createElement('div');
      box.className = 'chap';
      box.innerHTML = `<h3>${ch}</h3>`;
      LEVELS.filter(l => l.chap === ci).forEach(l => {
        const b = document.createElement('button');
        b.className = 'lvbtn' + (S.level && S.level.id === l.id && S.mode === 'levels' ? ' active' : '');
        const st = progress[l.id] || 0;
        b.innerHTML = `<span class="num">${l.id}</span><span>${l.title}</span><span class="stars">${st ? stars(st) : ''}</span>`;
        b.onclick = () => { S.mode = 'levels'; loadLevel(l); };
        box.appendChild(b);
      });
      nav.appendChild(box);
    });
  }

  function showView(v) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    $('view-play').classList.toggle('active', v === 'levels' || v === 'free');
    $('view-lab').classList.toggle('active', v === 'lab');
    $('view-refs').classList.toggle('active', v === 'refs');
    if (v === 'free') { S.mode = 'free'; $('freebar').hidden = false; startFree(); }
    if (v === 'levels') { S.mode = 'levels'; $('freebar').hidden = true; loadLevel(S.level && S.level.id !== 'free' ? S.level : LEVELS[0]); }
    if (v === 'lab' && window.QEC_LAB) window.QEC_LAB.show();
  }

  // ------------------------------------------------------------------ level setup
  function loadLevel(lv) {
    S.level = lv;
    S.round = 0; S.results = []; S.hintUsed = false; S.levelHint = false; S.weightOK = true;
    S.free = { ok: 0, total: 0 };
    S.logShow = -1;
    if (lv.kind === 'spacetime') { S.code = null; } else { S.code = Q.getCode(lv.code); }
    renderLesson();
    buildNav();
    newRound();
  }

  function renderLesson() {
    const lv = S.level;
    let html = lv.html || '';
    let refs = lv.refs || [];
    if (lv.id === 'free') {
      const c = S.code;
      html = `<h2>フリープレイ: ${c.name}</h2>
        <p><b>[[${c.n}, ${c.k}, ${c.params[2]}]]</b> ・ スタビライザー生成元 ${c.m} 個 ・ ${c.css ? 'CSS 符号' : '非 CSS 符号'}</p>
        <p>最大重みのチェック: ${Math.max(...c.stabSupport.map(s => s.length))} ・ 1量子ビットが参加するチェック数(最大): ${Math.max(...c.qubitStabs.map(s => s.length))}</p>
        <div class="goal">符号・ノイズ・モードを選んで「新しい問題」。独立同分布モードでは、デコーダも失敗する「避けられない失敗」が起こり得ます。</div>
        <div class="legendrow"><span><i class="sw" style="background:var(--z)"></i>Z型チェック</span><span><i class="sw" style="background:var(--x)"></i>X型チェック</span><span><i class="sw" style="background:var(--m)"></i>混合型</span></div>`;
      refs = CODE_REFS[c.id] || [];
    }
    $('lesson').innerHTML = html + (refs.length ? `<h3>参考文献</h3>` + refs.map(r => `<div class="ref">${REFS[r]}</div>`).join('') : '');
  }

  function setTools() {
    const allowed = S.level.tools || (S.code && S.code.protects ? [S.code.protects === 'X' ? 1 : 2] : [1, 2, 3]);
    document.querySelectorAll('.tool').forEach(b => {
      const p = +b.dataset.p;
      b.disabled = !allowed.includes(p) || S.level.kind === 'spacetime';
    });
    if (!allowed.includes(S.tool)) S.tool = allowed[0];
    document.querySelectorAll('.tool').forEach(b => b.classList.toggle('active', +b.dataset.p === S.tool));
  }

  function newRound() {
    const lv = S.level;
    S.revealed = false; S.hintShown = false; S.dec = null; S.hlQ = -1; S.hlS = -1;
    $('result').hidden = true;
    const spacetime = lv.kind === 'spacetime';
    $('btnLogical').hidden = spacetime; $('btnMatrix').hidden = spacetime;
    $('btnSubmit').disabled = false;
    setTools();
    if (spacetime) return newSpacetimeRound();
    const c = S.code, nz = lv.noise;
    let e, syn, guard = 0;
    do {
      e = nz.mode === 'count' ? Q.sampleCount(c.n, nz.count, nz) : Q.sampleIID(c.n, nz);
      syn = c.syndrome(e);
    } while (Q.isZero(syn) && guard++ < 200);
    S.error = e; S.syn0 = syn; S.corr = Q.pauliVec(c.n);
    renderHeader();
    renderBoard();
    update();
    if (S.matrixOn) drawMatrix();
  }

  function renderHeader() {
    const lv = S.level;
    $('lvTitle').textContent = lv.id === 'free' ? `フリープレイ — ${S.code.name}` : `${lv.id}  ${lv.title}`;
    const b = [];
    if (lv.kind === 'spacetime') {
      b.push(`<span class="badge code">反復符号 d=${lv.d}</span>`, `<span class="badge">${lv.T} ラウンド測定</span>`, `<span class="badge">データエラー + 測定エラー</span>`);
    } else {
      const c = S.code;
      b.push(`<span class="badge code">[[${c.n},${c.k},${c.params[2]}]]${c.protects ? ' (' + c.protects + 'のみ)' : ''}</span>`);
      b.push(`<span class="badge">${noiseLabel(lv.noise)}</span>`);
      b.push(`<span class="badge">${c.css ? 'CSS' : '非CSS'}</span>`);
      if (c.torus) b.push(`<span class="badge">トーラス ${c.torus.l}×${c.torus.m} (端は反対側とつながる) ・ ○X型 □Z型</span>`);
    }
    $('lvBadges').innerHTML = b.join('');
    const rd = $('roundDots');
    rd.innerHTML = '';
    if (S.mode === 'free') {
      rd.innerHTML = `<span class="badge">成功 ${S.free.ok} / ${S.free.total}</span>`;
    } else {
      for (let i = 0; i < lv.rounds; i++) {
        const d = document.createElement('span');
        const r = S.results[i];
        d.className = 'rdot' + (i === S.round && !r ? ' cur' : '') + (r ? ' ' + r.cls : '');
        d.title = `ラウンド ${i + 1}`;
        rd.appendChild(d);
      }
    }
  }

  // ------------------------------------------------------------------ board rendering
  let qEls = [], stEls = [], layers = {}, R = 0.4;

  function computeR(code) {
    const pts = code.qubits.map(q => q.pos).concat(code.stabs.filter(s => s.style === 'node' || s.style === 'face').map(s => s.pos));
    let md = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d > 1e-6 && d < md) md = d;
    }
    return Math.min(0.48, md * 0.36);
  }

  function renderBoard() {
    const c = S.code, svg = $('board');
    svg.innerHTML = '';
    R = computeR(c);
    // bounds
    let xs = [], ys = [];
    c.qubits.forEach(q => { xs.push(q.pos[0]); ys.push(q.pos[1]); });
    c.stabs.forEach(s => { xs.push(s.pos[0]); ys.push(s.pos[1]); (s.poly || []).forEach(p => { xs.push(p[0]); ys.push(p[1]); }); });
    const pad = R * 2.6;
    let x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - Math.min(...xs) + 2 * pad, h = Math.max(...ys) - Math.min(...ys) + 2 * pad;
    // keep tiny codes from being drawn huge
    const minW = 11, minH = 7;
    if (w < minW) { x0 -= (minW - w) / 2; w = minW; }
    if (h < minH) { y0 -= (minH - h) / 2; h = minH; }
    svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const defs = el('defs', null, svg);
    ['X', 'Z', 'M'].forEach(k => {
      const f = el('filter', { id: 'glow' + k, x: '-1', y: '-1', width: '3', height: '3' }, defs);
      el('feDropShadow', { dx: 0, dy: 0, stdDeviation: R * 0.35, style: `flood-color: var(--${k.toLowerCase()}); flood-opacity: 1` }, f);
    });
    layers.faces = el('g', null, svg);
    layers.plaq = el('g', null, svg);
    layers.edges = el('g', null, svg);
    layers.stab = el('g', null, svg);
    layers.qubit = el('g', null, svg);
    layers.over = el('g', null, svg);
    // colour-code faces
    (c.faces || []).forEach(f => {
      const d = 'M' + f.poly.map(p => p.join(',')).join('L') + 'Z';
      el('path', { d, class: 'face ' + f.color }, layers.faces);
      el('path', { d, class: 'faceline' }, layers.faces);
    });
    // stabilisers
    stEls = c.stabs.map((s, j) => {
      const g = el('g', { class: `st ${s.kind}`, 'data-s': j }, s.style === 'plaq' ? layers.plaq : layers.stab);
      if (s.style === 'plaq') {
        const d = s.curve ? `M${s.poly[0]}Q${s.poly[1]} ${s.poly[2]}Z` : 'M' + s.poly.map(p => p.join(',')).join('L') + 'Z';
        el('path', { class: 'poly', d }, g);
        el('circle', { class: 'mk', cx: s.pos[0], cy: s.pos[1], r: R * 0.42 }, g);
        if (s.kind === 'M') {
          c.stabSupport[j].forEach(i => {
            const q = c.qubits[i].pos, t = 0.62;
            const p = Q.pauliGet(s, i);
            const tx = el('text', { class: 'plet p' + PCLS[p], x: s.pos[0] + (q[0] - s.pos[0]) * t, y: s.pos[1] + (q[1] - s.pos[1]) * t, 'font-size': R * 0.7 }, layers.over);
            tx.textContent = PN[p];
          });
        }
      } else {
        const sz = s.style === 'face' ? R * 0.42 : R * 0.6;
        if (s.kind === 'Z') el('rect', { class: 'mk', x: s.pos[0] - sz, y: s.pos[1] - sz, width: 2 * sz, height: 2 * sz, rx: sz * 0.25 }, g);
        else if (s.kind === 'X') el('circle', { class: 'mk', cx: s.pos[0], cy: s.pos[1], r: sz * 1.05 }, g);
        else el('path', { class: 'mk', d: `M${s.pos[0]},${s.pos[1] - sz * 1.3}L${s.pos[0] + sz * 1.3},${s.pos[1]}L${s.pos[0]},${s.pos[1] + sz * 1.3}L${s.pos[0] - sz * 1.3},${s.pos[1]}Z` }, g);
        if (s.label) {
          const t = el('text', { class: 'plet', x: s.pos[0], y: s.pos[1] + sz * 2.4, 'font-size': R * 0.45, fill: 'var(--muted)', style: 'fill:var(--muted)' }, layers.stab);
          t.textContent = s.label;
        }
      }
      g.addEventListener('mouseenter', ev => { S.hlS = j; update(); showTip(ev, stabTip(j)); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', () => { S.hlS = -1; update(); hideTip(); });
      g.addEventListener('click', ev => { ev.stopPropagation(); S.hlS = S.hlS === j && S.pinS ? -1 : j; S.pinS = S.hlS >= 0; S.hlQ = -1; update(); });
      return g;
    });
    // qubits
    const showIdx = c.n <= 60;
    qEls = c.qubits.map((q, i) => {
      const g = el('g', { class: 'q', 'data-q': i, transform: `translate(${q.pos[0]},${q.pos[1]})` }, layers.qubit);
      el('circle', { class: 'body', r: R }, g);
      const lbl = el('text', { class: 'lbl', 'font-size': R * 1.05 }, g);
      if (showIdx) { const t = el('text', { class: 'idx', y: R * 1.75, 'font-size': R * 0.5 }, g); t.textContent = (q.label || '') + i; }
      else if (q.label) { const t = el('text', { class: 'idx', y: R * 1.7, 'font-size': R * 0.5 }, g); t.textContent = q.label; }
      g.addEventListener('click', ev => { ev.stopPropagation(); clickQubit(i); });
      g.addEventListener('mouseenter', ev => { S.hlQ = i; update(); showTip(ev, qubitTip(i)); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', () => { S.hlQ = -1; update(); hideTip(); });
      g._lbl = lbl;
      return g;
    });
    // all edges for small node-style codes
    layers.staticEdges = el('g', null, layers.edges);
    layers.dynEdges = el('g', null, layers.edges);
    if (!c.sparseEdges) c.stabs.forEach((s, j) => { if (s.style === 'node') drawStabEdges(layers.staticEdges, j, ''); });
    svg.onclick = () => { S.hlS = -1; S.pinS = false; update(); };
  }

  function nearestImage(code, from, to) {
    if (!code.torus) return to;
    const { l, m, cell } = code.torus, W = l * cell * 2, H = m * cell * 2;
    let best = to, bd = Infinity;
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
      const p = [to[0] + dx, to[1] + dy], d = Math.hypot(p[0] - from[0], p[1] - from[1]);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function drawStabEdges(layer, j, extra) {
    const c = S.code, s = c.stabs[j];
    c.stabSupport[j].forEach(i => {
      const to = nearestImage(c, s.pos, c.qubits[i].pos);
      el('line', { class: `edge ${s.kind} ${extra}`, x1: s.pos[0], y1: s.pos[1], x2: to[0], y2: to[1] }, layer);
      if (s.kind === 'M' && s.style === 'node') {
        const p = Q.pauliGet(s, i), t = 0.4;
        const tx = el('text', { class: 'plet p' + PCLS[p], x: s.pos[0] + (to[0] - s.pos[0]) * t, y: s.pos[1] + (to[1] - s.pos[1]) * t, 'font-size': R * 0.62 }, layer);
        tx.textContent = PN[p];
      }
    });
  }

  function currentSyndrome() {
    return Q.xorInto(Uint8Array.from(S.syn0), S.code.syndrome(S.corr));
  }

  function update() {
    if (S.level.kind === 'spacetime') return updateSpacetime();
    const c = S.code, syn = currentSyndrome();
    // highlight sets
    const hlQ = new Set(), hlS = new Set();
    if (S.hlQ >= 0) { hlQ.add(S.hlQ); c.qubitStabs[S.hlQ].forEach(j => hlS.add(j)); }
    if (S.hlS >= 0) { hlS.add(S.hlS); c.stabSupport[S.hlS].forEach(i => hlQ.add(i)); }
    stEls.forEach((g, j) => { g.classList.toggle('on', !!syn[j]); g.classList.toggle('hl', hlS.has(j) && (S.hlS === j || S.hlQ >= 0)); });
    // dynamic edges
    const de = layers.dynEdges; de.innerHTML = '';
    c.stabs.forEach((s, j) => {
      if (s.style !== 'node') return;
      if (c.sparseEdges && syn[j]) drawStabEdges(de, j, 'on');
      else if (!c.sparseEdges && syn[j]) drawStabEdges(de, j, 'on');
    });
    if (S.hlS >= 0 && c.stabs[S.hlS].style === 'node') drawStabEdges(de, S.hlS, 'hl');
    if (S.hlQ >= 0) c.qubitStabs[S.hlQ].forEach(j => { if (c.stabs[j].style === 'node') drawStabEdges(de, j, 'hl'); });
    // qubits
    qEls.forEach((g, i) => {
      const p = Q.pauliGet(S.corr, i);
      g.classList.remove('hasX', 'hasZ', 'hasY');
      if (p) g.classList.add('has' + PN[p]);
      g._lbl.textContent = p ? PN[p] : '';
      g.classList.toggle('hl', hlQ.has(i));
    });
    // overlays: hint ghost / logicals / reveal
    const ov = layers.over;
    ov.querySelectorAll('.dyn').forEach(e => e.remove());
    if (S.hintShown && S.dec) {
      for (let i = 0; i < c.n; i++) {
        const p = Q.pauliGet(S.dec.correction, i);
        if (!p) continue;
        const [x, y] = c.qubits[i].pos;
        const g = el('g', { class: 'ghost dyn' }, ov);
        el('circle', { cx: x, cy: y, r: R * 1.3 }, g);
        const t = el('text', { class: 'plet', x: x - R * 1.15, y: y - R * 1.15, 'font-size': R * 0.75 }, g);
        t.textContent = PN[p];
      }
    }
    if (S.logShow >= 0) {
      const L = c.logicals();
      const pr = L[S.logShow >> 1], op = (S.logShow & 1) ? pr.Z : pr.X;
      for (let i = 0; i < c.n; i++) {
        const p = Q.pauliGet(op, i);
        if (!p) continue;
        const [x, y] = c.qubits[i].pos;
        el('circle', { class: 'dyn', cx: x, cy: y, r: R * 1.35, fill: 'none', 'stroke-width': R * 0.22, style: `stroke: var(--${PN[p].toLowerCase()})` }, ov);
        const t = el('text', { class: 'plet dyn p' + PN[p], x: x + R * 1.25, y: y - R * 1.25, 'font-size': R * 0.7 }, ov);
        t.textContent = PN[p];
      }
    }
    if (S.revealed) {
      const res = Q.pauliMul(S.error, S.corr);
      for (let i = 0; i < c.n; i++) {
        const [x, y] = c.qubits[i].pos;
        const pe = Q.pauliGet(S.error, i);
        if (pe) {
          const g = el('g', { class: 'dyn', transform: `translate(${x + R * 0.8},${y - R * 0.8})` }, ov);
          el('circle', { r: R * 0.5, style: `fill: var(--bad)` }, g);
          const t = el('text', { class: 'plet', 'font-size': R * 0.62, style: 'fill:#fff' }, g);
          t.textContent = PN[pe];
        }
        if (Q.pauliGet(res, i)) el('circle', { class: 'dyn', cx: x, cy: y, r: R * 1.22, fill: 'none', 'stroke-width': R * 0.1, 'stroke-dasharray': `${R * 0.3} ${R * 0.2}`, style: 'stroke: var(--bad)' }, ov);
      }
    }
    // status
    const lit = Q.weightOf(syn), w = Q.pauliWeight(S.corr);
    if (!S.revealed) {
      $('status').innerHTML = lit
        ? `光っているチェック: <b>${lit}</b> / ${c.m} ・ 訂正の重み: <b>${w}</b>`
        : `<b style="color:var(--ok)">全チェックが +1 に戻りました。</b> 訂正の重み ${w}。「判定する」で結果を確認 (Enter)`;
      if (S.hintShown && S.dec) $('status').innerHTML += ` ・ <span style="color:var(--accent)">点線 = デコーダ (${S.dec.method}) の訂正</span> <button class="btn ghost" id="applyHint">適用する</button>`;
      const ah = $('applyHint');
      if (ah) ah.onclick = () => { S.corr = Q.pauliClone(S.dec.correction); update(); };
    }
    if (S.matrixOn) drawMatrix();
  }

  function stabTip(j) {
    const c = S.code, s = c.stabs[j], syn = currentSyndrome();
    const ops = c.stabSupport[j].map(i => PN[Q.pauliGet(s, i)] + '<sub>' + i + '</sub>').join(' ');
    const kind = s.kind === 'X' ? 'X型チェック' : s.kind === 'Z' ? 'Z型チェック' : '混合型チェック';
    return `<b>${kind} #${j}</b> (重み ${c.stabSupport[j].length})<br><span class="mono">${ops}</span><br>測定値: <b>${syn[j] ? '−1 (反転)' : '+1'}</b>`;
  }
  function qubitTip(i) {
    const c = S.code;
    return `<b>量子ビット ${c.qubits[i].label || 'q'}${i}</b><br>${c.qubitStabs[i].length} 個のチェックに参加<br><span style="color:var(--muted)">クリックで ${PN[S.tool]} を適用</span>`;
  }
  function showTip(ev, html) { if (ev.pointerType === 'touch') return; const t = $('tip'); t.innerHTML = html; t.hidden = false; moveTip(ev); }
  function moveTip(ev) {
    const t = $('tip'), wrap = $('boardWrap').getBoundingClientRect();
    let x = ev.clientX - wrap.left + 14, y = ev.clientY - wrap.top + 14;
    if (x + 240 > wrap.width) x = ev.clientX - wrap.left - 250;
    if (y + 90 > wrap.height) y = ev.clientY - wrap.top - 90;
    t.style.left = Math.max(4, x) + 'px'; t.style.top = Math.max(4, y) + 'px';
  }
  function hideTip() { $('tip').hidden = true; }

  function clickQubit(i) {
    if (S.revealed) return;
    const btn = document.querySelector(`.tool[data-p="${S.tool}"]`);
    if (btn && btn.disabled) return;
    Q.pauliApply(S.corr, i, S.tool);
    update();
  }

  // ------------------------------------------------------------------ decoder / judging
  function decoderResult() {
    if (!S.dec) S.dec = Q.decode(S.code, S.syn0, S.level.noise);
    return S.dec;
  }

  function hint() {
    if (S.revealed) return;
    if (S.level.kind === 'spacetime') { S.st.showDec = !S.st.showDec; S.hintUsed = true; S.levelHint = true; return updateSpacetime(); }
    decoderResult();
    S.hintShown = !S.hintShown;
    S.hintUsed = true; S.levelHint = true;
    update();
  }

  function submit() {
    if (S.revealed) return nextRound();
    if (S.level.kind === 'spacetime') return submitSpacetime();
    const c = S.code, syn = currentSyndrome();
    if (!Q.isZero(syn)) {
      $('status').innerHTML = `<span style="color:var(--warn)">まだ ${Q.weightOf(syn)} 個のチェックが光っています。</span> デコーダは測定されたシンドロームと矛盾しない訂正を出す必要があります。`;
      return;
    }
    S.revealed = true;
    const dec = decoderResult();
    const res = Q.pauliMul(S.error, S.corr);
    const cls = c.classify(res);
    const decCls = c.classify(Q.pauliMul(S.error, dec.correction));
    const same = c.isStabilizer(Q.pauliMul(S.corr, dec.correction));
    const w = Q.pauliWeight(S.corr), wd = Q.pauliWeight(dec.correction), we = Q.pauliWeight(S.error);
    let kind, title, body;
    if (cls.ok) {
      kind = 'ok'; title = '成功! 論理情報は守られました';
      body = Q.isZero(res.x) && Q.isZero(res.z)
        ? '訂正はエラーとぴったり一致しました。'
        : `訂正はエラーと異なりますが、残差 E·C は<b>スタビライザー</b>(重み ${Q.pauliWeight(res)}) なので符号状態に作用しません — これが<b>縮退</b>です。`;
    } else if (same) {
      kind = 'meh'; title = '不可避の失敗 (最適デコーダと同じ判断)';
      body = `エラーが多すぎて、最もありそうな訂正が外れました。デコーダも同じ結果です。` + flipText(cls);
    } else {
      kind = 'bad'; title = '論理エラー!';
      body = `残差 E·C がシンドロームを残さない<b>論理演算子</b>になりました。` + flipText(cls) +
        (decCls.ok ? '<br>デコーダは正しく訂正できていました (点線)。' : ' (デコーダも失敗するケースでしたが、別の同値類を選びました。)');
      S.hintShown = true;
    }
    if (w > wd && cls.ok) S.weightOK = false;
    if (!cls.ok && kind !== 'meh') S.weightOK = false;
    const r = $('result');
    r.className = 'result ' + kind; r.hidden = false;
    r.innerHTML = `<h4>${title}</h4><div>${body}</div>
      <div class="row"><span class="badge">実際のエラー重み ${we}</span><span class="badge">あなたの訂正 ${w}</span><span class="badge">デコーダ ${wd} (${dec.method})</span></div>
      <div class="pstr">E = ${sparseStr(S.error)}<br>C = ${sparseStr(S.corr)}</div>
      <div class="row"><button class="btn primary" id="btnNext">${nextLabel()}</button></div>`;
    $('btnNext').onclick = nextRound;
    $('btnSubmit').disabled = false;
    $('btnSubmit').textContent = '次へ';
    recordRound(kind);
    update();
    $('status').innerHTML = '赤い丸 = 実際のエラー、赤い点線の輪 = 残差 (エラー×訂正) が残った量子ビット';
  }

  function flipText(cls) {
    if (!cls.flips.length) return '';
    const s = cls.flips.slice(0, 6).map(f => `論理量子ビット${f.q + 1}: ${f.X && f.Z ? 'Ȳ' : f.X ? 'X̄' : 'Z̄'}`).join(', ');
    return ` <br>反転: <b>${s}</b>${cls.flips.length > 6 ? ' …' : ''}`;
  }
  function sparseStr(e) {
    const parts = [];
    for (let i = 0; i < e.x.length; i++) { const p = Q.pauliGet(e, i); if (p) parts.push(PN[p] + i); }
    return parts.length ? parts.join(' ') : 'I';
  }
  function nextLabel() {
    if (S.mode === 'free') return '次の問題';
    return S.round + 1 >= S.level.rounds ? '結果を見る' : '次のラウンドへ';
  }

  function recordRound(kind) {
    if (S.mode === 'free') {
      S.free.total++; if (kind !== 'bad') S.free.ok++;
      renderHeader();
      return;
    }
    S.results[S.round] = { cls: kind };
    renderHeader();
  }

  function nextRound() {
    $('btnSubmit').textContent = '判定する';
    if (S.mode === 'free') return newRound();
    S.round++;
    if (S.round >= S.level.rounds) return finishLevel();
    newRound();
  }

  function finishLevel() {
    const lv = S.level, n = lv.rounds;
    const pass = S.results.filter(r => r.cls !== 'bad').length;
    const need = Math.ceil(n * 2 / 3);
    let st = 0;
    if (pass >= need) st = 1;
    if (pass === n) st = 2;
    if (pass === n && !S.levelHint && S.weightOK) st = 3;
    if (st > (progress[lv.id] || 0)) { progress[lv.id] = st; saveProgress(progress); }
    const idx = LEVELS.indexOf(lv), nxt = LEVELS[idx + 1];
    const msg = st === 0 ? `合格ラインは ${need}/${n} ラウンドです。もう一度挑戦しましょう。`
      : st === 3 ? '完璧! ヒントなし・最小重みで全ラウンド成功。'
      : st === 2 ? '全ラウンド成功! ★3 はヒントなし、かつデコーダ以下の重みで。'
      : 'クリア! 全ラウンド成功で ★2。';
    $('modalCard').innerHTML = `<div class="bigstars">${stars(st)}</div><h3>${lv.id} ${lv.title}</h3>
      <p>${pass} / ${n} ラウンド合格</p><p style="color:var(--text2)">${msg}</p>
      <div class="row" style="display:flex;gap:8px;justify-content:center;margin-top:12px">
      <button class="btn" id="mRetry">もう一度</button>${nxt ? '<button class="btn primary" id="mNext">次のステージ</button>' : ''}</div>`;
    $('modal').hidden = false;
    $('mRetry').onclick = () => { $('modal').hidden = true; loadLevel(lv); };
    if (nxt) $('mNext').onclick = () => { $('modal').hidden = true; loadLevel(nxt); };
    buildNav();
  }

  // ------------------------------------------------------------------ logical / matrix
  function toggleLogical() {
    if (!S.code) return;
    const k = S.code.k;
    S.logShow = S.logShow + 1;
    if (S.logShow >= 2 * k) S.logShow = -1;
    const b = $('btnLogical');
    if (S.logShow < 0) { b.textContent = '論理演算子'; b.classList.remove('on'); }
    else { b.textContent = `${S.logShow & 1 ? 'Z̄' : 'X̄'}${k > 1 ? (S.logShow >> 1) + 1 : ''} 表示中`; b.classList.add('on'); }
    update();
  }

  function drawMatrix() {
    const cv = $('matrix'), c = S.code;
    if (!c) return;
    const syn = currentSyndrome();
    const cs = Math.max(3, Math.min(14, Math.floor(1000 / (c.n + 3))));
    cv.width = (c.n + 3) * cs; cv.height = c.m * cs;
    const ctx = cv.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const col = v => css.getPropertyValue(v).trim();
    ctx.fillStyle = col('--bg'); ctx.fillRect(0, 0, cv.width, cv.height);
    for (let j = 0; j < c.m; j++) {
      const s = c.stabs[j];
      for (const i of c.stabSupport[j]) {
        const p = Q.pauliGet(s, i);
        ctx.fillStyle = col(p === 1 ? '--x' : p === 2 ? '--z' : '--y');
        ctx.fillRect(i * cs, j * cs, cs - (cs > 4 ? 1 : 0), cs - (cs > 4 ? 1 : 0));
      }
      ctx.fillStyle = syn[j] ? col('--warn') : col('--panel2');
      ctx.fillRect((c.n + 1) * cs, j * cs, cs * 2 - 1, cs - (cs > 4 ? 1 : 0));
    }
    cv.title = `スタビライザー行列 (${c.m} 行 × ${c.n} 列)。青=X, 橙=Z, 紫=Y。右端=現在のシンドローム`;
  }

  // ------------------------------------------------------------------ spacetime level
  function newSpacetimeRound() {
    const lv = S.level;
    const sample = Q.spacetimeSample(lv.d, lv.T, 0, 0, Math.random, lv.faults);
    const events = [];
    sample.det.forEach((row, t) => row.forEach((b, s) => b && events.push({ t, s })));
    if (!events.length) return newSpacetimeRound();
    S.st = { sample, events, pairs: [], sel: -1, showDec: false, mw: Q.spacetimeMWPM(sample) };
    renderHeader();
    renderSpacetime();
    updateSpacetime();
  }

  function renderSpacetime() {
    const { d, T } = S.level, svg = $('board');
    svg.innerHTML = '';
    const dy = 1.4;
    const x0 = -3.2, y0 = -1.6, w = 2 * (d - 1) + 6.4, h = (T - 1) * dy + 4.2;
    svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
    const g = el('g', null, svg);
    // boundaries
    const bl = el('rect', { class: 'bound', x: -2.6, y: -0.8, width: 1.6, height: (T - 1) * dy + 1.6, rx: 0.3 }, g);
    const br = el('rect', { class: 'bound', x: 2 * (d - 1) + 1, y: -0.8, width: 1.6, height: (T - 1) * dy + 1.6, rx: 0.3 }, g);
    bl.onclick = () => clickBoundary('L'); br.onclick = () => clickBoundary('R');
    const tl = el('text', { class: 'axislbl', x: -1.8, y: (T - 1) * dy + 1.25, 'text-anchor': 'middle' }, g); tl.textContent = '左境界';
    const tr = el('text', { class: 'axislbl', x: 2 * (d - 1) + 1.8, y: (T - 1) * dy + 1.25, 'text-anchor': 'middle' }, g); tr.textContent = '右境界';
    // data qubit columns
    for (let q = 0; q < d; q++) {
      el('line', { class: 'stdata', x1: 2 * q, y1: -0.8, x2: 2 * q, y2: (T - 1) * dy + 0.6 }, g);
      const t = el('text', { class: 'axislbl', x: 2 * q, y: -1.0, 'text-anchor': 'middle' }, g); t.textContent = 'q' + q;
    }
    for (let t = 0; t < T; t++) {
      const lab = el('text', { class: 'axislbl', x: x0 + 0.1, y: t * dy + 0.15 }, g);
      lab.textContent = t === T - 1 ? '最終' : 't=' + (t + 1);
      for (let s = 0; s < d - 1; s++) el('rect', { class: 'syncell', 'data-t': t, 'data-s': s, x: 2 * s + 1 - 0.5, y: t * dy - 0.5, width: 1, height: 1, rx: 0.15 }, g);
    }
    layers.st = { cells: g, pairs: el('g', null, svg), faults: el('g', null, svg), events: el('g', null, svg) };
    S.st.evEls = S.st.events.map((e, k) => {
      const eg = el('g', { class: 'ev' }, layers.st.events);
      el('circle', { cx: 2 * e.s + 1, cy: e.t * dy, r: 0.34 }, eg);
      eg.onclick = ev => { ev.stopPropagation(); clickEvent(k); };
      return eg;
    });
    S.st.dy = dy;
  }

  function stPos(e) { return [2 * e.s + 1, e.t * S.st.dy]; }

  function clickEvent(k) {
    const st = S.st;
    if (S.revealed) return;
    const pi = st.pairs.findIndex(p => p.a === k || p.b === k);
    if (pi >= 0) { st.pairs.splice(pi, 1); st.sel = -1; return updateSpacetime(); }
    if (st.sel < 0) st.sel = k;
    else if (st.sel === k) st.sel = -1;
    else { st.pairs.push({ a: st.sel, b: k }); st.sel = -1; }
    updateSpacetime();
  }
  function clickBoundary(side) {
    const st = S.st;
    if (S.revealed || st.sel < 0) return;
    st.pairs.push({ a: st.sel, b: side }); st.sel = -1;
    updateSpacetime();
  }

  function pairCost(p) {
    const d = S.level.d, a = S.st.events[p.a];
    if (p.b === 'L') return a.s + 1;
    if (p.b === 'R') return d - 1 - a.s;
    const b = S.st.events[p.b];
    return Math.abs(a.t - b.t) + Math.abs(a.s - b.s);
  }
  function correctionFromPairs(pairs) {
    const d = S.level.d, corr = new Uint8Array(d);
    for (const p of pairs) {
      const a = S.st.events[p.a];
      if (p.b === 'L') { for (let q = 0; q <= a.s; q++) corr[q] ^= 1; continue; }
      if (p.b === 'R') { for (let q = a.s + 1; q < d; q++) corr[q] ^= 1; continue; }
      const b = S.st.events[p.b];
      const i = Math.min(a.s, b.s), j = Math.max(a.s, b.s);
      for (let q = i + 1; q <= j; q++) corr[q] ^= 1;
    }
    return corr;
  }

  function drawPairPath(layer, a, bpos, cls) {
    // L-shaped path: vertical (time) then horizontal (space)
    const pa = stPos(a);
    const mid = [pa[0], bpos[1]];
    el('path', { class: 'pairline ' + cls, fill: 'none', d: `M${pa[0]},${pa[1]}L${mid[0]},${mid[1]}L${bpos[0]},${bpos[1]}` }, layer);
  }

  function updateSpacetime() {
    const st = S.st, { d } = S.level, L = layers.st;
    L.cells.querySelectorAll('.syncell').forEach(c => {
      const t = +c.dataset.t, s = +c.dataset.s;
      c.classList.toggle('on', !!st.sample.synHist[t][s]);
    });
    L.pairs.innerHTML = '';
    const bpos = (p, a) => p.b === 'L' ? [-1.4, stPos(a)[1]] : p.b === 'R' ? [2 * (d - 1) + 1.4, stPos(a)[1]] : stPos(st.events[p.b]);
    st.pairs.forEach(p => drawPairPath(L.pairs, st.events[p.a], bpos(p, st.events[p.a]), ''));
    if (st.showDec && st.mw) {
      st.mw.pairs.forEach(([a, b]) => {
        const ea = { t: a[0], s: a[1] };
        const target = b ? stPos({ t: b[0], s: b[1] }) : (a[1] + 1 <= d - 1 - a[1] ? [-1.4, stPos(ea)[1]] : [2 * (d - 1) + 1.4, stPos(ea)[1]]);
        drawPairPath(L.pairs, ea, target, 'dec');
      });
    }
    const paired = new Set();
    st.pairs.forEach(p => { paired.add(p.a); if (typeof p.b === 'number') paired.add(p.b); });
    st.evEls.forEach((g, k) => { g.classList.toggle('sel', st.sel === k); g.classList.toggle('paired', paired.has(k)); });
    L.faults.innerHTML = '';
    if (S.revealed) {
      st.sample.dataFlips.forEach((row, t) => row.forEach((b, q) => {
        if (!b) return;
        const tx = el('text', { class: 'faultmark', x: 2 * q, y: t * st.dy - st.dy / 2, style: 'fill: var(--bad)' }, L.faults);
        tx.textContent = 'X';
      }));
      st.sample.measFlips.forEach((row, t) => row.forEach((b, s) => {
        if (!b) return;
        el('rect', { x: 2 * s + 1 - 0.55, y: t * st.dy - 0.55, width: 1.1, height: 1.1, rx: 0.2, fill: 'none', 'stroke-width': 0.08, style: 'stroke: var(--bad)' }, L.faults);
      }));
    }
    const cost = st.pairs.reduce((a, p) => a + pairCost(p), 0);
    const remaining = st.events.length - paired.size;
    if (!S.revealed) {
      $('status').innerHTML = `検出イベント <b>${st.events.length}</b> 個 ・ 未ペア <b>${remaining}</b> ・ あなたのマッチングの重み <b>${cost}</b>` +
        (st.showDec ? ` ・ <span style="color:var(--warn)">黄の点線 = MWPM (重み ${st.mw.weight})</span>` : '') +
        `<br><span style="color:var(--muted)">薄い橙のマス = 生のシンドローム(−1)。点 = 検出イベント(前の時刻との差)。</span>`;
    }
  }

  function submitSpacetime() {
    const st = S.st;
    const paired = new Set();
    st.pairs.forEach(p => { paired.add(p.a); if (typeof p.b === 'number') paired.add(p.b); });
    if (paired.size < st.events.length) {
      $('status').innerHTML = `<span style="color:var(--warn)">まだペアになっていない検出イベントがあります。</span>`;
      return;
    }
    S.revealed = true;
    const corr = correctionFromPairs(st.pairs);
    const res = Q.xorInto(Uint8Array.from(st.sample.finalData), corr);
    const ok = Q.weightOf(res) === 0;
    const same = Q.weightOf(Q.xorInto(Uint8Array.from(corr), st.mw.correction)) === 0;
    const cost = st.pairs.reduce((a, p) => a + pairCost(p), 0);
    const kind = ok ? 'ok' : same ? 'meh' : 'bad';
    if (cost > st.mw.weight) S.weightOK = false;
    if (kind === 'bad') S.weightOK = false;
    st.showDec = true;
    const nd = st.sample.dataFlips.reduce((a, r) => a + Q.weightOf(r), 0), nm = st.sample.measFlips.reduce((a, r) => a + Q.weightOf(r), 0);
    const r = $('result');
    r.className = 'result ' + kind; r.hidden = false;
    r.innerHTML = `<h4>${ok ? '成功! 最終データは正しく訂正されました' : same ? '不可避の失敗 (MWPM と同じ)' : '論理エラー! (全ビット反転 = X̄)'}</h4>
      <div>実際の故障: データ X エラー <b>${nd}</b> 個 (赤い X)、測定エラー <b>${nm}</b> 個 (赤い枠)。横に伸びたペアの線がデータへの訂正、縦の線は測定エラーの解釈です。</div>
      <div class="row"><span class="badge">あなたの重み ${cost}</span><span class="badge">MWPM ${st.mw.weight}</span></div>
      <div class="pstr">最終データのエラー: ${Array.from(st.sample.finalData).join('')} ・ あなたの訂正: ${Array.from(corr).join('')}</div>
      <div class="row"><button class="btn primary" id="btnNext">${nextLabel()}</button></div>`;
    $('btnNext').onclick = nextRound;
    $('btnSubmit').textContent = '次へ';
    recordRound(kind);
    updateSpacetime();
    $('status').innerHTML = '青線 = あなたのペア、黄の点線 = MWPM、赤い X = データエラー、赤い枠 = 測定エラー';
  }

  // ------------------------------------------------------------------ free play
  function startFree() {
    const id = $('freeCode').value;
    S.code = Q.getCode(id);
    const type = $('freeNoise').value, mode = $('freeMode').value;
    let t = type;
    if (S.code.protects && type !== S.code.protects) { t = S.code.protects; $('freeNoise').value = t; }
    const noise = mode === 'count' ? { type: t, mode, count: Math.max(1, Math.min(12, +$('freeCount').value || 1)), eta: 100 } : { type: t, mode, p: Math.max(0.001, Math.min(0.3, +$('freeP').value || 0.05)), eta: 100 };
    S.level = { id: 'free', title: 'フリープレイ', code: id, noise, rounds: Infinity, tools: S.code.protects ? [S.code.protects === 'X' ? 1 : 2] : [1, 2, 3] };
    S.free = { ok: 0, total: 0 }; S.logShow = -1; S.levelHint = false;
    $('btnLogical').textContent = '論理演算子'; $('btnLogical').classList.remove('on');
    renderLesson();
    buildNav();
    newRound();
  }

  // ------------------------------------------------------------------ wiring
  function init() {
    buildNav();
    document.querySelectorAll('.tab').forEach(t => (t.onclick = () => showView(t.dataset.view)));
    document.querySelectorAll('.tool').forEach(b => (b.onclick = () => { if (b.disabled) return; S.tool = +b.dataset.p; setTools(); }));
    $('btnSubmit').onclick = submit;
    $('btnHint').onclick = hint;
    $('btnClear').onclick = () => {
      if (S.revealed) return;
      if (S.level.kind === 'spacetime') { S.st.pairs = []; S.st.sel = -1; return updateSpacetime(); }
      S.corr = Q.pauliVec(S.code.n); update();
    };
    $('btnLogical').onclick = toggleLogical;
    $('btnMatrix').onclick = () => {
      S.matrixOn = !S.matrixOn; $('matrix').hidden = !S.matrixOn; $('btnMatrix').classList.toggle('on', S.matrixOn);
      if (S.matrixOn) drawMatrix();
    };
    const fc = $('freeCode');
    FREE_CODES.forEach(([id, name]) => { const o = document.createElement('option'); o.value = id; o.textContent = name; fc.appendChild(o); });
    fc.value = 'surf5';
    $('freeGo').onclick = startFree;
    fc.onchange = startFree; $('freeNoise').onchange = startFree;
    $('freeMode').onchange = () => { const c = $('freeMode').value === 'count'; $('freeCountWrap').hidden = !c; $('freePWrap').hidden = c; startFree(); };
    $('modal').onclick = e => { if (e.target.id === 'modal') $('modal').hidden = true; };
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (!$('view-play').classList.contains('active')) return;
      const k = e.key.toLowerCase();
      const map = { '1': 1, x: 1, '2': 2, z: 2, '3': 3, y: 3 };
      if (map[k]) { const b = document.querySelector(`.tool[data-p="${map[k]}"]`); if (b && !b.disabled) { S.tool = map[k]; setTools(); } }
      else if (k === 'enter') { e.preventDefault(); if (!$('modal').hidden) return; submit(); }
      else if (k === 'h') hint();
      else if (k === 'escape') $('modal').hidden = true;
    });
    $('refs').innerHTML = REF_PAGE + Object.values(REFS).map(r => `<div class="ref">${r}</div>`).join('');
    // start at first unfinished level
    const first = LEVELS.find(l => !progress[l.id]) || LEVELS[0];
    loadLevel(first);
  }

  init();
  window.QEC_GAME = { state: S }; // for automated UI tests
})();
