# 疆域骰戰

兩人連線的回合制擲骰征服遊戲。Next.js 15 + Socket.IO，手機、平板、電腦皆可玩。

## 啟動

```bash
npm install
npm run dev          # 開發模式
# 或
npm run build && npm start   # 正式模式
```

終端機會印出兩個網址：

- `http://localhost:3000`：本機
- `http://192.168.x.x:3000`：同一個 Wi-Fi 的手機/平板開這個

建立房間後把房號（或連結）給對手即可加入。斷線重開網頁會回到原本的座位；第三個人進房會變成觀戰。

> 想讓不同網路的朋友連進來，需要部署到支援 WebSocket 的長駐主機（Render、Railway、Fly.io、VPS 等），啟動指令用 `npm run build && npm start`。Vercel 的 serverless 不支援這種常駐連線。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `server.js` | Next.js 自訂伺服器 + Socket.IO 房間；所有骰子都在伺服器擲 |
| `lib/game.js` | 規則引擎（國家技能、判定表、行動結算），前後端共用 |
| `lib/mapgen.js` | 地圖生成（大陸/群島/混合），同一個 seed 前後端結果相同 |
| `components/MapCanvas.js` | 地圖繪製與點擊 |
| `components/Dice.js` | 擲骰動畫 |
| `app/page.js` | 入口、大廳、對局畫面 |
| `scripts/sim.js` | 引擎自動對戰測試：`npm run test:engine` |
| `scripts/e2e.js` | 連線測試（先開伺服器）：`node scripts/e2e.js 3000` |

## 平衡數值（在 `lib/game.js` 調整）

- d12：1 = 大失敗、12 = 大成功（各 1/12）；2–11 加修正值 ≥ 7 為成功。基礎約 8% / 42% / 42% / 8%。
- 修正值：國力差 (敵方領土 − 我方領土) ÷ 3，上限 ±2；跨海 −1；總和限 ±4。
- 英國跨海 +2、美國進攻 +1 / 被攻擊時敵方 −1、義大利進攻 −2、法國馬奇諾 −2。
- 連續 3 回合沒有新標記的領土會自動 −1 層標記（`RECOVER`），避免前線全被標記而卡死。
- 首都被攻陷 2 次才滅國（`CAP_LIVES`）；第一次失守後，失守方免費另立首都。
- 日本「天皇」每 2 回合免費遷都到任意自有領土；目的地原有標記清空，但舊首都的標記會跟著帶過去。
