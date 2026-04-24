import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdirRecursive } from './utils.js';
import type { BotCommand, BotEvent } from './types/index.js';
import { BaseRepository } from './lib/repositories/baseRepository.js';
import { levelRepo } from './lib/repositories/levelRepo.js';
import 'dotenv/config';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.DirectMessageTyping,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
  ],
  partials: [
    Partials.User,
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.GuildScheduledEvent,
    Partials.ThreadMember,
  ],
}) as Client & { commands: Collection<string, BotCommand> };

client.commands = new Collection();

async function loadCommands(): Promise<void> {
  const commandFiles = await readdirRecursive(new URL('./commands', import.meta.url));
  for (const filePath of commandFiles) {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) continue;
    const imported = await import(filePath);
    const command: BotCommand | undefined = imported.default;
    if (!command) {
      console.log(`[警告] ${filePath} にデフォルトエクスポートがありません。`);
      continue;
    }
    if (!command.data || !command.execute) {
      console.log(`[警告] ${filePath} のコマンドには必須の "data" または "execute" プロパティがありません。`);
      continue;
    }
    client.commands.set(command.data.name, command);
  }
}

async function loadEvents(): Promise<void> {
  const eventFiles = await readdirRecursive(new URL('./events', import.meta.url));
  for (const filePath of eventFiles) {
    if (!filePath.endsWith('.js') && !filePath.endsWith('.ts')) continue;
    const { default: event }: { default: BotEvent | BotEvent[] } = await import(filePath);
    if (Array.isArray(event)) {
      for (const e of event) {
        if (e.once) {
          client.once(e.name, (...args) => e.execute(...args, client));
        } else {
          client.on(e.name, (...args) => e.execute(...args, client));
        }
      }
    } else {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
    }
  }
}

async function main(): Promise<void> {
  await BaseRepository.load();
  await levelRepo.loadLevelData();
  await loadCommands();
  await loadEvents();
  await client.login(process.env.MAIN_BOT_TOKEN);
}

main().catch(console.error);