import type { Client, Message } from 'discord.js';
import { miscRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

export class CrossPostManager {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
  }

  async handleMessage(message: Message): Promise<void> {
    if (message.author.bot || !message.guild) return;

    const targets = await miscRepo.getCrossPostTargets();
    if (Object.keys(targets).length === 0) return;

    const originGuilds = new Map<string, { emojis: string[]; stickers: string[] }>();

    const emojiRegex = /<a?:[a-zA-Z0-9_]+:(\d+)>/g;
    const emojiMatches = message.content.matchAll(emojiRegex);
    for (const match of emojiMatches) {
      const emojiId = match[1];
      const emoji = this.client!.emojis.cache.get(emojiId);
      if (emoji && emoji.guild) {
        if (!originGuilds.has(emoji.guild.id)) {
          originGuilds.set(emoji.guild.id, { emojis: [], stickers: [] });
        }
        originGuilds.get(emoji.guild.id)!.emojis.push(emoji.toString());
      }
    }

    for (const sticker of message.stickers.values()) {
      if (sticker.guildId) {
        if (!originGuilds.has(sticker.guildId)) {
          originGuilds.set(sticker.guildId, { emojis: [], stickers: [] });
        }
        originGuilds.get(sticker.guildId)!.stickers.push(sticker.name);
      }
    }

    if (originGuilds.size === 0) return;

    for (const [guildId, assets] of originGuilds.entries()) {
      const notifyChannelId = targets[guildId];
      if (!notifyChannelId) continue;

      try {
        const notifyGuild = await this.client!.guilds.fetch(guildId);
        const notifyChannel = await notifyGuild.channels.fetch(notifyChannelId).catch(() => null);
        if (!notifyChannel || !notifyChannel.isTextBased()) continue;

        const embed = new CustomEmbed(message.author)
          .setTitle('🎨 スタンプ/絵文字 利用通知')
          .setDescription(`サーバー **${message.guild.name}** でスタンプ/絵文字が使用されました。`)
          .addFields(
            { name: '使用者', value: `${message.author} (${message.author.tag})`, inline: true },
            { name: '使用場所', value: `${message.channel}`, inline: true },
            { name: 'メッセージ', value: `[ここをクリック](${message.url})`, inline: true },
          );

        if (assets.emojis.length > 0) {
          embed.addFields({ name: '使用された絵文字', value: assets.emojis.join(' '), inline: false });
        }
        if (assets.stickers.length > 0) {
          embed.addFields({ name: '使用されたスタンプ', value: assets.stickers.join(', '), inline: false });
        }

        await (notifyChannel as import('discord.js').TextChannel).send({ embeds: [embed] });

      } catch (error) {
        console.error(`[CrossPost] 通知の送信に失敗しました (GuildID: ${guildId}):`, error);
      }
    }
  }
}

export const crossPostManager = new CrossPostManager();