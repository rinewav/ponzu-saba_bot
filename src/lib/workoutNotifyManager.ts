import type { Client, Message } from 'discord.js';
import { workoutRepo } from './repositories/index.js';
import { CustomEmbed, EMBED_COLORS } from './customEmbed.js';

const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

export class WorkoutNotifyManager {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
    this.checkInactiveUsers();
    setInterval(() => this.checkInactiveUsers(), 60 * 60 * 1000);
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild) return;
    const settings = await workoutRepo.getWorkoutSettings(message.guild.id);
    if (!settings || !settings.targetChannels?.includes(message.channel.id)) {
      return;
    }

    await workoutRepo.setWorkoutTimestamp(message.author.id, {
      channelId: message.channel.id,
      timestamp: Date.now(),
    });

    const confirmationEmbed = new CustomEmbed(message.author)
      .setTitle('✅ 記録完了！')
      .setColor(EMBED_COLORS.SUCCESS)
      .setDescription('本日も筋トレ、お疲れ様でした！💪\nこのメッセージは30秒で自動削除されます。');

    try {
      const sentMessage = await (message.channel as import('discord.js').TextChannel).send({ embeds: [confirmationEmbed] });
      setTimeout(() => sentMessage.delete().catch(() => {}), 30000);
    } catch (error) {
      console.error('[Workout] 確認メッセージの送信に失敗しました:', error);
    }
  }

  private async checkInactiveUsers(): Promise<void> {
    if (!this.client) return;
    console.log('[Workout] 24時間以上報告のないユーザーをチェックしています...');

    const timestamps = await workoutRepo.getWorkoutTimestamps();
    if (!timestamps) return;

    const now = Date.now();

    for (const [userId, data] of Object.entries(timestamps)) {
      if (now - data.timestamp > TWENTY_FOUR_HOURS_IN_MS) {
        const channel = await this.client.channels.fetch(data.channelId).catch(() => null);
        if (channel && channel.isTextBased()) {
          const reminderEmbed = new CustomEmbed()
            .setTitle('🔥 筋トレの時間です！')
            .setColor(EMBED_COLORS.WARN)
            .setDescription('筋トレ報告から24時間が経過しました。筋トレ/報告を忘れていませんか？');

          await (channel as import('discord.js').TextChannel).send({ content: `<@${userId}>`, embeds: [reminderEmbed] }).catch(console.error);
        }

        await workoutRepo.removeWorkoutTimestamp(userId);
      }
    }
  }
}

export const workoutNotifyManager = new WorkoutNotifyManager();