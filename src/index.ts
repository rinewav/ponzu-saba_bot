import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import type { BotCommand, BotEvent } from './types/index.js';
import { BaseRepository } from './lib/repositories/baseRepository.js';
import { levelRepo } from './lib/repositories/levelRepo.js';
import { verificationManager } from './lib/verificationManager.js';
import { verificationWebServer } from './lib/verificationWebServer.js';

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

import ready from './events/ready.js';
import interactionCreate from './events/interactionCreate.js';
import messageCreate from './events/messageCreate.js';
import guildMemberAdd from './events/guildMemberAdd.js';
import guildMemberRemove from './events/guildMemberRemove.js';
import voiceStateUpdate from './events/voiceStateUpdate.js';
import afkActivityTracker from './events/afkActivityTracker.js';
import afkNicknameHandler from './events/afkNicknameHandler.js';
import autoCleanupOnLeave from './events/autoCleanupOnLeave.js';
import levelMessageCreate from './events/levelMessageCreate.js';
import loggingHandler from './events/loggingHandler.js';
import messageDelete from './events/messageDelete.js';
import messageUpdate from './events/messageUpdate.js';
import messageVirusScan from './events/messageVirusScan.js';
import rebanHandler from './events/rebanHandler.js';
import statsTracker from './events/statsTracker.js';

const commands: BotCommand[] = [
  cleanup, setup, kikisenManage, levelEdit, reload,
  verificationBypass, verificationReset, levelRole, level, statsNow,
];

const events: (BotEvent | BotEvent[])[] = [
  ready, interactionCreate, messageCreate, guildMemberAdd,
  guildMemberRemove, voiceStateUpdate, afkActivityTracker,
  afkNicknameHandler, autoCleanupOnLeave,
  levelMessageCreate, loggingHandler, messageDelete, messageUpdate,
  messageVirusScan, rebanHandler, statsTracker,
];

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
for (const cmd of commands) {
  client.commands.set(cmd.data.name, cmd);
}

for (const item of events) {
  const items = Array.isArray(item) ? item : [item];
  for (const evt of items) {
    if (evt.once) {
      client.once(evt.name, (...args: unknown[]) => evt.execute(...args, client));
    } else {
      client.on(evt.name, (...args: unknown[]) => evt.execute(...args, client));
    }
  }
}

async function main(): Promise<void> {
  await BaseRepository.load();
  await levelRepo.loadLevelData();
  await client.login(process.env.MAIN_BOT_TOKEN);

  verificationManager.initialize(client);

  const ndaPort = parseInt(process.env.NDA_WEB_PORT ?? '3001', 10);
  verificationWebServer.start(ndaPort);
}

main().catch(console.error);
