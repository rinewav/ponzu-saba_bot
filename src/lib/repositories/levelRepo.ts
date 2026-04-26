import { BaseRepository } from './baseRepository.js';
import type { VoiceRoleSettings, WorkoutSettings, WorkoutTimestampData, RolePanelData, LevelSettings, LevelUserData } from '../../types/index.js';
import { readFile as fsReadFile, writeFile as fsWriteFile } from 'node:fs/promises';
import path from 'node:path';

export class LevelRepository extends BaseRepository {
  private dataFile = path.join(process.cwd(), 'data', 'levels.json');
  private data: Record<string, Record<string, LevelUserData>> = {};

  async loadLevelData(): Promise<void> {
    try {
      const raw = await fsReadFile(this.dataFile, 'utf8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = {};
    }
  }

  async saveLevelData(): Promise<void> {
    await fsWriteFile(this.dataFile, JSON.stringify(this.data, null, 2), 'utf8');
  }

  ensureUser(guildId: string, userId: string): LevelUserData {
    if (!this.data[guildId]) this.data[guildId] = {};
    if (!this.data[guildId][userId]) {
      this.data[guildId][userId] = {
        xp: 0,
        level: 0,
        lastLogin: null,
        loginStreak: 0,
        highestLoginStreak: 0,
      };
    }
    if (this.data[guildId][userId].highestLoginStreak === undefined) {
      this.data[guildId][userId].highestLoginStreak = this.data[guildId][userId].loginStreak || 0;
    }
    return this.data[guildId][userId];
  }

  getUserData(guildId: string, userId: string): LevelUserData {
    return this.ensureUser(guildId, userId);
  }

  async setUserData(guildId: string, userId: string, update: Partial<LevelUserData>): Promise<LevelUserData> {
    const userData = this.ensureUser(guildId, userId);
    if (update.level !== undefined) userData.level = update.level;
    if (update.xp !== undefined) userData.xp = update.xp;
    if (update.loginStreak !== undefined) {
      userData.loginStreak = update.loginStreak;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      userData.lastLogin = yesterday.getTime();
    }
    if (update.highestLoginStreak !== undefined) userData.highestLoginStreak = update.highestLoginStreak;
    if (userData.loginStreak > userData.highestLoginStreak) {
      userData.highestLoginStreak = userData.loginStreak;
    }
    await this.saveLevelData();
    return userData;
  }

  async getLevelSettings(guildId: string): Promise<LevelSettings | undefined> {
    return this.getState().guildSettings[guildId]?.levelSystem;
  }

  async setLevelSettings(guildId: string, settings: LevelSettings): Promise<void> {
    this.getGuildSettings(guildId).levelSystem = settings;
    await this.save();
  }

  async setLevelRole(guildId: string, level: number, roleId: string): Promise<void> {
    const settings = (await this.getLevelSettings(guildId)) || {};
    if (!settings.levelRoles) settings.levelRoles = {};
    settings.levelRoles[level.toString()] = roleId;
    await this.setLevelSettings(guildId, settings);
  }

  async removeLevelRole(guildId: string, level: number): Promise<void> {
    const settings = await this.getLevelSettings(guildId);
    if (settings?.levelRoles?.[level.toString()]) {
      delete settings.levelRoles[level.toString()];
      await this.setLevelSettings(guildId, settings);
    }
  }

  async getLevelRoles(guildId: string): Promise<Record<string, string>> {
    const settings = await this.getLevelSettings(guildId);
    return settings?.levelRoles || {};
  }
}

export const levelRepo = new LevelRepository();