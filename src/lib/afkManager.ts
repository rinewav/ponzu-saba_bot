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
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  async initialize(client: Client): Promise<void> {
    this.client = client;

    for (const guild of client.guilds.cache.values()) {
      try {
        const members = await guild.members.fetch();
        for (const member of members.values()) {
          if (member.voice.channel) {
            this.trackNewUser(member);
          }
        }
      } catch {
        for (const member of guild.members.cache.values()) {
          if (member.voice.channel) {
            this.trackNewUser(member);
          }
        }
      }
    }

    this.checkInterval = setInterval(() => void this.checkAfkUsers().catch(console.error), 60000);
  }

  private trackNewUser(member: GuildMember, voiceChannelId: string = member.voice.channelId!): void {
    const userId = member.id;
    const existing = this.trackedUsers.get(userId);
    if (existing?.isPreAfk) {
      void this.restoreNickname(member, existing.originalNickname);
    }

    this.trackedUsers.set(userId, {
      guildId: member.guild.id,
      voiceChannelId,
      joinedAt: Date.now(),
      lastActivityAt: Date.now(),
      isPreAfk: false,
      originalNickname: member.nickname ?? null,
      notified: false,
      warned: false,
    });
  }

  isManagedByAfk(userId: string): boolean {
    return this.trackedUsers.get(userId)?.isPreAfk === true;
  }

  private async restoreNickname(member: GuildMember, savedNickname: string | null): Promise<void> {
    if (!member.manageable) return;
    const currentNickname = member.nickname ?? member.user.displayName;
    if (currentNickname.startsWith(PRE_AFK_PREFIX)) {
      try {
        await member.setNickname(savedNickname, 'AFK状態を解除');
        console.log(`[AFK] ${member.user.tag} のニックネームを復元しました。`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[AFK] ${member.user.tag} のニックネーム復元に失敗:`, msg);
      }
    }
  }

  async recordActivity(userId: string): Promise<void> {
    const userData = this.trackedUsers.get(userId);
    if (!userData) return;

    const guild = this.client!.guilds.cache.get(userData.guildId);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        await this.restoreNickname(member, userData.originalNickname);
      }
    }

    userData.lastActivityAt = Date.now();
    userData.notified = false;
    userData.warned = false;
    userData.isPreAfk = false;
    userData.originalNickname = null;
    this.trackedUsers.set(userId, userData);
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member ?? oldState.member;
    if (!member) return;
    if (member.user.bot) return;

    const joined = !oldState.channel && newState.channel;
    const moved = oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id;

    // VC参加・チャンネル移動はどちらも「アクティブ」とみなし、新しいチャンネルで追跡をやり直す
    if (joined || moved) {
      this.trackNewUser(member, newState.channel!.id);
      return;
    }

    // VC退出時は追跡を解除する（前兆AFKならニックネームを戻す）
    if (oldState.channel && !newState.channel) {
      const leavingData = this.trackedUsers.get(member.id);
      if (leavingData?.isPreAfk) {
        const fetched = await member.guild.members.fetch(member.id).catch(() => null);
        await this.restoreNickname(fetched ?? member, leavingData.originalNickname);
      }
      this.trackedUsers.delete(member.id);
      return;
    }

    const userData = this.trackedUsers.get(member.id);
    if (!userData) return;

    const becameActive =
      (oldState.selfMute && !newState.selfMute) ||
      (oldState.serverMute && !newState.serverMute) ||
      (!oldState.streaming && newState.streaming) ||
      (!oldState.selfVideo && newState.selfVideo);

    if (becameActive) {
      await this.recordActivity(member.id);
    }
  }

  private async sendNotification(
    type: 'notify' | 'warn',
    member: GuildMember,
    settings: import('../types/index.js').AfkSettings,
    remainingMinutes = 30,
  ): Promise<void> {
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
      const afkChannelMention = settings.afkChannelId ? `<#${settings.afkChannelId}>` : 'AFKチャンネル';
      embed = new CustomEmbed(member.user)
        .setDescription(`${member} 放置状態で2.5時間が経過しました。あと${remainingMinutes}分で ${afkChannelMention} に移動されます。`);
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
        if (member && userData.isPreAfk) {
          await this.restoreNickname(member, userData.originalNickname);
        }
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

      const settings = await afkRepo.getAfkSettings(userData.guildId);
      if (!settings || !settings.afkChannelId || settings.afkExcludedChannels?.includes(member.voice.channel.id)) continue;

      const inactivityDuration = now - userData.lastActivityAt;
      const afkTimeout = settings.afkTimeout || 3 * 60 * 60 * 1000;

      if (inactivityDuration > afkTimeout) {
        if (member.manageable) {
          try {
            await this.restoreNickname(member, userData.originalNickname);
            await member.voice.setChannel(settings.afkChannelId!, '放置時間が長いためAFKチャンネルに移動しました。');
            console.log(`[AFK] ${member.user.tag} をAFKチャンネルに移動しました。`);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('[AFK] AFKユーザーの移動に失敗:', msg);
          }
        }
        this.trackedUsers.delete(userId);
        continue;
      }

      // 警告はAFKタイムアウトが2.5時間より長い場合のみ送る（タイムアウト後に警告が出るのを防ぐ）
      if (!userData.warned && afkTimeout > TWO_AND_HALF_HOURS_MS && inactivityDuration > TWO_AND_HALF_HOURS_MS) {
        const remainingMinutes = Math.max(1, Math.round((afkTimeout - TWO_AND_HALF_HOURS_MS) / 60000));
        await this.sendNotification('warn', member, settings, remainingMinutes);
        userData.warned = true;
        this.trackedUsers.set(userId, userData);
      }

      if (!userData.isPreAfk && inactivityDuration > ONE_HOUR_MS) {
        if (member.manageable) {
          const currentNickname = member.nickname || member.user.displayName;
          if (!currentNickname.startsWith(PRE_AFK_PREFIX)) {
            userData.originalNickname = member.nickname ?? null;
            userData.isPreAfk = true;
            this.trackedUsers.set(userId, userData);

            try {
              await member.setNickname(PRE_AFK_PREFIX + currentNickname, '1時間以上放置しているため');
              console.log(`[AFK] ${member.user.tag} を前兆AFK状態にしました。`);
            } catch (error: unknown) {
              const msg = error instanceof Error ? error.message : String(error);
              console.error('[AFK] 前兆AFKニックネーム設定に失敗:', msg);
              userData.isPreAfk = false;
              userData.originalNickname = null;
              this.trackedUsers.set(userId, userData);
              continue;
            }

            if (!userData.notified) {
              await this.sendNotification('notify', member, settings);
              userData.notified = true;
              this.trackedUsers.set(userId, userData);
            }
          }
        }
      }
    }
  }
}

export const afkManager = new AfkManager();