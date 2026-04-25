import type { Client, VoiceState } from 'discord.js';
import { vcNotifyRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

export class VcNotifyManager {
  private client: Client | null = null;
  private activeTimers = new Map<string, NodeJS.Timeout>();

  initialize(client: Client): void {
    this.client = client;
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (oldChannel && oldChannel.members.size === 0 && this.activeTimers.has(oldChannel.id)) {
      clearTimeout(this.activeTimers.get(oldChannel.id)!);
      this.activeTimers.delete(oldChannel.id);
      console.log(`[VCNotify] #${oldChannel.name} の通知をキャンセルしました（無人になったため）。`);
    }

    if (newChannel && newChannel.members.size === 1 && (!oldChannel || oldChannel.id !== newChannel.id)) {
      const settings = await vcNotifyRepo.getVcNotifySettings(newChannel.guild.id);
      if (!settings || settings.excludedChannels?.includes(newChannel.id)) {
        return;
      }

      if (this.activeTimers.has(newChannel.id)) {
        clearTimeout(this.activeTimers.get(newChannel.id)!);
      }

      console.log(`[VCNotify] #${newChannel.name} でタイマーを開始します（トリガー: ${member.user.tag}）。`);
      const timer = setTimeout(() => {
        this.sendNotification(newChannel, member!).catch((err) => {
          console.error('[VCNotify] 通知送信中にエラーが発生しました:', err);
        });
        this.activeTimers.delete(newChannel.id);
      }, 10000);

      this.activeTimers.set(newChannel.id, timer);
    }
  }

  private async sendNotification(channel: import('discord.js').VoiceBasedChannel, firstMember: import('discord.js').GuildMember): Promise<void> {
    const currentChannel = await this.client!.channels.fetch(channel.id).catch(() => null);
    if (!currentChannel || !('members' in currentChannel) || (currentChannel as import('discord.js').VoiceChannel).members.size === 0) {
      console.log(`[VCNotify] #${channel.name} の通知を送信直前でキャンセルしました（無人になったため）。`);
      return;
    }

    const settings = await vcNotifyRepo.getVcNotifySettings(channel.guild.id);
    if (!settings || !settings.notificationChannelId) return;

    const notificationChannel = await this.client!.channels.fetch(settings.notificationChannelId).catch(() => null);
    if (!notificationChannel || !notificationChannel.isTextBased()) return;

    let color: string | undefined = settings.channelColors?.[channel.id];
    if (!color) {
      color = `#${Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0')}`;
      await vcNotifyRepo.setVcNotifyChannelColor(channel.guild.id, channel.id, color);
    }

    const embed = new CustomEmbed(firstMember.user)
      .setColor(color as `#${string}`)
      .setTitle('🎤 ボイスチャット通知')
      .setDescription(`**${channel}** で ${firstMember} さんが通話を始めました！`);

    try {
      await (notificationChannel as import('discord.js').TextChannel).send({ embeds: [embed] });
    } catch (error) {
      console.error('[VCNotify] 通知メッセージの送信に失敗しました:', error);
    }
  }
}

export const vcNotifyManager = new VcNotifyManager();