import { Events, type Message } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { virusTotalManager } from '../lib/virusTotalManager.js';
import { CustomEmbed } from '../lib/customEmbed.js';

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

const DISCORD_CDN_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net', 'discord.com', 'discord.gg'];

function isDiscordUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DISCORD_CDN_HOSTS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

export default {
  name: Events.MessageCreate,
  async execute(...args: unknown[]) {
    const [message] = args as [Message];
    if (!message.guild || message.author.bot) return;

    const urls: string[] = [];
    const contentUrls = message.content.match(URL_REGEX) || [];
    for (const url of contentUrls) {
      if (!isDiscordUrl(url)) {
        urls.push(url);
      }
    }

    for (const attachment of message.attachments.values()) {
      const attachmentUrl = attachment.url;
      if (!isDiscordUrl(attachmentUrl)) {
        urls.push(attachmentUrl);
      }
    }

    if (urls.length === 0) return;

    console.log(`[VirusScan] ${message.author.tag} のメッセージから ${urls.length} 件のURLを検出: ${urls.join(', ')}`);

    const scanResults: { url: string; malicious: number; suspicious: number; harmless: number; undetected: number }[] = [];

    for (const url of urls) {
      const result = await virusTotalManager.getUrlReport(url);
      if (result) {
        scanResults.push({
          url,
          malicious: result.stats.malicious,
          suspicious: result.stats.suspicious,
          harmless: result.stats.harmless,
          undetected: result.stats.undetected,
        });
      } else {
        console.warn(`[VirusScan] URLスキャン結果が取得できませんでした: ${url}`);
      }
    }

    if (scanResults.length === 0) return;

    const dangerousResults = scanResults.filter(r => r.malicious > 0 || r.suspicious > 0);
    if (dangerousResults.length > 0 && message.channel.isSendable()) {
      for (const result of dangerousResults) {
        const embed = new CustomEmbed()
          .setTitle('⚠️ 危険なURLが検出されました')
          .setColor(0xFF0000)
          .setDescription(`**URL:** \`${result.url.slice(0, 100)}\`\n**送信者:** ${message.author}`)
          .addFields(
            { name: '悪意のある検出数', value: `${result.malicious}`, inline: true },
            { name: '疑わしい検出数', value: `${result.suspicious}`, inline: true },
            { name: '無害', value: `${result.harmless}`, inline: true },
            { name: '未検出', value: `${result.undetected}`, inline: true },
          )
          .setTimestamp();

        await message.channel.send({ embeds: [embed] }).catch(console.error);
      }
    } else if (message.channel.isSendable()) {
      const safeUrls = scanResults.map(r => `・\`${r.url.slice(0, 80)}\``).join('\n');
      const embed = new CustomEmbed()
        .setTitle('✅ URLスキャン完了')
        .setColor(0x00FF00)
        .setDescription(`**対象:**\n${safeUrls}\n\n脅威は検出されませんでした。`)
        .addFields(
          { name: 'スキャン数', value: `${scanResults.length}`, inline: true },
          { name: '結果', value: '安全', inline: true },
        )
        .setTimestamp();

      await message.channel.send({ embeds: [embed] }).catch(console.error);
    }
  },
} satisfies BotEvent;
