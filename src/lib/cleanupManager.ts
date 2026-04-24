import { ActivityType, ButtonBuilder, ButtonStyle, ActionRowBuilder, type Client, type Guild, type Message } from 'discord.js';
import { cleanupRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

const processingGuilds = new Set<string>();

export class CleanupManager {
  private client: Client | null = null;

  createProgressBar(percentage: number): string {
    const filledBlocks = Math.round(percentage / 10);
    const emptyBlocks = 10 - filledBlocks;
    return '🟩'.repeat(filledBlocks) + '⬛'.repeat(emptyBlocks);
  }

  initialize(client: Client): void {
    this.client = client;
    this.resumeInterruptedJobs();
  }

  private async resumeInterruptedJobs(): Promise<void> {
    const jobs = await cleanupRepo.getAllCleanupJobs();
    for (const guildId in jobs) {
      console.log(`[クリーンアップ] 中断されたジョブを検出しました (Guild: ${guildId})。処理を再開します。`);
      const guild = await this.client!.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        this.executeCleanup(guild);
      }
    }
  }

  extractMentionedUserIds(message: Message): Set<string> {
    const ids = new Set<string>();
    const mentionRegex = /<@!?(\d+)>/g;
    const contentMatches = message.content.matchAll(mentionRegex);
    for (const match of contentMatches) ids.add(match[1]);
    for (const embed of message.embeds) {
      const textToCheck = [embed.description, embed.title, ...embed.fields.flatMap(f => [f.name, f.value]), embed.footer?.text, embed.author?.name].filter((t): t is string => t !== null);
      for (const text of textToCheck) {
        const embedMatches = text.matchAll(mentionRegex);
        for (const match of embedMatches) ids.add(match[1]);
      }
    }
    return ids;
  }

  async executeCleanup(guild: Guild): Promise<void> {
    if (processingGuilds.has(guild.id)) return;
    if (!this.client) { console.error('[クリーンアップ] Clientが初期化されていません。'); return; }

    processingGuilds.add(guild.id);
    const originalActivity = this.client.user?.presence?.activities[0];
    const cleanupSettings = (await cleanupRepo.getCleanupSettings(guild.id)) || {};
    const logChannelId = cleanupSettings.logChannelId;
    const logChannel = logChannelId ? await guild.channels.fetch(logChannelId).catch(() => null) : null;
    let progressMessage: Message | null = null;

    try {
      let jobData = await cleanupRepo.getCleanupJob(guild.id);

      if (!jobData) {
        const members = await guild.members.fetch();
        const memberIds = Array.from(members.keys());
        const excludedChannelIds = cleanupSettings.excludedChannels || [];
        const channels = guild.channels.cache.filter(ch => ch.isTextBased() && ch.viewable && !excludedChannelIds.includes(ch.id));

        jobData = {
          memberIds,
          channelsToScan: Array.from(channels.keys()),
          totalChannels: channels.size,
          deletedMessages: 0,
          deletedReactions: 0,
          isPaused: false,
          progressMessageId: null,
        };
        await cleanupRepo.startCleanupJob(guild.id, jobData);
      }

      if (logChannel && logChannel.isTextBased()) {
        const initialProgress = jobData.totalChannels > 0 ? Math.round(((jobData.totalChannels - jobData.channelsToScan.length) / jobData.totalChannels) * 100) : 0;
        const initialEmbed = new CustomEmbed()
          .setTitle('🧹 クリーンアップ処理中')
          .setDescription('サーバーにいないメンバーの投稿データをスキャンしています...')
          .addFields({ name: '進捗', value: `${this.createProgressBar(initialProgress)} ${initialProgress}%` });
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`cleanup_pause_${guild.id}`).setLabel('一時停止').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
        );

        progressMessage = jobData.progressMessageId
          ? await (logChannel as import('discord.js').TextChannel).messages.fetch(jobData.progressMessageId).catch(() => null)
          : null;

        if (progressMessage) {
          await progressMessage.edit({ embeds: [initialEmbed], components: [row] });
        } else {
          progressMessage = await (logChannel as import('discord.js').TextChannel).send({ content: '@here', embeds: [initialEmbed], components: [row] });
          await cleanupRepo.updateCleanupJob(guild.id, { progressMessageId: progressMessage.id });
          jobData.progressMessageId = progressMessage.id;
        }
      }

      const memberIdSet = new Set(jobData.memberIds);
      this.client.user?.setActivity(`クリーンアップ: 0%`, { type: ActivityType.Playing });

      while (jobData.channelsToScan.length > 0) {
        let currentJobState = await cleanupRepo.getCleanupJob(guild.id);
        while (currentJobState?.isPaused) {
          console.log(`[クリーンアップ] 処理が一時停止されました (Guild: ${guild.id})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          currentJobState = await cleanupRepo.getCleanupJob(guild.id);
        }

        const channelId = jobData.channelsToScan[0];
        const channel = await guild.channels.fetch(channelId).catch(() => null);

        if (channel && channel.isTextBased()) {
          console.log(`[クリーンアップ] #${channel.name} をスキャン中...`);
          let lastId: string | undefined;
          let fetchMore = true;

          while (fetchMore) {
            const messages = await (channel as import('discord.js').TextChannel).messages.fetch({ limit: 100, before: lastId }).catch(() => null);
            if (!messages || messages.size === 0) { fetchMore = false; continue; }

            for (const message of messages.values()) {
              let shouldDelete = false;
              if (!memberIdSet.has(message.author.id)) {
                shouldDelete = true;
              } else {
                const mentionedIds = this.extractMentionedUserIds(message);
                for (const mentionedId of mentionedIds) {
                  if (!memberIdSet.has(mentionedId)) {
                    shouldDelete = true;
                    break;
                  }
                }
              }
              if (shouldDelete) {
                await message.delete().catch(() => {});
                jobData.deletedMessages++;
                await new Promise(resolve => setTimeout(resolve, 1200));
                continue;
              }
              for (const reaction of message.reactions.cache.values()) {
                const users = await reaction.users.fetch().catch(() => null);
                if (!users) continue;
                for (const user of users.values()) {
                  if (!memberIdSet.has(user.id)) {
                    await reaction.users.remove(user.id).catch(() => {});
                    jobData.deletedReactions++;
                    await new Promise(resolve => setTimeout(resolve, 1200));
                  }
                }
              }
            }
            lastId = messages.last()!.id;
          }
        }

        jobData.channelsToScan.shift();
        await cleanupRepo.updateCleanupJob(guild.id, {
          channelsToScan: jobData.channelsToScan,
          deletedMessages: jobData.deletedMessages,
          deletedReactions: jobData.deletedReactions,
        });

        const progress = Math.round(((jobData.totalChannels - jobData.channelsToScan.length) / jobData.totalChannels) * 100);
        this.client.user?.setActivity(`クリーンアップ: ${progress}%`, { type: ActivityType.Playing });

        if (progressMessage) {
          const progressEmbed = new CustomEmbed().setTitle('🧹 クリーンアップ処理中').setDescription('...').addFields({ name: '進捗', value: `${this.createProgressBar(progress)} ${progress}%` });
          await progressMessage.edit({ embeds: [progressEmbed] }).catch(() => {});
        }
      }

      const resultMessage = `クリーンアップが完了しました。\n- 削除メッセージ: **${jobData.deletedMessages}**件\n- 削除リアクション: **${jobData.deletedReactions}**件`;
      const endEmbed = new CustomEmbed().setTitle('✅ クリーンアップ完了').setDescription(resultMessage);
      if (progressMessage) {
        await progressMessage.edit({ content: '', embeds: [endEmbed], components: [] });
      } else if (logChannel && logChannel.isTextBased()) {
        await (logChannel as import('discord.js').TextChannel).send({ embeds: [endEmbed] });
      }
      await cleanupRepo.endCleanupJob(guild.id);

    } catch (error) {
      console.error(`[クリーンアップ] ${guild.name} でエラーが発生しました:`, error);
    } finally {
      console.log('[クリーンアップ] 処理が完了したため、ボットのステータスを元に戻します。');
      if (originalActivity) {
        this.client.user?.setActivity(originalActivity.name, { type: originalActivity.type as ActivityType });
      } else {
        this.client.user?.setActivity('Welcome to ぽん酢鯖！', { type: ActivityType.Playing });
      }
      processingGuilds.delete(guild.id);
    }
  }
}

export const cleanupManager = new CleanupManager();