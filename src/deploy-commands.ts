import { REST, Routes } from 'discord.js';
import type { BotCommand } from './types/index.js';
import 'dotenv/config';

// コマンド
import cleanup from './commands/admin/cleanup.js';
import kikisenManage from './commands/admin/kikisen-manage.js';
import levelEdit from './commands/admin/level-edit.js';
import reload from './commands/admin/reload.js';
import setup from './commands/admin/setup.js';
import verificationBypass from './commands/admin/verification-bypass.js';
import verificationReset from './commands/admin/verification-reset.js';
import levelRole from './commands/level-role.js';
import level from './commands/level.js';
import statsNow from './commands/stats-now.js';

const clientId = process.env.CLIENT_ID!;
const guildIds = (process.env.GUILD_IDS || '').split(',').filter(Boolean);
const token = process.env.MAIN_BOT_TOKEN!;

const commands: BotCommand[] = [
  cleanup, setup, kikisenManage, levelEdit, reload,
  verificationBypass, verificationReset, levelRole, level, statsNow,
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