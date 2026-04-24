import { BaseRepository } from './baseRepository.js';
import type { CleanupSettings, CleanupJobData } from '../../types/index.js';

export class CleanupRepository extends BaseRepository {
  async getCleanupSettings(guildId: string): Promise<CleanupSettings | undefined> {
    return this.getState().guildSettings[guildId]?.cleanup;
  }

  async setCleanupSetting(guildId: string, settings: Partial<CleanupSettings>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.cleanup) gs.cleanup = {};
    Object.assign(gs.cleanup, settings);
    await this.save();
  }

  async addCleanupExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.cleanup) gs.cleanup = {};
    if (!gs.cleanup.excludedChannels) gs.cleanup.excludedChannels = [];
    if (!gs.cleanup.excludedChannels.includes(channelId)) {
      gs.cleanup.excludedChannels.push(channelId);
    }
    await this.save();
  }

  async removeCleanupExcludedChannel(guildId: string, channelId: string): Promise<void> {
    const excluded = this.getState().guildSettings[guildId]?.cleanup?.excludedChannels;
    if (excluded) {
      this.getState().guildSettings[guildId].cleanup!.excludedChannels = excluded.filter((id) => id !== channelId);
      await this.save();
    }
  }

  async getCleanupJob(guildId: string): Promise<CleanupJobData | undefined> {
    return this.getState().cleanupJobs?.[guildId];
  }

  async getAllCleanupJobs(): Promise<Record<string, CleanupJobData>> {
    return this.getState().cleanupJobs || {};
  }

  async startCleanupJob(guildId: string, jobData: Omit<CleanupJobData, 'isPaused' | 'progressMessageId'>): Promise<void> {
    if (!this.getState().cleanupJobs) this.getState().cleanupJobs = {};
    this.getState().cleanupJobs[guildId] = { ...jobData, isPaused: false, progressMessageId: null };
    await this.save();
  }

  async updateCleanupJob(guildId: string, updatedData: Partial<CleanupJobData>): Promise<void> {
    if (this.getState().cleanupJobs?.[guildId]) {
      Object.assign(this.getState().cleanupJobs[guildId], updatedData);
      await this.save();
    }
  }

  async endCleanupJob(guildId: string): Promise<void> {
    if (this.getState().cleanupJobs?.[guildId]) {
      delete this.getState().cleanupJobs[guildId];
      await this.save();
    }
  }
}

export const cleanupRepo = new CleanupRepository();