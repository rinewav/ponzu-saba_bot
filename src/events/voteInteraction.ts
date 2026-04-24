import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { voteReminderManager } from '../lib/voteReminderManager.js';

export default {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.interaction) return;

    await voteReminderManager.handleVote(message);
  },
} satisfies BotEvent;