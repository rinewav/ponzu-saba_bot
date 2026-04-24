import { BaseRepository } from './baseRepository.js';
import type { VerificationSettings } from '../../types/index.js';

export class VerificationRepository extends BaseRepository {
  async getVerificationSettings(guildId: string): Promise<VerificationSettings | undefined> {
    return this.getState().guildSettings[guildId]?.verification;
  }

  async setVerificationSettings(guildId: string, settings: VerificationSettings): Promise<void> {
    this.getGuildSettings(guildId).verification = settings;
    await this.save();
  }
}

export const verificationRepo = new VerificationRepository();