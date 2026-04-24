import { BaseRepository } from './baseRepository.js';
import type { VoteReminderData } from '../../types/index.js';

export class VoteReminderRepository extends BaseRepository {
  async getVoteReminders(): Promise<Record<string, VoteReminderData>> {
    return this.getState().voteReminders;
  }

  async addVoteReminder(userId: string, data: VoteReminderData): Promise<void> {
    if (!this.getState().voteReminders) this.getState().voteReminders = {};
    this.getState().voteReminders[userId] = data;
    await this.save();
  }

  async removeVoteReminder(userId: string): Promise<void> {
    if (this.getState().voteReminders?.[userId]) {
      delete this.getState().voteReminders[userId];
      await this.save();
    }
  }
}

export const voteReminderRepo = new VoteReminderRepository();