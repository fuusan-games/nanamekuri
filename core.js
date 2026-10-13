/* ななめくり：共通の定数・小道具・汎用UI（ほかのスクリプトより先に読み込む）
 * 構成：WebRTC（PeerJS）による P2P。ホストのブラウザが唯一の正（authoritative）で、山札・進行・ふーさん🐻の思考はホストが行います。
 */
'use strict';
var $ = function (id) { return document.getElementById(id); };
var L = window.NM;
var Q = new URLSearchParams(location.search);
var CFG = window.NM_CONFIG || window.SR_CONFIG || {};
var ICE = (CFG.iceServers && CFG.iceServers.length) ? CFG.iceServers : [{ urls: 'stun:stun.l.google.com:19302' }];
if (Q.get('ice')) ICE = Q.get('ice').split(',').map(function (u) { return { urls: u }; });   // テスト・独自環境用
var PEER_OPTS = Object.assign({ debug: 1, config: { iceServers: ICE } }, CFG.peer || {});
var ID_PREFIX = 'nanamekuri-v1-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var TURBO = Q.has('turbo');
var T = TURBO ? { cpu: [60, 120], off: 1200, roundEnd: 1400, awaken: 2500, k: 0.18 } : { cpu: [650, 1250], off: 8000, roundEnd: 6500, awaken: 7500, k: 1 };
var MAX_HUMANS = 8, HB_MS = 3000, LOST_MS = 10000;
var LV = { weak: '弱い', normal: '普通', strong: '強い', ultra: 'アストラウルトラ😎' };
var LV_KEYS = ['weak', 'normal', 'strong', 'ultra'];
var BEAR = '🐻', CPU_BASE = 'ふーさん' + BEAR;
var CARD_NAME = { fz: '❄️こおり', f3: '⚡3まいドン', sc: '🍀おまもり', x2: '×2', p2: '＋2', p4: '＋4', p6: '＋6', p8: '＋8', p10: '＋10' };
var NUMC = ['#868e96', '#e03131', '#f76707', '#e67700', '#5c940d', '#2b8a3e', '#0ca678', '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c'];
var LS_ID = 'nm-client-id', LS_NAME = 'nm-name', LS_HOST = 'nm-host-room', SS_CLIENT = 'nm-joined', LS_COUNT = 'nm-count', LS_SOUND = 'nm-sound-off';
// 画面間で共有する状態
var host = null, client = null, lastView = null, pending = '';
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch (e) {} }
function load(k, json) { try { var v = localStorage.getItem(k); return json ? JSON.parse(v) : v; } catch (e) { return null; } }
function sstore(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function sload(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } }
function rid(n) { var s = ''; for (var i = 0; i < n; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]; return s; }
var myId = load(LS_ID) || (function () { var v = rid(16); store(LS_ID, v); return v; })();
var countOn = load(LS_COUNT) === '1', soundOff = load(LS_SOUND) === '1';
function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function rand(a) { return a[0] + Math.random() * (a[1] - a[0]); }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 8); }
var PARTY = window.FuuParty && window.FuuParty.info;   // ひろばの「みんなの部屋」から来たとき
function genCode() { if (PARTY && PARTY.host) return PARTY.code; var c = ''; for (var i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return c; }
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, 4); }
function inviteUrl(code) { var u = location.origin + location.pathname + '?room=' + code; if (Q.get('ice')) u += '&ice=' + encodeURIComponent(Q.get('ice')); return u; }
function fill(t, o) { return t.replace(/\{(\w+)\}/g, function (_, k) { return o[k] != null ? o[k] : ''; }); }

// ---------- カードの見た目 ----------
function cardHtml(c, cls) {
  cls = cls ? ' ' + cls : '';
  if (typeof c === 'number') return '<div class="cd n' + cls + '" style="--nc:' + NUMC[c] + ';--nb:' + NUMC[c] + '33"><i>' + c + '</i><b>' + c + '</b></div>';
  if (c === 'back') return '<div class="cd back' + cls + '"><b>🐻</b></div>';
  if (c === 'x2') return '<div class="cd md x2' + cls + '"><b>×2</b><small>ばいばい</small></div>';
  if (/^p/.test(c)) return '<div class="cd md' + cls + '"><b>+' + c.slice(1) + '</b><small>おまけ</small></div>';
  if (c === 'fz') return '<div class="cd ac fz' + cls + '"><b>❄️</b><small>こおり</small></div>';
  if (c === 'f3') return '<div class="cd ac f3' + cls + '"><b>⚡</b><small>3まいドン</small></div>';
  if (c === 'sc') return '<div class="cd ac sc' + cls + '"><b>🍀</b><small>おまもり</small></div>';
  return '';
}

// ---------- 汎用UI ----------
function show(id) { ['title', 'lobby', 'game', 'end'].forEach(function (s) { $(s).classList.toggle('active', s === id); }); document.body.classList.toggle('in-game', id === 'game'); }
function overlay(id, on) { $(id).classList.toggle('active', on); }
var toastT;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 3000); }
function banner(msg) { var b = $('banner'); b.textContent = msg || ''; b.classList.toggle('show', !!msg); }
function confirmBox(title, text, yes, cb) {
  $('cfTitle').textContent = title; $('cfText').textContent = text; $('cfYes').textContent = yes; $('cfNo').style.display = '';
  overlay('confirmModal', true);
  $('cfYes').onclick = function () { overlay('confirmModal', false); cb(); };
  $('cfNo').onclick = function () { overlay('confirmModal', false); };
}
function alertBox(msg) { confirmBox('お知らせ', msg, 'OK', function () {}); $('cfNo').style.display = 'none'; }
function connecting(on, title, text, onCancel) {
  overlay('connecting', on);
  if (on) { $('connTitle').textContent = title || '接続中…'; $('connText').textContent = text || ''; $('connCancel').onclick = onCancel || function () { location.href = location.pathname; }; }
}
$('rulesBtn1').onclick = $('rulesBtn2').onclick = function () { overlay('rulesModal', true); };
$('rulesClose').onclick = function () { overlay('rulesModal', false); };
['rulesModal', 'menuModal'].forEach(function (id) { $(id).addEventListener('click', function (e) { if (e.target === this) overlay(id, false); }); });
$('rulesList').innerHTML = [
  '山札は<b>94枚</b>。数字カード <b>0〜12</b>（大きい数字ほど枚数が多い：12は12枚 … 1は1枚、0は1枚）、おまけカード ' + cardHtml('p2') + cardHtml('p4') + cardHtml('p6') + cardHtml('p8') + cardHtml('p10') + cardHtml('x2') + '（各1枚）、とくべつカード ' + cardHtml('fz') + cardHtml('f3') + cardHtml('sc') + '（各3枚）。',
  'ラウンドのはじめに、親の左どなりから順に<b>1枚ずつ表向き</b>で配ります。とくべつカードが出たら、その場ですぐ使います。',
  '自分の番では <b>「めくる」</b>（もう1枚）か <b>「とめる」</b>（このラウンドの点を確定して抜ける）を選びます。カードが1枚もないときは めくるしかありません。',
  'すでに持っている数字が出たら <b style="color:#d6342c">ドボン</b>！ このラウンドは<b>0点</b>（おまけがあっても0点）。',
  'ちがう数字を<b>7枚</b>ならべたら <b>「ななそろい」</b>！ <b>+15点</b>。そのラウンドはすぐ終わります（ほかの人も手元の点をもらえます）。',
  '点数：数字の合計 → ' + cardHtml('x2') + 'があれば<b>2倍</b> → <b>＋おまけ</b> → ななそろいなら<b>+15</b>。',
  cardHtml('fz') + ' <b>こおり</b>：まだめくっている誰か（自分もOK）に使います。受けた人は<b>いまの点で確定</b>してラウンドを抜けます。',
  cardHtml('f3') + ' <b>3まいドン</b>：誰か（自分もOK）に使うと、その人は<b>3枚つづけて</b>めくります。ドボンや ななそろいになったらそこで終わり。途中で出た こおり・3まいドン は、3枚めくり終えてから使います。',
  cardHtml('sc') + ' <b>おまもり</b>：持っておくと、<b>かぶった1回だけ</b>助かります（かぶった数字といっしょに捨てる）。1人1枚まで。2枚目は、まだ持っていない人に渡します。ラウンドが終わると捨てます。',
  'めくっている人がいなくなるか、誰かが ななそろい したらラウンド終了。使ったカードは捨て札にして、山札は<b>次のラウンドもそのまま</b>使います（なくなったら捨て札を切って作り直し）。親は左どなりへ。',
  '誰かが<b>200点以上</b>になったラウンドの終わりに、いちばん点が高い人の勝ち！（トップが同点なら、全員でもう1ラウンド）',
  '🔢ボタンで「まだ山札に残っているカード」と「次にかぶる確率」を見られます。ふーさん（強い以上）も、<b>見えているカードだけ</b>を数えて考えています（山札はのぞきません）。',
  '2〜8人（本来は3人以上向けですが2人でも遊べます）。空いた席は <b>ふーさん🐻</b>（弱い／普通／強い／アストラウルトラ😎）。'
].map(function (t) { return '<li>' + t + '</li>'; }).join('');
$('titleFan').innerHTML = cardHtml(3) + cardHtml(12) + '<span class="bear">🐻</span>' + cardHtml('sc') + cardHtml('x2');
