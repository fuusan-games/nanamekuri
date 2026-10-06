/* ななめくり：ホスト側のゲーム進行（authoritative）。山札・進行・ふーさん🐻の思考はここ */
'use strict';
var LINES = {
  stay: { weak: ['ここで とめるクマ〜', 'こわいから とめるクマ！'], normal: ['そろそろ あぶないクマ。とめるクマ！', '{pts}点で がまんするクマ'], strong: ['数えたら ここが引きどきクマ', 'のこりの山札、{pts}点で十分クマ'], ultra: ['フッ…ここが引き際だクマ😎', '{pts}点、計算どおりだクマ😎', 'これ以上は 確率がゆるさないクマ😎'] },
  hit: { weak: ['えいっ、めくるクマ！', 'もう1まい〜！'], normal: ['まだ いけるクマ！', 'どきどきするクマ…'], strong: ['かぶる確率{risk}%…いくクマ！', 'ここは めくるのが得クマ'], ultra: ['かぶる確率{risk}%…想定内だクマ😎', 'まだまだ いけるクマ😎', 'すべて見えているクマ…😎'] },
  bust: { weak: ['クマ〜〜っ！？ かぶったクマ…'], normal: ['あちゃ〜、ドボンだクマ…'], strong: ['うぐっ…{risk}%を引いたクマ…'], ultra: ['ば、ばかな…確率{risk}%だったクマ…😎💦', 'フッ…今回は 山札に花を持たせたクマ😎💦'] },
  flip7: { weak: ['ななそろい だクマー！🎉'], normal: ['やったクマ！ ななそろいクマ！🎉'], strong: ['ななそろい、いただきクマ！'], ultra: ['計算どおりだクマ😎✨', 'これが アストラの力クマ😎'] },
  fzSelf: ['じぶんを こおらせて 点を守るクマ❄️'],
  fz: ['{to}は そこまでクマ！ こおりづけクマ❄️', '{to}、ストップだクマ❄️'],
  f3Self: ['じぶんに 3まいドン！ いくクマ⚡'],
  f3: ['{to}に 3まいドン！クマ⚡', '{to}、3まい めくるクマ⚡'],
  sc: ['おまもり、{to}にあげるクマ🍀'],
  ultraFz: ['{to}の未来は、ここで止まるクマ😎❄️'], ultraF3: ['{to}…3枚の運命を受けるクマ😎⚡']
};
function hostId(code) { return ID_PREFIX + code; }
function newRoom(name, solo) {
  return { code: solo ? 'SOLO' : genCode(), solo: !!solo, phase: 'lobby', opts: { np: 4, lv: ['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal'], goal: 200 }, nextSid: 2, gameNo: 0,
    seats: [{ sid: 1, name: name, kind: 'host', clientId: myId, connected: true }], G: null, notice: null, lobbyReq: null };
}
function startHost(name, resumeRoom, solo) {
  document.body.classList.add('is-host');
  host = { room: resumeRoom || newRoom(name, solo), conns: {}, lastSeen: {}, tries: 0, opened: false };
  document.body.classList.toggle('solo', !!host.room.solo);
  if (resumeRoom) host.room.seats.forEach(function (s) { if (s.kind === 'remote') s.connected = false; });
  if (host.room.solo) { host.opened = true; hostRender(); saveHost(); }
  else { connecting(true, resumeRoom ? '部屋を再開しています…' : '部屋を作っています…', 'シグナリングサーバーに接続中', function () { location.href = location.pathname; }); openHostPeer(); }
  setInterval(hostHeartbeat, 2000);
  setInterval(hostTick, TURBO ? 25 : 80);
}
// 席：人間が参加順に前から。残りは ふーさん
function planOwners(seats, opts) {
  var np = Math.max(opts.np, seats.length, 2), out = [];
  for (var i = 0; i < np; i++) { var h = seats[i]; out.push(h ? { kind: 'human', sid: h.sid, name: h.name } : { kind: 'cpu', lv: opts.lv[i] || 'normal', name: '' }); }
  var cpus = out.filter(function (o) { return o.kind === 'cpu'; });
  cpus.forEach(function (o, i) { o.name = cpus.length > 1 ? CPU_BASE + (i + 1) : CPU_BASE; });
  return out;
}
function hostStartGame() {
  var R = host.room;
  if (!R.seats.length) return;
  R.gameNo++; R.lobbyReq = null;
  var owners = planOwners(R.seats, R.opts), ultra = owners.some(function (o) { return o.kind === 'cpu' && o.lv === 'ultra'; });
  var S = L.newGame(owners.length, { target: R.opts.goal || 200 });
  L.startRound(S);
  R.G = { S: S, owners: owners, ultra: ultra, startAt: Date.now() + (ultra ? T.awaken : 600), started: false, cpuAt: 0, nextAt: 0, roundEndAt: 0, say: null, seenEv: S.evId };
  R.phase = 'game';
  hostBroadcast();
}
function say(p, text) { var G = host.room.G; G.say = { id: (G.say ? G.say.id : 0) + 1, p: p, text: text }; }
function nameOf(p) { return host.room.G.owners[p].name; }
function riskPct(S, p) { return Math.round(L.bustProb(S, p) * 100); }
// 新しく起きた出来事に ふーさんがひとこと
function afterEvents() {
  var G = host.room.G, S = G.S;
  S.ev.forEach(function (e) {
    if (e.id <= G.seenEv) return;
    G.seenEv = e.id;
    var o = e.p != null ? G.owners[e.p] : null, lv = o && o.kind === 'cpu' ? o.lv : null;
    if (e.kind === 'bust' && lv) say(e.p, fill(pick(LINES.bust[lv]), { risk: G.lastRisk != null ? G.lastRisk : '?' }));
    else if (e.kind === 'flip7' && lv) say(e.p, pick(LINES.flip7[lv]));
    else if ((e.kind === 'freeze' || e.kind === 'flip3') && lv) {
      var self = e.to === e.p, key = e.kind === 'freeze' ? 'fz' : 'f3';
      say(e.p, fill(pick(lv === 'ultra' && !self ? LINES[key === 'fz' ? 'ultraFz' : 'ultraF3'] : LINES[key + (self ? 'Self' : '')]), { to: nameOf(e.to) }));
    } else if (e.kind === 'giveSC' && lv) say(e.p, fill(pick(LINES.sc), { to: nameOf(e.to) }));
    if (e.kind === 'roundEnd') G.roundEndAt = Date.now() + T.roundEnd;
  });
}
function delayFor() {
  var G = host.room.G, S = G.S, e = S.ev[S.ev.length - 1], d = 750;
  if (!e) return 500;
  if (e.kind === 'bust' || e.kind === 'flip7') d = 1700;
  else if (e.kind === 'freeze' || e.kind === 'flip3') { d = 1300; var o = G.owners[e.p]; if (o && o.kind === 'cpu' && o.lv === 'ultra') d = 2100; }
  else if (e.kind === 'saved') d = 1400;
  else if (e.kind === 'card' || e.kind === 'mod' || e.kind === 'sc' || e.kind === 'sc2' || e.kind === 'aside') d = e.f3 ? 950 : 850;
  else if (e.kind === 'stay') d = 450;
  else if (e.kind === 'round') d = 900;
  else if (e.kind === 'action') d = 600;
  return d * T.k;
}
function applyDecision(p, choice, cpuLv) {
  var G = host.room.G, S = G.S, nd = S.need;
  var risk = nd && nd.kind === 'hit' ? riskPct(S, p) : null;
  var err = L.decide(S, p, choice); if (err) return err;
  G.lastRisk = risk;
  if (cpuLv && nd.kind === 'hit') {
    if (choice === 'stay') say(p, fill(pick(LINES.stay[cpuLv]), { pts: L.curScore(S.P[p]) }));
    else if (Math.random() < (cpuLv === 'ultra' ? 0.5 : 0.25) && S.P[p].nums.length >= 2) say(p, fill(pick(LINES.hit[cpuLv]), { risk: risk }));
  }
  afterEvents(); G.nextAt = Date.now() + delayFor(); G.cpuAt = 0;
  hostBroadcast(); return null;
}
function hostAction(sid, m) {
  var R = host.room, G = R.G; if (!G || R.phase !== 'game') return null;
  var S = G.S, nd = S.need;
  if (Date.now() < G.startAt) return null;
  if (!nd || S.phase !== 'play') return null;
  var o = G.owners[nd.p];
  if (!o || o.kind !== 'human' || o.sid !== sid) return 'あなたの番ではありません';
  if (m.a === 'hit' || m.a === 'stay') { if (nd.kind !== 'hit') return null; return applyDecision(nd.p, m.a, null); }
  if (m.a === 'target') { if (nd.kind !== 'target') return null; return applyDecision(nd.p, +m.v, null); }
  return null;
}
function hostTick() {
  if (!host || !host.opened) return;
  var R = host.room, G = R.G, now = Date.now();
  if (R.phase !== 'game' || !G) return;
  if (now < G.startAt) return;
  if (!G.started) { G.started = true; G.nextAt = now + 200; hostBroadcast(); return; }
  var S = G.S;
  if (S.phase === 'play') {
    if (S.need) {
      var p = S.need.p, o = G.owners[p], seat = o.kind === 'human' ? seatBySid(o.sid) : null;
      var proxy = o.kind === 'human' && seat && seat.kind === 'remote' && !seat.connected;
      if (o.kind !== 'cpu' && !proxy) { G.cpuAt = 0; return; }
      if (now < G.nextAt) return;
      if (!G.cpuAt) { G.cpuAt = now + (o.kind === 'cpu' ? rand(T.cpu) : T.off); return; }
      if (now < G.cpuAt) return;
      G.cpuAt = 0;
      if (proxy) toastAll(BEAR + ' 切断中の ' + seat.name + ' のかわりに ふーさんが選びました');
      applyDecision(p, L.aiDecide(S, p, o.kind === 'cpu' ? o.lv : 'normal'), o.kind === 'cpu' ? o.lv : null);
      return;
    }
    if (now < G.nextAt) return;
    var guard = 0, vis = false;
    while (!vis && S.phase === 'play' && !S.need && guard++ < 60) vis = L.step(S);
    afterEvents(); G.nextAt = now + (vis ? delayFor() : 0);
    hostBroadcast();
  } else if (S.phase === 'roundEnd' || S.phase === 'over') {
    if (!G.roundEndAt) G.roundEndAt = now + T.roundEnd;
    if (now >= G.roundEndAt) {
      G.roundEndAt = 0;
      if (S.phase === 'over') R.phase = 'end';
      else { L.nextRound(S); G.nextAt = now + 300; afterEvents(); }
      hostBroadcast();
    } else if (now - (G.tickAt || 0) > 1000) { G.tickAt = now; hostBroadcast(); }
  }
}
function viewFor(sid) {
  var R = host.room, G = R.G, now = Date.now(), you = -1;
  R.seats.forEach(function (s, i) { if (s.sid === sid) you = i; });
  var v = { t: 'state', phase: R.phase, code: R.code, solo: R.solo, you: you, sid: sid, gameNo: R.gameNo, opts: { np: R.opts.np, lv: R.opts.lv.slice(), goal: R.opts.goal },
    seats: R.seats.map(function (s) { return { sid: s.sid, name: s.name, kind: s.kind, connected: s.kind !== 'remote' || s.connected }; }), notice: R.notice };
  if (sid === 1 && R.lobbyReq && R.phase !== 'lobby') v.lobbyReq = R.lobbyReq;
  if (R.phase === 'lobby' || !G) return v;
  var S = G.S, rem = S.phase === 'play' ? L.remaining(S) : null;
  v.g = { n: S.n, target: S.target, round: S.round, dealer: S.dealer, sphase: S.phase, scores: S.scores, P: S.P, k: S.evId,
    owners: G.owners.map(function (o) { var s = o.kind === 'human' ? seatBySid(o.sid) : null; return { kind: o.kind, sid: o.sid, name: o.name, lv: o.lv, connected: !s || s.kind !== 'remote' || s.connected }; }),
    need: S.need ? { kind: S.need.kind, p: S.need.p, card: S.need.card, opts: S.need.opts, deal: !!S.need.deal } : null,
    f3: (function () { for (var i = S.jobs.length - 1; i >= 0; i--) if (S.jobs[i].t === 'f3') return { p: S.jobs[i].p, left: S.jobs[i].left }; return null; })(),
    deck: S.deck.length, disc: S.discard.length, rem: rem ? { c: rem.slice(), t: rem.total } : null,
    ev: S.ev.slice(-8), result: S.result, winner: S.winner, ultra: G.ultra, wait: Math.max(0, G.startAt - now), say: G.say,
    nextIn: G.roundEndAt ? Math.max(0, G.roundEndAt - now) : null };
  return v;
}
function seatByClient(cid) { return host.room.seats.filter(function (s) { return s.clientId === cid; })[0]; }
function seatBySid(sid) { return host.room.seats.filter(function (s) { return s.sid === sid; })[0]; }
function toastAll(msg) { var R = host.room; R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg, toast: true }; }
function hostToLobby(msg) {
  var R = host.room;
  R.phase = 'lobby'; R.G = null; R.lobbyReq = null;
  R.seats = R.seats.filter(function (s) { if (s.kind === 'remote') { s.left = false; return !!s.connected; } return true; });
  R.notice = { id: (R.notice ? R.notice.id : 0) + 1, msg: msg };
  hostBroadcast();
}
function hostLobbyReq(seat) {
  var R = host.room;
  if (seat.kind !== 'remote' || R.phase === 'lobby') return;
  if (R.lobbyReq && R.lobbyReq.sid === seat.sid && Date.now() - R.lobbyReq.at < 5000) return;
  R.lobbyReq = { sid: seat.sid, name: seat.name, at: Date.now() };
  hostBroadcast();
}
function hostBroadcast() {
  var R = host.room;
  R.seats.forEach(function (s) { if (s.kind !== 'remote') return; var c = host.conns[s.clientId]; if (c && c.open) { try { c.send(viewFor(s.sid)); } catch (e) {} } });
  hostRender(); saveHost();
}
function hostRender() { render(viewFor(1)); }
var saveT = 0;
function saveHost() { var now = Date.now(); if (now - saveT < 700 && host.room.phase === 'game') return; saveT = now; try { localStorage.setItem(LS_HOST, JSON.stringify({ room: host.room, saved: now })); } catch (e) {} }
