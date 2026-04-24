import { BaseRepository } from './baseRepository.js';
import type { VcNotifySettings } from '../../types/index.js';

export class VcNotifyRepository extends BaseRepository {
  async getVcNotifySettings(guildId: string): Promise<VcNotifySettings | undefined> {
    return this.getState().guildSettings[guildId]?.vcNotify;
  }

  async setVcNotifySettings(guildId: string, settings: Partial<VcNotifySettings>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.vcNotify) gs.vcNotify = {};
    Object.assign(gs.vcNotify, settings);
    await this.save();
  }

  async addVcNotifyExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const settings: VcNotifySettings = (await this.getVcNotifySettings(guildId)) || {};
    if (!settings.excludedChannels) settings.excludedChannels = [];
    if (!settings.excludedChannels.includes(channelId)) {
      settings.excludedChannels.push(channelId);
    }
    await this.setVcNotifySettings(guildId, settings);
  }

  async removeVcNotifyExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const settings = await this.getVcNotifySettings(guildId);
    if (settings?.excludedChannels) {
      settings.excludedChannels = settings.excludedChannels.filter((id) => id !== channelId);
      await this.setVcNotifySettings(guildId, settings);
    }
  }

  async setVcNotifyChannelColor(guildId: string, channelId: string, color: string): Promise<void> {
    const settings: VcNotifySettings = (await this.getVcNotifySettings(guildId)) || {};
    if (!settings.channelColors) settings.channelColors = {};
    settings.channelColors[channelId] = color;
    await this.setVcNotifySettings(guildId, settings);
  }
}

export const vcNotifyRepo = new VcNotifyRepository();