import {
  Events,
  type NonThreadGuildBasedChannel,
  type GuildMember,
  type Message,
  type Role,
  type VoiceState,
  type User,
} from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { logManager } from '../lib/logManager.js';

const channelCreateEvent: BotEvent = {
  name: Events.ChannelCreate,
  execute(...args: unknown[]) {
    const [channel] = args as [NonThreadGuildBasedChannel];
    logManager.handleChannelCreate(channel);
  },
};

const channelDeleteEvent: BotEvent = {
  name: Events.ChannelDelete,
  execute(...args: unknown[]) {
    const [channel] = args as [NonThreadGuildBasedChannel];
    logManager.handleChannelDelete(channel);
  },
};

const guildMemberAddEvent: BotEvent = {
  name: Events.GuildMemberAdd,
  execute(...args: unknown[]) {
    const [member] = args as [GuildMember];
    logManager.handleGuildMemberAdd(member);
  },
};

const guildMemberRemoveEvent: BotEvent = {
  name: Events.GuildMemberRemove,
  execute(...args: unknown[]) {
    const [member] = args as [GuildMember];
    logManager.handleGuildMemberRemove(member);
  },
};

const messageDeleteEvent: BotEvent = {
  name: Events.MessageDelete,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    await logManager.handleMessageDelete(message);
  },
};

const messageUpdateEvent: BotEvent = {
  name: Events.MessageUpdate,
  execute(...args: unknown[]) {
    const [oldMessage, newMessage] = args as [Message, Message];
    logManager.handleMessageUpdate(oldMessage, newMessage);
  },
};

const roleCreateEvent: BotEvent = {
  name: Events.GuildRoleCreate,
  execute(...args: unknown[]) {
    const [role] = args as [Role];
    logManager.handleRoleCreate(role);
  },
};

const roleDeleteEvent: BotEvent = {
  name: Events.GuildRoleDelete,
  execute(...args: unknown[]) {
    const [role] = args as [Role];
    logManager.handleRoleDelete(role);
  },
};

const voiceStateUpdateEvent: BotEvent = {
  name: Events.VoiceStateUpdate,
  execute(...args: unknown[]) {
    const [oldState, newState] = args as [VoiceState, VoiceState];
    logManager.handleVoiceStateUpdate(oldState, newState);
  },
};

const guildMemberUpdateEvent: BotEvent = {
  name: Events.GuildMemberUpdate,
  execute(...args: unknown[]) {
    const [oldMember, newMember] = args as [GuildMember, GuildMember];
    logManager.handleGuildMemberUpdate(oldMember, newMember);
  },
};

const userUpdateEvent: BotEvent = {
  name: Events.UserUpdate,
  execute(...args: unknown[]) {
    const [oldUser, newUser] = args as [User, User];
    logManager.handleUserUpdate(oldUser, newUser);
  },
};

export default [
  channelCreateEvent,
  channelDeleteEvent,
  guildMemberAddEvent,
  guildMemberRemoveEvent,
  messageDeleteEvent,
  messageUpdateEvent,
  roleCreateEvent,
  roleDeleteEvent,
  voiceStateUpdateEvent,
  guildMemberUpdateEvent,
  userUpdateEvent,
] satisfies BotEvent[];