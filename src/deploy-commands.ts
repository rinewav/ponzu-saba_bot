import { REST, Routes } from 'discord.js';
import { readdirRecursive } from './utils.js';
import type { BotCommand } from './types/index.js';
import 'dotenv/config';

const clientId = process.env.CLIENT_ID!;
const guildIds = (process.env.GUILD_IDS || '').split(',').filter(Boolean);
const token = process.env.MAIN_BOT_TOKEN!;

async function main(): Promise<void> {
  const commands: ReturnType<BotCommand['data']['toJSON']>[] = [];
  const commandFiles = await readdirRecursive(new URL('./commands', import.meta.url));

  for (const filePath of commandFiles) {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) continue;
    const imported = await import(filePath);
    const command: BotCommand | undefined = imported.default;
    if (!command || !command.data || !command.execute) {
      console.log(`[警告] ${filePath} のコマンドには必須の "data" または "execute" プロパティがありません。`);
      continue;
    }
    commands.push(command.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(token);

  console.log(`${commands.length}個のアプリケーションコマンドの登録を開始します。`);

  for (const guildId of guildIds) {
    try {
      const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
        body: commands,
      }) as unknown[];
      console.log(`✅ サーバーID: ${guildId} に ${data.length}個のコマンドを正常に登録しました。`);
    } catch (error) {
      console.error(`❌ サーバーID: ${guildId} へのコマンド登録中にエラーが発生しました:`, error);
    }
  }
}

main().catch(console.error);