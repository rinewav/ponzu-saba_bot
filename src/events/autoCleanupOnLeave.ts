import { Events, type GuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { cleanupManager } from '../lib/cleanupManager.js';
import { cleanupRepo } from '../lib/repositories/index.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];

    const cleanupSettings = await cleanupRepo.getCleanupSettings(member.guild.id);
    if (!cleanupSettings?.enabled) return;

    try {
      const bans = await member.guild.bans.fetch({ user: member.id }).catch(() => null);
      if (bans) {
        console.log(`[Cleanup] ${member.user.tag} はBANされているためクリーンアップをスキップします。`);
        return;
      }
    } catch {
      // ban情報の取得に失敗した場合は続行
    }

    const guild = member.guild;
    try {
      await guild.members.fetch();
    } catch {
      // メンバーキャッシュの更新に失敗しても処理を続行
    }

    cleanupManager.executeCleanup(guild);
  },
} satisfies BotEvent;
