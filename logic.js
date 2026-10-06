/* ななめくり — ルールエンジンと ふーさん🐻AI（ブラウザ / Node 共通・副作用なし）
 * カード表現：数字 0〜12 は number、それ以外は文字列
 *   'p2' 'p4' 'p6' 'p8' 'p10' = おまけ＋N ／ 'x2' = ばいばい×2
 *   'fz' = こおり札（Freeze 相当） 'f3' = 3まいドン（Flip Three 相当） 'sc' = おまもり（Second Chance 相当）
 * 進め方：S = newGame(n) → startRound(S) → while(phase==='play'){ S.need ? decide(S,p,choice) : step(S) } → endRound → nextRound
 */
(function (root) {
  'use strict';
  var MODS = ['p2', 'p4', 'p6', 'p8', 'p10', 'x2'], ACTS = ['fz', 'f3', 'sc'];
  var KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].concat(MODS, ACTS);   // 22種
  var NK = KEYS.length, I_FZ = 19, I_F3 = 20, I_SC = 21;
  function ci(c) { return typeof c === 'number' ? c : KEYS.indexOf(c); }
  function isNum(c) { return typeof c === 'number'; }
  function modVal(c) { return c === 'x2' ? 0 : +String(c).slice(1); }
  var ALL = (function () { var a = []; for (var i = 0; i < NK; i++) a.push(0); a[0] = 1; for (var n = 1; n <= 12; n++) a[n] = n; MODS.forEach(function (m) { a[ci(m)] = 1; }); ACTS.forEach(function (m) { a[ci(m)] = 3; }); return a; })();
  function fullDeck() { var d = []; KEYS.forEach(function (k, i) { for (var j = 0; j < ALL[i]; j++) d.push(k); }); return d; }
  function shuffle(a, rng) { rng = rng || Math.random; for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function rowScore(nums, mods, f7) {
    var s = 0, i; for (i = 0; i < nums.length; i++) s += nums[i];
    if (mods.indexOf('x2') >= 0) s *= 2;
    for (i = 0; i < mods.length; i++) s += modVal(mods[i]);
    return s + (f7 ? 15 : 0);
  }
  function curScore(P) { return P.st === 'bust' ? 0 : rowScore(P.nums, P.mods, P.nums.length >= 7); }
  function hasCards(P) { return P.nums.length + P.mods.length + (P.sc ? 1 : 0) > 0; }
  function canStay(P) { return P.st === 'active' && hasCards(P); }
  function activeList(S) { var a = []; for (var p = 0; p < S.n; p++) if (S.P[p].st === 'active') a.push(p); return a; }

  // ---------------------------------------------------------------- ゲーム
  function newGame(n, opts) {
    opts = opts || {}; var rng = opts.rng || Math.random;
    var S = { n: n, target: opts.target || 200, scores: [], dealer: opts.dealer != null ? opts.dealer : Math.floor(rng() * n), round: 0,
      deck: shuffle(fullDeck(), rng), discard: [], phase: 'idle', winner: -1, tie: false, ev: [], evId: 0, P: [], jobs: [], need: null, result: null, reshuffles: 0 };
    for (var i = 0; i < n; i++) S.scores.push(0);
    return S;
  }
  function pushEv(S, e) { e.id = ++S.evId; S.ev.push(e); if (S.ev.length > 12) S.ev.shift(); return e; }
  function startRound(S) {
    S.round++; S.P = [];
    for (var p = 0; p < S.n; p++) S.P.push({ nums: [], mods: [], sc: 0, acts: [], st: 'active', bust: null });
    S.jobs = []; S.need = null; S.sub = 'deal'; S.dealPtr = 0; S.turnPtr = (S.dealer + 1) % S.n; S.flip7 = -1; S.phase = 'play'; S.result = null; S.tie = false;
    pushEv(S, { kind: 'round', round: S.round, dealer: S.dealer });
  }
  // 山札から1枚。尽きたら捨て札だけを切り直す（場に出ているカードはそのまま）
  function popCard(S, rng) {
    if (!S.deck.length && S.discard.length) { S.deck = shuffle(S.discard, rng); S.discard = []; S.reshuffles++; pushEv(S, { kind: 'reshuffle', n: S.deck.length }); }
    return S.deck.pop();
  }
  function draw(S, p, ctx, rng) {
    var c = popCard(S, rng);
    if (c === undefined) { pushEv(S, { kind: 'empty' }); endRound(S); return; }   // 全カードが場に出ている（理論上のみ）
    var P = S.P[p], e = { kind: 'card', p: p, c: c, f3: !!ctx };
    if (isNum(c)) {
      if (P.nums.indexOf(c) >= 0) {
        if (P.sc) { P.sc = 0; S.discard.push(c, 'sc'); e.kind = 'saved'; }
        else { P.st = 'bust'; P.bust = c; e.kind = 'bust'; }
      } else {
        P.nums.push(c);
        if (P.nums.length >= 7) { e.kind = 'flip7'; pushEv(S, e); S.flip7 = p; endRound(S); return; }
      }
    } else if (c === 'sc') {
      if (!P.sc) { P.sc = 1; e.kind = 'sc'; } else { S.jobs.push({ t: 'giveSC', p: p, card: 'sc' }); e.kind = 'sc2'; }
    } else if (c === 'fz' || c === 'f3') {
      if (ctx) { ctx.aside.push(c); e.kind = 'aside'; } else { S.jobs.push({ t: 'assign', p: p, card: c }); e.kind = 'action'; }
    } else { P.mods.push(c); e.kind = 'mod'; }
    pushEv(S, e);
  }
  function targetOpts(S, j) {
    var act = activeList(S);
    if (j.t === 'giveSC') return act.filter(function (q) { return q !== j.p && !S.P[q].sc; });
    return act;   // こおり・3まいドンは自分を含む誰にでも（1人しかいなければ自分）
  }
  // ジョブ（アクションの処理待ち）を1つ進める。見える出来事があれば true
  function doJob(S, rng) {
    var j = S.jobs[S.jobs.length - 1], o;
    if (j.t === 'f3') {
      if (S.P[j.p].st === 'active' && j.left > 0) {
        j.left--; draw(S, j.p, j, rng);
        if (S.phase !== 'play') return true;
        if (S.P[j.p].st === 'bust') {   // ドボン：3まいドンも、取っておいたアクションも捨て札
          S.jobs.splice(S.jobs.indexOf(j), 1); S.discard.push('f3'); j.aside.forEach(function (c) { S.discard.push(c); });
          if (j.aside.length) pushEv(S, { kind: 'asideDrop', p: j.p, cards: j.aside.slice() });
        }
        return true;
      }
      S.jobs.pop(); S.discard.push('f3');
      if (S.P[j.p].st === 'active' && j.aside.length) S.jobs.push({ t: 'handout', p: j.p, cards: j.aside, targets: [] });
      else j.aside.forEach(function (c) { S.discard.push(c); });
      pushEv(S, { kind: 'f3done', p: j.p });
      return false;
    }
    if (j.t === 'handout') {
      if (j.targets.length < j.cards.length) {
        o = targetOpts(S, j);
        if (o.length === 1) { j.targets.push(o[0]); return false; }
        S.need = { kind: 'target', p: j.p, card: j.cards[j.targets.length], opts: o, handout: true }; return false;
      }
      S.jobs.pop();
      for (var i = j.cards.length - 1; i >= 0; i--) S.jobs.push({ t: 'resolve', card: j.cards[i], target: j.targets[i], from: j.p });
      return false;
    }
    if (j.t === 'assign') {
      o = targetOpts(S, j);
      if (o.length <= 1) { S.jobs.pop(); if (!o.length) { S.discard.push(j.card); return false; } S.jobs.push({ t: 'resolve', card: j.card, target: o[0], from: j.p }); return false; }
      S.need = { kind: 'target', p: j.p, card: j.card, opts: o }; return false;
    }
    if (j.t === 'giveSC') {
      o = targetOpts(S, j);
      if (!o.length) { S.jobs.pop(); S.discard.push('sc'); pushEv(S, { kind: 'scDrop', p: j.p }); return true; }
      if (o.length === 1) { S.jobs.pop(); giveSC(S, j.p, o[0]); return true; }
      S.need = { kind: 'target', p: j.p, card: 'sc', opts: o }; return false;
    }
    if (j.t === 'resolve') {
      S.jobs.pop();
      var T = S.P[j.target];
      if (T.st !== 'active') { S.discard.push(j.card); pushEv(S, { kind: 'fizzle', p: j.from, to: j.target, c: j.card }); return true; }
      if (j.card === 'fz') { T.st = 'frozen'; T.acts.push('fz'); pushEv(S, { kind: 'freeze', p: j.from, to: j.target }); return true; }
      S.jobs.push({ t: 'f3', p: j.target, left: 3, aside: [], from: j.from });
      pushEv(S, { kind: 'flip3', p: j.from, to: j.target }); return true;
    }
    S.jobs.pop(); return false;
  }
  function giveSC(S, from, to) { S.P[to].sc = 1; pushEv(S, { kind: 'giveSC', p: from, to: to }); }
  // 1手すすめる（決定待ちのときは何もしない）。見える出来事（カード・効果）があれば true
  function step(S, rng) {
    if (S.phase !== 'play' || S.need) return false;
    if (S.jobs.length) return doJob(S, rng);
    if (S.sub === 'deal') {
      if (S.dealPtr >= S.n) { S.sub = 'turns'; S.turnPtr = (S.dealer + 1) % S.n; return false; }
      var p = (S.dealer + 1 + S.dealPtr) % S.n; S.dealPtr++;
      if (S.P[p].st !== 'active') return false;
      if (hasCards(S.P[p])) { S.need = { kind: 'hit', p: p, deal: true }; return false; }   // 配る前に3まいドンでカードを得た人は「めくる／とめる」を選べる
      draw(S, p, null, rng); return true;
    }
    var act = activeList(S);
    if (!act.length) { endRound(S); return true; }
    for (var k = 0; k < S.n; k++) { var q = (S.turnPtr + k) % S.n; if (S.P[q].st === 'active') { S.turnPtr = q; S.need = { kind: 'hit', p: q }; return false; } }
    return false;
  }
  // 決定：hit 待ちなら 'hit' | 'stay'、target 待ちなら相手の番号
  function decide(S, p, choice, rng) {
    var nd = S.need; if (!nd || S.phase !== 'play') return 'いまは選べません';
    if (nd.p !== p) return 'あなたの番ではありません';
    var P = S.P[p];
    if (nd.kind === 'hit') {
      if (choice === 'stay') {
        if (!canStay(P)) return 'カードが1枚もないので、とめられません';
        S.need = null; P.st = 'stay'; if (!nd.deal) S.turnPtr = (p + 1) % S.n;
        pushEv(S, { kind: 'stay', p: p, pts: curScore(P) }); return null;
      }
      if (choice !== 'hit') return '選べません';
      S.need = null; if (!nd.deal) S.turnPtr = (p + 1) % S.n;
      draw(S, p, null, rng); return null;
    }
    if (nd.kind === 'target') {
      var t = +choice; if (nd.opts.indexOf(t) < 0) return 'その人には使えません';
      var j = S.jobs[S.jobs.length - 1]; S.need = null;
      if (j.t === 'assign') { S.jobs.pop(); S.jobs.push({ t: 'resolve', card: j.card, target: t, from: p }); }
      else if (j.t === 'giveSC') { S.jobs.pop(); giveSC(S, p, t); }
      else if (j.t === 'handout') j.targets.push(t);
      return null;
    }
    return '選べません';
  }
  function endRound(S) {
    S.phase = 'roundEnd'; S.need = null;
    var pts = [];
    for (var p = 0; p < S.n; p++) { var v = curScore(S.P[p]); pts.push(v); S.scores[p] += v; }
    // 処理中だったカードは捨て札へ
    S.jobs.forEach(function (j) { if (j.t === 'f3') { S.discard.push('f3'); j.aside.forEach(function (c) { S.discard.push(c); }); } else if (j.t === 'handout') j.cards.forEach(function (c) { S.discard.push(c); }); else if (j.card) S.discard.push(j.card); });
    S.jobs = [];
    var max = Math.max.apply(null, S.scores), lead = [];
    S.scores.forEach(function (s, i) { if (s === max) lead.push(i); });
    if (max >= S.target) { if (lead.length === 1) { S.winner = lead[0]; S.phase = 'over'; } else S.tie = true; }   // 200点以上で同点なら、全員でもう1ラウンド
    S.result = { pts: pts, flip7: S.flip7, round: S.round, totals: S.scores.slice(), tie: S.tie };
    pushEv(S, { kind: 'roundEnd', pts: pts, flip7: S.flip7 });
  }
  // 場のカードを捨て札にして（山札は切り直さない）、親を左隣へ
  function nextRound(S) {
    if (S.phase !== 'roundEnd') return;
    S.P.forEach(function (P) { P.nums.forEach(function (c) { S.discard.push(c); }); P.mods.forEach(function (c) { S.discard.push(c); }); P.acts.forEach(function (c) { S.discard.push(c); }); if (P.bust !== null) S.discard.push(P.bust); if (P.sc) S.discard.push('sc'); });
    S.P = []; S.dealer = (S.dealer + 1) % S.n;
    startRound(S);
  }
  // 公開情報（捨て札＋場のカード）から山札に残っている内訳を数える。人間が数えても同じになる＝ふーさんはズルなし
  function remaining(S) {
    var c = ALL.slice();
    function sub(x) { c[ci(x)]--; }
    S.discard.forEach(sub);
    S.P.forEach(function (P) { P.nums.forEach(sub); P.mods.forEach(sub); P.acts.forEach(sub); if (P.bust !== null) sub(P.bust); if (P.sc) sub('sc'); });
    S.jobs.forEach(function (j) { if (j.t === 'f3') { sub('f3'); j.aside.forEach(sub); } else if (j.t === 'handout') j.cards.forEach(sub); else if (j.card) sub(j.card); });
    var tot = 0; c.forEach(function (x) { tot += x; }); c.total = tot;
    return c;
  }
  function bustProb(S, p, cnt) {
    cnt = cnt || remaining(S); var P = S.P[p]; if (!cnt.total) return 0;
    var b = 0; P.nums.forEach(function (n) { b += cnt[n]; }); return b / cnt.total;
  }

  // ================================================================ ふーさん🐻 AI（公開情報だけを使う）
  // 手の要約 h = { m: 数字のビット, nn, sum, x2, add, sc }
  function handOf(P) { var h = { m: 0, nn: 0, sum: 0, x2: 0, add: 0, sc: P.sc ? 1 : 0, mm: 0 }; P.nums.forEach(function (n) { h.m |= 1 << n; h.nn++; h.sum += n; }); P.mods.forEach(function (c) { if (c === 'x2') h.x2 = 1; else h.add += modVal(c); }); return h; }
  function hval(h) { return (h.x2 ? 2 * h.sum : h.sum) + h.add + (h.nn >= 7 ? 15 : 0); }
  function hAddNum(h, n) { return { m: h.m | (1 << n), nn: h.nn + 1, sum: h.sum + n, x2: h.x2, add: h.add, sc: h.sc, mm: h.mm }; }
  function hAddMod(h, i) { var c = KEYS[i]; return { m: h.m, nn: h.nn, sum: h.sum, x2: h.x2 || c === 'x2' ? 1 : 0, add: h.add + modVal(c), sc: h.sc, mm: h.mm | (1 << (i - 13)) }; }
  function hSet(h, k, v) { var o = { m: h.m, nn: h.nn, sum: h.sum, x2: h.x2, add: h.add, sc: h.sc, mm: h.mm }; o[k] = v; return o; }
  // 最適停止の先読み：U(得点) の期待値を最大にする方針の価値。アクション札は「何も起きない」として除外（引き直し扱い）
  function lookV(h, cnt, depth, U, memo) {
    var stay = U(hval(h));
    if (h.nn >= 7 || depth <= 0) return stay;
    var key = h.m + h.mm * 8192 + h.sc * 524288 + depth * 1048576, mv = memo.get(key);
    if (mv !== undefined) return mv;
    var acc = 0, w = 0, i, c;
    for (i = 0; i <= 12; i++) {
      c = cnt[i]; if (!c) continue; w += c;
      if (h.m & (1 << i)) { if (h.sc) { cnt[i]--; acc += c * lookV(hSet(h, 'sc', 0), cnt, depth - 1, U, memo); cnt[i]++; } else acc += c * U(0); }
      else { cnt[i]--; acc += c * lookV(hAddNum(h, i), cnt, depth - 1, U, memo); cnt[i]++; }
    }
    for (i = 13; i <= 18; i++) { c = cnt[i]; if (!c) continue; w += c; cnt[i]--; acc += c * lookV(hAddMod(h, i), cnt, depth - 1, U, memo); cnt[i]++; }
    c = cnt[I_SC]; if (c) { w += c; cnt[I_SC]--; acc += c * lookV(h.sc ? h : hSet(h, 'sc', 1), cnt, depth - 1, U, memo); cnt[I_SC]++; }
    var hit = w ? acc / w : stay, v = Math.max(stay, hit);
    memo.set(key, v);
    return v;
  }
  function hitValue(h, cnt, depth, U) {   // 「いま1枚めくる」を選んだときの価値
    var memo = new Map(), acc = 0, w = 0, i, c;
    for (i = 0; i <= 12; i++) {
      c = cnt[i]; if (!c) continue; w += c;
      if (h.m & (1 << i)) { if (h.sc) { cnt[i]--; acc += c * lookV(hSet(h, 'sc', 0), cnt, depth - 1, U, memo); cnt[i]++; } else acc += c * U(0); }
      else { cnt[i]--; acc += c * lookV(hAddNum(h, i), cnt, depth - 1, U, memo); cnt[i]++; }
    }
    for (i = 13; i <= 18; i++) { c = cnt[i]; if (!c) continue; w += c; cnt[i]--; acc += c * lookV(hAddMod(h, i), cnt, depth - 1, U, memo); cnt[i]++; }
    c = cnt[I_SC]; if (c) { w += c; cnt[I_SC]--; acc += c * lookV(h.sc ? h : hSet(h, 'sc', 1), cnt, depth - 1, U, memo); cnt[I_SC]++; }
    return w ? acc / w : U(hval(h));
  }
  var ID = function (x) { return x; };
  var TUNE = { dA: 3, dB: 4, expo: 0 };
  // 続けた場合の期待得点（リスク中立）
  function contV(P, cnt, depth) { if (P.st !== 'active') return curScore(P); return lookV(handOf(P), cnt, depth, ID, new Map()); }
  // 3まいドンを受けたときの期待得点（3枚強制。ドボン・7そろいで止まる。アクション札も1枚に数える）
  function flip3V(P, cnt) {
    if (P.st !== 'active') return curScore(P);
    var memo = new Map();
    function rec(h, left) {
      if (h.nn >= 7) return hval(h);
      if (left === 0) return lookV(h, cnt, 1, ID, memo2);
      var key = h.m + h.mm * 8192 + h.sc * 524288 + left * 1048576, mv = memo.get(key); if (mv !== undefined) return mv;
      var acc = 0, w = 0, i, c;
      for (i = 0; i < NK; i++) {
        c = cnt[i]; if (!c) continue; w += c; cnt[i]--;
        if (i <= 12) acc += c * ((h.m & (1 << i)) ? (h.sc ? rec(hSet(h, 'sc', 0), left - 1) : 0) : rec(hAddNum(h, i), left - 1));
        else if (i <= 18) acc += c * rec(hAddMod(h, i), left - 1);
        else if (i === I_SC) acc += c * rec(h.sc ? h : hSet(h, 'sc', 1), left - 1);
        else acc += c * rec(h, left - 1);
        cnt[i]++;
      }
      var v = w ? acc / w : hval(h); memo.set(key, v); return v;
    }
    var memo2 = new Map();
    return rec(handOf(P), 3);
  }
  // ---- アストラウルトラ用：勝率表 W[a][b]（ラウンド開始時に a 点 vs b 点のとき a が勝つ確率）
  // 1ラウンドの得点分布 RD は「強い」同士の自動対戦（2人・3000局）から集計。0点（ドボン）が約31%。
  var RD = [3101,6,14,15,26,26,41,39,61,71,85,90,115,35,43,47,50,62,61,79,93,149,190,352,257,376,421,474,436,449,409,359,281,255,180,147,127,93,83,63,55,43,42,28,39,26,36,20,30,15,34,14,31,10,28,7,28,6,26,5,24,7,20,6,21,5,17,5,17,6,11,5,11,4,9,4,7,2,4,1,3,0,4,0,3,0,2,0,3,0,1,0,1,0,1,0,2,0,1,0,2,0,1,0,1,0,0,0,0,1,0,1,0,1,0,1,1,0,0,0,0,1];
  var WT = {};
  function buildW(T) {
    if (WT[T]) return WT[T];
    var K = RD.length, R = [], tot = 0, i; RD.forEach(function (x) { tot += x; }); for (i = 0; i < K; i++) R.push(RD[i] / tot);
    var W = new Float64Array(T * T), G = new Float64Array((T + K) * T), R0 = R[0];
    function cmp(A, B) { return A > B ? 1 : A < B ? 0 : 0.5; }
    for (var A = T; A < T + K; A++) for (var b = 0; b < T; b++) { var g = 0; for (var y = 0; y < K; y++) g += R[y] * cmp(A, b + y); G[A * T + b] = g; }
    var inner = new Float64Array(T);
    for (var a = T - 1; a >= 0; a--) {
      for (b = T - 1; b >= 0; b--) {
        var s = 0, x, yy, q = 0;
        for (x = 1; x < K; x++) s += R[x] * G[(a + x) * T + b];
        for (yy = 1; yy < K && b + yy < T; yy++) q += R[yy] * W[a * T + b + yy];
        inner[b] = q;
        W[a * T + b] = (s + R0 * q) / (1 - R0 * R0);
      }
      for (b = 0; b < T; b++) G[a * T + b] = inner[b] + R0 * W[a * T + b];
    }
    WT[T] = W; return W;
  }
  function wEnd(W, T, A, B) { return (A >= T || B >= T) ? (A > B ? 1 : A < B ? 0 : 0.5) : W[A * T + B]; }
  // リスク中立の方針で続けたときの [期待得点, ドボン確率]
  function evB(h, cnt, depth, memo) {
    var sv = hval(h);
    if (h.nn >= 7 || depth <= 0) return [sv, 0];
    var key = h.m + h.mm * 8192 + h.sc * 524288 + depth * 1048576, mv = memo.get(key); if (mv) return mv;
    var av = 0, ab = 0, w = 0, i, c, r;
    for (i = 0; i <= 12; i++) {
      c = cnt[i]; if (!c) continue; w += c;
      if (h.m & (1 << i)) { if (h.sc) { cnt[i]--; r = evB(hSet(h, 'sc', 0), cnt, depth - 1, memo); av += c * r[0]; ab += c * r[1]; cnt[i]++; } else ab += c; }
      else { cnt[i]--; r = evB(hAddNum(h, i), cnt, depth - 1, memo); av += c * r[0]; ab += c * r[1]; cnt[i]++; }
    }
    for (i = 13; i <= 18; i++) { c = cnt[i]; if (!c) continue; w += c; cnt[i]--; r = evB(hAddMod(h, i), cnt, depth - 1, memo); av += c * r[0]; ab += c * r[1]; cnt[i]++; }
    c = cnt[I_SC]; if (c) { w += c; cnt[I_SC]--; r = evB(h.sc ? h : hSet(h, 'sc', 1), cnt, depth - 1, memo); av += c * r[0]; ab += c * r[1]; cnt[I_SC]++; }
    var out = (w && av / w > sv + 0.01) ? [av / w, ab / w] : [sv, 0];
    memo.set(key, out); return out;
  }
  // 3まいドン後の [期待得点, ドボン確率]
  function f3B(P, cnt) {
    var memo = new Map();
    function rec(h, left) {
      if (h.nn >= 7 || left === 0) return [hval(h), 0];
      var key = h.m + h.mm * 8192 + h.sc * 524288 + left * 1048576, mv = memo.get(key); if (mv) return mv;
      var av = 0, ab = 0, w = 0, i, c, r;
      for (i = 0; i < NK; i++) {
        c = cnt[i]; if (!c) continue; w += c; cnt[i]--;
        if (i <= 12) { if (h.m & (1 << i)) { if (h.sc) r = rec(hSet(h, 'sc', 0), left - 1); else r = [0, 1]; } else r = rec(hAddNum(h, i), left - 1); }
        else if (i <= 18) r = rec(hAddMod(h, i), left - 1);
        else if (i === I_SC) r = rec(h.sc ? h : hSet(h, 'sc', 1), left - 1);
        else r = rec(h, left - 1);
        av += c * r[0]; ab += c * r[1]; cnt[i]++;
      }
      var out = w ? [av / w, ab / w] : [hval(h), 0]; memo.set(key, out); return out;
    }
    return rec(handOf(P), 3);
  }
  // 結果の分布（[得点, 確率] の配列）
  function distOf(eb) { var b = Math.min(0.999, eb[1]); if (b < 1e-6) return [[eb[0], 1]]; return [[0, b], [eb[0] / (1 - b), 1 - b]]; }
  function oppDists(S, p, cnt, override) {
    var out = [];
    for (var o = 0; o < S.n; o++) {
      if (o === p) continue;
      var P = S.P[o], d;
      if (override && override[o]) d = override[o];
      else d = P.st === 'active' ? distOf(evB(handOf(P), cnt, 2, new Map())) : [[curScore(P), 1]];
      out.push({ o: o, base: S.scores[o], d: d });
    }
    return out;
  }
  function makeU(S, p, opp) {
    var T = S.target, W = buildW(T), me = S.scores[p], cache = {};
    return function (x) {
      x = Math.round(x); if (cache[x] !== undefined) return cache[x];
      var M = me + x, u = 1;
      for (var k = 0; k < opp.length; k++) { var o = opp[k], e = 0; for (var j = 0; j < o.d.length; j++) e += o.d[j][1] * wEnd(W, T, M, o.base + Math.round(o.d[j][0])); u *= e; }
      return (cache[x] = u);
    };
  }
  function expU(U, d) { var e = 0; d.forEach(function (z) { e += z[1] * U(z[0]); }); return e; }
  // ---- めくる／とめる ----
  function aiHit(S, p, lv, rng) {
    rng = rng || Math.random;
    var P = S.P[p]; if (!canStay(P)) return 'hit';
    var cur = curScore(P), h = handOf(P);
    if (lv === 'weak') {
      if (P.nums.length >= 5 || cur >= 26) return 'stay';
      if (cur < 13) return 'hit';
      return rng() < 0.45 ? 'stay' : 'hit';
    }
    if (lv === 'normal') {   // 自分の手札だけからざっくり危険度（出たカードは数えない）
      var seen = P.nums.length + P.mods.length, risk = 0;
      P.nums.forEach(function (n) { risk += Math.max(0, ALL[n] - 1); });
      risk /= (94 - seen);
      var lim = P.sc ? 0.5 : 0.24 + rng() * 0.08;
      if (cur >= (P.sc ? 40 : 30)) return 'stay';
      return risk > lim ? 'stay' : 'hit';
    }
    var cnt = remaining(S);
    if (lv === 'strong') {   // 正確なカウント＋1手先の期待値＋終盤ルール
      var me = S.scores[p], banked = -1, bestOther = -1;
      for (var o = 0; o < S.n; o++) { if (o === p) continue; var Q = S.P[o], f = S.scores[o] + curScore(Q); if (Q.st !== 'active') banked = Math.max(banked, f); bestOther = Math.max(bestOther, f); }
      if (banked >= S.target && banked >= me + cur) return 'hit';          // もう誰かが200点超えを確定：追い越すしかない
      if (me + cur >= S.target && me + cur > bestOther) return 'stay';      // 勝ちが見えたら止める
      return hitValue(h, cnt, 1, ID) > cur + 0.01 ? 'hit' : 'stay';
    }
    // アストラウルトラ：勝率表を効用にした多段先読み（7そろいボーナス・ばいばい・おまもりも含む）
    var U = makeU(S, p, oppDists(S, p, cnt));
    var depth = h.nn <= 2 ? TUNE.dA : TUNE.dB;
    var hv = hitValue(h, cnt, depth, U), sv = U(cur);
    // まだ めくり中の相手が3まいドンを引いたら、こちらに飛んでくるかもしれない（危ない手ほど痛い）
    if (TUNE.expo && cnt[I_F3]) {
      var nAct = 0; for (var q = 0; q < S.n; q++) if (q !== p && S.P[q].st === 'active') nAct++;
      if (nAct) { var pf = Math.min(0.5, TUNE.expo * nAct * cnt[I_F3] / cnt.total), f3v = expU(U, distOf(f3B(P, cnt))); if (f3v < hv) hv -= pf * (hv - f3v); }
    }
    // めくってアクション札（こおり・3まいドン）が出たときの使い道の価値も足す
    var nA = cnt[I_FZ] + cnt[I_F3], nO = cnt.total - nA;
    if (nA && nO > 0) {
      var act = activeList(S), av = 0;
      if (cnt[I_FZ]) av += cnt[I_FZ] * ultraActionU(S, p, cnt, 'fz', act);
      if (cnt[I_F3]) av += cnt[I_F3] * ultraActionU(S, p, cnt, 'f3', act);
      hv = (hv * nO + av) / cnt.total;
    }
    if (Math.abs(hv - sv) < 1e-7) return hitValue(h, cnt, depth, ID) > cur + 0.01 ? 'hit' : 'stay';   // 勝率が動かないときは期待得点で
    return hv > sv ? 'hit' : 'stay';
  }
  // ---- アクションの相手選び ----
  function aiTarget(S, p, lv, rng) {
    rng = rng || Math.random;
    var nd = S.need, opts = nd.opts, card = nd.card;
    if (opts.length === 1) return opts[0];
    if (lv === 'weak') return opts[Math.floor(rng() * opts.length)];
    var others = opts.filter(function (q) { return q !== p; });
    if (lv === 'normal') {
      if (card === 'sc') return others[Math.floor(rng() * others.length)];
      if (!others.length) return p;
      var by = function (f) { return others.slice().sort(function (a, b) { return f(a) - f(b); })[0]; };
      if (card === 'fz') return by(function (q) { return S.P[q].nums.length - S.scores[q] / 1000; });   // まだ少ない人を止める
      return by(function (q) { return -S.P[q].nums.length; });                                           // 枚数が多い人にドン
    }
    var cnt = remaining(S), depth = lv === 'ultra' ? 2 : 1;
    var base = {}, alt = {};
    opts.forEach(function (q) {
      var P = S.P[q]; base[q] = contV(P, cnt, depth);
      if (card === 'fz') alt[q] = curScore(P);
      else if (card === 'f3') alt[q] = flip3V(P, cnt);
      else { var P2 = { nums: P.nums, mods: P.mods, sc: 1, st: P.st }; alt[q] = contV(P2, cnt, depth); }
    });
    var best = null, bestV = -Infinity;
    if (lv === 'strong') {
      var leader = -1, ls = -1; for (var o = 0; o < S.n; o++) if (o !== p && S.scores[o] > ls) { ls = S.scores[o]; leader = o; }
      opts.forEach(function (q) {
        var d = alt[q] - base[q], v;
        if (q === p) v = d + (card === 'fz' ? 0.5 : 0);
        else { v = -d * (q === leader ? 1.5 : 1); if (card === 'fz' && S.scores[q] + alt[q] >= S.target && S.scores[q] + alt[q] > S.scores[p] + curScore(S.P[p])) v -= 100; }
        if (v > bestV + 1e-9) { bestV = v; best = q; }
      });
      return best;
    }
    // アストラウルトラ：各案ごとに相手と自分の結果分布を作り、勝率表で比べる
    return ultraBest(S, p, cnt, card, opts).q;
  }
  function ultraBest(S, p, cnt, card, opts) {
    // 各案で「誰の期待得点がどれだけ動くか」を出し、勝率表から求めた重み（その人の1点が自分の勝率をどれだけ動かすか）で比べる
    var T = S.target, W = buildW(T), E = [], base = [], i, q;
    for (i = 0; i < S.n; i++) { var Pi = S.P[i]; base[i] = Pi.st === 'active' ? contV(Pi, cnt, 2) : curScore(Pi); E[i] = S.scores[i] + base[i]; }
    function pw(Ev) { var u = 1; for (var k = 0; k < S.n; k++) if (k !== p) u *= wEnd(W, T, Math.round(Ev[p]), Math.round(Ev[k])); return u; }
    var P0 = pw(E), wt = [], D = 6;
    for (i = 0; i < S.n; i++) { var E2 = E.slice(); E2[i] += D; wt[i] = (pw(E2) - P0) / D; }
    var mag = 0; wt.forEach(function (x) { mag += Math.abs(x); });
    if (mag < 1e-6) wt = wt.map(function (x, k) { return k === p ? 1 : -1 / (S.n - 1); });   // 勝負が決まっているときは得点差で
    else {   // 自分の1点 = 相手の平均的な1点 とそろえ、相手どうしの重みの差（誰がトップに近いか）だけを勝率表から使う
      var so = 0; for (i = 0; i < S.n; i++) if (i !== p) so += -wt[i];
      so = so / (S.n - 1);
      wt = wt.map(function (x, k) { return k === p ? 1 : (so > 1e-9 ? x / so : -1); });
    }
    var best = null, bestV = -Infinity;
    opts.forEach(function (q) {
      var P = S.P[q], alt;
      if (card === 'fz') alt = curScore(P);
      else if (card === 'f3') alt = flip3V(P, cnt);
      else alt = contV({ nums: P.nums, mods: P.mods, sc: 1, st: P.st }, cnt, 2);
      var d = alt - base[q], v = d * wt[q];
      // こおりで相手が200点超えを確定して逃げ切られる、は避ける
      if (card === 'fz' && q !== p && S.scores[q] + alt >= T && S.scores[q] + alt > E[p]) v -= 1;
      if (v > bestV + 1e-12) { bestV = v; best = q; }
    });
    return { q: best, v: bestV };
  }
  function ultraActionU(S, p, cnt, card, opts) {   // めくってアクション札が出たときの勝率（使い道の最善）
    var meP = S.P[p], best = -Infinity;
    opts.forEach(function (q) {
      var ov = {}, myD = null, P = S.P[q], d;
      if (card === 'fz') d = [[curScore(P), 1]]; else d = distOf(f3B(P, cnt));
      if (q === p) myD = d; else ov[q] = d;
      var U = makeU(S, p, oppDists(S, p, cnt, ov));
      var v = myD ? expU(U, myD) : lookV(handOf(meP), cnt, 2, U, new Map());
      if (v > best) best = v;
    });
    return best;
  }
  function aiDecide(S, p, lv, rng) {
    var nd = S.need; if (!nd || nd.p !== p) return null;
    var hl = lv, tl = lv; if (lv.indexOf(':') > 0) { hl = lv.split(':')[0]; tl = lv.split(':')[1]; }   // 実験用 'hit:target'
    return nd.kind === 'hit' ? aiHit(S, p, hl, rng) : aiTarget(S, p, tl, rng);
  }

  // ---- シミュレーション（ふーさん同士） ----
  function mulberry(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function simGame(levels, rng, opts) {
    opts = opts || {}; rng = rng || Math.random;
    var S = newGame(levels.length, { rng: rng, dealer: opts.dealer, target: opts.target });
    startRound(S);
    for (var guard = 0; guard < 200000; guard++) {
      if (S.phase === 'play') {
        if (S.need) { var p = S.need.p, ch = aiDecide(S, p, levels[p], rng), err = decide(S, p, ch, rng); if (err) throw new Error('AI illegal: ' + err + ' ' + JSON.stringify(S.need) + ' ' + ch); }
        else step(S, rng);
      } else if (S.phase === 'roundEnd') { if (S.round > 300) break; nextRound(S); }
      else break;
    }
    return S;
  }

  var api = { KEYS: KEYS, ALL: ALL, MODS: MODS, ci: ci, isNum: isNum, modVal: modVal, fullDeck: fullDeck, shuffle: shuffle, rowScore: rowScore, curScore: curScore, hasCards: hasCards, canStay: canStay, activeList: activeList,
    newGame: newGame, startRound: startRound, step: step, decide: decide, endRound: endRound, nextRound: nextRound, remaining: remaining, bustProb: bustProb,
    aiHit: aiHit, aiTarget: aiTarget, aiDecide: aiDecide, contV: contV, flip3V: flip3V, buildW: buildW, tune: TUNE, simGame: simGame, mulberry: mulberry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NM = api;
})(typeof window !== 'undefined' ? window : this);
