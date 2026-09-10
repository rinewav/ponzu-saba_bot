# Project Instructions for AI Agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->


## Build & Test

```bash
npm ci                 # 依存関係のインストール
npm run typecheck      # tsc --noEmit（唯一の品質ゲート。テストは未整備）
npm run dev            # tsx watch src/index.ts（.env が必要）
npm run deploy         # スラッシュコマンド登録（CLIENT_ID / GUILD_IDS / MAIN_BOT_TOKEN）
```

- ローカルで本番トークンを使って Bot を起動しないこと（本番と二重稼働になりイベントが二重処理される）。
- 読み取り専用の調査は discord.js の `REST` + `Routes` で GET のみ行う。

## Architecture Overview

- TypeScript + ESM、discord.js v14、実行は `tsx`（ビルド成果物なし）。
- `src/index.ts` がコマンド・イベントを配列で登録する（動的ロードなし）。新規コマンドは `src/index.ts` と `src/deploy-commands.ts` の両方に追加する。
- `src/lib/*Manager.ts` が機能ごとのビジネスロジック、`src/lib/repositories/*` が永続化。状態は `data/settings.json`（設定）/ `data/runtime.json`（実行時データ）/ `data/applications.json`（参加認証申請）に分割保存され、`baseRepository.ts` が 500ms デバウンスで原子的に書き込む。`save('settings' | 'runtime' | 'applications')` でスライスを指定する。
- レベルデータのみ `data/levels.json`（`levelRepo.ts`）。
- 参加認証: クイズ → フォーム → 審査 → チケット作成 → NDA 署名（`verificationWebServer.ts`、Express）→ PDF（`ndaPdfGenerator.ts`）→ DM 送付 → チケット後処理。
- 設定 UI は `/setup`（`src/commands/admin/setup.ts`）に集約。ボタン ID `setup_<x>` とモーダル ID `setup_m_<x>` は `SIMPLE_SETUP_ACTIONS` で対応付ける。

## Conventions & Patterns

- 2 スペースインデント、シングルクォート、ユーザー向け文言は日本語。
- ephemeral 返信は `flags: MessageFlags.Ephemeral`（`ephemeral: true` は非推奨）。
- Embed の色は `EMBED_COLORS`（`src/lib/customEmbed.ts`）を使う。
- ログ接頭辞は `[Level]` `[Kikisen]` `[NDA]` `[Verification]` `[VCLog]` `[AFK]` `[Cleanup]` `[DailyStats]` など英語のモジュール名。
- イベントハンドラの例外は `src/index.ts` で捕捉されるが、cron / setInterval / setTimeout 内の Promise は必ず `.catch` すること。
- 日付判定は必ず `Asia/Tokyo` を明示する（サーバーのローカルタイムゾーンに依存しない）。
- 課題管理は `bd`（beads）。
