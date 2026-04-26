# 🍋 ぽん酢鯖 Official Bot

プロアマクリエイターズコミュニティ「ぽん酢鯖」の管理用Discord ボットです。TypeScript + ESM で構築されています。

## 機能一覧

| カテゴリ                | 機能                                                                      | コマンド                                                      |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 🛡️ 参加認証             | ルールクイズ → 申請フォーム → 審査 → NDA署名 → 認証ロール付与の完全フロー | `/setup-verification`                                         |
| 🛡️ 認証フォーム         | 申請フォーム項目のカスタマイズ（最大5項目）                               | `/setup-verification` → 📝 申請フォーム設定                   |
| 🛡️ 認証管理             | バイパスリスト管理、申請リセット、ユーザー検索                            | `/verification-bypass`, `/verification-reset`                 |
| 📋 NDA署名              | ブラウザ上でNDA署名、PDF生成（CJKフォント対応）、SHA-256ハッシュ検証      | （自動）                                                      |
| 🔝 レベル               | メッセージ/通話XP、レベルアップ報酬ロール、ログインボーナス               | `/level`, `/level-roles`, `/level-edit`, `/setup-level`       |
| 🛌 AFK                  | 放置検知、ニックネームPrefix、AFKチャンネル自動移動                       | `/setup-afk`                                                  |
| 👁️‍🗨️ 聞き専               | VCに紐付くテキストチャンネル自動作成/削除、ログ保存                       | `/kikisen-manage`, `/setup-kikisenlog`                        |
| 🧹 クリーンアップ       | 退出メンバーのメッセージ/リアクション一括削除                             | `/cleanup`, `/setup-cleanup`                                  |
| 🔨 追い打ちBAN          | 退出時の自動BAN                                                           | `/setup-reban`                                                |
| 📊 デイリー統計         | サーバー活動レポート（グラフ付き）                                        | `/stats-now`, `/setup-dailystats`                             |
| 🔔 VC通知               | 通話開始時の通知                                                          | `/setup-vcnotify`                                             |
| 🎤 VCロール             | 通話参加中ロール付与                                                      | `/setup-voicerole`                                            |
| 💪 筋トレ通知           | 24時間未報告時のリマインダー                                              | `/setup-workout`                                              |
| 📊 ロールパネル         | セレクトメニュー式ロール選択                                              | `/role-panel`, `/setup-role-panel`                            |
| 👽 クロスポスト通知     | 他サーバーでの絵文字/スタンプ使用通知                                     | `/setup-crosspost`                                            |
| 📁 ファイル再アップ     | 添付ファイルの自動バックアップ                                            | `/setup-reupload`                                             |
| 🛡️ ウイルススキャン     | URL/添付ファイルのVirusTotalスキャン                                      | （自動検知）                                                  |
| 🧩 テンプレート         | 常に最新状態を維持するテンプレートメッセージ                              | `/setup-template`, `/setup-introduction`, `/setup-message-id` |
| 📝 ログ                 | 各種イベントのログ記録                                                    | `/setup-logs`                                                 |
| ⏰ ステータスチャンネル | 日付/時刻VCチャンネルの自動更新                                           | （自動動作）                                                  |
| 🔄 リロード             | ボットコマンド再読み込み                                                  | `/reload`                                                     |

### 参加認証フロー

```
ウェルカムチャンネルで「始める」ボタン押下
  ↓
📝 ルールクイズ（設定した問題数に全問正解）
  ↓
📋 申請フォーム入力（カスタマイズ可能、最大5項目）
  ↓
⏳ 運営チームが審査チャンネルで承認/却下
  ↓
🔒 チケットチャンネル作成 → NDA署名（ブラウザ）
  ↓
✅ 認証ロール付与・ウェルカムメッセージ送信・PDF保管
```

## 必要要件

- Node.js 20+
- npm

## プロジェクト構成

```
src/
├── index.ts                    # エントリポイント
├── deploy-commands.ts          # コマンド登録スクリプト
├── types/
│   ├── discord.d.ts            # Client拡張型
│   ├── state.ts                # 状態管理の型
│   └── index.ts                # 型のバレルエクスポート
├── lib/                        # ビジネスロジック
│   ├── customEmbed.ts          # 共通Embed
│   ├── verificationManager.ts  # 参加認証マネージャー
│   ├── verificationWebServer.ts # NDA署名Webサーバー
│   ├── ndaPdfGenerator.ts      # NDA PDF生成
│   ├── levelManager.ts         # レベルシステム
│   ├── afkManager.ts           # AFK管理
│   ├── kikisenManager.ts       # 聞き専管理
│   ├── cleanupManager.ts       # クリーンアップ
│   ├── dailyStatsManager.ts    # デイリー統計
│   ├── vcNotifyManager.ts      # VC通知
│   ├── virusTotalManager.ts    # ウイルススキャン
│   ├── reuploadManager.ts      # ファイル再アップ
│   ├── logManager.ts           # ログ管理
│   ├── rolePanelManager.ts     # ロールパネル
│   ├── templateManager.ts      # テンプレート
│   ├── workoutNotifyManager.ts # 筋トレ通知
│   ├── crossPostManager.ts     # クロスポスト通知
│   ├── voiceRoleManager.ts     # VCロール
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
│   ├── level-role.ts           # /level-roles
│   ├── stats-now.ts            # /stats-now
│   ├── role-panel.ts           # /role-panel
│   └── admin/                  # 管理者コマンド
│       ├── setup-verification.ts
│       ├── verification-bypass.ts
│       ├── verification-reset.ts
│       ├── setup-level.ts
│       ├── level-edit.ts
│       ├── setup-afk.ts
│       ├── kikisen-manage.ts
│       ├── setup-kikisenlog.ts
│       ├── setup-cleanup.ts
│       ├── cleanup.ts
│       ├── setup-reban.ts
│       ├── setup-dailystats.ts
│       ├── setup-vcnotify.ts
│       ├── setup-voicerole.ts
│       ├── setup-workout.ts
│       ├── setup-role-panel.ts
│       ├── setup-crosspost.ts
│       ├── setup-reupload.ts
│       ├── setup-template.ts
│       ├── setup-introduction.ts
│       ├── setup-message-id.ts
│       ├── setup-logs.ts
│       └── reload.ts
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
│   ├── cleanupInteraction.ts
│   ├── messageVirusScan.ts
│   ├── afkNicknameHandler.ts
│   ├── afkActivityTracker.ts
│   ├── autoCleanupOnLeave.ts
│   └── rebanHandler.ts
data/                           # 実行時データ（JSON、Git管理外）
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
- **[chart.js](https://www.chartjs.org/)** (MIT)
- **[chartjs-node-canvas](https://github.com/Sean-Bradley/Chartjs-Node-Canvas)** (MIT)
- **[node-fetch](https://github.com/node-fetch/node-fetch)** (MIT)
- **[dotenv](https://github.com/motdotla/dotenv)** (BSD-2-Clause)
- **[tsx](https://github.com/privatenumber/tsx)** (MIT)
- **[typescript](https://www.typescriptlang.org/)** (Apache-2.0)

その他の依存ライブラリについては `package.json` および `package-lock.json` を参照してください。
