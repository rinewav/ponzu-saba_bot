import type { Client, VoiceState } from 'discord.js';
import { vcNotifyRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

interface ActiveSession {
  messageId: string;
  channelId: string;
  startedAt: Date;
  participants: Set<string>;
}

export class VcLogManager {
  private client: Client | null = null;
  private activeSessions = new Map<string, ActiveSession>();

  initialize(client: Client): void {
    this.client = client;
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (oldChannel && oldChannel.id !== newChannel?.id) {
      await this.handleLeave(oldChannel.id, member.id, oldChannel.guild.id);
    }

    if (newChannel && oldChannel?.id !== newChannel.id) {
      await this.handleJoin(newChannel.id, member.id, member.displayName, newChannel.guild.id, newChannel.name);
    }
  }

  private async handleJoin(channelId: string, memberId: string, memberName: string, guildId: string, channelName: string): Promise<void> {
    const session = this.activeSessions.get(channelId);

    if (session) {
      session.participants.add(memberId);
      return;
    }

    const settings = await vcNotifyRepo.getVcNotifySettings(guildId);
    if (!settings?.notificationChannelId) return;
    if (settings.excludedChannels?.includes(channelId)) return;

    const logChannel = await this.client!.channels.fetch(settings.notificationChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    const embed = new CustomEmbed()
      .setColor(0x5865F2)
      .setTitle(`🎤 ${channelName}`)
      .setDescription(`**${memberName}** さんが通話を開始しました。`);

    try {
      const message = await (logChannel as import('discord.js').TextChannel).send({ embeds: [embed] });
      this.activeSessions.set(channelId, {
        messageId: message.id,
        channelId: settings.notificationChannelId,
        startedAt: new Date(),
        participants: new Set([memberId]),
      });
      console.log(`[VCLog] #${channelName} のセッションを開始しました。`);
    } catch (error) {
      console.error('[VCLog] ログメッセージの送信に失敗しました:', error);
    }
  }

  private async handleLeave(channelId: string, memberId: string, guildId: string): Promise<void> {
    const session = this.activeSessions.get(channelId);
    if (!session) return;

    session.participants.delete(memberId);

    const vcChannel = await this.client!.channels.fetch(channelId).catch(() => null);
    const isEmpty = !vcChannel || !('members' in vcChannel) || (vcChannel as import('discord.js').VoiceChannel).members.size === 0;

    if (!isEmpty) return;

    this.activeSessions.delete(channelId);

    const settings = await vcNotifyRepo.getVcNotifySettings(guildId);
    if (!settings?.notificationChannelId) return;

    const logChannel = await this.client!.channels.fetch(settings.notificationChannelId).catch(() => null);
    if (!logChannel || !logChannel.isTextBased()) return;

    try {
      const message = await (logChannel as import('discord.js').TextChannel).messages.fetch(session.messageId).catch(() => null);
      if (!message) {
        console.log('[VCLog] 編集対象のメッセージが見つかりませんでした。');
        return;
      }

      const duration = Date.now() - session.startedAt.getTime();
      const durationStr = this.formatDuration(duration);

      const memberList = Array.from(session.participants).map(id => `<@${id}>`).join(', ');

      const embed = new CustomEmbed()
        .setColor(0x2ECC71)
        .setTitle(`🎤 通話終了`)
        .setDescription(
          `**参加者:** ${memberList || 'なし'}\n` +
          `**通話時間:** ${durationStr}`,
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
