/* Levels, lessons and references for QEC Puzzle. */
(function (root) {
  'use strict';

  const REFS = {
    shor95: 'P. W. Shor, “Scheme for reducing decoherence in quantum computer memory”, <i>Phys. Rev. A</i> 52, R2493 (1995).',
    steane96: 'A. M. Steane, “Error correcting codes in quantum theory”, <i>Phys. Rev. Lett.</i> 77, 793 (1996).',
    cs96: 'A. R. Calderbank &amp; P. W. Shor, “Good quantum error-correcting codes exist”, <i>Phys. Rev. A</i> 54, 1098 (1996).',
    laflamme96: 'R. Laflamme, C. Miquel, J. P. Paz, W. H. Zurek, “Perfect quantum error correcting code”, <i>Phys. Rev. Lett.</i> 77, 198 (1996).',
    bennett96: 'C. H. Bennett, D. P. DiVincenzo, J. A. Smolin, W. K. Wootters, “Mixed-state entanglement and quantum error correction”, <i>Phys. Rev. A</i> 54, 3824 (1996).',
    knill97: 'E. Knill &amp; R. Laflamme, “Theory of quantum error-correcting codes”, <i>Phys. Rev. A</i> 55, 900 (1997).',
    gottesman97: 'D. Gottesman, “Stabilizer codes and quantum error correction”, PhD thesis, Caltech (1997), arXiv:quant-ph/9705052.',
    kitaev03: 'A. Yu. Kitaev, “Fault-tolerant quantum computation by anyons”, <i>Ann. Phys.</i> 303, 2 (2003), arXiv:quant-ph/9707021.',
    dennis02: 'E. Dennis, A. Kitaev, A. Landahl, J. Preskill, “Topological quantum memory”, <i>J. Math. Phys.</i> 43, 4452 (2002), arXiv:quant-ph/0110143.',
    bombin07: 'H. Bombin &amp; M. A. Martin-Delgado, “Optimal resources for topological two-dimensional stabilizer codes: Comparative study”, <i>Phys. Rev. A</i> 76, 012305 (2007).',
    fowler12: 'A. G. Fowler, M. Mariantoni, J. M. Martinis, A. N. Cleland, “Surface codes: Towards practical large-scale quantum computation”, <i>Phys. Rev. A</i> 86, 032324 (2012), arXiv:1208.0928.',
    terhal15: 'B. M. Terhal, “Quantum error correction for quantum memories”, <i>Rev. Mod. Phys.</i> 87, 307 (2015).',
    google21: 'Google Quantum AI, “Exponential suppression of bit or phase errors with cyclic error correction”, <i>Nature</i> 595, 383 (2021).',
    google23: 'Google Quantum AI, “Suppressing quantum errors by scaling a surface code logical qubit”, <i>Nature</i> 614, 676 (2023).',
    google25: 'Google Quantum AI and Collaborators, “Quantum error correction below the surface code threshold”, <i>Nature</i> 638, 920 (2025), arXiv:2408.13687.',
    xzzx21: 'J. P. Bonilla Ataides, D. K. Tuckett, S. D. Bartlett, S. T. Flammia, B. J. Brown, “The XZZX surface code”, <i>Nat. Commun.</i> 12, 2172 (2021), arXiv:2009.07851.',
    bombin06: 'H. Bombin &amp; M. A. Martin-Delgado, “Topological quantum distillation”, <i>Phys. Rev. Lett.</i> 97, 180501 (2006), arXiv:quant-ph/0605138.',
    lacroix25: 'N. Lacroix et al. (Google Quantum AI), “Scaling and logic in the color code on a superconducting quantum processor”, <i>Nature</i> (2025), arXiv:2412.14256.',
    bluvstein24: 'D. Bluvstein et al., “Logical quantum processor based on reconfigurable atom arrays”, <i>Nature</i> 626, 58 (2024), arXiv:2312.03982.',
    tillich14: 'J.-P. Tillich &amp; G. Zémor, “Quantum LDPC codes with positive rate and minimum distance proportional to the square root of the blocklength”, <i>IEEE Trans. Inf. Theory</i> 60, 1193 (2014), arXiv:0903.0566.',
    kovalev13: 'A. A. Kovalev &amp; L. P. Pryadko, “Quantum Kronecker sum-product low-density parity-check codes with finite rate”, <i>Phys. Rev. A</i> 88, 012311 (2013).',
    bravyi24: 'S. Bravyi, A. W. Cross, J. M. Gambetta, D. Maslov, P. Rall, T. J. Yoder, “High-threshold and low-overhead fault-tolerant quantum memory”, <i>Nature</i> 627, 778 (2024), arXiv:2308.07915.',
    yoder25: 'T. J. Yoder et al., “Tour de gross: A modular quantum computer based on bivariate bicycle codes”, arXiv:2506.03094 (2025).',
    xu24: 'Q. Xu et al., “Constant-overhead fault-tolerant quantum computation with reconfigurable atom arrays”, <i>Nat. Phys.</i> 20, 1084 (2024), arXiv:2308.08648.',
    panteleev21: 'P. Panteleev &amp; G. Kalachev, “Degenerate quantum LDPC codes with good finite length performance”, <i>Quantum</i> 5, 585 (2021), arXiv:1904.02703.',
    panteleev22: 'P. Panteleev &amp; G. Kalachev, “Asymptotically good quantum and locally testable classical LDPC codes”, <i>Proc. STOC 2022</i>, arXiv:2111.03654.',
    roffe20: 'J. Roffe, D. R. White, S. Burton, E. Campbell, “Decoding across the quantum low-density parity-check code landscape”, <i>Phys. Rev. Research</i> 2, 043423 (2020), arXiv:2005.07016.',
    breuckmann21: 'N. P. Breuckmann &amp; J. N. Eberhardt, “Quantum low-density parity-check codes”, <i>PRX Quantum</i> 2, 040101 (2021).',
    edmonds65: 'J. Edmonds, “Paths, trees, and flowers”, <i>Can. J. Math.</i> 17, 449 (1965).',
    higgott23: 'O. Higgott &amp; C. Gidney, “Sparse Blossom: correcting a million errors per core second with minimum-weight matching”, arXiv:2303.15933.',
    hastings21: 'M. B. Hastings &amp; J. Haah, “Dynamically generated logical qubits”, <i>Quantum</i> 5, 564 (2021).',
  };

  const LEGEND = {
    std: `<div class="legendrow">
      <span><i class="sw" style="background:var(--z)"></i>Z型チェック: X/Y エラーを検出</span>
      <span><i class="sw" style="background:var(--x)"></i>X型チェック: Z/Y エラーを検出</span>
      <span><i class="sw" style="background:var(--m)"></i>混合型 (XZZX など)</span></div>`,
  };

  const CHAPTERS = ['第1章 基礎: 反復符号から', '第2章 スタビライザー符号', '第3章 サーフェスコード', '第4章 カラーコード', '第5章 qLDPC 符号'];

  const L = [];
  // ---------------- Chapter 1 ----------------
  L.push({
    id: '1-1', chap: 0, title: 'ビット反転と3量子ビット反復符号', code: 'rep3',
    noise: { type: 'X', mode: 'count', count: 1 }, rounds: 3, tools: [1],
    html: `<h2>1-1 ビット反転と3量子ビット反復符号</h2>
    <p>論理状態を <code>α|000⟩ + β|111⟩</code> と3量子ビットに「冗長化」します。量子状態はコピーできません(no-cloning)が、<b>もつれ</b>で情報を広げることはできます。</p>
    <p>直接 3 量子ビットを測ると α, β が壊れてしまうので、代わりに<b>パリティ</b> <code>Z₁Z₂</code>, <code>Z₂Z₃</code> だけを測ります。これを<b>スタビライザー測定</b>、結果を<b>シンドローム</b>と呼びます。符号状態ではどちらも +1 で、α と β の情報には一切触れません。</p>
    <table><tr><th>エラー</th><th>Z₁Z₂</th><th>Z₂Z₃</th></tr>
    <tr><td>なし</td><td>+1</td><td>+1</td></tr><tr><td>X₁</td><td>−1</td><td>+1</td></tr>
    <tr><td>X₂</td><td>−1</td><td>−1</td></tr><tr><td>X₃</td><td>+1</td><td>−1</td></tr></table>
    <div class="goal"><b>操作:</b> 光っている(−1 になった)チェックを見て、エラーが起きた量子ビットをクリックし X で打ち消してください。全チェックが消えたら「判定する」。</div>
    ${LEGEND.std}
    <h3>ポイント</h3><ul><li>チェックが光る = その2量子ビットのパリティが反転</li><li>X を2回かけると元に戻る (X² = I)。間違えたらもう一度クリック。</li></ul>`,
    refs: ['shor95', 'terhal15'],
  });
  L.push({
    id: '1-2', chap: 0, title: '5量子ビット反復符号と符号距離', code: 'rep5',
    noise: { type: 'X', mode: 'count', count: 2 }, rounds: 3, tools: [1],
    html: `<h2>1-2 符号距離 d と訂正能力</h2>
    <p>d 個の量子ビットの反復符号は <b>符号距離 d</b>: 論理 X̄ = X⊗X⊗…⊗X を起こすには d 個のエラーが必要です。最小重みのエラーを推定する(=多数決)と、<b>t = ⌊(d−1)/2⌋</b> 個までのエラーを必ず訂正できます。</p>
    <p>今回は d=5、エラーは 2 個。光るチェックは「エラーの連なり(チェーン)の<b>端点</b>」に現れます。隣り合う2個のエラーの間のチェックは2回反転して元に戻るので光りません。</p>
    <div class="goal"><b>考え方:</b> 光るチェックをペアにする(または端=境界と組にする)と、その間にエラーの鎖があります。より<b>短い</b>鎖のほうがありそうです。これがのちの<b>最小重み完全マッチング (MWPM)</b>デコーダの考え方です。</div>
    <h3>注意</h3><p>反復符号は X エラーにしか強くありません。Z エラー1個で論理位相が反転します(量子的な符号距離は1)。だから本物の量子符号が必要になります → 1-4, 1-5。</p>`,
    refs: ['google21', 'dennis02'],
  });
  L.push({
    id: '1-3', chap: 0, title: '確率的ノイズと「避けられない失敗」', code: 'rep5',
    noise: { type: 'X', mode: 'iid', p: 0.15 }, rounds: 5, tools: [1],
    html: `<h2>1-3 現実のノイズは確率的</h2>
    <p>実機では各量子ビットが独立に確率 p でエラーを起こします(ここでは p = 15%)。たまたまエラーが 3 個以上起きると、どんなデコーダでも失敗します。</p>
    <p>d=5 の反復符号の論理エラー率は p<sub>L</sub> = Σ<sub>k≥3</sub> C(5,k) p<sup>k</sup>(1−p)<sup>5−k</sup> ≈ 2.7% (p=0.15)。p が小さいほど、d が大きいほど指数的に小さくなります — これが量子誤り訂正の本質です。</p>
    <div class="goal"><b>評価:</b> 最適なデコーダと同じ判断(同じ同値類)をすれば、結果が論理エラーでも「不可避の失敗」として合格になります。</div>
    <p>Google は 2021 年、超伝導量子ビットで最大 21 量子ビットの反復符号を動かし、d を増やすと論理エラーが指数的に減ることを実証しました。</p>`,
    refs: ['google21'],
  });
  L.push({
    id: '1-4', chap: 0, title: '位相反転符号: アダマール基底の反復符号', code: 'phase3',
    noise: { type: 'Z', mode: 'count', count: 1 }, rounds: 3, tools: [2],
    html: `<h2>1-4 位相反転 (Z エラー)</h2>
    <p>量子ビットには古典ビットにない<b>位相反転</b> Z|1⟩ = −|1⟩ があります。アダマール基底 |±⟩ では Z は |+⟩↔|−⟩ の「ビット反転」に見えます。</p>
    <p>そこで <code>|0̄⟩=|+++⟩, |1̄⟩=|−−−⟩</code> とし、<b>X 型</b>のチェック <code>X₁X₂, X₂X₃</code> を測れば、Z エラーを検出できます。</p>
    <div class="goal">青い X 型チェックが光ります。Z ツールでエラー箇所を打ち消してください。</div>
    <p>X 型スタビライザーは Z(と Y)と<b>反可換</b>なので、その測定値が反転します。一般に「スタビライザー S とエラー E が反可換 ⇔ シンドローム 1」。</p>`,
    refs: ['shor95', 'gottesman97'],
  });
  L.push({
    id: '1-5', chap: 0, title: 'Shor の 9 量子ビット符号', code: 'shor9',
    noise: { type: 'depol', mode: 'count', count: 1 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>1-5 最初の量子誤り訂正符号 (Shor 1995)</h2>
    <p>ビット反転符号を位相反転符号の中に<b>連接 (concatenate)</b>した [[9,1,3]] 符号。任意の1量子ビットエラー (X, Y, Z、さらにその任意の重ね合わせ) を訂正できる最初の符号です。</p>
    <ul><li>行の中の <code>ZZ</code> チェック(橙)6 個 → 各ブロックの X エラー</li>
    <li>2 行にまたがる <code>X⊗6</code> チェック(青)2 個 → どのブロックに Z エラーがあるか</li></ul>
    <div class="goal">Y = iXZ は両方のチェックを鳴らします。ツールは X / Z / Y を切り替え (キー 1/2/3)。</div>
    <h3>縮退 (degeneracy)</h3><p>Z₁ のエラーに Z₂ で「訂正」しても成功します。Z₁Z₂ はスタビライザー(符号状態に作用しない)だからです。古典符号にはない量子符号特有の性質で、正しい訂正は1つではありません。</p>
    <p>連続的なエラー (例えば小さな回転) も、シンドローム測定によって離散的な X/Y/Z に「射影」されるので、パウリエラーだけ考えれば十分です (エラーの離散化)。</p>`,
    refs: ['shor95', 'knill97'],
  });
  L.push({
    id: '1-6', chap: 0, title: '測定エラーと時空間デコード', kind: 'spacetime', d: 5, T: 5,
    faults: { data: 2, meas: 1 }, rounds: 3,
    html: `<h2>1-6 シンドローム測定も間違える</h2>
    <p>実機では補助量子ビットの測定も誤ります。そこで同じスタビライザーを<b>繰り返し測定</b>し、前のラウンドとの差(XOR)が 1 になった点を<b>検出イベント</b>とします。</p>
    <ul><li>データ量子ビットの X エラー → <b>同じ時刻</b>の隣り合う2チェックにイベント(横のペア)</li>
    <li>測定エラー → <b>同じチェック</b>の連続2時刻にイベント(縦のペア)</li>
    <li>最後の行は全データ量子ビットの直接測定から求めた完全なシンドローム</li></ul>
    <div class="goal"><b>操作:</b> 検出イベント(橙の点)を2つずつクリックしてペアにします。左右の端の帯をクリックすると境界とペアになります。全イベントをペアにしたら判定。縦の距離(時間)も横の距離(空間)も重み1として、<b>合計の長さが最小</b>になるペアリング(MWPM)を探しましょう。</div>
    <p>横方向の線分がデータ量子ビットへの訂正になります。縦の線は「測定エラーだった」という解釈で、訂正は不要です。</p>
    <p>これが Google の実験 (2021, 2023, 2025) で実際に行われている<b>時空間 (space-time) デコード</b>です。サーフェスコードでは3次元(2次元空間+時間)のマッチングになります。</p>`,
    refs: ['google21', 'dennis02', 'edmonds65', 'higgott23'],
  });

  // ---------------- Chapter 2 ----------------
  L.push({
    id: '2-1', chap: 1, title: '[[5,1,3]] 完全符号 (非CSS)', code: 'five',
    noise: { type: 'depol', mode: 'count', count: 1 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>2-1 最小の量子符号 [[5,1,3]]</h2>
    <p>スタビライザー生成元は <code>XZZXI</code> の巡回シフト 4 つ。X と Z が混ざった<b>非 CSS 符号</b>です。</p>
    <p>1量子ビットエラーは 5 量子ビット × 3 種類 = 15 通り。シンドロームは 4 ビット = 16 通り(エラーなし含む)。ちょうど一致するので<b>完全符号</b>(量子ハミング限界を等号で満たす)です。任意の1量子ビットエラーを訂正できる最小の符号です。</p>
    <div class="goal">各チェックの辺に書かれた文字が、その量子ビットに作用するパウリです。エラー P がチェックの文字と<b>反可換</b>(異なる非単位元のパウリ)のときチェックが光ります。</div>
    <table><tr><th></th><th>X</th><th>Y</th><th>Z</th></tr><tr><th>X</th><td>可換</td><td>反</td><td>反</td></tr><tr><th>Z</th><td>反</td><td>反</td><td>可換</td></tr></table>
    <p>記法 [[n,k,d]]: n 物理量子ビット, k 論理量子ビット, 符号距離 d。</p>`,
    refs: ['laflamme96', 'bennett96', 'gottesman97'],
  });
  L.push({
    id: '2-2', chap: 1, title: 'Steane 符号 [[7,1,3]] (CSS)', code: 'steane',
    noise: { type: 'depol', mode: 'count', count: 1 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>2-2 CSS 符号: Steane [[7,1,3]]</h2>
    <p>古典 [7,4,3] ハミング符号の検査行列 H を、X 型にも Z 型にも使います: H<sub>X</sub> = H<sub>Z</sub> = H。CSS 符号の条件 H<sub>X</sub>H<sub>Z</sub><sup>T</sup> = 0 を満たすのでスタビライザーが可換になります。</p>
    <p>X エラーと Z エラーを<b>独立に</b>デコードできるのが CSS 符号の利点。各面(4量子ビット)に X 型と Z 型のチェックが1つずつあります。</p>
    <div class="goal">各面の左の青●が X 型チェック、右の橙■が Z 型チェック。3つの面の光り方のパターン(3ビット)は量子ビットごとにすべて異なります — ハミング符号が1ビットエラーの位置を特定できるのと同じ理由です。</div>
    <p>Steane 符号は <b>d=3 の2次元カラーコード</b>でもあり、全クリフォード演算(H, S, CNOT)を<b>トランスバーサル</b>に実行できます。中性原子 (Bluvstein et al. 2024) やイオントラップでの論理量子ビット実験に使われています。</p>`,
    refs: ['steane96', 'cs96', 'bluvstein24'],
  });

  // ---------------- Chapter 3 ----------------
  L.push({
    id: '3-1', chap: 2, title: '回転サーフェスコード d=3', code: 'surf3',
    noise: { type: 'depol', mode: 'count', count: 1 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>3-1 サーフェスコード</h2>
    <p>2次元格子に量子ビットを並べ、<b>隣接する4量子ビットだけ</b>のチェック(プラケット)を測ります。局所的な相互作用だけで済むので超伝導量子ビットに最適で、Google や IBM の主力です。</p>
    <ul><li>青のプラケット: X⊗4 (Z エラー検出)</li><li>橙のプラケット: Z⊗4 (X エラー検出)</li><li>端の半円: 重み2の境界チェック</li></ul>
    <p>回転サーフェスコードは d×d = d² 個のデータ量子ビットで距離 d (Bombin & Martin-Delgado 2007, Horsman et al. 2012)。実機では d²−1 個の補助量子ビットを加えて合計 2d²−1 個 (d=3 で 17 個)。</p>
    <div class="goal">「論理演算子」ボタンで X̄ (横断する X の列) と Z̄ を表示できます。どちらも盤面を端から端まで横切る重み d の文字列です。</div>`,
    refs: ['kitaev03', 'dennis02', 'bombin07', 'fowler12'],
  });
  L.push({
    id: '3-2', chap: 2, title: 'd=5: エラー連鎖とマッチング', code: 'surf5',
    noise: { type: 'depol', mode: 'count', count: 2 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>3-2 エニオンとマッチング</h2>
    <p>サーフェスコードでは、エラーの<b>鎖の端点</b>だけでチェックが光ります(トーリック符号ではこれを<b>エニオン</b>と呼びます)。X エラー鎖の端は橙のチェック、Z エラー鎖の端は青のチェックに現れます。</p>
    <p>デコーダの仕事は「光ったチェックを短い鎖で結ぶ(または境界に逃がす)」こと。これを<b>最小重み完全マッチング (MWPM)</b>で解くのが標準手法です (Dennis et al. 2002; Edmonds のブロッサム法)。</p>
    <div class="goal">訂正の鎖と実際のエラー鎖が合わさって<b>閉じたループ</b>(スタビライザーの積)になれば成功。盤面を<b>横断</b>してしまうと論理エラーです。</div>
    <p>ビット反転ノイズ・完全測定での最適しきい値は約 10.9%、MWPM では約 10.3% (Dennis et al.; Wang, Harrington, Preskill)。</p>`,
    refs: ['dennis02', 'edmonds65', 'higgott23'],
  });
  L.push({
    id: '3-3', chap: 2, title: 'd=7: Google Willow の論理量子ビット', code: 'surf7',
    noise: { type: 'depol', mode: 'iid', p: 0.035 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>3-3 しきい値以下の誤り訂正</h2>
    <p>2024 年、Google の Willow プロセッサ (105 量子ビット) は d=3, 5, 7 の回転サーフェスコードで、距離を 2 増やすごとに論理エラー率が <b>Λ ≈ 2.14 倍</b>小さくなることを示しました。d=7 は 49 データ量子ビット + 48 測定量子ビット (+ リーク除去用) の 101 量子ビットで、1サイクルあたりの論理エラー率は約 0.143%。最良の物理量子ビットより長寿命な「break-even を超えた」論理メモリです。</p>
    <p>このステージは各量子ビットが独立に p = 3.5% で脱分極エラーを起こします。エラーの個数は毎回ランダム。</p>
    <div class="goal">エラーが多いときは、デコーダと同じ判断ができれば合格(避けられない失敗)。リアルタイムに毎サイクル (~1μs) これを行うデコーダが実機のボトルネックの一つです。</div>`,
    refs: ['google25', 'google23', 'fowler12'],
  });
  L.push({
    id: '3-4', chap: 2, title: 'XZZX サーフェスコード: バイアスノイズ', code: 'xzzx5',
    noise: { type: 'biasZ', mode: 'count', count: 4, eta: 100 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>3-4 XZZX サーフェスコード (2021)</h2>
    <p>多くの量子ビット (猫量子ビット、一部のスピン量子ビットなど) では Z エラーが X エラーより桁違いに起こりやすい<b>バイアスノイズ</b>です。</p>
    <p>XZZX 符号は、サーフェスコードの片方の副格子にアダマールをかけたもの: 全チェックが <code>X Z Z X</code> 型になります(緑)。Z エラーだけが起きる極限では、符号は<b>斜め方向の反復符号の束</b>に帰着し、実効距離が大きく伸びます。</p>
    <div class="goal">今回は Z エラーが 4 個 (η = p<sub>Z</sub>/(p<sub>X</sub>+p<sub>Y</sub>) = 100)。通常の d=5 サーフェスコードなら t=2 個までしか保証されませんが、XZZX ではほぼ訂正できます。プラケットの角の文字が各量子ビットに作用するパウリです。</div>
    <p>Bonilla Ataides らは無限バイアスでしきい値 50%(ハッシング限界に到達)を示しました。</p>`,
    refs: ['xzzx21'],
  });

  // ---------------- Chapter 4 ----------------
  L.push({
    id: '4-1', chap: 3, title: '6.6.6 カラーコード d=5 [[19,1,5]]', code: 'color5',
    noise: { type: 'depol', mode: 'count', count: 2 }, rounds: 4, tools: [1, 2, 3],
    html: `<h2>4-1 2次元カラーコード</h2>
    <p>3色で塗り分けられる六角形タイル (6.6.6 格子) の頂点に量子ビットを置き、各面に X 型と Z 型のチェックを1つずつ置きます (Bombin & Martin-Delgado 2006)。隣接する面は常に2量子ビット(偶数)を共有するので可換です。</p>
    <ul><li>三角形パッチ d=3 → [[7,1,3]] (Steane), d=5 → [[19,1,5]], d=7 → [[37,1,7]]</li>
    <li>すべてのクリフォードゲートがトランスバーサル → 論理演算が軽い</li>
    <li>1つのエラーが最大3つの面を光らせる。マッチングでは直接解けず、デコードはサーフェスコードより難しい</li></ul>
    <div class="goal">各面の青●= X 型チェック、橙■= Z 型チェック。1量子ビットのエラーは、それを含む(最大3つの)面を光らせます。</div>
    <p>Google (Lacroix et al. 2025) は超伝導量子ビットでカラーコード d=3→5 で論理エラーを Λ<sub>3/5</sub> ≈ 1.56 倍抑制し、トランスバーサル論理ゲートやマジック状態注入を実証しました。</p>`,
    refs: ['bombin06', 'lacroix25', 'bluvstein24'],
  });
  L.push({
    id: '4-2', chap: 3, title: 'カラーコード d=7 [[37,1,7]]', code: 'color7',
    noise: { type: 'depol', mode: 'count', count: 3 }, rounds: 3, tools: [1, 2, 3],
    html: `<h2>4-2 大きなカラーコード</h2>
    <p>d=7, 37 量子ビット。3 個のエラーまで必ず訂正可能。サーフェスコード d=7 (49 量子ビット) より少ない量子ビットで同じ距離を実現します。</p>
    <div class="goal">ヒント: 1 つの X エラーは、そのビットを含む面の<b>Z 型チェック</b>(橙)をすべて光らせます。3 面が光る点 = 内部の量子ビット、2 面 = 境界、1 面 = 角。</div>
    <p>カラーコードのデコーダには、制限付きデコーダ (restriction decoder)、Möbius デコーダ、連接 MWPM などがあります。このゲームは最小重み全探索で厳密解を計算しています。</p>`,
    refs: ['bombin06', 'lacroix25'],
  });

  // ---------------- Chapter 5 ----------------
  L.push({
    id: '5-1', chap: 4, title: 'ハイパーグラフ積: 反復符号 ⊗ 反復符号', code: 'hgpRep',
    noise: { type: 'depol', mode: 'count', count: 1 }, rounds: 3, tools: [1, 2, 3],
    html: `<h2>5-1 ハイパーグラフ積 (Tillich & Zémor 2009)</h2>
    <p>任意の2つの古典符号 H<sub>1</sub> (m<sub>1</sub>×n<sub>1</sub>), H<sub>2</sub> から量子 CSS 符号を作る構成:</p>
    <p><code>H<sub>X</sub> = [H<sub>1</sub>⊗I | I⊗H<sub>2</sub><sup>T</sup>]</code><br><code>H<sub>Z</sub> = [I⊗H<sub>2</sub> | H<sub>1</sub><sup>T</sup>⊗I]</code></p>
    <p>H<sub>X</sub>H<sub>Z</sub><sup>T</sup> = H<sub>1</sub>⊗H<sub>2</sub><sup>T</sup> + H<sub>1</sub>⊗H<sub>2</sub><sup>T</sup> = 0 (mod 2) なので必ず CSS 条件を満たします。</p>
    <div class="goal">3ビット反復符号同士の積は、(回転していない) [[13,1,3]] サーフェスコードそのものです。左上の 3×3 ブロックと右下の 2×2 ブロックが量子ビット、その他がチェック。</div>
    <p>qLDPC 符号はこの「古典符号の積」という発想から大きく発展しました。</p>`,
    refs: ['tillich14', 'breuckmann21'],
  });
  L.push({
    id: '5-2', chap: 4, title: 'HGP(ハミング⊗ハミング) [[58,16,3]]', code: 'hgpHam',
    noise: { type: 'X', mode: 'count', count: 1 }, rounds: 3, tools: [1],
    html: `<h2>5-2 高レートの qLDPC 符号</h2>
    <p>[7,4,3] ハミング符号同士のハイパーグラフ積。k = k<sub>1</sub>k<sub>2</sub> + k<sub>1</sub><sup>T</sup>k<sub>2</sub><sup>T</sup> = 4·4 + 0 = <b>16 論理量子ビット</b>を 58 物理量子ビットに詰め込みます(距離 3 のサーフェスコード 16 個なら 9×16 = 144 データ量子ビット)。</p>
    <p>各チェックの重みは最大 4+3=7、各量子ビットが参加するチェック数も有界 → <b>低密度パリティ検査 (LDPC)</b>。ただしチェックは平面上で局所的ではありません。</p>
    <div class="goal">今回は X エラーのみ (Z 型チェック=橙が光ります)。チェックや量子ビットにマウスを乗せる(タップする)とつながりが表示されます。光ったチェックの共通の量子ビットを探しましょう。</div>
    <p>16 個の論理量子ビットのうち、どれが反転したかも判定に表示されます。</p>`,
    refs: ['tillich14', 'breuckmann21'],
  });
  L.push({
    id: '5-3', chap: 4, title: '二変数バイシクル符号 [[72,12,6]]', code: 'bb72',
    noise: { type: 'X', mode: 'count', count: 2 }, rounds: 3, tools: [1],
    html: `<h2>5-3 Bivariate Bicycle (BB) 符号 — IBM 2024</h2>
    <p>ℓ×m トーラス上の巡回シフト x = S<sub>ℓ</sub>⊗I<sub>m</sub>, y = I<sub>ℓ</sub>⊗S<sub>m</sub> の多項式</p>
    <p><code>A = x³ + y + y²,  B = y³ + x + x²</code> (ℓ = m = 6)</p>
    <p>から <code>H<sub>X</sub> = [A | B]</code>, <code>H<sub>Z</sub> = [B<sup>T</sup> | A<sup>T</sup>]</code>。A と B は可換なので H<sub>X</sub>H<sub>Z</sub><sup>T</sup> = AB + BA = 0。</p>
    <ul><li>各チェックの重みは 6、各量子ビットは 6 個のチェックに参加</li>
    <li>トーラス上で各セルに L, R 2 量子ビット + X, Z チェック。6 本の辺のうち 4 本は近接、2 本は長距離 → 2 層の配線で実装可能 (thickness-2)</li>
    <li>[[72,12,6]]: 12 論理量子ビット、距離 6</li></ul>
    <div class="goal">X エラー 2 個。光った橙チェック(各エラーで最大 3 個)の共通の量子ビットを探します。L/R の量子ビットに触れると、それにつながるチェックが表示されます。トーラスなので端は反対側とつながっています。</div>`,
    refs: ['bravyi24', 'kovalev13', 'panteleev21'],
  });
  L.push({
    id: '5-4', chap: 4, title: 'グロス符号 [[144,12,12]] (ボス)', code: 'gross',
    noise: { type: 'X', mode: 'count', count: 3 }, rounds: 3, tools: [1],
    html: `<h2>5-4 グロス符号 (gross = 144)</h2>
    <p>同じ A, B で ℓ=12, m=6。<b>144 データ量子ビット + 144 チェック量子ビット = 288 量子ビット</b>で、12 論理量子ビットを距離 12 で保護します。同じ性能をサーフェスコードで得るには約 3000 量子ビット必要で、<b>約 10 倍の効率</b>です (Bravyi et al., Nature 2024)。</p>
    <p>IBM はこの符号をベースにしたフォールトトレラント量子コンピュータのアーキテクチャ (“Tour de gross”, 2025) を発表しています。</p>
    <div class="goal">X エラー 3 個。人間には大変です! 行き詰まったら「ヒント」でデコーダ (BP+OSD) の答えを見られます。BP は LDPC 符号の標準的なデコーダですが、量子符号では縮退や短いループのため収束しないことがあり、OSD (順序統計デコード) で補います。</div>`,
    refs: ['bravyi24', 'yoder25', 'panteleev21', 'roffe20'],
  });

  const FREE_CODES = [
    ['rep5', 'ビット反転反復符号 [5,1,5]'], ['phase5', '位相反転反復符号 [5,1,5]'], ['rep7', 'ビット反転反復符号 [7,1,7]'],
    ['shor9', 'Shor [[9,1,3]]'], ['five', '完全符号 [[5,1,3]]'], ['steane', 'Steane [[7,1,3]]'],
    ['surf3', 'サーフェスコード d=3 [[9,1,3]]'], ['surf5', 'サーフェスコード d=5 [[25,1,5]]'], ['surf7', 'サーフェスコード d=7 [[49,1,7]]'],
    ['xzzx5', 'XZZX サーフェスコード d=5'], ['xzzx7', 'XZZX サーフェスコード d=7'],
    ['color5', 'カラーコード d=5 [[19,1,5]]'], ['color7', 'カラーコード d=7 [[37,1,7]]'],
    ['hgpRep', 'HGP(反復⊗反復) [[13,1,3]]'], ['hgpHam', 'HGP(ハミング⊗ハミング) [[58,16,3]]'],
    ['bb72', 'BB符号 [[72,12,6]]'], ['bb90', 'BB符号 [[90,8,10]]'], ['bb108', 'BB符号 [[108,8,10]]'], ['gross', 'グロス符号 [[144,12,12]]'],
  ];

  const REF_PAGE = `
  <h2>解説: このゲームで「本物」になっているところ</h2>
  <p>盤面上の符号はすべて論文の定義どおりに生成され、スタビライザーの可換性、論理量子ビット数 k = n − rank(S)、小さな符号の距離 d を、
  GF(2) 線形代数で検証しています (<code>qec/test.js</code>)。</p>
  <ul>
    <li><b>シンドローム</b>: 各スタビライザー生成元とエラーのシンプレクティック内積 s = S·Λ·e (mod 2)。</li>
    <li><b>判定</b>: 残差 R = (エラー)·(あなたの訂正) のシンドロームが 0 で、かつ R がスタビライザー群に含まれる (rank 判定) なら成功。含まれなければ<b>論理エラー</b>で、どの論理量子ビットの X̄/Z̄ が反転したかを、シンプレクティック・グラム-シュミットで作った論理演算子基底から求めます。</li>
    <li><b>デコーダ</b>: 小さな符号は最小コスト (= 最尤に近い) のパウリを全探索。大きな符号は 2 値 BP (正規化 min-sum) + OSD-CS (Panteleev & Kalachev 2021; Roffe et al. 2020)。時空間反復符号はビットマスク DP による厳密な最小重み完全マッチング。</li>
    <li><b>ノイズ</b>: 符号容量ノイズ (データ量子ビットのみ、測定は完全) が基本。1-6 だけ測定エラーを含む現象論的ノイズ。実機の回路レベルノイズ (ゲート・リーク・クロストーク) は含みません。</li>
  </ul>
  <h3>符号の一覧</h3>
  <table class="reftable">
  <tr><th>符号</th><th>[[n,k,d]]</th><th>構成</th></tr>
  <tr><td>反復符号</td><td>[d,1,d] (古典)</td><td>Z<sub>i</sub>Z<sub>i+1</sub></td></tr>
  <tr><td>Shor</td><td>[[9,1,3]]</td><td>反復符号の連接</td></tr>
  <tr><td>完全符号</td><td>[[5,1,3]]</td><td>XZZXI の巡回シフト</td></tr>
  <tr><td>Steane</td><td>[[7,1,3]]</td><td>CSS(ハミング, ハミング)</td></tr>
  <tr><td>回転サーフェスコード</td><td>[[d²,1,d]]</td><td>重み4のプラケット + 重み2の境界</td></tr>
  <tr><td>XZZX</td><td>[[d²,1,d]]</td><td>サーフェスコードに副格子アダマール</td></tr>
  <tr><td>6.6.6 カラーコード</td><td>[[(3d²+1)/4,1,d]]</td><td>三色六角格子の三角形パッチ</td></tr>
  <tr><td>ハイパーグラフ積</td><td>[[58,16,3]] など</td><td>H<sub>1</sub>, H<sub>2</sub> の積</td></tr>
  <tr><td>BB 符号</td><td>[[72,12,6]], [[90,8,10]], [[108,8,10]], [[144,12,12]]</td><td>A, B ∈ F<sub>2</sub>[x,y]/(x<sup>ℓ</sup>−1, y<sup>m</sup>−1)</td></tr>
  </table>
  <h3>その他の最新の話題 (ゲーム外)</h3>
  <ul>
    <li><b>漸近的に良い qLDPC 符号</b> (Panteleev & Kalachev 2022): k と d が n に比例する LDPC 符号が存在。量子タナー符号など。</li>
    <li><b>リフト積 (Lifted product) 符号</b>と中性原子での定数オーバーヘッドの FTQC (Xu et al. 2024)。</li>
    <li><b>フロケ (Floquet) 符号</b> (Hastings & Haah 2021): 2量子ビット測定の周期的な列で論理量子ビットが動的に生成される。</li>
  </ul>
  <h3>文献</h3>`;

  root.QEC_LEVELS = { REFS, LEVELS: L, CHAPTERS, FREE_CODES, REF_PAGE };
})(typeof window !== 'undefined' ? window : globalThis);
