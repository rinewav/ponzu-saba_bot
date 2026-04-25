import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { kikisenRepo } from '../lib/repositories/index.js';
import { workoutNotifyManager } from '../lib/workoutNotifyManager.js';
import { crossPostManager } from '../lib/crossPostManager.js';
import { reuploadManager } from '../lib/reuploadManager.js';

export default {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.guild) return;

    // 聞き専チャットへのメッセージをログに記録
    const kikisenData = kikisenRepo.getActiveChannelByText(message.channel.id);
    if (kikisenData) {
      await kikisenRepo.logMessage(message.channel.id, message);
    }

    if (message.author.bot) return;

    await workoutNotifyManager.handleMessage(message);
    await crossPostManager.handleMessage(message);
    await reuploadManager.handleMessage(message);
  },
} satisfies BotEvent;