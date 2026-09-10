import { BaseRepository } from './baseRepository.js';
import type { DailyStatsData, DailyStatsSettings, VoiceSessionData } from '../../types/index.js';

const JST_DATE_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Asia/Tokyo基準の YYYY-MM-DD 文字列を返します。 */
export function getJstDateString(d: Date = new Date()): string {
  return JST_DATE_FORMATTER.format(d);
}

export class DailyStatsRepository extends BaseRepository {
  async getDailyStatsData(guildId: string): Promise<DailyStatsData> {
    const date = getJstDateString();
    if (!this.getState().dailyStats[guildId] || this.getState().dailyStats[guildId].date !== date) {
      this.getState().dailyStats[guildId] = { date, voiceSessions: [], userActivity: {} };
    }
    return this.getState().dailyStats[guildId];
  }

  async clearDailyStatsData(guildId: string): Promise<void> {
    delete this.getState().dailyStats[guildId];
    await this.save('runtime');
  }

  async logVoiceSession(guildId: string, sessionData: VoiceSessionData): Promise<void> {
    const data = await this.getDailyStatsData(guildId);
    data.voiceSessions.push(sessionData);
    await this.save('runtime');
  }

  async logUserActivity(guildId: string, userId: string): Promise<void> {
    const data = await this.getDailyStatsData(guildId);
    if (!data.userActivity[userId]) data.userActivity[userId] = 0;
    data.userActivity[userId]++;
    await this.save('runtime');
  }

  async getDailyStatsSettings(guildId: string): Promise<DailyStatsSettings | undefined> {
    return this.getState().guildSettings[guildId]?.dailyStats;
  }

  async setDailyStatsSettings(guildId: string, settings: Partial<DailyStatsSettings>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.dailyStats) gs.dailyStats = {};
    Object.assign(gs.dailyStats, settings);
    await this.save('settings');
  }

  async addDailyStatsExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const settings: DailyStatsSettings = this.getState().guildSettings[guildId]?.dailyStats || {};
    if (!settings.excludedChannels) settings.excludedChannels = [];
    if (!settings.excludedChannels.includes(channelId)) {
      settings.excludedChannels.push(channelId);
    }
    await this.setDailyStatsSettings(guildId, settings);
  }

  async removeDailyStatsExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const settings = this.getState().guildSettings[guildId]?.dailyStats;
    if (settings?.excludedChannels) {
      settings.excludedChannels = settings.excludedChannels.filter((id) => id !== channelId);
      await this.setDailyStatsSettings(guildId, settings);
    }
  }
}

export const dailyStatsRepo = new DailyStatsRepository();