import { Events, type VoiceState } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { kikisenManager } from '../lib/kikisenManager.js';
import { levelManager } from '../lib/levelManager.js';
import { afkManager } from '../lib/afkManager.js';
import { voiceRoleManager } from '../lib/voiceRoleManager.js';
import { vcLogManager } from '../lib/vcLogManager.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';

export default {
  name: Events.VoiceStateUpdate,
  async execute(...args: unknown[]) {
    const [oldState, newState] = args as [VoiceState, VoiceState];

    const handlers: { label: string; run: () => Promise<void> | void }[] = [
      { label: '聞き専チャットマネージャー', run: () => kikisenManager.handleVoiceStateUpdate(oldState, newState) },
      { label: 'レベルマネージャー', run: () => levelManager.handleVoiceState(oldState, newState) },
      { label: 'AFKマネージャー', run: () => afkManager.handleVoiceStateUpdate(oldState, newState) },
      { label: 'VC参加中ロールマネージャー', run: () => voiceRoleManager.handleVoiceStateUpdate(oldState, newState) },
      { label: 'VC通話ログマネージャー', run: () => vcLogManager.handleVoiceStateUpdate(oldState, newState) },
      { label: 'デイリー統計機能マネージャー', run: () => dailyStatsManager.trackVoiceState(oldState, newState) },
    ];

    for (const { label, run } of handlers) {
      try {
        await run();
      } catch (error) {
        console.error(`[VoiceStateUpdate] ${label} の処理に失敗:`, error);
      }
    }
  },
} satisfies BotEvent;