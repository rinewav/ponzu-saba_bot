import { BaseRepository } from './baseRepository.js';
import type { ReuploadSettings, RebanSettings, VoiceRoleSettings, ChannelTemplateSettings } from '../../types/index.js';

export class MiscRepository extends BaseRepository {
  // --- Log ---
  async setLogChannelId(guildId: string, channelId: string): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    gs.logChannelId = channelId;
    await this.save();
  }

  async setLogSettings(guildId: string, settings: Record<string, boolean>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.logging) gs.logging = {};
    Object.assign(gs.logging, settings);
    await this.save();
  }

  getLogSettings(guildId: string): Record<string, boolean> | undefined {
    return this.getState().guildSettings[guildId]?.logging;
  }

  getLogChannelId(guildId: string): string | undefined {
    return this.getState().guildSettings[guildId]?.logChannelId;
  }

  // --- Voice Role ---
  async setVoiceRoleSettings(guildId: string, settings: Partial<VoiceRoleSettings>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.voiceRole) gs.voiceRole = {};
    Object.assign(gs.voiceRole, settings);
    await this.save();
  }

  getVoiceRoleSettings(guildId: string): VoiceRoleSettings | undefined {
    return this.getState().guildSettings[guildId]?.voiceRole;
  }

  // --- Welcome ---
  async setWelcomeMessageId(userId: string, messageId: string): Promise<void> {
    if (!this.getState().welcomeMessages) this.getState().welcomeMessages = {};
    this.getState().welcomeMessages[userId] = messageId;
    await this.save();
  }

  getWelcomeMessageId(userId: string): string | undefined {
    return this.getState().welcomeMessages?.[userId];
  }

  async removeWelcomeMessageId(userId: string): Promise<void> {
    if (this.getState().welcomeMessages?.[userId]) {
      delete this.getState().welcomeMessages[userId];
      await this.save();
    }
  }

  // --- Cross-post ---
  async getCrossPostTargets(): Promise<Record<string, string>> {
    return this.getState().crossPostTargets || {};
  }

  async addCrossPostTarget(guildId: string, channelId: string): Promise<void> {
    if (!this.getState().crossPostTargets) this.getState().crossPostTargets = {};
    this.getState().crossPostTargets[guildId] = channelId;
    await this.save();
  }

  async removeCrossPostTarget(guildId: string): Promise<void> {
    if (this.getState().crossPostTargets?.[guildId]) {
      delete this.getState().crossPostTargets[guildId];
      await this.save();
    }
  }

  // --- Reupload ---
  async getReuploadSettings(guildId: string): Promise<ReuploadSettings | undefined> {
    return this.getState().guildSettings[guildId]?.reupload;
  }

  async setReuploadSettings(guildId: string, settings: ReuploadSettings): Promise<void> {
    this.getGuildSettings(guildId).reupload = settings;
    await this.save();
  }

  // --- Reban ---
  async getRebanSettings(guildId: string): Promise<RebanSettings | undefined> {
    return this.getState().guildSettings[guildId]?.rebanOnLeave;
  }

  async setRebanSettings(guildId: string, settings: Partial<RebanSettings>): Promise<void> {
    const gs = this.getGuildSettings(guildId);
    if (!gs.rebanOnLeave) gs.rebanOnLeave = {};
    Object.assign(gs.rebanOnLeave, settings);
    await this.save();
  }

  // --- Locked Nicknames ---
  async getLockedNicknamesForGuild(guildId: string): Promise<Record<string, string>> {
    if (!this.getState().lockedNicknames) this.getState().lockedNicknames = {};
    return this.getState().lockedNicknames![guildId] ?? {};
  }

  async setLockedNickname(guildId: string, userId: string, nickname: string | null): Promise<void> {
    if (!this.getState().lockedNicknames) this.getState().lockedNicknames = {};
    if (!this.getState().lockedNicknames![guildId]) this.getState().lockedNicknames![guildId] = {};
    this.getState().lockedNicknames![guildId]![userId] = nickname ?? '';
    await this.save();
  }

  async removeLockedNickname(guildId: string, userId: string): Promise<void> {
    if (this.getState().lockedNicknames?.[guildId]?.[userId]) {
      delete this.getState().lockedNicknames![guildId]![userId];
      await this.save();
    }
  }

  // --- Template ---
  getTemplateSetting(guildId: string, templateKey: string) {
    return this.getState().guildSettings[guildId]?.templates?.[templateKey];
  }

  getAllTemplateSettingsByChannel(guildId: string) {
    const guild = this.getState().guildSettings[guildId];
    if (!guild) return {};
    const result: Record<string, ChannelTemplateSettings> = {};
    const byChannel = guild.templatesByChannel;
    if (byChannel && typeof byChannel === 'object') {
      for (const [channelId, settings] of Object.entries(byChannel)) {
        if (!settings || typeof settings !== 'object') continue;
        result[channelId] = { ...settings, channelId };
      }
    }
    const legacy = guild.templates;
    if (legacy && typeof legacy === 'object') {
      for (const [templateKey, settings] of Object.entries(legacy)) {
        const channelId = settings?.channelId;
        if (!channelId) continue;
        if (result[channelId]) continue;
        result[channelId] = { ...settings, channelId, templateKey };
      }
    }
    return result;
  }

  getTemplateSettingForChannel(guildId: string, channelId: string) {
    const all = this.getAllTemplateSettingsByChannel(guildId);
    return all[channelId];
  }

  async setTemplateSettingForChannel(guildId: string, channelId: string, settings: Record<string, unknown>) {
    const gs = this.getGuildSettings(guildId);
    if (!gs.templatesByChannel) gs.templatesByChannel = {};
    if (!gs.templatesByChannel[channelId]) gs.templatesByChannel[channelId] = {};
    const target = gs.templatesByChannel[channelId] as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      if (value === null) {
        delete target[key];
        continue;
      }
      if (key === 'embed' && value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target.embed || typeof target.embed !== 'object') target.embed = {};
        Object.assign(target.embed as Record<string, unknown>, value);
        continue;
      }
      target[key] = value;
    }
    await this.save();
  }

  async clearTemplateSettingForChannel(guildId: string, channelId: string) {
    const guild = this.getState().guildSettings[guildId];
    if (guild?.templatesByChannel?.[channelId]) {
      delete guild.templatesByChannel[channelId];
      await this.save();
    }
  }

  async setTemplateSetting(guildId: string, templateKey: string, settings: Record<string, unknown>) {
    const gs = this.getGuildSettings(guildId);
    if (!gs.templates) gs.templates = {};
    if (!gs.templates[templateKey]) gs.templates[templateKey] = {};
    const target = gs.templates[templateKey] as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      if (value === null) {
        delete target[key];
        continue;
      }
      if (key === 'embed' && value && typeof value === 'object' && !Array.isArray(value)) {
        if (!target.embed || typeof target.embed !== 'object') target.embed = {};
        Object.assign(target.embed as Record<string, unknown>, value);
        continue;
      }
      target[key] = value;
    }
    await this.save();
  }

  async clearTemplateSetting(guildId: string, templateKey: string) {
    if (this.getState().guildSettings[guildId]?.templates?.[templateKey]) {
      delete this.getState().guildSettings[guildId].templates![templateKey];
      await this.save();
    }
  }
}

export const miscRepo = new MiscRepository();