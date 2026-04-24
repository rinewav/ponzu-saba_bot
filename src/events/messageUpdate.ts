import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { kikisenRepo } from '../lib/repositories/index.js';

export default {
  name: Events.MessageUpdate,
  async execute(...args: unknown[]) {
    const [_oldMessage, newMessage] = args as [Message, Message];
    if (!newMessage.guild) return;

    const kikisenData = kikisenRepo.getActiveChannelByText(newMessage.channel.id);
    if (kikisenData) {
      await kikisenRepo.logMessageUpdate(newMessage.channel.id, newMessage);
    }
  },
} satisfies BotEvent;