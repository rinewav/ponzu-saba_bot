# 🍋 ぽん酢鯖 Official Bot

プロアマクリエイターズコミュニティ「ぽん酢鯖」の管理用Discord ボットです。TypeScript + ESM で構築されています。

## 機能一覧

設定はすべて `/setup` に集約されています。表の「設定場所」は `/setup` を実行したあとに選ぶメニュー項目です。

| カテゴリ                  | 機能                                                                     | 設定場所・コマンド                             |
| ------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| 🛡️ 参加認証               | ルールクイズ → 申請フォーム → 審査 → NDA署名 → 認証ロール付与の完全フロー | `/setup` → 参加認証                            |
| 🛡️ 認証フォーム           | 申請フォーム項目のカスタマイズ（最大5項目）                              | `/setup` → 参加認証 → 申請フォーム設定         |
| 🛡️ 認証管理               | バイパスリスト管理、申請リセット、ユーザー検索                           | `/verification-bypass`, `/verification-reset`  |
| 🎫 チケット後処理         | チケットの削除/アーカイブ状況の確認・移行、アーカイブカテゴリ管理        | `/verification-tickets`                        |
| 📋 NDA署名                | ブラウザ上でNDA署名、PDF生成（CJKフォント対応）、SHA-256ハッシュ検証     | （自動）                                       |
| 🔝 レベル                 | メッセージ/通話XP（メッセージXPは60秒クールダウン）、報酬ロール、ログインボーナス | `/level`, `/level-role`, `/level-edit`, `/setup` → レベル |
| 🛌 AFK                    | 放置検知、ニックネームPrefix、AFKチャンネル自動移動                      | `/setup` → AFK                                 |
| 👁️‍🗨️ 聞き専                 | VCに紐付くテキストチャンネル自動作成/削除、ログ保存                      | `/kikisen-manage`, `/setup` → 聞き専ログ       |
| 🧹 クリーンアップ         | 退出メンバーのメッセージ/リアクション一括削除                            | `/cleanup`, `/setup` → クリーンアップ          |
| 🔨 追い打ちBAN            | 退出時の自動BAN                                                          | `/setup` → 追い打ちBAN                         |
| 📊 デイリー統計           | サーバー活動レポート（グラフ付き）                                       | `/stats-now`, `/setup` → デイリー統計          |
| 🎤 VC通話ログ             | 通話の開始/終了ログの記録                                                | `/setup` → VC通話ログ                          |
| 🎤 VC参加中ロール         | 通話に参加している間だけロールを付与                                     | `/setup` → VCロール                            |
| 💪 筋トレ通知             | 24時間未報告時のリマインダー                                             | `/setup` → 筋トレ通知                          |
| 🗳️ ロールパネル           | セレクトメニュー式ロール選択                                             | `/setup` → ロールパネル                        |
| 👽 絵文字/スタンプ通知    | 他サーバーでの絵文字/スタンプ使用通知                                    | `/setup` → 絵文字/スタンプ通知                 |
| 📁 ファイル再アップロード | 添付ファイルの自動バックアップ                                           | `/setup` → ファイル再アップロード              |
| 🛡️ ウイルススキャン       | URL/添付ファイルのVirusTotalスキャン（添付は32MBまで）（画像/動画/音声の添付は既定で除外、/setup で切替） | （自動検知）                                   |
| 🧩 テンプレート           | 常に最新状態を維持するテンプレートメッセージ、Botメッセージの本文編集    | `/setup` → テンプレート                        |
| 📝 監査ログ               | 各種イベントのログ記録                                                   | `/setup` → 監査ログ                            |
| ⏰ ステータスチャンネル   | 日付/時刻VCチャンネルの自動更新                                          | （自動動作）                                   |
| 🔄 再起動                 | ボットの再起動                                                           | `/reload`                                      |

### コマンド一覧

| コマンド                                                        | 権限   | 説明                                                     |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| `/setup`                                                        | 管理者 | 全機能の設定を一元管理                                   |
| `/cleanup`                                                      | 管理者 | サーバーのクリーンアップを実行                           |
| `/kikisen-manage link \| unlink \| sync`                        | 管理者 | 聞き専チャットの強制リンク・解除・同期                   |
| `/level-edit`                                                   | 管理者 | ユーザーのレベル/XP/ストリークデータを編集               |
| `/reload`                                                       | 管理者 | ボットを再起動                                           |
| `/verification-bypass add \| remove \| list \| bulk \| tickets-only` | 管理者 | 参加認証のバイパス管理・一括バイパス・チケット再生成 |
| `/verification-reset`                                           | 管理者 | ユーザーの参加認証申請をリセット                         |
| `/verification-tickets status \| migrate \| archive-category add \| remove \| list` | 管理者 | チケット後処理の状況確認・移行、アーカイブカテゴリ管理 |
| `/level`                                                        | 全員   | ユーザーのレベル/XP情報を表示                            |
| `/level-role`                                                   | 全員   | レベルアップ報酬ロールを表示                             |
| `/stats-now`                                                    | 全員   | 現在のデイリー統計レポートを生成して表示                 |

### 参加認証フロー

```
はじめにチャンネルの「ルールクイズを始める」ボタン押下
  ↓
📝 ルールクイズ（設定した問題数に全問正解）
  ↓
📋 申請フォーム入力（カスタマイズ可能、最大5項目）
  ↓
⏳ 運営チームが審査チャンネルで承認/却下
  ↓
🔒 チケットチャンネル作成 → NDA署名（ブラウザ）
  ↓
🗄️ PDF+SHA-256 をアーカイブチャンネルへ記録
  ↓
📬 本人のDMへPDF送付
   （DMが閉じている場合は「もう一度送る」ボタンで再送。届くまで認証済みロールは付与されない）
  ↓
✅ 認証ロール付与・ウェルカムメッセージ
  ↓
🎫 チケットは会話が無ければ削除、あればアーカイブカテゴリへ移動
   （満杯時は自動で次のカテゴリを作成）
```

## 必要要件

- Node.js 20+
- npm

## 環境変数

`.env.example` をコピーして `.env` を作成し、以下の値を設定します。

| キー                     | 説明                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| `MAIN_BOT_TOKEN`         | Discord Bot のトークン                                                     |
| `CLIENT_ID`              | Discord アプリケーションのクライアントID（コマンド登録に使用）             |
| `GUILD_IDS`              | コマンドを登録するサーバーIDをカンマ区切りで指定                           |
| `WELCOME_CHANNEL_ID`     | 参加時のウェルカムメッセージを送信するチャンネルID                         |
| `LEAVE_CHANNEL_ID`       | （旧データ互換用）退出時に削除するウェルカムメッセージの投稿先。新規分は投稿先を自動記録 |
| `DATE_CHANNEL_ID`        | 日付を表示するステータス用ボイスチャンネルID                               |
| `TIME_CHANNEL_ID`        | 時刻を表示するステータス用ボイスチャンネルID                               |
| `INTRO_CHANNEL_ID`       | 自己紹介チャンネルのID                                                     |
| `FOOTER_ICON_URL`        | Embed フッターに表示するアイコンのURL（任意）                              |
| `VIRUSTOTAL_API_KEY`     | ウイルススキャンに使う VirusTotal の APIキー                               |
| `NDA_WEB_PORT`           | NDA署名Webサーバーの待受ポート（既定: 3001）                               |
| `NDA_PUBLIC_URL`         | NDA署名ページの公開URL（未設定時は `http://localhost:3001`）               |
| `DISCORD_CLIENT_SECRET`  | NDA署名ページの Discord OAuth2 認証に使うクライアントシークレット          |
| `PROXYCHECK_API_KEY`     | NDA署名時のVPN/プロキシ判定に使う proxycheck.io の APIキー                 |
| `TRUST_PROXY`            | リバースプロキシ配下で `X-Forwarded-For` を信頼するか（直接公開時は `false`） |

## プロジェクト構成

```
src/
├── index.ts                    # エントリポイント
├── deploy-commands.ts          # コマンド登録スクリプト
├── types/
│   ├── discord.d.ts            # Client拡張型
│   ├── fontkit.d.ts            # fontkit の型定義
│   ├── state.ts                # 状態管理の型
│   └── index.ts                # 型のバレルエクスポート
├── lib/                        # ビジネスロジック
│   ├── customEmbed.ts          # 共通Embed・カラー定義
│   ├── verificationManager.ts  # 参加認証マネージャー
│   ├── verificationWebServer.ts # NDA署名Webサーバー
│   ├── ndaPdfGenerator.ts      # NDA PDF生成
│   ├── levelManager.ts         # レベルシステム
│   ├── afkManager.ts           # AFK管理
│   ├── kikisenManager.ts       # 聞き専管理
│   ├── cleanupManager.ts       # クリーンアップ
│   ├── dailyStatsManager.ts    # デイリー統計
│   ├── vcLogManager.ts         # VC通話ログ
│   ├── virusTotalManager.ts    # ウイルススキャン
│   ├── reuploadManager.ts      # ファイル再アップロード
│   ├── logManager.ts           # 監査ログ管理
│   ├── rolePanelManager.ts     # ロールパネル
│   ├── templateManager.ts      # テンプレート
│   ├── workoutNotifyManager.ts # 筋トレ通知
│   ├── crossPostManager.ts     # 絵文字/スタンプ通知
│   ├── voiceRoleManager.ts     # VC参加中ロール
│   ├── updateStatusChannels.ts # ステータスチャンネル更新
│   ├── introductionTemplateEmbed.ts # 自己紹介テンプレート
│   └── repositories/           # 状態永続化層（JSON）
│       ├── baseRepository.ts
│       ├── verificationRepo.ts
│       ├── levelRepo.ts
│       ├── afkRepo.ts
│       ├── kikisenRepo.ts
│       ├── cleanupRepo.ts
│       ├── dailyStatsRepo.ts
│       ├── vcNotifyRepo.ts
│       ├── rolePanelRepo.ts
│       ├── workoutRepo.ts
│       ├── miscRepo.ts
│       └── index.ts
├── commands/                   # スラッシュコマンド
│   ├── level.ts                # /level
│   ├── level-role.ts           # /level-role
│   ├── stats-now.ts            # /stats-now
│   └── admin/                  # 管理者コマンド
│       ├── setup.ts            # /setup（全設定の一元管理）
│       ├── cleanup.ts
│       ├── kikisen-manage.ts
│       ├── level-edit.ts
│       ├── reload.ts
│       ├── verification-bypass.ts
│       ├── verification-reset.ts
│       └── verification-tickets.ts
├── events/                     # イベントハンドラ
│   ├── ready.ts
│   ├── interactionCreate.ts
│   ├── messageCreate.ts
│   ├── messageUpdate.ts
│   ├── messageDelete.ts
│   ├── guildMemberAdd.ts
│   ├── guildMemberRemove.ts
│   ├── voiceStateUpdate.ts
│   ├── levelMessageCreate.ts
│   ├── statsTracker.ts
│   ├── loggingHandler.ts
│   ├── messageVirusScan.ts
│   ├── afkNicknameHandler.ts
│   ├── afkActivityTracker.ts
│   ├── autoCleanupOnLeave.ts
│   └── rebanHandler.ts
data/                           # 実行時データ（JSON、Git管理外）
├── settings.json               # 設定
├── runtime.json                # 実行時データ
├── applications.json           # 参加認証申請
└── levels.json                 # レベル
```

旧形式の `data/kikisen-state.json` が残っている場合は、初回起動時に上記のファイルへ自動で移行されます（旧ファイルはバックアップとして退避されます）。

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
