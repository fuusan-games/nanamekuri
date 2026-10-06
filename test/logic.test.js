/* ななめくり ルールテスト： node test/logic.test.js */
var L = require('../logic.js');
var passed = 0, failed = 0;
function ok(c, m) { if (c) passed++; else { failed++; console.error('FAIL: ' + m); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
// order[0] が最初に引かれる。残りの山札は「取り除いた」扱い（捨て札にも入れない）
function game(n, order, dealer) { var S = L.newGame(n, { dealer: dealer == null ? n - 1 : dealer, rng: L.mulberry(1) }); S.deck = order.slice().reverse(); L.startRound(S); return S; }
function run(S) { var g = 0; while (S.phase === 'play' && !S.need && g++ < 500) L.step(S); return S.need; }
function total(S) { var c = S.deck.length + S.discard.length; S.P.forEach(function (P) { c += P.nums.length + P.mods.length + P.acts.length + (P.bust !== null ? 1 : 0) + (P.sc ? 1 : 0); }); S.jobs.forEach(function (j) { if (j.t === 'f3') c += 1 + j.aside.length; else if (j.t === 'handout') c += j.cards.length; else if (j.card) c++; }); return c; }

// ---- 山札 94枚 ----
(function () {
  var d = L.fullDeck(); ok(d.length === 94, '山札は94枚');
  var c = {}; d.forEach(function (x) { c[x] = (c[x] || 0) + 1; });
  ok(c[0] === 1 && c[1] === 1 && c[7] === 7 && c[12] === 12, '数字 n は n枚（0は1枚）');
  ok(['p2', 'p4', 'p6', 'p8', 'p10', 'x2'].every(function (m) { return c[m] === 1; }), 'おまけ +2〜+10 と ×2 は各1枚');
  ok(c.fz === 3 && c.f3 === 3 && c.sc === 3, 'こおり・3まいドン・おまもり 各3枚');
})();
// ---- 得点 ----
(function () {
  ok(L.rowScore([11, 5, 12], ['p4'], false) === 32, '11+5+12 に +4 で 32点（公式の例）');
  ok(L.rowScore([10, 12, 6, 8], ['x2', 'p10'], false) === 82, '×2 は数字だけを倍（36×2+10=82）');
  ok(L.rowScore([], ['p2', 'p6', 'x2'], false) === 8, '数字なしでも＋おまけは入る（×2は0）');
  ok(L.rowScore([0, 1, 2, 3, 4, 5, 6], [], true) === 36, '7種そろうと +15');
  var P = { nums: [5, 6], mods: ['p10'], sc: 0, acts: [], st: 'bust', bust: 5 };
  ok(L.curScore(P) === 0, 'ドボンはおまけがあっても0点');
})();
// ---- 配る・かぶったらドボン ----
(function () {
  var S = game(3, [5, 7, 9, 5]);   // 親=2 → 0,1,2 の順に配る
  var nd = run(S);
  ok(eq(S.P.map(function (P) { return P.nums; }), [[5], [7], [9]]), '親の左から1枚ずつ表向きに配る');
  ok(nd && nd.kind === 'hit' && nd.p === 0, '配り終えたら親の左から「めくる／とめる」');
  ok(L.decide(S, 1, 'hit') !== null, '手番でない人は選べない');
  L.decide(S, 0, 'hit');
  ok(S.P[0].st === 'bust' && S.P[0].bust === 5, '同じ数字を引くとドボン');
  nd = run(S); ok(nd.p === 1, 'ドボンした人の次へ');
})();
// ---- とめる（カードが無いと不可） ----
(function () {
  var S = game(3, ['fz', 3, 4, 8]);
  var nd = run(S);   // 0番が こおり を引いた → 相手選び
  ok(nd.kind === 'target' && nd.card === 'fz' && eq(nd.opts, [0, 1, 2]), '配りでこおり → すぐ使う（自分も含め誰でも）');
  L.decide(S, 0, 2);   // まだ配られていない2番を こおりに
  run(S);
  ok(S.P[2].st === 'frozen' && S.P[2].nums.length === 0, 'まだ配られていない人も こおりにできる（FAQ）');
  ok(eq(S.P[1].nums, [3]), '配りの続き');
  nd = S.need; ok(nd.kind === 'hit' && nd.p === 0, '2番は飛ばしてめくり番へ');
  ok(L.decide(S, 0, 'stay') !== null, 'カードが1枚もないと とめられない');
  L.decide(S, 0, 'hit'); ok(eq(S.P[0].nums, [4]), 'めくれる');
})();
// ---- おまもり ----
(function () {
  var S = game(2, ['sc', 4, 4, 6], 1);   // 0:sc 1:4 → 0 は 4? → 0が引くのは 4? 順番： 0←sc, 1←4, 0 hit←4
  run(S); ok(S.P[0].sc === 1, 'おまもりは持っておく');
  L.decide(S, 0, 'hit'); ok(eq(S.P[0].nums, [4]), '数字を引く');
  run(S); L.decide(S, 1, 'stay'); run(S);
  S.deck.push(4);   // 次に 4 を引く
  L.decide(S, 0, 'hit');
  ok(S.P[0].st === 'active' && S.P[0].sc === 0 && eq(S.P[0].nums, [4]), 'かぶってもおまもりで助かる');
  ok(S.discard.indexOf(4) >= 0 && S.discard.indexOf('sc') >= 0, 'かぶった数字とおまもりは捨て札へ');
  var nd = run(S); ok(nd && nd.p === 0, 'おまもりを使ったら手番は終わり（2人目は とめた ので再び0）');
})();
(function () {
  var S = game(3, ['sc', 3, 'sc', 'sc'], 2);   // 0:sc,1:3,2:sc → 2は持っていないので保持
  run(S); ok(S.P[0].sc && S.P[2].sc, '各自1枚ずつ保持');
  S.deck.push('sc'); var nd = S.need; L.decide(S, 0, 'hit');
  nd = run(S);
  ok(S.P[1].sc === 1, '2枚目のおまもりは、持っていない人へ（1人なら自動）');
  S.deck.push('sc'); L.decide(S, 1, 'hit'); run(S);
  ok(S.discard.indexOf('sc') >= 0, '全員持っているときは捨て札');
})();
// ---- 7種そろい ----
(function () {
  var S = game(2, [0, 12, 1, 2, 3, 4, 5, 6], 1);
  run(S);
  for (var i = 0; i < 6; i++) { L.decide(S, 0, 'hit'); run(S); if (S.phase !== 'play') break; L.decide(S, 1, 'stay'); run(S); }
  ok(S.phase === 'roundEnd' && S.flip7 === 0, '7種そろうとラウンド終了');
  ok(S.result.pts[0] === 0 + 1 + 2 + 3 + 4 + 5 + 6 + 15 && S.result.pts[1] === 12, '7種 +15、ほかの人は手元の点');
})();
// ---- 3まいドン ----
(function () {
  // 0:f3 → 1 に → 1 は 3枚 (2, 'fz', 2?) …
  var S = game(3, ['f3', 7, 'fz', 9, 8, 6], 2);
  var nd = run(S); ok(nd.kind === 'target' && nd.card === 'f3', '配りで3まいドン → すぐ使う');
  L.decide(S, 0, 1); nd = run(S);
  ok(eq(S.P[1].nums, [7, 9]) && S.need && S.need.kind === 'target' && S.need.card === 'fz' && S.need.p === 1, '3枚めくった後、途中のこおりを配る（3枚に数える）');
  L.decide(S, 1, 0); run(S);
  ok(S.P[0].st === 'frozen', '途中で出たこおりは3枚の後に解決');
  ok(S.need && S.need.kind === 'hit' && S.need.p === 1 && S.need.deal, '配りの続き：すでにカードがある1番は「めくる／とめる」');
  L.decide(S, 1, 'stay'); run(S);
  ok(eq(S.P[2].nums, [8]) && S.need.kind === 'hit' && S.need.p === 2, '2番に配り、めくり番は親の左から（0は こおり、1は とめた）');
})();
(function () {
  var S = game(2, [5, 6, 'f3', 'f3', 5, 2], 1);
  run(S); L.decide(S, 0, 'hit'); var nd = run(S);
  ok(nd.kind === 'target' && nd.card === 'f3', '手番で3まいドン');
  L.decide(S, 0, 0); run(S);
  ok(S.P[0].st === 'bust' && eq(S.P[0].nums, [5]) && S.P[0].bust === 5, '3まいドン中にかぶるとその場でドボン');
  ok(S.discard.filter(function (c) { return c === 'f3'; }).length === 2, '取っておいた3まいドンもドボンで捨て札');
})();
(function () {   // 3まいドン中のおまもりはすぐ使える
  var S = game(2, [5, 6, 'f3', 'sc', 5, 9], 1);
  run(S); L.decide(S, 0, 'hit'); run(S); L.decide(S, 0, 0); run(S);
  ok(S.P[0].st === 'active' && eq(S.P[0].nums, [5, 9]) && !S.P[0].sc, '3まいドン中に引いたおまもりで、続くかぶりを防げる');
})();
(function () {   // 7種そろいで3まいドン終了
  var S = game(2, [0, 12, 1, 2, 3, 4, 'f3', 5, 6, 7], 1);
  run(S);
  for (var i = 0; i < 4; i++) { L.decide(S, 0, 'hit'); run(S); L.decide(S, 1, 'stay'); run(S); }
  ok(eq(S.P[0].nums, [0, 1, 2, 3, 4]), '準備');
  L.decide(S, 0, 'hit'); run(S);
  ok(S.phase === 'roundEnd' && S.flip7 === 0 && S.P[0].nums.length === 7 && S.deck[S.deck.length - 1] === 7, '3まいドン中でも7種そろったら即終了（残りはめくらない）');
})();
(function () {   // ひとりしか残っていないと自分に
  var S = game(2, [3, 4, 'f3', 8, 9, 10], 1);
  run(S); L.decide(S, 0, 'stay'); run(S); L.decide(S, 1, 'hit'); run(S);
  ok(eq(S.P[1].nums, [4, 8, 9, 10]), '残り1人なら3まいドンは自分に（自動）');
})();
(function () {   // 3まいドンを渡したあと、次は「引いた人」の左
  var S = game(4, [1, 2, 3, 4, 'f3', 9, 10, 11], 3);
  run(S); L.decide(S, 0, 'hit'); var nd = run(S); L.decide(S, 0, 2); nd = run(S);
  ok(eq(S.P[2].nums, [3, 9, 10, 11]) && nd.p === 1, '3まいドンの後は、引いた人の次（1番）が手番');
})();
(function () {   // FAQ 13a：こおり→3まいドンを同じ人に → 3まいドンは不発
  var S = game(3, [1, 2, 3, 'f3', 'fz', 'f3', 4, 5, 6], 2);
  run(S); L.decide(S, 0, 'hit'); run(S); L.decide(S, 0, 0); var nd = run(S);   // 0が自分に3まいドン → fz, f3, 4
  ok(eq(S.P[0].nums, [1, 4]) && nd.kind === 'target' && nd.card === 'fz', '取っておいた2枚を順に配る');
  L.decide(S, 0, 1); nd = run(S); ok(nd.card === 'f3', '2枚目');
  L.decide(S, 0, 1); run(S);
  ok(S.P[1].st === 'frozen' && eq(S.P[1].nums, [2]), 'こおり（先）の後の3まいドンは不発');
  ok(S.ev.some(function (e) { return e.kind === 'fizzle'; }), '不発のイベント');
})();
(function () {   // FAQ 15：配られる前に3まいドンを受けた人は めくる／とめる を選べる
  var S = game(3, ['f3', 5, 6, 7, 9], 2);
  run(S); L.decide(S, 0, 1); var nd = run(S);
  ok(eq(S.P[1].nums, [5, 6, 7]) && nd.kind === 'hit' && nd.p === 1 && nd.deal, '配り番で「めくる／とめる」を聞かれる');
  L.decide(S, 1, 'stay'); run(S);
  ok(S.P[1].st === 'stay' && eq(S.P[2].nums, [9]), 'とめてもOK・配りは続く');
})();
// ---- ラウンド終了・山札の引き継ぎ・切り直し ----
(function () {
  var S = L.newGame(3, { dealer: 0, rng: L.mulberry(3) }); L.startRound(S);
  var rng = L.mulberry(4), n = 0;
  while (S.phase === 'play' && n++ < 999) { if (S.need) L.decide(S, S.need.p, L.aiDecide(S, S.need.p, 'normal', rng)); else L.step(S); }
  var deckLeft = S.deck.length, top = S.deck[S.deck.length - 1];
  ok(total(S) === 94, 'ラウンド終了時も94枚');
  L.nextRound(S);
  ok(S.dealer === 1, '親は左隣へ');
  ok(S.P.every(function (P) { return P.nums.length + P.mods.length + P.acts.length === 0; }) && S.deck.length === deckLeft && S.deck[S.deck.length - 1] === top, '捨て札は切り直さず、残りの山札をそのまま使う');
  ok(S.discard.length === 94 - deckLeft, '場のカードは捨て札へ');
})();
(function () {
  var S = game(2, [3, 4], 1); S.discard = [8, 9, 10];
  run(S); L.decide(S, 0, 'hit');
  ok(S.reshuffles === 1 && S.discard.length === 0 && S.P[0].nums.length === 2 && S.P[1].nums.length === 1, '山札が尽きたら捨て札だけを切って新しい山札に（場のカードはそのまま）');
})();
// ---- ゲーム終了 ----
(function () {
  var S = game(3, [10, 3, 4], 2); S.scores = [195, 150, 100];
  run(S); L.decide(S, 0, 'stay'); run(S); L.decide(S, 1, 'stay'); run(S); L.decide(S, 2, 'stay'); run(S);
  ok(S.phase === 'over' && S.winner === 0, '200点以上で単独トップなら終了');
  var T = game(2, [10, 5], 1); T.scores = [195, 200];
  run(T); L.decide(T, 0, 'stay'); run(T); L.decide(T, 1, 'stay'); run(T);
  ok(T.phase === 'roundEnd' && T.tie, '200点以上で同点なら、全員でもう1ラウンド');
})();
// ---- ランダム対戦：枚数保存・不正手なし・ズルなし ----
(function () {
  var rng = L.mulberry(11), bad = 0, games = 0, illegal = 0;
  var lvs = ['weak', 'normal', 'strong', 'ultra'];
  for (var g = 0; g < 300; g++) {
    var n = 2 + (g % 7), lv = []; for (var i = 0; i < n; i++) lv.push(lvs[(g + i) % 4]);
    var S = L.newGame(n, { rng: rng }); L.startRound(S); var guard = 0;
    while (S.phase !== 'over' && guard++ < 50000) {
      if (S.phase === 'play') { if (S.need) { if (L.decide(S, S.need.p, L.aiDecide(S, S.need.p, lv[S.need.p], rng), rng)) illegal++; } else L.step(S, rng); }
      else L.nextRound(S);
      if (total(S) !== 94) bad++;
    }
    if (S.phase === 'over') games++;
  }
  ok(bad === 0, 'どの時点でもカードは94枚（' + bad + '）');
  ok(illegal === 0, 'ふーさんは不正な選択をしない');
  ok(games === 300, '2〜8人のランダム対戦が最後まで終わる（' + games + '/300）');
})();
(function () {   // 山札の並びを入れ替えても、ふーさんの判断は変わらない＝山札を覗いていない
  var rng = L.mulberry(21), checked = 0, diff = 0;
  for (var g = 0; g < 60; g++) {
    var S = L.newGame(3, { rng: rng }); L.startRound(S);
    for (var k = 0; k < 400 && S.phase !== 'over'; k++) {
      if (S.phase === 'roundEnd') { L.nextRound(S); continue; }
      if (!S.need) { L.step(S, rng); continue; }
      ['strong', 'ultra'].forEach(function (lv) {
        var a = L.aiDecide(S, S.need.p, lv, L.mulberry(5));
        var saved = S.deck.slice(); L.shuffle(S.deck, L.mulberry(k + 7));
        var b = L.aiDecide(S, S.need.p, lv, L.mulberry(5)); S.deck = saved;
        checked++; if (a !== b) diff++;
      });
      L.decide(S, S.need.p, L.aiDecide(S, S.need.p, 'normal', rng), rng);
    }
  }
  ok(checked > 500 && diff === 0, '山札の順番を変えても判断は同じ（' + checked + '回）');
})();
(function () {   // 強いふーさんの基本判断
  var S = game(2, [12, 3, 11, 10, 9], 1); run(S);
  L.decide(S, 0, 'hit'); run(S); L.decide(S, 1, 'hit'); run(S); L.decide(S, 0, 'hit'); run(S);
  ok(L.aiHit(S, 1, 'strong') === 'hit', '2枚・低リスクなら めくる');
  var T = game(2, [3, 4], 1); run(T); T.P[0].nums = [12, 11, 10, 9, 8, 7]; T.deck = [];
  T.discard = []; // 残りは数えた上で計算（ここでは残り=場に出ていない全カード）
  ok(L.aiHit(T, 0, 'strong') === 'stay' && L.aiHit(T, 0, 'ultra') === 'stay', '57点・高リスクなら とめる');
  var U = game(2, [3, 4], 1); run(U); U.scores = [150, 199]; U.P[1].st = 'stay'; U.P[1].nums = [4, 9]; U.P[0].nums = [3, 6];
  ok(L.aiHit(U, 0, 'strong') === 'hit' && L.aiHit(U, 0, 'ultra') === 'hit', '相手が200点超えを確定 → 追いつくまで めくる');
})();
console.log((failed ? '❌ ' : '✅ ') + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
