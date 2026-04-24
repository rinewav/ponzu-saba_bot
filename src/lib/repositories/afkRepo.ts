import { BaseRepository } from './baseRepository.js';
import type { AfkSettings } from '../../types/index.js';

export class AfkRepository extends BaseRepository {
  async getAfkSettings(guildId: string): Promise<AfkSettings | undefined> {
    return this.getState().guildSettings[guildId]?.afk;
  }

  async setAfkSetting(guildId: string, settings: Partial<AfkSettings>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.afk) gs.afk = {};
    Object.assign(gs.afk, settings);
    await this.save();
  }

  async addAfkExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.afk) gs.afk = {};
    if (!gs.afk.afkExcludedChannels) gs.afk.afkExcludedChannels = [];
    if (!gs.afk.afkExcludedChannels.includes(channelId)) {
      gs.afk.afkExcludedChannels.push(channelId);
    }
    await this.save();
  }

  async removeAfkExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const excluded = this.getState().guildSettings[guildId]?.afk?.afkExcludedChannels;
    if (excluded) {
      this.getState().guildSettings[guildId].afk!.afkExcludedChannels = excluded.filter((id) => id !== channelId);
      await this.save();
    }
  }
}

export const afkRepo = new AfkRepository();