import { Events, type GuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { cleanupManager } from '../lib/cleanupManager.js';
import { cleanupRepo } from '../lib/repositories/index.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];

    const cleanupSettings = await cleanupRepo.getCleanupSettings(member.guild.id);

    if (cleanupSettings) {
      const guild = member.guild;
      try {
        await guild.members.fetch();
      } catch {
        // メンバーキャッシュの更新に失敗しても処理を続行
      }

      cleanupManager.executeCleanup(guild);
    }
  },
} satisfies BotEvent;