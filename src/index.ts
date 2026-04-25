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
import verificationReset from './commands/admin/verification-reset.js';
import setupVoicerole from './commands/admin/setup-voicerole.js';
import setupWorkout from './commands/admin/setup-workout.js';
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
import cleanupInteraction from './events/cleanupInteraction.js';
import levelMessageCreate from './events/levelMessageCreate.js';
import loggingHandler from './events/loggingHandler.js';
import messageDelete from './events/messageDelete.js';
import messageUpdate from './events/messageUpdate.js';
import messageVirusScan from './events/messageVirusScan.js';
import rebanHandler from './events/rebanHandler.js';
import statsTracker from './events/statsTracker.js';
import voteInteraction from './events/voteInteraction.js';

const commands: BotCommand[] = [
  cleanup, kikisenManage, levelEdit, reload, setupAfk, setupCleanup,
  setupCrosspost, setupDailystats, setupIntroduction, setupKikisenlog,
  setupLevel, setupLogs, setupMessageId, setupReban, setupReupload,
  setupRolePanel, setupTemplate, setupVcnotify, setupVerification,
  verificationBypass, verificationReset, setupVoicerole, setupWorkout, levelRole, level, statsNow,
];

const events: (BotEvent | BotEvent[])[] = [
  ready, interactionCreate, messageCreate, guildMemberAdd,
  guildMemberRemove, voiceStateUpdate, afkActivityTracker,
  afkNicknameHandler, autoCleanupOnLeave, cleanupInteraction,
  levelMessageCreate, loggingHandler, messageDelete, messageUpdate,
  messageVirusScan, rebanHandler, statsTracker, voteInteraction,
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
