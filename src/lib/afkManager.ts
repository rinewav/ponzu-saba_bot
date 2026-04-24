import type { Client, GuildMember, VoiceState } from 'discord.js';
import { afkRepo, kikisenRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

const ONE_HOUR_MS = 1 * 60 * 60 * 1000;
const TWO_AND_HALF_HOURS_MS = 2.5 * 60 * 60 * 1000;
const PRE_AFK_PREFIX = '🛌 ';

interface TrackedUserData {
  guildId: string;
  voiceChannelId: string;
  joinedAt: number;
  lastActivityAt: number;
  isPreAfk: boolean;
  originalNickname: string | null;
  notified: boolean;
  warned: boolean;
}

export class AfkManager {
  private client: Client | null = null;
  private trackedUsers = new Map<string, TrackedUserData>();

  initialize(client: Client): void {
    this.client = client;
    for (const guild of client.guilds.cache.values()) {
      for (const member of guild.members.cache.values()) {
        if (member.voice.channel) {
          this.updateUser(member.voice);
        }
      }
    }
    setInterval(() => this.checkAfkUsers(), 60000);
  }

  isManagedByAfk(userId: string): boolean {
    const userData = this.trackedUsers.get(userId);
    return userData?.isPreAfk === true;
  }

  async updateUser(voiceState: VoiceState, isActivity = false): Promise<void> {
    const userId = voiceState.member!.id;
    const userData = this.trackedUsers.get(userId);

    if (!voiceState.channel || isActivity) {
      if (userData?.isPreAfk) {
        try {
          const member = await voiceState.guild.members.fetch(userId).catch(() => null);
          if (member && member.manageable) {
            await member.setNickname(userData.originalNickname, 'AFK状態を解除');
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[AFKManager] ${voiceState.member!.user.tag}のニックネーム復元に失敗:`, msg);
        }
      }
      if (!voiceState.channel) {
        this.trackedUsers.delete(userId);
      }
      return;
    }

    this.trackedUsers.set(userId, {
      guildId: voiceState.guild.id,
      voiceChannelId: voiceState.channel.id,
      joinedAt: Date.now(),
      lastActivityAt: Date.now(),
      isPreAfk: false,
      originalNickname: null,
      notified: false,
      warned: false,
    });
  }

  async recordActivity(userId: string): Promise<void> {
    if (this.trackedUsers.has(userId)) {
      const userData = this.trackedUsers.get(userId)!;
      const guild = this.client!.guilds.cache.get(userData.guildId);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await this.updateUser(member.voice, true);
        }
      }
      userData.lastActivityAt = Date.now();
      userData.notified = false;
      userData.warned = false;
      userData.isPreAfk = false;
      userData.originalNickname = null;
      this.trackedUsers.set(userId, userData);
    }
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member) return;
    const userData = this.trackedUsers.get(member.id);
    if (!userData) return;

    const becameActive =
      (oldState.selfMute && !newState.selfMute) ||
      (oldState.serverMute && !newState.serverMute) ||
      (!oldState.streaming && newState.streaming) ||
      (!oldState.selfVideo && newState.selfVideo) ||
      (oldState.channel && !newState.channel) ||
      (oldState.channel?.id !== newState.channel?.id);

    if (becameActive) {
      await this.recordActivity(member.id);
    }
  }

  private async sendNotification(type: 'notify' | 'warn', member: GuildMember, settings: import('../types/index.js').AfkSettings): Promise<void> {
    let targetChannel: import('discord.js').TextChannel | null = null;

    const vcId = member.voice.channel?.id;
    if (vcId) {
      const kikisenChannelInfo = kikisenRepo.getActiveChannelByVoice(vcId);
      if (kikisenChannelInfo) {
        targetChannel = await this.client!.channels.fetch(kikisenChannelInfo.id).catch(() => null) as import('discord.js').TextChannel | null;
      }
    }

    if (!targetChannel && settings.notifyChannelId) {
      targetChannel = await this.client!.channels.fetch(settings.notifyChannelId).catch(() => null) as import('discord.js').TextChannel | null;
    }

    if (!targetChannel) return;

    let embed: CustomEmbed | null = null;
    let content: string | undefined;

    if (type === 'notify') {
      embed = new CustomEmbed(member.user)
        .setDescription(`${member} 放置状態で1時間が経過しました。ニックネームの頭に🛌をつけました`);
    } else if (type === 'warn') {
      const afkChannelMention = settings.afkChannelId ? `<#${settings.afkChannelId}>` : '放置用チャンネル';
      embed = new CustomEmbed(member.user)
        .setDescription(`${member} 放置状態で2.5時間が経過しました。あと30分で ${afkChannelMention} に移動されます。`);
      content = `${member} おはようございます！！`;
    }

    if (embed) {
      await targetChannel.send({ content, embeds: [embed] }).catch(console.error);
    }
  }

  private async checkAfkUsers(): Promise<void> {
    if (!this.client) return;

    const now = Date.now();
    for (const [userId, userData] of this.trackedUsers.entries()) {
      const guild = this.client.guilds.cache.get(userData.guildId);
      if (!guild) continue;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || !member.voice.channel) {
        this.trackedUsers.delete(userId);
        continue;
      }

      const isMuted = member.voice.serverMute || member.voice.selfMute;
      if (!isMuted) {
        if (now - userData.lastActivityAt > 1000 * 60) {
          await this.recordActivity(userId);
        }
        continue;
      }

      const settings =await afkRepo.getAfkSettings(userData.guildId);
      if (!settings || !settings.afkChannelId || settings.afkExcludedChannels?.includes(member.voice.channel.id)) continue;

      const inactivityDuration = now - userData.lastActivityAt;
      const afkTimeout = settings.afkTimeout || 3 * 60 * 60 * 1000;

      if (inactivityDuration > afkTimeout) {
        if (member.manageable) {
          try {
            if (userData.isPreAfk) await member.setNickname(userData.originalNickname, 'AFKチャンネルへ移動するため');
            await member.voice.setChannel(settings.afkChannelId!, '放置時間が長いためAFKチャンネルに移動しました。');
            console.log(`[AFKManager] ${member.user.tag} をAFKチャンネルに移動しました。`);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[AFKManager] AFKユーザーの移動に失敗:', msg);
          }
        }
        continue;
      }

      if (!userData.warned && inactivityDuration > TWO_AND_HALF_HOURS_MS) {
        await this.sendNotification('warn', member, settings);
        userData.warned = true;
        this.trackedUsers.set(userId, userData);
      }

      if (!userData.isPreAfk && inactivityDuration > ONE_HOUR_MS) {
        if (member.manageable) {
          try {
            const currentNickname = member.nickname || member.user.displayName;
            if (!currentNickname.startsWith(PRE_AFK_PREFIX)) {
              userData.originalNickname = member.nickname;
              userData.isPreAfk = true;
              this.trackedUsers.set(userId, userData);

              await member.setNickname(PRE_AFK_PREFIX + currentNickname, '1時間以上放置しているため');
              console.log(`[AFKManager] ${member.user.tag} を前兆AFK状態にしました。`);

              if (!userData.notified) {
                await this.sendNotification('notify', member, settings);
                userData.notified = true;
                this.trackedUsers.set(userId, userData);
              }
            }
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[AFKManager] 前兆AFKニックネーム設定に失敗:', msg);
          }
        }
      }
    }
  }
}

export const afkManager = new AfkManager();