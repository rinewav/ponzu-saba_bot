import { Events, type GuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { miscRepo } from '../lib/repositories/index.js';
import { logManager } from '../lib/logManager.js';

const rebanEvent: BotEvent = {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];

    const settings = await miscRepo.getRebanSettings(member.guild.id);
    if (!settings?.enabled) return;

    try {
      await member.guild.members.ban(member.id, { reason: '再Ban設定: 退出時に自動的にBAN' });
      console.log(`[Reban] ${member.user.tag} を再Banしました。`);
    } catch (error) {
      console.error(`[Reban] ${member.user.tag} の再Banに失敗しました:`, error);
    }

    logManager.handleGuildMemberRemove(member);
  },
};

export default [rebanEvent] satisfies BotEvent[];