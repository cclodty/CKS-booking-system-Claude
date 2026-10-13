# CKS 場地預約 UI 重設計

蔡高中學場地預約系統的介面重設計稿。原本在 Claude Design 畫布上製作，現搬到此 repo 繼續開發。

> 先前的 PHP + MySQL 版本已從此分支移除，需要時可從 git 歷史找回（commit `90d486a`）。

---

## 預覽

用瀏覽器直接開啟 **`design/index.html`**（雙擊即可，毋須伺服器）。總覽頁列出全部畫面的縮圖，
點任何一個開啟全尺寸、可操作的預覽；右下角工具列可返回總覽。資料為示範資料，重新整理後還原。

預約側欄的情境可用網址參數切換，亦可在工具列切換：

| 網址 | 情境 |
|---|---|
| `Drawer.dc.html` | 直接預約 |
| `Drawer.dc.html?mode=approval` | 需經審批 |
| `Drawer.dc.html?conflict=true` | 核對時發現撞期 |

---

## 目錄結構

```
design/
├── index.html             預覽總覽頁
├── support.js             本地預覽用的執行環境，令 *.dc.html 可直接在瀏覽器開啟
├── canvas.json            畫布索引：各畫板的位置、尺寸、標題及設計重點備註
├── Main.dc.html           桌面 · 時間表先行（可點選課節）       1440 × 1040
├── Drawer.dc.html         桌面 · 預約側欄：填寫 → 核對 → 完成   560 × 1040
├── Mobile.dc.html         手機 · 單日課節清單                   401 × 844
├── MobileRooms.dc.html    手機 · 選擇場地                       390 × 844
├── Lookup.dc.html         查詢預約 · 按預約編號分組取消         1440 × 960
├── Admin.dc.html          管理工作台 · 待審申請                 1440 × 960
└── assets/                校徽及 13 個場地相片（已壓縮，每張約 17KB）
```

畫板之間以相對連結互通（例如時間表的「預約」按鈕連到 `Drawer.dc.html`）。

## 設計重點（功能不變）

1. 時間表先行：拿走大橫幅與場地輪播，打開即見課節。
2. 空格是行動：可預約留白、已預約轉淡、不開放用斜紋。
3. 預約改用右側欄三步：填寫 → 核對 → 完成，核對時寫「確認後即成立」而非「已成立」。
4. 手機改為單日清單，大觸控區；週末自動跳到下週。
5. 查詢結果按預約編號分組，配合「同一編號才可一次取消」的規則。
6. 管理端待審預設全學年，導覽列顯示待審數。
7. 場地圖由 2MB PNG 縮為約 17KB JPEG（33MB → 0.24MB）。

## 視覺規格

| 用途 | 值 |
|---|---|
| 內文字型 | Noto Sans TC（後備 PingFang TC、Microsoft JhengHei） |
| 標題字型 | Noto Serif TC |
| 主色 | `#0B6E5F`（hover `#08564A`，淺底 `#DCEEE8` / `#E3F1EC`） |
| 頁面底色 / 面板 | `#F4F2EC` / `#FBFAF7`，卡片 `#FFFFFF` |
| 文字 | 主 `#16222E`、次 `#3E4B58`、輔助 `#5B6672` |
| 邊框 | `#E3E0D8`、`#D5D1C6`、`#CFCAC0` |
| 待審 / 警示 | 標記 `#B45309`，膠囊 `#FBEFD9` 底 `#8A4F00` 字 |
| 危險操作 | `#B42318` |
| 圓角 | 按鈕 / 輸入框 8–10px，卡片 16px |

## 檔案格式說明

`*.dc.html` 是 Claude Design 的元件格式：

- 版面寫在 `<x-dc>` 內，`<helmet>` 放字型及全域樣式。
- `{{name}}` 從底部 `<script type="text/x-dc">` 中 `Component.renderVals()` 回傳的值取值。
- `<sc-for>` 為重複、`<sc-if>` 為條件顯示；狀態以 `this.setState()` 更新。

每個畫板都以 `<script src="./support.js">` 載入執行環境。在 Claude Design 編輯器內由編輯器提供；
在此 repo 則由 `design/support.js` 提供，所以畫板原始碼毋須任何修改即可預覽。
如要把畫板貼回 Claude Design，只需搬 `*.dc.html`、`canvas.json` 及圖片，不要連同 `support.js` 和 `index.html`。

原始畫布仍保留在 Claude：<https://claude.ai/artifact/L19ysomHfTqK4LYYE5haWs>（只有擁有者可開啟）。
