/* ななめくり：描画 — めくったカードの演出・出たカード表・相手選び・ラウンド結果・最終結果 */
'use strict';
function popText(text, cls) { var p = $('pop'); p.className = ''; void p.offsetWidth; p.textContent = text; p.className = 'go ' + (cls || ''); }
function stageEvent(v, e, me) {
  var g = v.g, o = e.p != null ? g.owners[e.p] : null, nm = o ? esc(dispName(o)) : '', cap = $('cap');
  var ultra = o && o.kind === 'cpu' && o.lv === 'ultra';
  if (e.c !== undefined && /^(card|bust|saved|flip7|mod|sc|sc2|aside)$/.test(e.kind)) {
    var inner = $('revealInner'); inner.innerHTML = cardHtml(e.c) + cardHtml('back', 'bk'); $('reveal').classList.remove('empty');
    inner.classList.remove('go'); void inner.offsetWidth; inner.classList.add('go');
    var what = typeof e.c === 'number' ? '「' + e.c + '」' : CARD_NAME[e.c];
    cap.innerHTML = '<div class="who">' + nm + (e.f3 ? ' ⚡3まいドン' : '') + (e.p === me ? '（あなた）' : '') + '</div><div class="what">' + what + ' をめくった</div>';
    sfx.card();
  }
  if (e.kind === 'bust') {
    popText('かぶった！ ドボン💥', 'bad'); cap.innerHTML += '<div>「' + e.c + '」は もう持っていた…</div>';
    $('stage').classList.remove('bustFx'); void $('stage').offsetWidth; $('stage').classList.add('bustFx'); sfx.bust(); if (e.p === me) vibrate([60, 40, 120]);
  }
  else if (e.kind === 'saved') { popText('おまもりでセーフ🍀', 'safe'); sfx.safe(); }
  else if (e.kind === 'flip7') { popText('ななそろい！ +15🎉', 'good'); confetti(ultra ? 90 : 60); sfx.flip7(); if (ultra) cutin('ななそろい！', '計算どおりだクマ😎✨'); }
  else if (e.kind === 'sc') cap.innerHTML += '<div>🍀 おまもりゲット</div>';
  else if (e.kind === 'sc2') cap.innerHTML += '<div>🍀 2枚目 → 誰かに渡す</div>';
  else if (e.kind === 'aside') cap.innerHTML += '<div>（3枚めくり終えたら使う）</div>';
  else if (e.kind === 'action') cap.innerHTML += '<div>→ だれに使う？</div>';
  else if (e.kind === 'freeze') {
    var to = esc(dispName(g.owners[e.to])); popText('❄️ こおり！ ' + to, 'ice');
    cap.innerHTML = '<div class="who">' + nm + '</div><div class="what">❄️ ' + (e.to === e.p ? 'じぶんを こおらせた' : to + ' を こおらせた') + '</div>'; sfx.freeze();
    if (ultra && e.to !== e.p) cutin('こおり札 発動！', dispName(g.owners[e.to]) + ' の未来は止まるクマ😎❄️');
  }
  else if (e.kind === 'flip3') {
    var t3 = esc(dispName(g.owners[e.to])); popText('⚡ 3まいドン！ ' + t3, 'bad');
    cap.innerHTML = '<div class="who">' + nm + '</div><div class="what">⚡ ' + (e.to === e.p ? 'じぶんに 3まいドン' : t3 + ' に 3まいドン') + '</div>'; sfx.f3();
    if (ultra && e.to !== e.p) cutin('3まいドン 発動！', dispName(g.owners[e.to]) + '…3枚の運命を受けるクマ😎⚡');
  }
  else if (e.kind === 'giveSC') cap.innerHTML = '<div class="who">' + nm + '</div><div class="what">🍀 おまもりを ' + esc(dispName(g.owners[e.to])) + ' へ</div>';
  else if (e.kind === 'fizzle') cap.innerHTML = '<div class="what">' + (CARD_NAME[e.c] || '') + ' は不発（相手がもう抜けていた）</div>';
  else if (e.kind === 'scDrop') cap.innerHTML += '<div>（渡せる人がいないので捨て札）</div>';
  else if (e.kind === 'stay') { cap.innerHTML = '<div class="who">' + nm + '</div><div class="what">✋ とめた（' + e.pts + '点）</div>'; sfx.stay(); }
  else if (e.kind === 'reshuffle') toast('山札がなくなったので、捨て札を切りなおしました');
  else if (e.kind === 'round') { $('revealInner').innerHTML = ''; $('reveal').classList.add('empty'); cap.innerHTML = '<div class="what">ラウンド' + e.round + ' スタート！</div><div class="who">親：' + esc(dispName(g.owners[e.dealer])) + '</div>'; }
  if (e.kind !== 'round' && g.need && g.need.kind === 'hit' && g.need.p === me && e.id === g.ev[g.ev.length - 1].id) sfx.turn();
}
function renderCount(v, me) {
  var g = v.g, box = $('countBox');
  box.classList.toggle('on', countOn && !!g.rem);
  if (!countOn || !g.rem) return;
  var mine = {}; if (me >= 0 && g.P[me]) g.P[me].nums.forEach(function (n) { mine[n] = 1; });
  var c = g.rem.c, cells = '';
  for (var n = 0; n <= 12; n++) cells += '<div class="cc' + (mine[n] ? ' mine' : '') + (!c[n] ? ' gone' : '') + '"><b style="color:' + (mine[n] ? '#fff' : '#ffe9a8') + '">' + n + '</b><small>' + c[n] + '/' + L.ALL[n] + '</small></div>';
  var mods = ['p2', 'p4', 'p6', 'p8', 'p10', 'x2'].filter(function (m) { return c[L.ci(m)]; }).map(function (m) { return CARD_NAME[m]; }).join(' ') || 'なし';
  var risk = me >= 0 ? riskOf(g, g.P[me]) : 0;
  box.innerHTML = '<div class="cgrid">' + cells + '</div><div class="crest">山札 <b>' + g.rem.t + '</b>枚（捨て札 ' + g.disc + '）・あなたが次にかぶる確率 <b>' + risk + '%</b><br>おまけ残り：' + mods + '／❄️' + c[19] + ' ⚡' + c[20] + ' 🍀' + c[21] + '</div>';
}
function renderTarget(v, me) {
  var g = v.g, nd = g.need, c = nd.card;
  $('tgTitle').textContent = { fz: '❄️ こおり を だれに使う？', f3: '⚡ 3まいドン を だれに使う？', sc: '🍀 おまもり を だれにあげる？' }[c];
  $('tgDesc').textContent = { fz: '受けた人は、いまの点で確定して このラウンドを抜けます。', f3: '受けた人は、山札から3枚つづけてめくります（かぶったらドボン）。', sc: 'あなたはもう持っているので、まだ持っていない人に渡します。' }[c];
  $('tgList').innerHTML = nd.opts.map(function (t) {
    var P = g.P[t], o = g.owners[t], pts = L.rowScore(P.nums, P.mods, false);
    return '<button data-t="' + t + '" class="' + (t === me ? 'self' : '') + '"><span class="nm">' + esc(dispName(o)) + (t === me ? '（じぶん）' : '') + '<br><small>いま ' + pts + '点・数字' + P.nums.length + '枚' + (countOn ? '・かぶる確率' + riskOf(g, P) + '%' : '') + '・合計' + g.scores[t] + '点</small></span>' + (c === 'fz' ? '❄️' : c === 'f3' ? '⚡' : '🍀') + '</button>';
  }).join('');
}
function renderRound(v) {
  var g = v.g, r = g.result;
  $('rdTitle').textContent = g.sphase === 'over' ? '🎉 ゲーム終了！（ラウンド' + r.round + '）' : 'ラウンド' + r.round + ' のけっか' + (r.tie ? '（ゴール超えで同点 → もう1ラウンド！）' : '');
  $('rdList').innerHTML = g.owners.map(function (o, p) {
    var P = g.P[p], pts = r.pts[p], cls = P && P.st === 'bust' ? 'z' : r.flip7 === p ? 'f7' : '';
    var lab = P && P.st === 'bust' ? 'ドボン 0' : (r.flip7 === p ? '🎉+' + pts : '+' + pts);
    return '<div class="rr"><span class="nm">' + esc(dispName(o)) + '</span><span class="gain ' + cls + '">' + lab + '</span><span class="bar"><i style="width:' + Math.min(100, r.totals[p] / g.target * 100) + '%"></i></span><span class="tot">' + r.totals[p] + '点</span></div>';
  }).join('');
  $('rdNext').textContent = g.nextIn != null ? (g.sphase === 'over' ? 'まもなく結果発表…' : '次のラウンドまで ' + Math.ceil(g.nextIn / 1000) + '秒') : '';
  $('rdGo').textContent = g.sphase === 'over' ? '▶ 結果を見る' : '▶ 次のラウンドへ';
}
function renderEnd(v) {
  var g = v.g; if (!g) return;
  var rows = g.owners.map(function (o, p) { return { o: o, p: p, sc: g.scores[p] }; }).sort(function (a, b) { return b.sc - a.sc; });
  var rank = 0;
  $('rankList').innerHTML = rows.map(function (r, i) {
    if (i === 0 || r.sc < rows[i - 1].sc) rank = i + 1;
    return '<div class="rk' + (rank === 1 ? ' first' : '') + '"><span class="md">' + (['🥇', '🥈', '🥉'][rank - 1] || rank) + '</span><span class="nm">' + esc(dispName(r.o)) +
      (r.o.kind === 'cpu' ? ' <span class="lv ' + r.o.lv + '" style="font-size:10px">' + LV[r.o.lv] + '</span>' : '') + (r.o.sid === v.sid && r.o.kind === 'human' ? '<small>あなた</small>' : '') + '</span><span class="sc">' + r.sc + '</span></div>';
  }).join('') + (rows[0].o.kind === 'cpu' ? '<p class="mid">' + BEAR + (rows[0].o.lv === 'ultra' ? '「山札の声が聞こえたクマ😎」' : '「ふーさんの勝ちクマ〜！」') + '</p>' : '<p class="mid">🎉 ' + esc(rows[0].o.name) + ' の勝ち！ ' + BEAR + '「まいったクマ〜」</p>');
  $('leaveBtn2').textContent = host ? (host.room.solo ? '🚪 タイトルへ' : '🚪 部屋を閉じる') : '🚪 部屋を出る';
  var key = v.code + ':' + v.gameNo;
  if (ui.endKey !== key) { ui.endKey = key; confetti(70); sfx.flip7(); }
}
