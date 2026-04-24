import { BaseRepository } from './baseRepository.js';
import type { WorkoutSettings, WorkoutTimestampData } from '../../types/index.js';

export class WorkoutRepository extends BaseRepository {
  async getWorkoutSettings(guildId: string): Promise<WorkoutSettings | undefined> {
    return this.getState().guildSettings[guildId]?.workoutNotify;
  }

  async setWorkoutSettings(guildId: string, settings: WorkoutSettings): Promise<void> {
    this.getGuildSettings(guildId).workoutNotify = settings;
    await this.save();
  }

  async getWorkoutTimestamps(): Promise<Record<string, WorkoutTimestampData>> {
    return this.getState().workoutTimestamps;
  }

  async setWorkoutTimestamp(userId: string, data: WorkoutTimestampData): Promise<void> {
    if (!this.getState().workoutTimestamps) this.getState().workoutTimestamps = {};
    this.getState().workoutTimestamps[userId] = data;
    await this.save();
  }

  async removeWorkoutTimestamp(userId: string): Promise<void> {
    if (this.getState().workoutTimestamps?.[userId]) {
      delete this.getState().workoutTimestamps[userId];
      await this.save();
    }
  }
}

export const workoutRepo = new WorkoutRepository();