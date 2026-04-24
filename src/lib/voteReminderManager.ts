import type { Client, Message } from 'discord.js';
import { voteReminderRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;

export class VoteReminderManager {
  private client: Client | null = null;
  private activeTimers = new Map<string, NodeJS.Timeout>();

  initialize(client: Client): void {
    this.client = client;
    this.restoreReminders();
  }

  async handleVote(message: Message): Promise<void> {
    if (!message.interaction || !message.guild) return;
    const user = message.interaction.user;
    const userId = user.id;

    if (this.activeTimers.has(userId)) {
      clearTimeout(this.activeTimers.get(userId)!);
      this.activeTimers.delete(userId);
      console.log(`[VoteReminder] ${user.tag} の古い通知をキャンセルしました。`);
    }

    const reminderData = {
      guildId: message.guild.id,
      channelId: message.channel.id,
      notifyAt: Date.now() + TWO_HOURS_IN_MS,
    };
    await voteReminderRepo.addVoteReminder(userId, reminderData);

    this.scheduleNotification(userId, reminderData);
    console.log(`[VoteReminder] ${user.tag} の通知を2時間後に予約しました。`);
  }

  private scheduleNotification(userId: string, reminderData: import('../types/index.js').VoteReminderData): void {
    const timeoutDuration = reminderData.notifyAt - Date.now();

    if (timeoutDuration <= 0) {
      this.sendNotification(userId, reminderData);
      return;
    }

    const timerId = setTimeout(() => {
      this.sendNotification(userId, reminderData);
    }, timeoutDuration);

    this.activeTimers.set(userId, timerId);
  }

  private async sendNotification(userId: string, reminderData: import('../types/index.js').VoteReminderData): Promise<void> {
    try {
      const guild = await this.client!.guilds.fetch(reminderData.guildId).catch(() => null);
      if (!guild) return;

      const channel = await guild.channels.fetch(reminderData.channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const user = await this.client!.users.fetch(userId).catch(() => null);
      if (!user) return;

      const embed = new CustomEmbed(user)
        .setColor('#5865F2')
        .setTitle('⏰️ 投票の時間です！')
        .setDescription(`${user}さん、前回の投票から2時間が経過しました！再度投票が可能です。`);

      await channel.send({ content: `${user}`, embeds: [embed] });

    } catch (error) {
      console.error(`[VoteReminder] 通知の送信に失敗しました (User: ${userId}):`, error);
    } finally {
      this.activeTimers.delete(userId);
      await voteReminderRepo.removeVoteReminder(userId);
    }
  }

  private async restoreReminders(): Promise<void> {
    const reminders = await voteReminderRepo.getVoteReminders();
    if (!reminders) return;

    console.log(`[VoteReminder] ${Object.keys(reminders).length}件のリマインダーをファイルから復元します。`);
    for (const userId in reminders) {
      this.scheduleNotification(userId, reminders[userId]);
    }
  }
}

export const voteReminderManager = new VoteReminderManager();