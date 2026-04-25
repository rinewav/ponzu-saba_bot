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

    if (!message.channel.isSendable()) return;

    const scanningEmbed = new CustomEmbed()
      .setTitle('🔍 URLスキャン中...')
      .setColor(0xFFAA00)
      .setDescription(`${urls.length}件のURLをスキャンしています。少々お待ちください。`);

    const scanMsg = await message.reply({ embeds: [scanningEmbed] }).catch(() => null);
    if (!scanMsg) return;

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

    if (scanResults.length === 0) {
      const errorEmbed = new CustomEmbed()
        .setTitle('❌ スキャン失敗')
        .setColor(0xFF0000)
        .setDescription('VirusTotal APIエラーのためスキャン結果を取得できませんでした。');
      await scanMsg.edit({ embeds: [errorEmbed] }).catch(console.error);
      return;
    }

    const dangerousResults = scanResults.filter(r => r.malicious > 0 || r.suspicious > 0);

    if (dangerousResults.length > 0) {
      const urlList = dangerousResults.map(r => {
        return `・\`${r.url.slice(0, 80)}\`\n  悪意: **${r.malicious}** / 疑わしい: **${r.suspicious}** / 無害: ${r.harmless}`;
      }).join('\n');

      const embed = new CustomEmbed()
        .setTitle('⚠️ 危険なURLが検出されました')
        .setColor(0xFF0000)
        .setDescription(`**送信者:** ${message.author}\n\n${urlList}`)
        .setTimestamp();

      await scanMsg.edit({ embeds: [embed] }).catch(console.error);
    } else {
      const urlList = scanResults.map(r => `・\`${r.url.slice(0, 80)}\``).join('\n');

      const embed = new CustomEmbed()
        .setTitle('✅ URLスキャン完了')
        .setColor(0x00FF00)
        .setDescription(`**対象:**\n${urlList}\n\n脅威は検出されませんでした。`)
        .addFields(
          { name: 'スキャン数', value: `${scanResults.length}`, inline: true },
          { name: '結果', value: '安全', inline: true },
        )
        .setTimestamp();

      await scanMsg.edit({ embeds: [embed] }).catch(console.error);
    }
  },
} satisfies BotEvent;
