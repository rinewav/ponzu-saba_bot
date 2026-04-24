import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { kikisenRepo } from '../lib/repositories/index.js';

export default {
  name: Events.MessageDelete,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.guild) return;

    const kikisenData = kikisenRepo.getActiveChannelByText(message.channel.id);
    if (kikisenData) {
      await kikisenRepo.logMessageDelete(message.channel.id, message.id);
    }
  },
} satisfies BotEvent;