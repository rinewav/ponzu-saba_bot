import { Events, type Attachment, type Message } from 'discord.js';
import axios from 'axios';
import type { BotEvent } from '../types/index.js';
import { virusTotalManager } from '../lib/virusTotalManager.js';
import { miscRepo } from '../lib/repositories/index.js';
import { CustomEmbed, EMBED_COLORS } from '../lib/customEmbed.js';

const URL_REGEX = /https?:\/\/[^\s<>"']+/g;

const DISCORD_CDN_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net', 'discord.com', 'discord.gg'];

/** contentTypeが取得できない添付をメディアと判定するための拡張子 */
const MEDIA_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif',
  'mp4', 'mov', 'webm',
  'mp3', 'wav', 'flac', 'ogg', 'm4a',
];

/** VirusTotalの通常アップロードで扱えるファイルサイズの上限 */
const MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DELETE_AFTER_MS = 30_000;

interface ScanEntry {
  kind: 'url' | 'file';
  label: string;
  stats?: { malicious: number; suspicious: number; harmless: number; undetected: number };
  /** スキャンできなかった理由（成功時は undefined） */
  note?: string;
}

function isDiscordUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DISCORD_CDN_HOSTS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

/** 画像/動画/音声の添付かどうかを判定します（contentTypeが無い場合は拡張子で推定）。 */
function isMediaAttachment(attachment: Attachment): boolean {
  const contentType = attachment.contentType?.toLowerCase();
  if (contentType) {
    return contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/');
  }
  const ext = (attachment.name ?? '').split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_EXTENSIONS.includes(ext);
}

function formatLabel(entry: ScanEntry): string {
  return entry.kind === 'file' ? `📎 ${entry.label.slice(0, 80)}` : `\`${entry.label.slice(0, 80)}\``;
}

function formatEntry(entry: ScanEntry): string {
  if (!entry.stats) {
    return `・${formatLabel(entry)}\n  ${entry.note ?? '取得失敗'}`;
  }
  return `・${formatLabel(entry)}\n  悪意: **${entry.stats.malicious}** / 疑わしい: **${entry.stats.suspicious}** / 無害: ${entry.stats.harmless}`;
}

/** 添付ファイルをダウンロードしてVirusTotalに送信します。 */
async function scanAttachment(attachment: Attachment): Promise<ScanEntry> {
  const name = attachment.name ?? 'file';

  if (attachment.size > MAX_FILE_SIZE_BYTES) {
    console.log(`[VirusScan] サイズ超過のためスキャンをスキップ: ${name} (${attachment.size} bytes)`);
    return { kind: 'file', label: name, note: 'サイズ超過のためスキャン対象外' };
  }

  try {
    const response = await axios.get<ArrayBuffer>(attachment.url, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_FILE_SIZE_BYTES,
    });

    const result = await virusTotalManager.getFileReport(Buffer.from(response.data), name);
    if (!result) {
      console.warn(`[VirusScan] ファイルスキャン結果が取得できませんでした: ${name}`);
      return { kind: 'file', label: name, note: '取得失敗' };
    }

    return {
      kind: 'file',
      label: name,
      stats: {
        malicious: result.stats.malicious,
        suspicious: result.stats.suspicious,
        harmless: result.stats.harmless,
        undetected: result.stats.undetected,
      },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[VirusScan] 添付ファイルのダウンロードに失敗しました: ${name}`, msg);
    return { kind: 'file', label: name, note: '取得失敗' };
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

    const settings = miscRepo.getVirusScanSettings(message.guild.id);
    const skipMedia = settings?.skipMediaAttachments ?? true;

    const allAttachments = [...message.attachments.values()];
    const attachments = skipMedia ? allAttachments.filter(a => !isMediaAttachment(a)) : allAttachments;

    const skippedMediaCount = allAttachments.length - attachments.length;
    if (skippedMediaCount > 0) {
      console.log(`[VirusScan] メディア添付 ${skippedMediaCount}件 をスキャン対象外にしました。`);
    }

    if (urls.length === 0 && attachments.length === 0) return;

    console.log(`[VirusScan] ${message.author.tag} のメッセージからURL ${urls.length}件 / 添付 ${attachments.length}件 を検出`);

    if (!message.channel.isSendable()) return;

    const scanningEmbed = new CustomEmbed()
      .setTitle('🔍 スキャン中...')
      .setColor(EMBED_COLORS.WARN)
      .setDescription(`URL ${urls.length}件 / 添付 ${attachments.length}件 をスキャンしています。少々お待ちください。`);

    const scanMsg = await message.reply({ embeds: [scanningEmbed] }).catch(() => null);
    if (!scanMsg) return;

    const entries: ScanEntry[] = [];

    for (const url of urls) {
      const result = await virusTotalManager.getUrlReport(url);
      if (result) {
        entries.push({
          kind: 'url',
          label: url,
          stats: {
            malicious: result.stats.malicious,
            suspicious: result.stats.suspicious,
            harmless: result.stats.harmless,
            undetected: result.stats.undetected,
          },
        });
      } else {
        console.warn(`[VirusScan] URLスキャン結果が取得できませんでした: ${url}`);
        entries.push({ kind: 'url', label: url, note: '取得失敗' });
      }
    }

    for (const attachment of attachments) {
      entries.push(await scanAttachment(attachment));
    }

    const scanned = entries.filter(e => e.stats);
    const failed = entries.filter(e => !e.stats);

    if (scanned.length === 0) {
      const errorEmbed = new CustomEmbed()
        .setTitle('❌ スキャン失敗')
        .setColor(EMBED_COLORS.ERROR)
        .setDescription(
          failed.some(e => e.note !== 'サイズ超過のためスキャン対象外')
            ? 'VirusTotal APIエラーのためスキャン結果を取得できませんでした。'
            : 'サイズ超過のためスキャンできる対象がありませんでした。',
        );
      await scanMsg.edit({ embeds: [errorEmbed] }).catch(console.error);
      return;
    }

    const dangerousResults = scanned.filter(e => e.stats!.malicious > 0 || e.stats!.suspicious > 0);
    const deleteAt = Date.now() + DELETE_AFTER_MS;
    const deleteTs = Math.floor(deleteAt / 1000);
    const failedList = failed.length > 0 ? `\n\n**スキャンできなかった対象:**\n${failed.map(formatEntry).join('\n')}` : '';

    if (dangerousResults.length > 0) {
      const resultList = dangerousResults.map(formatEntry).join('\n');

      const embed = new CustomEmbed()
        .setTitle('⚠️ 危険なURL/ファイルが検出されました')
        .setColor(EMBED_COLORS.ERROR)
        .setDescription(`**送信者:** ${message.author}\n\n${resultList}${failedList}\n\n<t:${deleteTs}:R>にこのメッセージは削除されます。`)
        .setTimestamp();

      await scanMsg.edit({ embeds: [embed] }).catch(console.error);

      setTimeout(() => {
        scanMsg.delete().catch(() => {});
      }, DELETE_AFTER_MS);
    } else {
      const resultList = scanned.map(e => `・${formatLabel(e)}`).join('\n');

      const embed = new CustomEmbed()
        .setTitle('✅ スキャン完了')
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(`**対象:**\n${resultList}${failedList}\n\n脅威は検出されませんでした。\n<t:${deleteTs}:R>にこのメッセージは削除されます。`)
        .addFields(
          { name: 'スキャン数', value: `${scanned.length}`, inline: true },
          { name: '結果', value: '安全', inline: true },
        )
        .setTimestamp();

      await scanMsg.edit({ embeds: [embed] }).catch(console.error);

      setTimeout(() => {
        scanMsg.delete().catch(() => {});
      }, DELETE_AFTER_MS);
    }
  },
} satisfies BotEvent;
