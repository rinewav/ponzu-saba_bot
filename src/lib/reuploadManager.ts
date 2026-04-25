import { AttachmentBuilder, type Client, type Message } from 'discord.js';
import { mkdir, writeFile, unlink, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import axios from 'axios';
import { miscRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

const TEMP_DIR = join(process.cwd(), 'temp');

export class ReuploadManager {
  private client: Client | null = null;

  async initialize(client: Client): Promise<void> {
    this.client = client;
    await mkdir(TEMP_DIR, { recursive: true });
  }

  async handleMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;

    const settings = await miscRepo.getReuploadSettings(message.guild.id);
    const destinationChannelId = settings?.destinationChannelId;

    if (!destinationChannelId || message.channel.id === destinationChannelId) return;

    const destinationChannel = await this.client!.channels.fetch(destinationChannelId).catch(() => null);
    if (!destinationChannel || !destinationChannel.isTextBased()) return;

    interface FileInfo {
      url: string;
      name: string;
    }

    const fileUrls: FileInfo[] = [];

    for (const [, attachment] of message.attachments) {
      fileUrls.push({ url: attachment.url, name: attachment.name ?? 'unknown' });
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const potentialUrls = message.content.match(urlRegex) || [];
    for (const url of potentialUrls) {
      if (/\.(png|jpg|jpeg|gif|webp|mp4|mov|webm)$/i.test(url)) {
        try {
          const parsedUrl = new URL(url);
          fileUrls.push({ url, name: basename(parsedUrl.pathname) });
        } catch {
          // 無効なURLはスキップ
        }
      }
    }

    if (fileUrls.length === 0) return;

    for (const fileInfo of fileUrls) {
      const tempFilePath = join(TEMP_DIR, `reupload_${Date.now()}_${fileInfo.name}`);
      try {
        const response = await axios({
          method: 'get',
          url: fileInfo.url,
          responseType: 'arraybuffer',
          timeout: 30000,
        });

        await writeFile(tempFilePath, Buffer.from(response.data));

        const stats = await stat(tempFilePath);
        const fileSizeInMB = stats.size / (1024 * 1024);

        const embed = new CustomEmbed(message.author)
          .setTitle('📁 ファイルが送信されました')
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
          .setDescription(`**${message.channel}** への投稿をバックアップしました。\n[元のメッセージへ飛ぶ](${message.url})`);

        if (fileSizeInMB > 8) {
          embed.addFields({ name: 'ファイルサイズ超過', value: `ファイルサイズが8MBを超えているため、再アップロードできませんでした。\n元ファイル: ${fileInfo.url}` });
          await (destinationChannel as import('discord.js').TextChannel).send({ embeds: [embed] });
        } else {
          const attachment = new AttachmentBuilder(tempFilePath, { name: fileInfo.name });
          await (destinationChannel as import('discord.js').TextChannel).send({ embeds: [embed], files: [attachment] });
        }

      } catch (error) {
        console.error(`[Reupload] ファイルの処理に失敗しました (URL: ${fileInfo.url}):`, error);
      } finally {
        await unlink(tempFilePath).catch(() => {});
      }
    }
  }
}

export const reuploadManager = new ReuploadManager();