import { Events, type VoiceState } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { kikisenManager } from '../lib/kikisenManager.js';
import { levelManager } from '../lib/levelManager.js';
import { afkManager } from '../lib/afkManager.js';
import { voiceRoleManager } from '../lib/voiceRoleManager.js';
import { vcNotifyManager } from '../lib/vcNotifyManager.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(...args: unknown[]) {
    const [oldState, newState] = args as [VoiceState, VoiceState];

    await kikisenManager.handleVoiceStateUpdate(oldState, newState);
    await levelManager.handleVoiceState(oldState, newState);
    afkManager.handleVoiceStateUpdate(oldState, newState);
    await voiceRoleManager.handleVoiceStateUpdate(oldState, newState);
    await vcNotifyManager.handleVoiceStateUpdate(oldState, newState);
    await dailyStatsManager.trackVoiceState(oldState, newState);
  },
} satisfies BotEvent;