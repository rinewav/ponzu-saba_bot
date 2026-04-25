import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { levelManager } from '../lib/levelManager.js';

export default {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.guild) return;
    await levelManager.handleMessage(message);
  },
} satisfies BotEvent;