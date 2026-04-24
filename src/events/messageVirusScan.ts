import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { virusTotalManager } from '../lib/virusTotalManager.js';
import { CustomEmbed } from '../lib/customEmbed.js';
import { isUri } from 'valid-url';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export default {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.guild || message.author.bot) return;

    const urls: string[] = [];
    const contentUrls = message.content.match(URL_REGEX) || [];
    for (const url of contentUrls) {
      if (isUri(url)) {
        urls.push(url);
      }
    }

    for (const attachment of message.attachments.values()) {
      if (attachment.url) {
        urls.push(attachment.url);
      }
    }

    if (urls.length === 0) return;

    const scanResults: { url: string; malicious: number; suspicious: number }[] = [];

    for (const url of urls) {
      const result = await virusTotalManager.getUrlReport(url);
      if (result) {
        scanResults.push({
          url,
          malicious: result.stats.malicious,
          suspicious: result.stats.suspicious,
        });
      }
    }

    const dangerousResults = scanResults.filter(r => r.malicious > 0 || r.suspicious > 0);
    if (dangerousResults.length > 0 && message.channel.isSendable()) {
      for (const result of dangerousResults) {
        const embed = new CustomEmbed()
          .setTitle('⚠️ 危険なURLが検出されました')
          .setColor(0xFF0000)
          .setDescription(`**検出されたURL:** \`${result.url.slice(0, 100)}\``)
          .addFields(
            { name: '悪意のある検出数', value: `**${result.malicious}**`, inline: true },
            { name: '疑わしい検出数', value: `**${result.suspicious}**`, inline: true },
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(console.error);
      }
    }
  },
} satisfies BotEvent;