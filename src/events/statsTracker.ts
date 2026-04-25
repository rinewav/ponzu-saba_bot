import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';

const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    await dailyStatsManager.trackMessage(message);
  },
};

export default [
  messageCreateEvent,
] satisfies BotEvent[];
