import type { Message } from 'discord.js';
import { verificationRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

export class VerificationManager {
  initialize(_client: import('discord.js').Client): void {
    // VerificationManagerはクライアントを必要としない
  }

  async handleVerification(message: Message): Promise<void> {
    if (!message.guild) return;
    const settings = await verificationRepo.getVerificationSettings(message.guild.id);
    if (!settings || !settings.channelId || message.channel.id !== settings.channelId) {
      return;
    }

    if (!settings.roleId || !settings.password) {
      return;
    }

    const member = message.member;
    if (!member) return;

    if (member.roles.cache.has(settings.roleId)) {
      await message.delete().catch(() => {});
      return;
    }

    if (message.content !== settings.password) {
      await message.delete().catch(() => {});
      return;
    }

    try {
      await message.delete();

      const successEmbed = new CustomEmbed(member.user)
        .setTitle('✅️ 認証が成功しました！')
        .setDescription('正しい合言葉が入力されました。5秒後にロールが付与され、このチャンネルは見えなくなります。')
        .setColor(0x00FF00);

      const successMessage = await (message.channel as import('discord.js').TextChannel).send({
        content: `${member}`,
        embeds: [successEmbed],
      });

      setTimeout(async () => {
        try {
          const role = await message.guild!.roles.fetch(settings.roleId!);
          if (role) {
            await member.roles.add(role);
          }
        } catch (roleError) {
          console.error(`[Verification] ロール付与に失敗しました (RoleID: ${settings.roleId}):`, roleError);
        } finally {
          await successMessage.delete().catch(() => {});
        }
      }, 5000);

    } catch (error) {
      console.error('[Verification] 認証処理中にエラーが発生しました:', error);
    }
  }
}

export const verificationManager = new VerificationManager();