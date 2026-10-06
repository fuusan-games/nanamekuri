// ふーさん同士の自動対戦。 node test/sim.js [games=2000] [seed=7]
const L = require('../logic.js');
const N = +(process.argv[2] || 2000), SEED = +(process.argv[3] || 7);
const LV = ['weak', 'normal', 'strong', 'ultra'], JP = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ' };
const rng = L.mulberry(SEED);
function pair(a, b) {
  let wa = 0, wb = 0, rounds = 0;
  for (let i = 0; i < N; i++) {
    const S = L.simGame([a, b], rng, { dealer: i % 2 });   // 先の親を交互に
    rounds += S.round; if (S.winner === 0) wa++; else if (S.winner === 1) wb++;
  }
  return { wa, wb, rounds: rounds / N };
}
const t0 = Date.now(), rows = [];
for (let i = 0; i < LV.length; i++) for (let j = i + 1; j < LV.length; j++) {
  const r = pair(LV[j], LV[i]);
  const line = `${JP[LV[j]]} vs ${JP[LV[i]]}: ${r.wa}-${r.wb}  (${(100 * r.wa / N).toFixed(1)}%)  平均${r.rounds.toFixed(1)}ラウンド`;
  console.log(line); rows.push(line);
}
// 4人戦（全レベル1人ずつ・席を回す）
const w4 = { weak: 0, normal: 0, strong: 0, ultra: 0 };
for (let i = 0; i < N; i++) {
  const seats = LV.slice(i % 4).concat(LV.slice(0, i % 4));
  const S = L.simGame(seats, rng, { dealer: 0 });
  w4[seats[S.winner]]++;
}
console.log('4人戦（各レベル1人）: ' + LV.map(l => `${JP[l]} ${(100 * w4[l] / N).toFixed(1)}%`).join(' / '));
console.log(`(${N} games each, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
