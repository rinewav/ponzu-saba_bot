import type { Client, VoiceState } from 'discord.js';
import { BaseRepository } from './repositories/baseRepository.js';
import { vcNotifyRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';
import type { VcLogSession } from '../types/index.js';

export class VcLogRepository extends BaseRepository {
  async getVcLogSessions(): Promise<Record<string, VcLogSession>> {
    return this.getState().vcLogSessions ?? {};
  }

  async setVcLogSession(vcChannelId: string, session: VcLogSession): Promise<void> {
    const state = this.getState();
    if (!state.vcLogSessions) state.vcLogSessions = {};
    state.vcLogSessions[vcChannelId] = session;
    await this.save();
  }

  async deleteVcLogSession(vcChannelId: string): Promise<void> {
    const state = this.getState();
    if (state.vcLogSessions) {
      delete state.vcLogSessions[vcChannelId];
      await this.save();
    }
  }

  async addParticipant(vcChannelId: string, memberId: string): Promise<void> {
    const sessions = this.getState().vcLogSessions;
    if (sessions?.[vcChannelId] && !sessions[vcChannelId].participants.includes(memberId)) {
      sessions[vcChannelId].participants.push(memberId);
      await this.save();
    }
  }

  async removeParticipant(vcChannelId: string, memberId: string): Promise<void> {
    const sessions = this.getState().vcLogSessions;
    if (sessions?.[vcChannelId]) {
      sessions[vcChannelId].participants = sessions[vcChannelId].participants.filter(id => id !== memberId);
      await this.save();
    }
  }
}

export const vcLogRepo = new VcLogRepository();

interface ActiveSession {
  messageId: string;
  logChannelId: string;
  startedAt: Date;
  participants: Set<string>;
}

export class VcLogManager {
  private client: Client | null = null;
  private activeSessions = new Map<string, ActiveSession>();

  initialize(client: Client): void {
    this.client = client;
    this.restoreSessions();
  }

  private async restoreSessions(): Promise<void> {
    const sessions = await vcLogRepo.getVcLogSessions();
    for (const [vcChannelId, session] of Object.entries(sessions)) {
      const vcChannel = await this.client!.channels.fetch(vcChannelId).catch(() => null);
      const isEmpty = !vcChannel || !('members' in vcChannel) || (vcChannel as import('discord.js').VoiceChannel).members.size === 0;

      if (isEmpty) {
        await this.finalizeSession(vcChannelId, session.guildId, session.messageId, session.logChannelId, new Date(session.startedAt), new Set(session.participants));
      } else {
        const currentMembers = (vcChannel as import('discord.js').VoiceChannel).members;
        const participants = new Set(session.participants);
        for (const [id] of currentMembers) {
          participants.add(id);
        }
        this.activeSessions.set(vcChannelId, {
          messageId: session.messageId,
          logChannelId: session.logChannelId,
          startedAt: new Date(session.startedAt),
          participants,
        });
        console.log(`[VCLog] 既存セッションを復元: <#${vcChannelId}>（${participants.size}名）`);
      }
    }
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const isBot = member.user.bot;

    if (oldChannel && oldChannel.id !== newChannel?.id) {
      await this.handleLeave(oldChannel.id, member.id, oldChannel.guild.id);
    }

    if (!isBot && newChannel && oldChannel?.id !== newChannel.id) {
      await this.handleJoin(newChannel.id, member.id, newChannel.guild.id);
    } else if (isBot && newChannel && oldChannel?.id !== newChannel.id) {
      this.addBotParticipant(newChannel.id, member.id);
    }
  }

  private async handleJoin(vcChannelId: string, memberId: string, guildId: string): Promise<void> {
    const session = this.activeSessions.get(vcChannelId);

    if (session) {
      session.participants.add(memberId);
      await vcLogRepo.addParticipant(vcChannelId, memberId);
      return;
    }

    const settings = await vcNotifyRepo.getVcNotifySettings(guildId);
    if (!settings?.notificationChannelId) return;
    if (settings.excludedChannels?.includes(vcChannelId)) return;

    const logChannel = await this.client!.channels.fetch(settings.notificationChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new CustomEmbed()
      .setColor(0x5865F2)
      .setTitle(`🎤 <#${vcChannelId}>`)
      .setDescription(`<@${memberId}> さんが通話を開始しました。`);

    try {
      const message = await (logChannel as import('discord.js').TextChannel).send({ embeds: [embed] });
      const startedAt = new Date();
      this.activeSessions.set(vcChannelId, {
        messageId: message.id,
        logChannelId: settings.notificationChannelId,
        startedAt,
        participants: new Set([memberId]),
      });
      await vcLogRepo.setVcLogSession(vcChannelId, {
        messageId: message.id,
        logChannelId: settings.notificationChannelId,
        vcChannelId,
        guildId,
        startedAt: startedAt.getTime(),
        participants: [memberId],
      });
      console.log(`[VCLog] <#${vcChannelId}> のセッションを開始しました。`);
    } catch (error) {
      console.error('[VCLog] ログメッセージの送信に失敗しました:', error);
    }
  }

  private addBotParticipant(vcChannelId: string, botId: string): void {
    const session = this.activeSessions.get(vcChannelId);
    if (session) {
      session.participants.add(botId);
      vcLogRepo.addParticipant(vcChannelId, botId).catch(() => {});
    }
  }

  private async handleLeave(vcChannelId: string, memberId: string, guildId: string): Promise<void> {
    const session = this.activeSessions.get(vcChannelId);
    if (!session) return;

    session.participants.delete(memberId);
    await vcLogRepo.removeParticipant(vcChannelId, memberId);

    const vcChannel = await this.client!.channels.fetch(vcChannelId).catch(() => null);
    const isEmpty = !vcChannel || !('members' in vcChannel) || (vcChannel as import('discord.js').VoiceChannel).members.size === 0;

    if (!isEmpty) return;

    this.activeSessions.delete(vcChannelId);
    await this.finalizeSession(vcChannelId, guildId, session.messageId, session.logChannelId, session.startedAt, session.participants);
  }

  private async finalizeSession(vcChannelId: string, guildId: string, messageId: string, logChannelId: string, startedAt: Date, participants: Set<string>): Promise<void> {
    await vcLogRepo.deleteVcLogSession(vcChannelId);

    const logChannel = await this.client!.channels.fetch(logChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    try {
      const message = await (logChannel as import('discord.js').TextChannel).messages.fetch(messageId).catch(() => null);
      if (!message) {
        console.log('[VCLog] 編集対象のメッセージが見つかりませんでした。');
        return;
      }

      const endedAt = new Date();
      const duration = endedAt.getTime() - startedAt.getTime();
      const durationStr = this.formatDuration(duration);
      const startTs = Math.floor(startedAt.getTime() / 1000);
      const endTs = Math.floor(endedAt.getTime() / 1000);

      const memberList = Array.from(participants).map(id => `<@${id}>`).join(', ');

      const embed = new CustomEmbed()
        .setColor(0x2ECC71)
        .setTitle(`🎤 通話終了`)
        .setDescription(
          `**チャンネル:** <#${vcChannelId}>\n` +
          `**参加者:** ${memberList || 'なし'}\n` +
          `**通話時間:** <t:${startTs}:t> 〜 <t:${endTs}:t> （${durationStr}）`,
        );

      await message.edit({ embeds: [embed] });
      console.log(`[VCLog] セッション終了ログを記録しました（${durationStr}）。`);
    } catch (error) {
      console.error('[VCLog] メッセージの編集に失敗しました:', error);
    }
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}時間`);
    if (minutes > 0) parts.push(`${minutes}分`);
    parts.push(`${seconds}秒`);
    return parts.join('');
  }
}

export const vcLogManager = new VcLogManager();
