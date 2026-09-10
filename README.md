# 🍋 ぽん酢鯖 Official Bot

プロアマクリエイターズコミュニティ「ぽん酢鯖」専用の管理 Discord Bot です。TypeScript + ESM（discord.js v14 / tsx）で構築されています。

- 参加認証（ルールクイズ → 申請フォーム → 審査 → NDA 署名）を中心に、聞き専チャット、レベル、AFK、監査ログ、デイリー統計など、サーバー運営に必要な機能を 1 つの Bot に集約しています。
- 設定はすべてスラッシュコマンド `/setup` から行い、ファイルの手編集は不要です。
- 単一サーバーでの運用を前提としています（一部の設定は環境変数で固定されます）。

> 本リポジトリはサーバー運営の透明性確保と作者のポートフォリオを目的に公開しています。オープンソースライセンスは付与していません。詳細は「ライセンスについて」を参照してください。

## 目次

1. [機能一覧](#機能一覧)
2. [コマンド一覧](#コマンド一覧)
3. [参加認証フロー](#参加認証フロー)
4. [セットアップ](#セットアップ)
5. [運用ガイド](#運用ガイド)
6. [デプロイ](#デプロイ)
7. [開発](#開発)
8. [ライセンスについて](#ライセンスについて)
9. [使用ライブラリ・クレジット](#使用ライブラリクレジット)

## 機能一覧

「設定場所」は `/setup` 実行後に選ぶメニュー項目です。

| カテゴリ | 機能 | 設定場所・コマンド |
| --- | --- | --- |
| 🛡️ 参加認証 | ルールクイズ → 申請フォーム → 審査 → NDA署名 → 認証ロール付与の完全フロー | `/setup` → 参加認証 |
| 🛡️ 認証フォーム | 申請フォーム項目のカスタマイズ（最大5項目） | `/setup` → 参加認証 → 申請フォーム設定 |
| 🛡️ 認証管理 | バイパスリスト管理、申請リセット、ユーザー検索 | `/verification-bypass`, `/verification-reset` |
| 🎫 チケット後処理 | NDA署名後のチケット削除／アーカイブ移動、状況確認、既存分の一括処理 | `/verification-tickets` |
| 📋 NDA署名 | ブラウザ上で Discord OAuth 認証 → 署名、PDF 生成（日本語フォント対応）、SHA-256 記録、本人へ DM 送付 | （自動） |
| 🔝 レベル | メッセージ XP（60 秒クールダウン）／通話 XP、レベルアップ報酬ロール、ログインボーナス | `/level`, `/level-role`, `/level-edit`, `/setup` → レベル |
| 🛌 AFK | ミュート放置の検知（1時間で 🛌 プレフィックス、警告、AFK チャンネルへ自動移動） | `/setup` → AFK |
| 👁️‍🗨️ 聞き専 | VC に紐付くテキストチャンネルの自動作成／削除、ログの保存 | `/kikisen-manage`, `/setup` → 聞き専ログ |
| 🧹 クリーンアップ | 退出メンバーのメッセージ／リアクションの一括削除（退出時に自動、または手動） | `/cleanup`, `/setup` → クリーンアップ |
| 🔨 追い打ちBAN | 退出したメンバーの自動 BAN | `/setup` → 追い打ちBAN |
| 📊 デイリー統計 | 1 日のテキスト／VC 活動レポート（グラフ付き、毎日 23:50 JST） | `/stats-now`, `/setup` → デイリー統計 |
| 🎤 VC通話ログ | 通話の開始／終了・参加者・通話時間の記録 | `/setup` → VC通話ログ |
| 🎤 VC参加中ロール | 通話に参加している間だけロールを付与 | `/setup` → VCロール |
| 💪 筋トレ通知 | 報告から 24 時間経過でリマインド | `/setup` → 筋トレ通知 |
| 🗳️ ロールパネル | セレクトメニュー式のロール自己付与 | `/setup` → ロールパネル |
| 👽 絵文字/スタンプ通知 | 他サーバーで自サーバーの絵文字／スタンプが使われたときに通知 | `/setup` → 絵文字/スタンプ通知 |
| 📁 ファイル再アップロード | 添付ファイルの自動バックアップ | `/setup` → ファイル再アップロード |
| 🦠 ウイルススキャン | URL／添付ファイルの VirusTotal スキャン（添付は 32MB まで、画像・動画・音声は既定で除外） | `/setup` → ウイルススキャン |
| 🧩 テンプレート | 常に最新位置に保つテンプレートメッセージ、Bot が投稿したメッセージの本文編集 | `/setup` → テンプレート |
| 📝 監査ログ | メッセージ編集／削除、入退室、ロール・チャンネル変更などの記録 | `/setup` → 監査ログ |
| ⏰ ステータスチャンネル | 日付／時刻を表示する VC チャンネル名の自動更新 | （自動） |
| 🔄 再起動 | Bot の再起動（未保存データを書き出してから終了） | `/reload` |

## コマンド一覧

| コマンド | 権限 | 説明 |
| --- | --- | --- |
| `/setup` | 管理者 | 全機能の設定メニュー |
| `/cleanup` | 管理者 | クリーンアップを今すぐ実行 |
| `/kikisen-manage link \| unlink \| sync` | 管理者 | 聞き専チャットの手動リンク／解除／整合性チェック |
| `/level-edit` | 管理者 | ユーザーのレベル・XP・連続ログイン日数を編集 |
| `/reload` | 管理者 | Bot を再起動 |
| `/verification-bypass add \| remove \| list \| bulk \| tickets-only` | 管理者 | 認証バイパスの管理、一括バイパス、チケットの再生成 |
| `/verification-reset` | 管理者 | ユーザーの申請をリセット（チケットも削除） |
| `/verification-tickets status \| migrate \| archive-category add \| remove \| list` | 管理者 | チケット後処理の状況確認・一括処理、アーカイブ先カテゴリの管理 |
| `/level` | 全員 | 自分（または指定ユーザー）のレベル情報 |
| `/level-role` | 全員 | レベルアップ報酬ロールの一覧 |
| `/stats-now` | 全員 | 現時点のデイリー統計レポートを送信 |

## 参加認証フロー

```
「はじめに」チャンネルの「ルールクイズを始める」ボタン
  ↓
📝 ルールクイズ（設定した出題数に全問正解）
  ↓
📋 参加申請フォーム（最大5項目、カスタマイズ可）
  ↓
⏳ 審査チャンネルで運営が 承認 / 却下（BAN） / アーカイブのみ を選択
  ↓
🎫 チケットチャンネル作成 → 「NDA署名用リンクを発行する」（1時間有効）
  ↓
🌐 ブラウザで Discord OAuth 認証（本人確認・VPN判定）→ NDA 本文を最後まで読んで署名
  ↓
🗄️ PDF + SHA-256 をアーカイブチャンネルへ永久記録
  ↓
📬 本人の DM へ PDF と SHA-256 を送付
   ・DM が閉じている場合は、チケットに設定手順と「もう一度送る」ボタンを表示
   ・DM が届くまで認証済みロールは付与されません
  ↓
✅ 認証済みロール付与・ウェルカムメッセージ
  ↓
🎫 チケットの後処理
   ・会話が無ければ削除
   ・会話があればアーカイブ先カテゴリへ移動して読み取り専用に
     （カテゴリが 50 チャンネルで満杯なら、丸数字を進めた名前で次のカテゴリを自動作成）
```

補足:

- 署名記録の証拠は「申請データ（OAuth で確認した Discord アカウント・メール・IP・端末情報・署名時刻）」と「PDF の SHA-256」です。チケットチャンネルは記録の置き場ではありません。
- 「バイパスリスト」に登録されたユーザーは、参加時にクイズ・フォームをスキップして NDA 署名から始まります。
- メンバーが退出した場合: 署名済みなら NDA 記録をアーカイブへ保存したうえでチケットを削除（移動・DM なし）、未署名ならチケットと申請を自動削除します。既存分は `/verification-tickets migrate` でも同じ扱いになります。
- 署名済みの PDF は `NDA_PUBLIC_URL/nda/<トークン>/download` からも再取得できます。

## セットアップ

### 必要要件

- Node.js 20 以上、npm
- 日本語フォント（NDA PDF 生成に使用）
  - Windows: Yu Gothic（`YuGothR.ttc` / `YuGothM.ttc`）、Meiryo、MS Gothic のいずれか
  - macOS: ヒラギノ角ゴシック
  - Linux: Noto Sans CJK（`fonts-noto-cjk` など）
- Discord Developer Portal で以下を有効化・登録
  - Privileged Gateway Intents: **Server Members**、**Message Content**、**Presence**
  - OAuth2 Redirect URL: `<NDA_PUBLIC_URL>/nda/callback`（スコープ `identify email`）
- Bot ロールには管理者権限を推奨（チャンネルの作成／削除／移動、ロール管理、ニックネーム管理、メッセージ管理、BAN、監査ログの閲覧を使用します）

### インストール

```bash
git clone https://github.com/rinewav/ponzu-saba_bot.git
cd ponzu-saba_bot
npm ci
cp .env.example .env   # 値を設定する
npm run deploy          # スラッシュコマンドを登録（GUILD_IDS のサーバーに登録）
npm run start           # 起動（tsx src/index.ts）
```

`./start.sh` を使うと、ログ表示付きのダッシュボードで起動し、Bot が落ちた場合に 5 秒後に自動再起動します。常駐運用では pm2（`ecosystem.config.cjs`）を利用してください。

### 環境変数

| キー | 必須 | 説明 |
| --- | --- | --- |
| `MAIN_BOT_TOKEN` | ✅ | Discord Bot のトークン |
| `CLIENT_ID` | ✅ | Discord アプリケーションのクライアント ID（コマンド登録・NDA の OAuth に使用） |
| `GUILD_IDS` | ✅ | コマンドを登録するサーバー ID（カンマ区切り） |
| `WELCOME_CHANNEL_ID` | ✅ | 参加時（認証完了時）のウェルカムメッセージを送るチャンネル |
| `LEAVE_CHANNEL_ID` | | 旧データ互換用。退出時に削除するウェルカムメッセージの投稿先（新規分は投稿先を自動記録） |
| `INTRO_CHANNEL_ID` | | ウェルカムメッセージで案内する自己紹介チャンネル |
| `DATE_CHANNEL_ID` / `TIME_CHANNEL_ID` | | 日付／時刻を表示する VC チャンネル（10 分ごとに名前を更新） |
| `FOOTER_ICON_URL` | | Embed フッターのアイコン URL |
| `VIRUSTOTAL_API_KEY` | | VirusTotal API キー。未設定ならスキャン機能は無効 |
| `NDA_WEB_PORT` | | NDA 署名 Web サーバーの待受ポート（既定 3001） |
| `NDA_PUBLIC_URL` | ✅ | NDA 署名ページの公開 URL（例: `https://nda.example.com`） |
| `DISCORD_CLIENT_SECRET` | ✅ | NDA 署名ページの Discord OAuth2 に使うクライアントシークレット |
| `PROXYCHECK_API_KEY` | | proxycheck.io の API キー。設定すると VPN／プロキシ経由の署名をブロック |
| `TRUST_PROXY` | | リバースプロキシ配下で `X-Forwarded-For` を信頼するか（既定 `true`、直接公開時は `false`） |

### NDA 署名 Web サーバー

- `certs/key.pem` と `certs/cert.pem` があれば HTTPS、無ければ HTTP で起動します。自己署名証明書は `./generate-cert.sh` で作成できます。
- 通常は Cloudflare などのリバースプロキシ配下で HTTP 起動し、`NDA_PUBLIC_URL` に公開 URL を設定します。この構成では `TRUST_PROXY=true`（既定）のままにしてください。

## 運用ガイド

### 初期設定の順番（参加認証）

1. `/setup` → 参加認証 で、はじめにチャンネル・認証済みロール・運営ロール・審査チャンネル・アーカイブチャンネル・チケットカテゴリを設定
2. 「問題を追加」でルールクイズを登録し、「クイズ出題数」を設定
3. 必要なら「申請フォーム設定」でフォーム項目をカスタマイズ
4. 「認証案内メッセージ送信」で、はじめにチャンネルに案内（「ルールクイズを始める」ボタン付き）を投稿。2 回目以降は既存メッセージが編集されます
5. `/verification-tickets archive-category add` でチケットのアーカイブ先カテゴリを登録（未登録でも必要時に自動作成されます）
6. 「システム ON/OFF」で有効化

### チケットの後処理

- `/verification-tickets status`: 完了済み申請のうち、チケット未処理・DM 未送付・アーカイブ未投稿の件数と、各カテゴリの使用数（50 上限）を表示
- `/verification-tickets migrate confirm:true dry_run:true`: 既存の署名済み申請に対する処理内容を確認
- `/verification-tickets migrate confirm:true`: アーカイブ記録の投稿、本人への DM 送付、チケットの削除／移動を一括実行（既存メンバーのロールには触れません）

### Bot が投稿したメッセージの本文を直す

`/setup` → テンプレート → 「Botメッセージ編集」で、メッセージリンクと新しい本文を入力すると、Bot 自身の投稿を編集できます（ルール本文の更新など）。本文は Discord の仕様により 2,000 文字までです。

### データファイル

`data/` 配下に JSON で保存されます（Git 管理外）。**`applications.json` には NDA 署名記録が含まれるため、必ずバックアップしてください。**

| ファイル | 内容 |
| --- | --- |
| `settings.json` | `/setup` で行った各機能の設定 |
| `runtime.json` | 聞き専ログ、デイリー統計、進行中のジョブなどの実行時データ |
| `applications.json` | 参加認証の申請・NDA 署名記録 |
| `levels.json` | レベル・XP・ログインボーナス |

書き込みは 500ms ごとにまとめて原子的に行われ、終了シグナル受信時と `/reload` 実行時には未保存分を書き出してから終了します。旧形式の `data/kikisen-state.json` が残っている場合は初回起動時に自動で移行され、旧ファイルは `.migrated-<時刻>` として退避されます。

## デプロイ

GitHub で Release を公開すると、以下が自動で実行されます。

1. `discord-release-notify.yml`: Release の本文を Discord へ通知（`DISCORD_WEBHOOK_URL` シークレット）
2. `deploy.yml`: セルフホストランナー（Windows）上で `git reset --hard origin/main` → `pm2 stop` → `npm install --ignore-scripts` → `npm run typecheck` → `npm run deploy` → `pm2 restart ecosystem.config.cjs --env production`

ランナーがオフラインだとワークフローは `queued` のまま待機し、24 時間で自動キャンセルされます。その場合はランナーサービスを起動するか、サーバー上で次を手動実行してください。

```powershell
pm2 stop ponzubot
git fetch origin main; git reset --hard origin/main
npm install --ignore-scripts
npm run typecheck
npm run deploy
pm2 restart ecosystem.config.cjs --env production
```

## 開発

```bash
npm run typecheck   # tsc --noEmit（品質ゲート）
npm run dev         # tsx watch src/index.ts
```

- 本番トークンでローカル起動しないでください（本番と二重稼働になり、イベントが二重処理されます）。
- コマンドを追加するときは `src/index.ts` と `src/deploy-commands.ts` の両方に登録します。
- 規約: ephemeral 返信は `flags: MessageFlags.Ephemeral`、Embed の色は `EMBED_COLORS`、日付判定は `Asia/Tokyo` を明示、タイマー内の Promise は必ず `.catch`。
- 課題管理は `bd`（beads）を使用しています（`bd ready` / `bd show <id>`）。

### プロジェクト構成

```
src/
├── index.ts                 # エントリポイント（コマンド・イベント登録）
├── deploy-commands.ts       # スラッシュコマンド登録スクリプト
├── types/                   # 型定義（state.ts が保存データの形）
├── lib/                     # 機能ごとのマネージャー
│   ├── verificationManager.ts / verificationWebServer.ts / ndaPdfGenerator.ts
│   ├── kikisenManager.ts / levelManager.ts / afkManager.ts / cleanupManager.ts
│   ├── dailyStatsManager.ts / vcLogManager.ts / logManager.ts / virusTotalManager.ts
│   ├── rolePanelManager.ts / templateManager.ts / reuploadManager.ts / crossPostManager.ts
│   ├── voiceRoleManager.ts / workoutNotifyManager.ts / updateStatusChannels.ts
│   ├── customEmbed.ts       # 共通 Embed とカラー定義
│   └── repositories/        # 永続化層（baseRepository.ts が分割保存・デバウンスを担当）
├── commands/                # スラッシュコマンド（admin/ は管理者用）
└── events/                  # Discord イベントハンドラ
```

## ライセンスについて

Copyright (c) 2026 りね（ぽん酢鯖）, All Rights Reserved.

このリポジトリは、クリエイターズコミュニティサーバー「ぽん酢鯖」の透明性を上げる目的、及び作者「りね」のポートフォリオとしてソースコードを公開しているものです。
オープンソースライセンスは付与しておらず、すべての著作権は作者に帰属します。

**【許可されていること】**

- ソースコードの閲覧
- コードの書き方などの学習目的での参考

**【禁止されていること】**

- コードの一部または全部の無断使用、複製、改変、再配布
- ご自身のDiscordサーバー等への本ボットの導入・運用
- このコードを流用して作成した派生物の公開や商用利用

## 使用ライブラリ・クレジット

このプロジェクトの開発にあたり、以下の主要なオープンソースソフトウェアおよびライブラリを使用しています。各ライブラリの作者およびコミュニティに深く感謝いたします。

- **[discord.js](https://discord.js.org/)** (Apache-2.0)
- **[express](https://expressjs.com/)** (MIT)
- **[pdfkit](https://pdfkit.org/)** (MIT)
- **[fontkit](https://github.com/foliojs/fontkit)** (MIT)
- **[chart.js](https://www.chartjs.org/)** (MIT)
- **[chartjs-node-canvas](https://github.com/Sean-Bradley/Chartjs-Node-Canvas)** (MIT)
- **[axios](https://axios-http.com/)** (MIT)
- **[node-cron](https://github.com/node-cron/node-cron)** (ISC)
- **[dotenv](https://github.com/motdotla/dotenv)** (BSD-2-Clause)
- **[tsx](https://github.com/privatenumber/tsx)** (MIT)
- **[typescript](https://www.typescriptlang.org/)** (Apache-2.0)

その他の依存ライブラリについては `package.json` および `package-lock.json` を参照してください。
