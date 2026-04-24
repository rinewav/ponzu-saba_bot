import { Events, type Message, type MessageReaction, type User } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { afkManager } from '../lib/afkManager.js';

const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (message.author.bot) return;
    await afkManager.recordActivity(message.author.id);
  },
};

const messageReactionAddEvent: BotEvent = {
  name: Events.MessageReactionAdd,
  async execute(...args: unknown[]) {
    const [_reaction, user] = args as [MessageReaction, User];
    if (user.bot) return;
    await afkManager.recordActivity(user.id);
  },
};

const messageReactionRemoveEvent: BotEvent = {
  name: Events.MessageReactionRemove,
  async execute(...args: unknown[]) {
    const [_reaction, user] = args as [MessageReaction, User];
    if (user.bot) return;
    await afkManager.recordActivity(user.id);
  },
};

export default [
  messageCreateEvent,
  messageReactionAddEvent,
  messageReactionRemoveEvent,
] satisfies BotEvent[];