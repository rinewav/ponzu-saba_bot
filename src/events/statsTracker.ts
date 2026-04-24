import { Events, type Message, type VoiceState } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';

const messageCreateEvent: BotEvent = {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    await dailyStatsManager.trackMessage(message);
  },
};

const voiceStateUpdateEvent: BotEvent = {
  name: Events.VoiceStateUpdate,
  async execute(...args: unknown[]) {
    const [oldState, newState] = args as [VoiceState, VoiceState];
    await dailyStatsManager.trackVoiceState(oldState, newState);
  },
};

export default [
  messageCreateEvent,
  voiceStateUpdateEvent,
] satisfies BotEvent[];