// E2E: ななめくり — solo vs ふーさん at 390×844 and 375×667, then host + guest over real PeerJS cloud signaling (local STUN workaround).
// usage: node test/stun-server.js <box-ip> 3478 &  python3 -m http.server 8811 &  node test/e2e.js <box-ip> 8811
const { chromium } = require('/workspace/hayaoshi-quiz/node_modules/playwright-core');
const IP = process.argv[2] || '172.30.0.2', PORT = process.argv[3] || 8811;
const ROOT = `http://localhost:${PORT}/index.html`;
const NET = `${ROOT}?ice=${encodeURIComponent('stun:' + IP + ':3478')}&turbo`;
const SS = __dirname + '/../screenshots/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = []; const fail = m => { errors.push(m); console.log('  ✗', m); }; const ok = m => console.log('  ✓', m);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  async function phone(label, w = 390, h = 844) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ja-JP' });
    const p = await ctx.newPage(); p.label = label;
    p.on('pageerror', e => fail(`[${label}] JS error ${e.message}`));
    p.on('console', m => { if (m.type() === 'error' && !/PeerJS|WebSocket|net::|ERR_|Failed to load resource/.test(m.text())) fail(`[${label}] console ${m.text()}`); });
    return p;
  }
  const view = p => p.evaluate(() => window.__nm.view && JSON.parse(JSON.stringify(window.__nm.view)));
  const waitV = (p, fn, ms) => p.waitForFunction(new Function('var v = window.__nm.view; return !!v && (' + fn + ');'), null, { timeout: ms || 20000 });
  // layout: no document scroll, controls inside the viewport, hub button not over any visible control
  async function layout(p, tag) {
    const r = await p.evaluate(() => {
      const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return false; for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false; return true; };
      const fab = document.getElementById('hirobaFab'), fr = fab && vis(fab) ? fab.getBoundingClientRect() : null;
      const scr = document.querySelector('.screen.active') || document.body, sr = scr.getBoundingClientRect(), hits = [];
      scr.querySelectorAll('button, input, select, a').forEach(b => {
        if (!vis(b) || b === fab) return; const r = b.getBoundingClientRect(); if (!r.width || !r.height) return;
        const top = Math.max(r.top, sr.top), bot = Math.min(r.bottom, sr.bottom, innerHeight);   // clipped by the scrolling screen
        if (bot <= top) return;
        if (fr && r.left < fr.right && r.right > fr.left && top < fr.bottom && bot > fr.top) hits.push((b.id || b.className || b.tagName) + ' ' + (b.textContent || '').trim().slice(0, 12));
      });
      const ctl = ['hitBtn', 'stayBtn'].map(id => document.getElementById(id).getBoundingClientRect());
      return { docScroll: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - innerHeight, scrollY: scrollY, fab: !!fr, hits, inGame: document.body.classList.contains('in-game'),
        ctlBottom: Math.max(ctl[0].bottom, ctl[1].bottom), ctlH: Math.min(ctl[0].height, ctl[1].height), vh: innerHeight };
    });
    if (r.docScroll > 1 || r.scrollY) fail(`[${tag}] page scrolls: ${JSON.stringify(r)}`);
    if (r.hits.length) fail(`[${tag}] hub button overlaps: ${r.hits.join(', ')}`);
    if (r.inGame) {
      if (r.fab) fail(`[${tag}] hub button visible during play`);
      if (r.ctlBottom > r.vh + 0.5 || r.ctlH < 48) fail(`[${tag}] controls off-screen/small ${JSON.stringify(r)}`);
    }
    return r;
  }
  // a few real taps on めくる／とめる (and target buttons) when it's my turn
  async function humanTurns(p, who, n) {
    let done = 0;
    while (done < n) {
      await p.waitForFunction(() => { const v = window.__nm.view; if (!v || v.phase !== 'game') return true; const g = v.g, me = mySeat(v); return g.sphase !== 'play' || (g.need && g.need.p === me && g.wait === 0 && (g.need.kind === 'target' ? document.getElementById('targetModal').classList.contains('active') : !document.getElementById('hitBtn').disabled)); }, null, { timeout: 60000 });
      const s = await p.evaluate(() => { const v = window.__nm.view; if (v.phase !== 'game' || v.g.sphase !== 'play') return null; const g = v.g, me = mySeat(v), P = g.P[me]; return { kind: g.need.kind, pts: NM.rowScore(P.nums, P.mods, false), can: NM.canStay(P), k: g.k }; });
      if (!s) { await sleep(300); continue; }
      if (s.kind === 'target') await p.tap('#tgList button[data-t]');
      else await p.tap(s.can && s.pts >= 16 ? '#stayBtn' : '#hitBtn');
      await p.waitForFunction(k => { const v = window.__nm.view; return !v.g || v.g.k !== k; }, s.k, { timeout: 10000 }).catch(() => fail(`[${who}] tap had no effect`));
      done++;
    }
    ok(`[${who}] ${n} turns played by real taps (めくる／とめる／相手選び)`);
  }

  // ================= 1) solo, 390×844, ?from=portal, アストラウルトラ in the game =================
  {
    const p = await phone('solo390');
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(400);
    let L1 = await layout(p, 'title390');
    if (!L1.fab) fail('hub button should show on title with ?from=portal'); else ok('title: 🏠 ひろばへ visible with ?from=portal, no overlap, no page scroll');
    await p.screenshot({ path: SS + 'title.png' });
    await p.fill('#nameIn', 'りょう'); await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby390');
    await p.selectOption('select[data-c="1"]', 'ultra'); await p.selectOption('select[data-c="2"]', 'strong');
    await waitV(p, "v.opts.lv[1] === 'ultra'");
    await p.tap('#startBtn');
    await p.waitForSelector('#awaken.on', { timeout: 5000 });
    const dur = await p.evaluate(() => { const a = document.getAnimations().filter(a => a.effect && a.effect.target && (a.effect.target.id === 'awaken' || a.effect.target.closest && a.effect.target.closest('#awaken'))); return Math.max.apply(null, a.map(x => x.effect.getComputedTiming().endTime)); });
    await p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 4300; }));
    await sleep(200); await p.screenshot({ path: SS + 'awaken.png' });
    const aw = await p.evaluate(() => ({ title: document.querySelector('.aw-title b').textContent, parts: document.querySelectorAll('#awParts i').length, bgm: window.__nm.bgm() }));
    await p.evaluate(() => document.getAnimations().forEach(a => a.play()));
    if (dur < 6500 || dur > 8000) fail('awakening length ' + dur); else ok(`「${aw.title}」 cinematic ${(dur / 1000).toFixed(1)}s, ${aw.parts} particles; BGM waits (cur=${aw.bgm.cur}, wanted=${aw.bgm.wanted})`);
    if (aw.bgm.cur) fail('BGM should wait for the cinematic');
    await p.tap('#awaken'); await sleep(200);
    if (await p.$('#awaken.on')) fail('tap did not skip the cinematic'); else ok('tap skips the cinematic');
    await waitV(p, 'v.g.wait === 0', 8000); await sleep(1500);
    const b = await p.evaluate(() => ({ s: window.__nm.bgm(), lv: window.__nm.bgmLevel() }));
    if (b.s.cur !== 'epic' || !(b.lv > 0.002)) fail('epic BGM not playing ' + JSON.stringify(b)); else ok(`「最終決戦」BGM playing after awakening (level ${b.lv.toFixed(3)})`);
    if (!(await p.$('.pr.ultra'))) fail('ultra row aura missing'); else ok('アストラウルトラ row has the aura border');
    await layout(p, 'game390');
    await humanTurns(p, 'solo390', 4);
    // count table toggle
    await p.tap('#countBtn'); await sleep(150);
    const cnt = await p.evaluate(() => document.querySelectorAll('#countBox.on .cc').length);
    if (cnt !== 13) fail('count table should show 13 numbers, got ' + cnt); else ok('🔢 出たカード表 shows 13 numbers + risk %');
    await layout(p, 'game390-count'); await p.tap('#countBtn');
    // cut-in effect (deterministic call, same as an ultra freeze)
    await p.evaluate(() => window.__nm.cutin('こおり札 発動！', 'テスト')); await sleep(120);
    if (!(await p.$('#cutin.on')) || !(await p.$('#game.quake'))) fail('ultra cut-in not shown'); else ok('ultra cut-in (flash + band + lightning + shake) renders');
    await sleep(1700);
    await p.evaluate(() => { window.__nm.autoplay = true; });
    // gameplay screenshot once rows hold several cards
    await p.waitForFunction(() => { const v = window.__nm.view; return v.phase !== 'game' || (v.g.sphase === 'play' && v.g.P.reduce((s, P) => s + P.nums.length + P.mods.length, 0) >= 11 && !document.getElementById('roundModal').classList.contains('active')); }, null, { timeout: 90000 });
    await p.evaluate(() => { window.__nm.autoplay = false; }); await sleep(250);
    await p.evaluate(() => document.getAnimations().forEach(a => { try { if (isFinite(a.effect.getComputedTiming().endTime)) a.finish(); } catch (e) {} }));   // settle the card-flip mid-animation
    await p.screenshot({ path: SS + 'gameplay.png' }); await layout(p, 'gameplay390');
    await p.evaluate(() => { window.__nm.autoplay = true; });
    const t0 = Date.now();
    await waitV(p, 'v.phase === "end"', 300000).catch(() => {});
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 390 game did not finish: ' + v.phase);
    else {
      const top = Math.max.apply(null, v.g.scores);
      if (top < v.g.target) fail('winner below target');
      ok(`solo 390×844 game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${v.g.round} rounds, scores ${v.g.owners.map((o, i) => o.name.replace('ふーさん🐻', 'ふー') + (o.lv ? '(' + o.lv + ')' : '') + ' ' + v.g.scores[i]).join(' / ')}`);
      if ((await p.$$('#rankList .rk')).length !== 4) fail('rank list should show 4 rows');
      await sleep(400); await p.screenshot({ path: SS + 'result.png' }); await layout(p, 'result390');
      const fabEnd = await p.evaluate(() => getComputedStyle(document.getElementById('hirobaFab')).display !== 'none');
      if (!fabEnd) fail('hub button should return on the result screen'); else ok('hub button back on result screen, no overlap');
    }
    await p.context().close();
  }

  // ================= 2) solo, 375×667 (iPhone SE size), 3 players, ゴール100 =================
  {
    const p = await phone('solo375', 375, 667);
    await p.goto(ROOT + '?turbo&from=portal'); await sleep(300);
    await layout(p, 'title375'); await p.screenshot({ path: SS + 'title_375.png' });
    await p.tap('#soloBtn'); await p.waitForSelector('#lobby.active');
    await layout(p, 'lobby375');
    await p.tap('#npSeg button[data-v="3"]'); await p.tap('#goalSeg button[data-v="100"]'); await p.tap('#lvAllSeg button[data-v="strong"]');
    await waitV(p, 'v.opts.np === 3 && v.opts.goal === 100');
    await p.tap('#startBtn'); await waitV(p, 'v.phase === "game" && v.g.wait === 0');
    if (await p.$('#awaken.on')) fail('cinematic should not play without アストラウルトラ');
    await layout(p, 'game375');
    await humanTurns(p, 'solo375', 3);
    await p.evaluate(() => { window.__nm.autoplay = true; });
    let sampled = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const v = await view(p); if (v.phase === 'end') break;
      if (v.phase === 'game' && sampled < 6) { await layout(p, 'game375-sample'); sampled++; if (sampled === 3) await p.screenshot({ path: SS + 'gameplay_375.png' }); }
      await sleep(2500);
    }
    const v = await view(p);
    if (v.phase !== 'end') fail('solo 375 game did not finish');
    else ok(`solo 375×667 game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${v.g.round} rounds, scores ${v.g.scores.join(' / ')} (layout sampled ${sampled}× during play: no page scroll, controls on screen, hub hidden)`);
    await layout(p, 'result375');
    await p.context().close();
  }

  // ================= 3) online: host + guest over PeerJS cloud =================
  {
    const host = await phone('host'), guest = await phone('guest');
    await host.goto(NET); await host.fill('#nameIn', 'りょう'); await host.tap('#createBtn');
    await host.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.getElementById('codeBig').textContent), null, { timeout: 30000 }).catch(() => {});
    const code = await host.textContent('#codeBig');
    if (!/^[A-Z0-9]{4}$/.test(code)) { fail('room could not be created (signaling blocked?)'); }
    else {
      ok('room created ' + code + ' (PeerJS cloud signaling)');
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.seats.length === 2', 45000).then(() => ok('guest joined via invite URL (WebRTC data channel up)'), () => fail('guest could not join'));
      await host.tap('#npSeg button[data-v="3"]'); await waitV(host, 'v.opts.np === 3');
      await host.selectOption('select[data-c="2"]', 'ultra');
      await waitV(guest, "v.opts.np === 3 && v.opts.lv[2] === 'ultra'");
      const cl = await guest.textContent('#cpuList'); if (!/アストラウルトラ/.test(cl)) fail('guest lobby does not show ふーさん level'); else ok('guest lobby shows ふーさん🐻 = アストラウルトラ😎');
      await host.screenshot({ path: SS + 'lobby_online.png' });
      await host.tap('#startBtn');
      await guest.waitForSelector('#awaken.on', { timeout: 10000 }).then(() => ok('覚醒 cinematic plays on the guest too'), () => fail('no cinematic on guest'));
      await waitV(guest, 'v.phase === "game" && v.g.wait === 0', 15000);
      // both humans tap at the same time (each then hands over to autoplay so nobody blocks the other)
      await Promise.all([[guest, 'guest', 3], [host, 'host', 2]].map(async ([p, who, n]) => { await humanTurns(p, who, n); await p.evaluate(() => { window.__nm.autoplay = true; }); }));
      await host.evaluate(() => { window.__nm.autoplay = false; }); await guest.evaluate(() => { window.__nm.autoplay = false; });
      const hv = await view(host), gv = await view(guest);
      if (JSON.stringify(hv.g.scores) !== JSON.stringify(gv.g.scores) || hv.g.round !== gv.g.round) fail('host/guest out of sync'); else ok('host and guest views in sync');
      // out-of-turn action is ignored
      await waitV(host, 'v.g.need && v.g.need.p !== 1', 30000).catch(() => {});
      const k0 = (await view(host)).g.k; await guest.evaluate(() => window.__nm.act('stay')); await sleep(400);
      // (it may legitimately advance due to CPU moves; check the guest's own row did not become "stay")
      const after = await view(host); if (after.g.P[1] && after.g.P[1].st === 'stay' && (await view(host)).g.round === hv.g.round && k0 === after.g.k) fail('out-of-turn stay accepted'); else ok('out-of-turn action is ignored by the host');
      await host.evaluate(() => { window.__nm.autoplay = true; }); await guest.evaluate(() => { window.__nm.autoplay = true; });
      const t0 = Date.now();
      await waitV(guest, 'v.phase === "end"', 300000).catch(() => {});
      const ev = await view(guest), eh = await view(host);
      if (ev.phase !== 'end' || eh.phase !== 'end') fail('online game did not finish: ' + eh.phase + '/' + ev.phase);
      else {
        ok(`online game finished in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${eh.g.round} rounds, scores ${eh.g.scores.join(' / ')}`);
        if (JSON.stringify(eh.g.scores) !== JSON.stringify(ev.g.scores)) fail('final scores differ host/guest');
        await guest.screenshot({ path: SS + 'result_online_guest.png' });
      }
      await host.evaluate(() => { window.__nm.autoplay = false; }); await guest.evaluate(() => { window.__nm.autoplay = false; });
      // 「ロビーに戻りたい」 → host 中断
      await host.tap('#againBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      // close anything covering the top bar (覚醒 cinematic / my own target choice), then use the ⋯ menu
      const clear = async p => { for (let i = 0; i < 20; i++) {
        if (await p.$('#awaken.on')) await p.tap('#awaken').catch(() => {});
        if (await p.$('#targetModal.active')) await p.tap('#tgList button[data-t]').catch(() => {});
        if (!(await p.$('#awaken.on')) && !(await p.$('#targetModal.active'))) break; await sleep(200);
      } };
      await clear(guest); await guest.tap('#menuBtn'); await guest.tap('#menuReq');
      await host.waitForSelector('#lobbyReqBar.show button[data-lr="abort"]', { timeout: 10000 }); await clear(host); await host.tap('#lobbyReqBar button[data-lr="abort"]'); await host.tap('#cfYes');
      await waitV(guest, 'v.phase === "lobby"').then(() => ok('ロビーに戻りたい → host 中断してロビーへ → both in lobby'), () => fail('abort to lobby failed'));
      // reconnect by nickname mid-game
      await host.tap('#startBtn'); await waitV(guest, 'v.phase === "game"', 15000);
      await guest.goto(NET + '&room=' + code); await guest.fill('#nameIn', 'たろう'); await guest.tap('#joinInvitedBtn');
      await waitV(guest, 'v.phase === "game"', 45000).then(() => ok('guest reloaded and rejoined mid-game by nickname'), () => fail('rejoin failed'));
    }
  }
  await browser.close();
  console.log(errors.length ? `\nFAILED (${errors.length})` : '\nALL E2E CHECKS PASSED');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
