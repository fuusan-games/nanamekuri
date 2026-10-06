# ななめくり 〜ふーさんの どきどき山札〜

「めくる？ とめる？」のバースト系カードゲームを、スマホ・PCのブラウザで遊べるオンライン版です（オリジナルの名前・文言・見た目）。

- 各自のスマホで参加（部屋コード／招待URL／QR）。PeerJS（WebRTC）のP2P通信で、ホストのブラウザが進行を管理します。
- 空いた席には ふーさん🐻（弱い／普通／強い／アストラウルトラ😎）が入ります。ふーさんは見えているカードだけを数えます（山札はのぞきません）。
- 「🐻 ふーさんと ひとりで遊ぶ」は通信なしで遊べます。
- 2〜8人。ゴールは200点（公式）か100点（ショート）。

## ファイル
- `index.html` … 画面とスタイル
- `core.js` … 共通の定数・小道具・汎用UI
- `audio.js` / `bgm.js` … 効果音・BGM（Web Audio で合成）
- `fx.js` … ふーさん覚醒・カットイン・紙ふぶき
- `host.js` … ホスト側のゲーム進行（authoritative）
- `net.js` … PeerJS の通信（ホスト受付・参加者）
- `ui.js` / `stage.js` … 画面の描画
- `app.js` … ボタン操作・タイトル・全体の流れ（最後に読み込む）
- `logic.js` … ルールエンジンとふーさんAI（DOMに依存しない）
- `config.js` … STUN/TURN の設定（`SR_CONFIG.iceServers`）
- `vendor/` … peerjs, qrcode

## テスト
```
node test/logic.test.js     # ルールのテスト
node test/sim.js 2000       # ふーさん同士の対戦シミュレーション
# ブラウザE2E（ひとり用 390×844／375×667、ホスト＋ゲストのオンライン対戦）
node test/stun-server.js <box-ip> 3478 &  python3 -m http.server 8811 &  node test/e2e.js <box-ip> 8811
```
