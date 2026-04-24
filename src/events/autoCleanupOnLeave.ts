import { Events, type GuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { cleanupManager } from '../lib/cleanupManager.js';
import { cleanupRepo, miscRepo } from '../lib/repositories/index.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];

    const settings = await miscRepo.getRebanSettings(member.guild.id);
    const cleanupSettings = await cleanupRepo.getCleanupSettings(member.guild.id);

    if (settings?.enabled || cleanupSettings) {
      const guild = member.guild;
      try {
        await guild.members.fetch();
      } catch {
        // メンバーキャッシュの更新に失敗しても処理を続行
      }

      if (settings?.enabled) {
        try {
          await guild.members.ban(member.id, { reason: '再Ban設定により自動BAN' });
          console.log(`[AutoCleanup] ${member.user.tag} を再Banしました。`);
        } catch (error) {
          console.error(`[AutoCleanup] ${member.user.tag} の再Banに失敗しました:`, error);
        }
      }

      if (cleanupSettings) {
        cleanupManager.executeCleanup(guild);
      }
    }
  },
} satisfies BotEvent;