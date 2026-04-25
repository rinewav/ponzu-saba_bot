import { REST, Routes } from 'discord.js';
import type { BotCommand } from './types/index.js';
import 'dotenv/config';

// コマンド
import cleanup from './commands/admin/cleanup.js';
import kikisenManage from './commands/admin/kikisen-manage.js';
import levelEdit from './commands/admin/level-edit.js';
import reload from './commands/admin/reload.js';
import setupAfk from './commands/admin/setup-afk.js';
import setupCleanup from './commands/admin/setup-cleanup.js';
import setupCrosspost from './commands/admin/setup-crosspost.js';
import setupDailystats from './commands/admin/setup-dailystats.js';
import setupIntroduction from './commands/admin/setup-introduction.js';
import setupKikisenlog from './commands/admin/setup-kikisenlog.js';
import setupLevel from './commands/admin/setup-level.js';
import setupLogs from './commands/admin/setup-logs.js';
import setupMessageId from './commands/admin/setup-message-id.js';
import setupReban from './commands/admin/setup-reban.js';
import setupReupload from './commands/admin/setup-reupload.js';
import setupRolePanel from './commands/admin/setup-role-panel.js';
import setupTemplate from './commands/admin/setup-template.js';
import setupVcnotify from './commands/admin/setup-vcnotify.js';
import setupVerification from './commands/admin/setup-verification.js';
import verificationBypass from './commands/admin/verification-bypass.js';
import setupVoicerole from './commands/admin/setup-voicerole.js';
import setupWorkout from './commands/admin/setup-workout.js';
import levelRole from './commands/level-role.js';
import level from './commands/level.js';
import statsNow from './commands/stats-now.js';

const clientId = process.env.CLIENT_ID!;
const guildIds = (process.env.GUILD_IDS || '').split(',').filter(Boolean);
const token = process.env.MAIN_BOT_TOKEN!;

const commands: BotCommand[] = [
  cleanup, kikisenManage, levelEdit, reload, setupAfk, setupCleanup,
  setupCrosspost, setupDailystats, setupIntroduction, setupKikisenlog,
  setupLevel, setupLogs, setupMessageId, setupReban, setupReupload,
  setupRolePanel, setupTemplate, setupVcnotify, setupVerification,
  verificationBypass, setupVoicerole, setupWorkout, levelRole, level, statsNow,
];

async function main(): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token);
  const body = commands.map((cmd) => cmd.data.toJSON());

  console.log(`${body.length}個のアプリケーションコマンドの登録を開始します。`);

  for (const guildId of guildIds) {
    try {
      const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body }) as unknown[];
      console.log(`✅ サーバーID: ${guildId} に ${data.length}個のコマンドを正常に登録しました。`);
    } catch (error) {
      console.error(`❌ サーバーID: ${guildId} へのコマンド登録中にエラーが発生しました:`, error);
    }
  }
}

main().catch(console.error);