import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { kikisenRepo, miscRepo } from '../lib/repositories/index.js';
import { workoutNotifyManager } from '../lib/workoutNotifyManager.js';
import { crossPostManager } from '../lib/crossPostManager.js';
import { reuploadManager } from '../lib/reuploadManager.js';
import { ensureLatestTemplateMessage } from '../lib/templateManager.js';

export default {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.guild) return;

    const kikisenData = kikisenRepo.getActiveChannelByText(message.channel.id);
    if (kikisenData) {
      await kikisenRepo.logMessage(message.channel.id, message);
    }

    if (message.author.bot) return;

    const templateSettings = miscRepo.getAllTemplateSettingsByChannel(message.guild.id);
    const channelTemplate = templateSettings[message.channel.id];
    if (channelTemplate?.templateKey) {
      await ensureLatestTemplateMessage(message.guild.id, channelTemplate.templateKey, message.channel as import('discord.js').TextChannel).catch(() => {});
    }

    await workoutNotifyManager.handleMessage(message);
    await crossPostManager.handleMessage(message);
    await reuploadManager.handleMessage(message);
  },
} satisfies BotEvent;