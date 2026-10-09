/* Threshold lab: Monte-Carlo logical error rate vs physical error rate (code-capacity noise, BP+OSD). */
(function () {
  'use strict';
  const Q = window.QEC;
  const $ = id => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const FAMILIES = {
    surf: { codes: ['surf3', 'surf5', 'surf7'], labels: ['d=3', 'd=5', 'd=7'], ps: { depol: [0.03, 0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22], X: [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2] } },
    color: { codes: ['steane', 'color5', 'color7'], labels: ['d=3', 'd=5', 'd=7'], ps: { depol: [0.03, 0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22], X: [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2] } },
    rep: { codes: ['rep3', 'rep5', 'rep7'], labels: ['d=3', 'd=5', 'd=7'], forceX: true, ps: { X: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5] } },
    bb: { codes: ['bb72', 'bb90', 'gross'], labels: ['[[72,12,6]]', '[[90,8,10]]', '[[144,12,12]]'], ps: { depol: [0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.13], X: [0.01, 0.02, 0.03, 0.04, 0.06, 0.08, 0.1] } },
  };
  const COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];
  let run = null, data = [];

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function trial(code, model, rng) {
    const e = Q.sampleIID(code.n, model, rng);
    const syn = code.syndrome(e);
    if (Q.isZero(syn)) return !code.isStabilizer(e);
    if (!code._tanner) code._tanner = Q.makeTanner(code.Hdec);
    const pr = Q.pauliProbs(model), n = code.n, prior = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) { prior[i] = pr.X + pr.Y; prior[n + i] = pr.Z + pr.Y; }
    const r = Q.bposd(code._tanner, syn, prior);
    const res = Q.pauliMul(e, { x: r.e.slice(0, n), z: r.e.slice(n) });
    return !code.classify(res).ok;
  }

  function start() {
    stop();
    const fam = FAMILIES[$('labFamily').value];
    let noise = $('labNoise').value;
    if (fam.forceX) { noise = 'X'; $('labNoise').value = 'X'; }
    const ps = fam.ps[noise] || fam.ps.X;
    const shots = +$('labShots').value;
    data = fam.codes.map((id, si) => ({ id, label: fam.labels[si], code: Q.getCode(id), pts: ps.map(p => ({ p, fails: 0, shots: 0 })) }));
    run = { fam, noise, shots, si: 0, pi: 0, rng: Q.rngFrom(12345), stopped: false };
    $('labRun').disabled = true; $('labStop').disabled = false;
    $('labNote').textContent = (noise === 'depol' ? '脱分極ノイズ' : 'ビット反転ノイズ') + `、各点 ${shots} 回。デコーダ: BP (min-sum) + OSD-CS。` +
      (fam === FAMILIES.bb ? ' BB 符号は k 個の論理量子ビットのどれか1つでも反転したら失敗と数えます (ブロック論理エラー率)。' : '') +
      ' BP+OSD は表面符号では MWPM や最尤デコーダより少し弱く、しきい値はやや低めに出ます。点線は p_L = p (符号化しない1量子ビット)。失敗 0 回の点はプロットしません (表を参照)。';
    drawChart();
    step();
  }

  function stop() {
    if (run) run.stopped = true;
    run = null;
    $('labRun').disabled = false; $('labStop').disabled = true;
  }

  function step() {
    if (!run || run.stopped) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 30) {
      const s = data[run.si], pt = s.pts[run.pi];
      const model = { type: run.noise, p: pt.p };
      if (trial(s.code, model, run.rng)) pt.fails++;
      pt.shots++;
      if (pt.shots >= run.shots) {
        run.pi++;
        if (run.pi >= s.pts.length) { run.pi = 0; run.si++; }
        drawChart();
        if (run.si >= data.length) { $('labProg').textContent = '完了'; stop(); renderTable(); return; }
      }
    }
    const done = data.reduce((a, s) => a + s.pts.reduce((b, p) => b + p.shots, 0), 0);
    const total = data.length * data[0].pts.length * run.shots;
    $('labProg').textContent = `${Math.round((100 * done) / total)}% — ${data[run.si].label}, p=${data[run.si].pts[run.pi].p}`;
    renderTable();
    setTimeout(step, 0);
  }

  function renderTable() {
    const ps = data[0].pts.map(p => p.p);
    let h = '<table><tr><th>p</th>' + data.map(s => `<th>${s.label}</th>`).join('') + '</tr>';
    ps.forEach((p, i) => {
      h += `<tr><td>${p}</td>` + data.map(s => {
        const pt = s.pts[i];
        if (!pt.shots) return '<td>—</td>';
        return `<td>${pt.fails ? (pt.fails / pt.shots).toExponential(2) : '< ' + (1 / pt.shots).toExponential(1)} (${pt.fails}/${pt.shots})</td>`;
      }).join('') + '</tr>';
    });
    $('labTable').innerHTML = h + '</table>';
  }

  function drawChart() {
    const svg = $('labChart');
    svg.innerHTML = '';
    const W = svg.clientWidth || 800, H = svg.clientHeight || 420;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const m = { l: 62, r: 92, t: 14, b: 46 };
    const ps = data[0].pts.map(p => p.p);
    const xmin = Math.log10(ps[0] * 0.85), xmax = Math.log10(ps[ps.length - 1] * 1.15);
    const ymin = -4, ymax = 0;
    const X = p => m.l + ((Math.log10(p) - xmin) / (xmax - xmin)) * (W - m.l - m.r);
    const Y = v => m.t + (1 - (Math.log10(v) - ymin) / (ymax - ymin)) * (H - m.t - m.b);
    const ax = el('g', { class: 'axis' }, svg);
    for (let e = ymin; e <= ymax; e++) {
      el('line', { class: 'gridline', x1: m.l, x2: W - m.r, y1: Y(10 ** e), y2: Y(10 ** e) }, ax);
      const t = el('text', { x: m.l - 8, y: Y(10 ** e) + 4, 'text-anchor': 'end' }, ax); t.textContent = '1e' + e;
    }
    ps.forEach(p => {
      const t = el('text', { x: X(p), y: H - m.b + 18, 'text-anchor': 'middle' }, ax); t.textContent = p;
    });
    const xt = el('text', { class: 'axistitle', x: (m.l + W - m.r) / 2, y: H - 8, 'text-anchor': 'middle' }, svg); xt.textContent = '物理エラー率 p';
    const yt = el('text', { class: 'axistitle', x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, svg); yt.textContent = '論理エラー率 p_L';
    // p_L = p reference
    const pr0 = Math.max(ps[0] * 0.85, 1e-4), pr1 = ps[ps.length - 1] * 1.15;
    el('line', { x1: X(pr0), y1: Y(pr0), x2: X(pr1), y2: Y(Math.min(pr1, 1)), stroke: 'var(--muted)', 'stroke-dasharray': '4 4', 'stroke-width': 1 }, svg);
    const pts = [], ends = [];
    data.forEach((s, si) => {
      const valid = s.pts.filter(p => p.shots && p.fails);
      if (valid.length > 1) {
        el('path', { d: 'M' + valid.map(p => `${X(p.p)},${Y(p.fails / p.shots)}`).join('L'), fill: 'none', stroke: COLORS[si], 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
      }
      valid.forEach(p => {
        const cx = X(p.p), cy = Y(p.fails / p.shots);
        el('circle', { cx, cy, r: 4, fill: COLORS[si], stroke: 'var(--surface-1)', 'stroke-width': 2 }, svg);
        pts.push({ cx, cy, s, p });
      });
      if (valid.length) { const last = valid[valid.length - 1]; ends.push({ x: X(last.p) + 10, y: Y(last.fails / last.shots) + 4, label: s.label }); }
    });
    // direct labels at series ends, nudged apart so they never overlap
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    ends.forEach(e => { const t = el('text', { x: e.x, y: e.y, fill: 'var(--text2)', 'font-size': 12 }, svg); t.textContent = e.label; });
    $('labLegend').innerHTML = data.map((s, si) => `<span><i style="background:${COLORS[si]}"></i>${s.code.name}</span>`).join('') + '<span><i style="background:var(--muted)"></i>p_L = p</span>';
    // hover
    const tip = $('labTip');
    svg.onmousemove = ev => {
      const r = svg.getBoundingClientRect(), x = ((ev.clientX - r.left) * W) / r.width, y = ((ev.clientY - r.top) * H) / r.height;
      let best = null, bd = 24;
      pts.forEach(q => { const d = Math.hypot(q.cx - x, q.cy - y); if (d < bd) { bd = d; best = q; } });
      if (!best) { tip.hidden = true; return; }
      tip.hidden = false;
      tip.innerHTML = `<b>${best.s.label}</b><br>p = ${best.p.p}<br>p<sub>L</sub> = ${(best.p.fails / best.p.shots).toExponential(2)} (${best.p.fails}/${best.p.shots})`;
      tip.style.left = Math.min(ev.clientX - r.left + 12, r.width - 170) + 'px';
      tip.style.top = ev.clientY - r.top + 12 + 'px';
    };
    svg.onmouseleave = () => (tip.hidden = true);
  }

  window.QEC_LAB = {
    show() { if (!data.length) { const fam = FAMILIES.surf; data = fam.codes.map((id, si) => ({ id, label: fam.labels[si], code: Q.getCode(id), pts: fam.ps.depol.map(p => ({ p, fails: 0, shots: 0 })) })); } drawChart(); },
  };
  $('labRun').onclick = start;
  $('labStop').onclick = stop;
  $('labFamily').onchange = () => { $('labNoise').disabled = !!FAMILIES[$('labFamily').value].forceX; };
  window.addEventListener('resize', () => { if (data.length && $('view-lab').classList.contains('active')) drawChart(); });
})();
