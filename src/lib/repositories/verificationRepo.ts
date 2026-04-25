import { BaseRepository } from './baseRepository.js';
import type { VerificationSettings, VerificationApplication } from '../../types/index.js';

type AppMap = Record<string, VerificationApplication>;

export class VerificationRepository extends BaseRepository {
  private getApps(): AppMap {
    const state = this.getState() as unknown as Record<string, AppMap>;
    if (!state.verificationApplications) state.verificationApplications = {};
    return state.verificationApplications;
  }

  async getVerificationSettings(guildId: string): Promise<VerificationSettings | undefined> {
    return this.getState().guildSettings[guildId]?.verification;
  }

  async setVerificationSettings(guildId: string, settings: VerificationSettings): Promise<void> {
    this.getGuildSettings(guildId).verification = settings;
    await this.save();
  }

  getApplication(appId: string): VerificationApplication | undefined {
    return this.getApps()[appId];
  }

  getApplicationsByUser(guildId: string, userId: string): VerificationApplication[] {
    return Object.values(this.getApps())
      .filter(app => app.guildId === guildId && app.userId === userId);
  }

  getActiveApplicationByUser(guildId: string, userId: string): VerificationApplication | undefined {
    return Object.values(this.getApps())
      .find(app => app.guildId === guildId && app.userId === userId && app.status !== 'rejected' && app.status !== 'completed');
  }

  async setApplication(appId: string, application: VerificationApplication): Promise<void> {
    this.getApps()[appId] = application;
    await this.save();
  }

  async deleteApplication(appId: string): Promise<void> {
    delete this.getApps()[appId];
    await this.save();
  }

  getApplicationByNdaToken(token: string): VerificationApplication | undefined {
    return Object.values(this.getApps())
      .find(app => app.ndaToken === token);
  }

  getBypassList(guildId: string): string[] {
    return this.getState().guildSettings[guildId]?.verification?.bypassList ?? [];
  }

  async addBypass(guildId: string, userId: string): Promise<void> {
    const settings = this.getGuildSettings(guildId).verification ?? {};
    if (!settings.bypassList) settings.bypassList = [];
    if (!settings.bypassList.includes(userId)) {
      settings.bypassList.push(userId);
    }
    this.getGuildSettings(guildId).verification = settings;
    await this.save();
  }

  async removeBypass(guildId: string, userId: string): Promise<void> {
    const settings = this.getGuildSettings(guildId).verification ?? {};
    if (settings.bypassList) {
      settings.bypassList = settings.bypassList.filter(id => id !== userId);
    }
    this.getGuildSettings(guildId).verification = settings;
    await this.save();
  }

  getAllApplications(guildId: string): VerificationApplication[] {
    return Object.values(this.getApps())
      .filter(app => app.guildId === guildId);
  }
}

export const verificationRepo = new VerificationRepository();
