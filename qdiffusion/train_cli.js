// node qdiffusion/train_cli.js [additive|reupload] [steps] [lr]
const { Model, encode } = require('./qdlm.js');
const corpus = Int32Array.from(encode(require('./corpus.js')));
const mode = process.argv[2] || 'additive', steps = +process.argv[3] || 3000, lr0 = +process.argv[4] || 0.002;
const m = new Model({ seed: 1, mode });
console.log(`mode=${mode} gates/block=${m.G} params=${m.W.length} corpus=${corpus.length} chars`);
console.log('init eval NLL', m.evalLoss(corpus).toFixed(3), '(uniform', Math.log(m.V).toFixed(3) + ')');
for (let s = 1; s <= steps; s++) {
  m.trainBatch(corpus, { lr: lr0 * 0.5 * (1 + Math.cos(Math.PI * s / steps)) });
  if (s % 500 === 0) console.log('step', s, 'eval NLL', m.evalLoss(corpus).toFixed(3));
}
for (let k = 0; k < 3; k++) {
  const frames = m.generate(80, { temperature: 0.7 });
  console.log(JSON.stringify(frames[frames.length - 1]));
}
