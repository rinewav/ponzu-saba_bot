import { BaseRepository } from './baseRepository.js';
import type { VoiceRoleSettings, WorkoutSettings, WorkoutTimestampData, RolePanelData, LevelSettings, LevelUserData } from '../../types/index.js';
import { readFile as fsReadFile, writeFile as fsWriteFile, rename as fsRename } from 'node:fs/promises';
import path from 'node:path';

export class LevelRepository extends BaseRepository {
  private dataFile = path.join(process.cwd(), 'data', 'levels.json');
  private tmpFile = path.join(process.cwd(), 'data', 'levels.json.tmp');
  private data: Record<string, Record<string, LevelUserData>> = {};
  private isSaving = false;
  private saveQueued = false;

  async loadLevelData(): Promise<void> {
    try {
      const raw = await fsReadFile(this.dataFile, 'utf8');
      this.data = JSON.parse(raw);
    } catch (error: unknown) {
      this.data = {};
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        console.log('[Level] レベルデータファイルが見つからないため、新規作成します。');
        return;
      }
      console.error('[Level] レベルデータの読み込みに失敗しました:', error);
      const corruptFile = `${this.dataFile}.corrupt-${Date.now()}`;
      try {
        await fsRename(this.dataFile, corruptFile);
        console.error(`[Level] 破損した可能性のあるファイルを退避しました: ${corruptFile}`);
      } catch (renameError) {
        console.error('[Level] 破損ファイルの退避に失敗しました:', renameError);
      }
    }
  }

  async saveLevelData(): Promise<void> {
    if (this.isSaving) {
      this.saveQueued = true;
      return;
    }
    this.isSaving = true;
    try {
      const json = JSON.stringify(this.data, null, 2);
      await fsWriteFile(this.tmpFile, json, 'utf8');
      await fsRename(this.tmpFile, this.dataFile);
    } catch (error) {
      console.error('[Level] レベルデータの保存に失敗しました:', error);
    } finally {
      this.isSaving = false;
      if (this.saveQueued) {
        this.saveQueued = false;
        await this.saveLevelData();
      }
    }
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
    await this.save('settings');
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