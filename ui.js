/* ななめくり：描画（ホスト・参加者で共通。受け取ったビューだけを使う）— ロビー・プレイヤー列・ボタン */
'use strict';
var ui = { gameKey: '', lastEv: 0, sayId: 0, roundShownAt: 0, roundKey: '', endKey: '' };
function render(v) {
  lastView = v; window.__nm.view = v;
  BGM.want(v.phase === 'game' && v.g ? (v.g.ultra ? 'epic' : 'normal') : null);
  noticeUi(v);
  if (v.phase !== 'game') { overlay('targetModal', false); overlay('roundModal', false); }
  if (v.phase === 'lobby') { show('lobby'); renderLobby(v); ui.gameKey = ''; return; }
  if (v.phase === 'end') { show('end'); renderEnd(v); return; }
  show('game'); renderGame(v);
}
var seenNotice = null;
function noticeUi(v) {
  if (seenNotice === null) seenNotice = v.notice ? v.notice.id : 0;
  else if (v.notice && v.notice.id !== seenNotice) { seenNotice = v.notice.id; if (v.notice.toast || !host) toast(v.notice.msg + (!v.notice.toast && v.phase === 'lobby' ? '。ロビーで次のゲームを待っています' : '')); }
  if (v.phase === 'lobby') overlay('menuModal', false);
  var bar = $('lobbyReqBar'), key = host && v.lobbyReq && v.phase !== 'lobby' ? v.lobbyReq.sid + ':' + v.lobbyReq.at : '';
  if (bar.dataset.key !== key) {
    bar.dataset.key = key;
    bar.innerHTML = key ? '<span>🙋 ' + esc(v.lobbyReq.name) + '「ロビーに戻りたい」</span><button data-lr="abort">中断してロビーへ</button><button data-lr="no" class="ghost">とじる</button>' : '';
    bar.classList.toggle('show', !!key);
  }
}
function lvSelect(c, lv) { return '<select data-c="' + c + '" class="' + (lv === 'ultra' ? 'ultra' : '') + '" aria-label="ふーさんの強さ">' + LV_KEYS.map(function (k) { return '<option value="' + k + '"' + (k === lv ? ' selected' : '') + '>' + LV[k] + '</option>'; }).join('') + '</select>'; }
function renderLobby(v) {
  var isHost = !!host, n = v.seats.length;
  document.body.classList.toggle('solo', !!v.solo);
  $('codeBig').textContent = v.code;
  var url = inviteUrl(v.code);
  $('inviteUrl').textContent = url;
  if (!v.solo && $('qr').dataset.url !== url) {
    try { var qr = qrcode(0, 'M'); qr.addData(url); qr.make(); $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) { $('qr').textContent = ''; }
    $('qr').dataset.url = url;
  }
  $('seatCount').textContent = n + ' / ' + MAX_HUMANS + '人';
  $('seatList').innerHTML = v.seats.map(function (s, i) {
    var tags = (s.kind === 'host' ? '<span class="tagx host">ホスト</span>' : '') + (i === v.you ? '<span class="tagx you">あなた</span>' : '') + (s.kind === 'remote' && !s.connected ? '<span class="tagx off">切断</span>' : '');
    return '<div class="seat' + (s.connected ? '' : ' offline') + '"><span class="av">' + (i + 1) + '</span><span class="nm">' + esc(s.name) + '</span>' + tags + (isHost && s.kind === 'remote' ? '<button class="xbtn" data-sid="' + s.sid + '" aria-label="外す">×</button>' : '') + '</div>';
  }).join('');
  var np = Math.max(v.opts.np, n);
  $('npSeg').innerHTML = [2, 3, 4, 5, 6, 7, 8].map(function (k) { return '<button data-v="' + k + '" class="' + (k === np ? 'on' : '') + '"' + (isHost && k >= n ? '' : ' disabled') + '>' + k + '</button>'; }).join('');
  $('npSeg').classList.toggle('ro', !isHost);
  $('npHint').textContent = np === 2 ? '2人でも遊べます（本来は3人以上向けのルールです）' : '';
  var owners = planOwners(v.seats, v.opts);
  $('cpuList').innerHTML = owners.map(function (o, c) {
    return '<div class="crow"><span class="av" style="background:' + (o.kind === 'cpu' ? '#c4581d' : '#2f6b4a') + '">' + (c + 1) + '</span><span class="nm">' + esc(o.name) + (o.kind === 'human' && o.sid === v.sid ? '（あなた）' : '') + '</span>' +
      (o.kind === 'cpu' ? (isHost ? lvSelect(c, o.lv) : '<span class="lv ' + o.lv + '">' + LV[o.lv] + '</span>') : '') + '</div>';
  }).join('');
  $('lvAllSeg').innerHTML = LV_KEYS.map(function (k) { return '<button data-v="' + k + '"' + (isHost ? '' : ' disabled') + '>' + (k === 'ultra' ? 'アストラ<br>ウルトラ😎' : LV[k]) + '</button>'; }).join('');
  var cpuN = owners.filter(function (o) { return o.kind === 'cpu'; }).length;
  $('lvAllBox').style.display = cpuN && isHost ? '' : 'none';
  $('goalSeg').innerHTML = [[200, '200点', '公式'], [100, '100点', 'ショート']].map(function (o) { return '<button data-v="' + o[0] + '" class="' + ((v.opts.goal || 200) === o[0] ? 'on' : '') + '"' + (isHost ? '' : ' disabled') + '>' + o[1] + '<small>' + o[2] + '</small></button>'; }).join('');
  $('goalSeg').classList.toggle('ro', !isHost);
  $('seatHint').textContent = v.solo ? 'ふーさん🐻の人数と強さを選んで、スタート！' : '2〜8人で遊べます。空いた席は ふーさん🐻 が入ります。招待URLかQRで、各自のスマホから参加してね';
  $('startBtn').disabled = n < 1;
}

// ---------------- ゲーム画面 ----------------
function mySeat(v) { var me = -1; v.g.owners.forEach(function (o, i) { if (o.kind === 'human' && o.sid === v.sid) me = i; }); return me; }
function dispName(o) { return o.kind === 'cpu' ? o.name + (o.lv === 'ultra' ? '😎' : '') : o.name; }
function stTxt(P, g, p) {
  if (P.st === 'bust') return 'ドボン💥';
  if (P.st === 'frozen') return 'こおり❄️';
  if (P.nums.length >= 7) return '7そろい🎉';
  if (P.st === 'stay') return 'とめた✋';
  if (g.need && g.need.p === p) return '▶ ばん';
  return 'めくり中';
}
function layoutRows(n) {
  var box = $('players'), stage = $('stage');
  // 人数が少なくて縦に余裕があるときは、ステージ（めくったカード）を大きくする
  stage.style.height = ''; box.style.gridAutoRows = '0px';
  var base = stage.offsetHeight, spare = box.clientHeight - 8 - (n * 104 + 4 * (n - 1)), extra = Math.max(0, Math.min(120, spare));
  stage.style.height = (base + extra) + 'px'; stage.classList.toggle('big', extra >= 40);
  var H = box.clientHeight - 8, rowH = Math.max(34, Math.min(112, (H - 4 * (n - 1)) / n));
  box.style.gridAutoRows = rowH + 'px';
  var cw = Math.max(16, Math.min(56, Math.floor((rowH - 9) / 1.4)));
  box.style.setProperty('--cw', cw + 'px');
  box.querySelectorAll('.pc').forEach(function (pc) {
    var cards = pc.querySelectorAll('.cd'), k = cards.length; if (!k) return;
    var gaps = pc.querySelectorAll('.gap').length * 6, avail = pc.clientWidth - gaps, need = k * (cw + 3);
    pc.style.setProperty('--ov', need > avail && k > 1 ? Math.floor((avail - cw) / (k - 1) - cw) + 'px' : '3px');
  });
  box.querySelectorAll('.cd').forEach(function (c) { c.style.setProperty('--cw', cw + 'px'); });
}
function rowHtml(g, o, p, P, e, me) {
  var nd = g.need, cls = 'pr';
  if (nd && nd.p === p) cls += ' cur';
  if (p === me) cls += ' me';
  cls += ' ' + (P.nums.length >= 7 ? 'stay' : P.st);
  if (o.kind === 'cpu' && o.lv === 'ultra') cls += ' ultra';
  if (!o.connected) cls += ' off';
  if (e && e.kind === 'bust') cls += ' shake';
  if (e && e.kind === 'flip7') cls += ' flash7';
  var lastNum = P.nums.length - 1, lastMod = P.mods.length - 1, cards = '';
  P.nums.forEach(function (c, i) { cards += cardHtml(c, e && i === lastNum && (e.kind === 'card' || e.kind === 'flip7') && e.c === c ? 'new' : ''); });
  if (P.bust !== null && P.bust !== undefined) cards += cardHtml(P.bust, 'dup' + (e && e.kind === 'bust' ? ' new' : ''));
  if (P.mods.length || P.sc || P.acts.length) cards += '<span class="gap"></span>';
  P.mods.forEach(function (c, i) { cards += cardHtml(c, e && e.kind === 'mod' && i === lastMod && e.c === c ? 'new' : ''); });
  if (P.sc) cards += cardHtml('sc', e && (e.kind === 'sc' || e.kind === 'giveSC') ? 'new' : '');
  P.acts.forEach(function (c) { cards += cardHtml(c, ''); });
  var pts = P.st === 'bust' ? 0 : L.rowScore(P.nums, P.mods, P.nums.length >= 7);
  return '<div class="' + cls + '" data-p="' + p + '"><div class="pi"><div class="pn">' + esc(dispName(o)) + '</div><div class="pt">' + g.scores[p] + '点<span class="bar"><i style="width:' + Math.min(100, g.scores[p] / g.target * 100) + '%"></i></span></div></div>' +
    '<div class="pc">' + cards + '</div><div class="ps"><b>' + pts + '</b><small>' + stTxt(P, g, p) + '</small></div></div>';
}
function renderGame(v) {
  var g = v.g, me = mySeat(v), gk = v.code + ':' + v.gameNo, nd = g.need;
  if (ui.gameKey !== gk) {
    ui.gameKey = gk; ui.lastEv = g.ev.length ? g.ev[g.ev.length - 1].id : 0; ui.sayId = g.say ? g.say.id : 0; ui.roundKey = '';
    $('revealInner').innerHTML = ''; $('reveal').classList.add('empty'); $('cap').innerHTML = '';
    if (g.ultra && g.wait > 600) awaken();
  }
  var fresh = {}, evs = g.ev.filter(function (e) { return e.id > ui.lastEv; });
  if (evs.length) { ui.lastEv = evs[evs.length - 1].id; evs.forEach(function (e) { if (e.p != null) fresh[e.p] = e; }); }
  $('phLabel').textContent = 'ラウンド' + g.round + '・親：' + dispName(g.owners[g.dealer]) + '・ゴール' + g.target;
  var html = '';
  g.owners.forEach(function (o, p) { html += rowHtml(g, o, p, g.P[p] || { nums: [], mods: [], acts: [], sc: 0, st: 'active', bust: null }, fresh[p], me); });
  $('players').innerHTML = html; layoutRows(g.n);
  $('deckCnt').textContent = '山札 ' + g.deck;
  evs.forEach(function (e) { stageEvent(v, e, me); });
  if (g.say && g.say.id !== ui.sayId) {
    ui.sayId = g.say.id; var o = g.owners[g.say.p];
    var b = document.createElement('div'); b.className = 'bubble' + (o && o.lv === 'ultra' ? ' ultra' : ''); b.textContent = (o ? dispName(o) : '') + '「' + g.say.text + '」';
    $('stage').querySelectorAll('.bubble').forEach(function (x) { x.remove(); }); $('stage').appendChild(b); setTimeout(function () { b.remove(); }, 3200);
  }
  renderCount(v, me);
  paintButtons();
  var myTarget = nd && nd.kind === 'target' && nd.p === me && g.sphase === 'play' && g.wait <= 0;
  if (myTarget) {
    var tk = g.k + ':' + nd.card;
    if ($('tgList').dataset.k !== tk) { $('tgList').dataset.k = tk; renderTarget(v, me); }
    overlay('targetModal', true);
  } else { overlay('targetModal', false); $('tgList').dataset.k = ''; }
  if ((g.sphase === 'roundEnd' || g.sphase === 'over') && g.result) {
    var rk = gk + ':' + g.round, dl = 1300 * (TURBO ? 0.2 : 1);
    if (ui.roundKey !== rk) { ui.roundKey = rk; ui.roundShownAt = Date.now() + dl; setTimeout(function () { if (lastView && lastView.phase === 'game') renderGame(lastView); }, dl + 50); }
    if (Date.now() >= ui.roundShownAt) { renderRound(v); overlay('roundModal', true); }
  } else overlay('roundModal', false);
}
function riskOf(g, P) { return P && g.rem && g.rem.t ? Math.round(P.nums.reduce(function (s, n) { return s + g.rem.c[n]; }, 0) / g.rem.t * 100) : 0; }
function paintButtons() {
  var v = lastView; if (!v || !v.g) return;
  var g = v.g, me = mySeat(v), nd = g.need, P = me >= 0 ? g.P[me] : null;
  var myHit = nd && nd.kind === 'hit' && nd.p === me && g.sphase === 'play' && g.wait <= 0;
  var risk = riskOf(g, P), canStay = P && L.canStay(P);
  $('hitBtn').disabled = !myHit || !!pending;
  $('stayBtn').disabled = !myHit || !canStay || !!pending;
  $('ctrl').classList.toggle('wait', !myHit);
  var pts = P ? (P.st === 'bust' ? 0 : L.rowScore(P.nums, P.mods, P.nums.length >= 7)) : 0;
  $('staySub').textContent = myHit ? (canStay ? pts + '点で確定' : 'カードがないので不可') : '';
  $('hitSub').textContent = myHit ? (countOn ? 'かぶる確率 ' + risk + '%' : (P && P.sc ? 'おまもり付き🍀' : 'もう1枚')) : '';
  var st = '', cls = '';
  if (g.wait > 0) st = g.ultra ? '…なにかが 目覚めようとしている…' : 'まもなく開始…';
  else if (g.sphase !== 'play') st = g.sphase === 'over' ? '🎉 ゲーム終了！' : 'ラウンド' + g.round + ' 終了';
  else if (myHit) { cls = 'mine'; st = (nd.deal ? '配りの途中：' : 'あなたの番！') + ' めくる？ とめる？' + (countOn && P.nums.length ? '<span class="risk">かぶる確率 ' + risk + '%</span>' : ''); }
  else if (nd && nd.kind === 'target' && nd.p === me) { cls = 'mine'; st = CARD_NAME[nd.card] + ' を使う相手を選んでね'; }
  else if (nd) {
    var o = g.owners[nd.p];
    st = o.kind === 'cpu' ? BEAR + ' ' + esc(dispName(o)) + (nd.kind === 'target' ? ' が ' + CARD_NAME[nd.card] + ' の相手を考え中…' : ' が考え中…')
      : esc(o.name) + (nd.kind === 'target' ? ' が ' + CARD_NAME[nd.card] + ' の相手を選んでいます' : ' の番です') + (o.connected ? '' : '（切断中）');
  }
  else if (g.f3) st = '⚡ ' + esc(dispName(g.owners[g.f3.p])) + ' が3まいドン中（のこり' + g.f3.left + '枚）';
  else if (me >= 0 && P && P.st !== 'active') st = 'このラウンドは ' + ({ stay: 'とめました', frozen: 'こおりで確定', bust: 'ドボン…' }[P.st] || '') + '。みんなを見守ろう';
  else st = 'カードをめくっています…';
  $('status').innerHTML = st; $('status').className = 'status ' + cls;
}
window.addEventListener('resize', function () { if (lastView && lastView.phase === 'game' && lastView.g) layoutRows(lastView.g.n); });
