# 🍋 ぽん酢鯖 Official Bot

プロアマクリエイターズコミュニティ「ぽん酢鯖」の管理用 Discord ボットです。TypeScript + ESM で構築されています。

## 機能一覧

| カテゴリ                | 機能                                                        | コマンド                                                      |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| 🔝 レベル               | メッセージ/通話XP、レベルアップ報酬ロール、ログインボーナス | `/level`, `/level-roles`, `/setup-level`                      |
| 🛌 AFK                  | 放置検知、ニックネームPrefix、AFKチャンネル自動移動         | `/setup-afk`                                                  |
| 👁️‍🗨️ 聞き専               | VCに紐付くテキストチャンネル自動作成/削除、ログ保存         | `/kikisen-manage`, `/kikisen-setup`                           |
| 🧹 クリーンアップ       | 退出メンバーのメッセージ/リアクション一括削除               | `/cleanup`, `/setup-cleanup`                                  |
| 🛡️ 認証                 | あいことば認証、ロール自動付与                              | `/setup-verification`                                         |
| 🛡️ 追い打ちBAN          | 退出時の自動BAN                                             | `/setup-reban`                                                |
| 📊 デイリー統計         | サーバー活動レポート（グラフ付き）                          | `/stats-now`, `/setup-dailystats`                             |
| 🔔 VC通知               | 通話開始時の通知                                            | `/setup-vcnotify`                                             |
| 🎤 VCロール             | 通話参加中ロール付与                                        | `/setup-voicerole`                                            |
| 🗳️ 投票リマインダー     | 2時間後の再投票通知                                         | （自動検知）                                                  |
| 💪 筋トレ通知           | 24時間未報告時のリマインダー                                | `/setup-workout`                                              |
| 📊 ロールパネル         | セレクトメニュー式ロール選択                                | `/role-panel`                                                 |
| 👽 クロスポスト通知     | 他サーバーでの絵文字/スタンプ使用通知                       | `/setup-crosspost`                                            |
| 📁 ファイル再アップ     | 添付ファイルの自動バックアップ                              | `/setup-reupload`                                             |
| 🛡️ ウイルススキャン     | URL/添付ファイルのVirusTotalスキャン                        | （自動検知）                                                  |
| 🧩 テンプレート         | 常に最新状態を維持するテンプレートメッセージ                | `/setup-template`, `/setup-introduction`, `/setup-message-id` |
| 📝 ログ                 | 各種イベントのログ記録                                      | `/setup-logs`                                                 |
| ⏰ ステータスチャンネル | 日付/時刻VCチャンネルの自動更新                             | （自動動作）                                                  |
| 🔄 リロード             | ボット再起動                                                | `/reload`                                                     |

## 必要要件

- Node.js 20+
- npm

## セットアップ

### 1. インストール

```bash
git clone https://github.com/rinewav/ponzu-saba_bot.git
cd ponzubots
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して各値を記入してください：

```env
# 必須
MAIN_BOT_TOKEN=          # Discord Bot Token
CLIENT_ID=               # Bot Application ID
GUILD_IDS=               # カンマ区切りで複数指定可能

# チャンネルID（使用する機能に応じて設定）
WELCOME_CHANNEL_ID=      # ウェルカムメッセージ送信先
LEAVE_CHANNEL_ID=        # 退出メッセージチャンネル
INTRO_CHANNEL_ID=        # 自己紹介チャンネル
DATE_CHANNEL_ID=         # 日付表示VC
TIME_CHANNEL_ID=         # 時刻表示VC

# 任意
FOOTER_ICON_URL=         # EmbedフッターアイコンURL
VIRUSTOTAL_API_KEY=      # VirusTotal API Key
```

### 3. スラッシュコマンドの登録

```bash
npm run deploy
```

### 4. 起動

```bash
# 開発（ファイル変更で自動再起動）
npm run dev

# 本番
npm start
```

自動再起動付きで起動する場合：

```bash
./start.sh
```

## プロジェクト構成

```
src/
├── index.ts                 # エントリポイント
├── deploy-commands.ts       # コマンド登録スクリプト
├── types/                   # 型定義
│   ├── discord.d.ts         # Client拡張型
│   └── state.ts             # 状態管理の型
├── lib/                     # ビジネスロジック
│   ├── customEmbed.ts       # 共通Embed
│   ├── repositories/        # 状態永続化層
│   │   ├── baseRepository.ts
│   │   ├── kikisenRepo.ts
│   │   ├── afkRepo.ts
│   │   ├── levelRepo.ts
│   │   └── ...
│   ├── kikisenManager.ts    # 聞き専マネージャー
│   ├── levelManager.ts      # レベルマネージャー
│   └── ...
├── commands/                # スラッシュコマンド
│   ├── level.ts
│   └── admin/               # 管理者コマンド
└── events/                  # イベントハンドラ
data/                        # 実行時データ（JSON、Git管理外）
```

## 開発

```bash
# 型チェック
npm run typecheck
```

## ライセンス

MIT
