import { Events, type GuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { afkManager } from '../lib/afkManager.js';

const PRE_AFK_PREFIX = '🛌 ';

export default {
  name: Events.GuildMemberUpdate,
  async execute(...args: unknown[]) {
    const [oldMember, newMember] = args as [GuildMember, GuildMember];

    if (oldMember.nickname === newMember.nickname) return;

    const newNickname = newMember.nickname ?? newMember.user.displayName;

    if (newNickname.startsWith(PRE_AFK_PREFIX) && !afkManager.isManagedByAfk(newMember.id)) {
      const originalNickname = oldMember.nickname ?? null;
      try {
        await newMember.setNickname(originalNickname, 'AFKマネージャー以外による🛌プレフィックスの付与を拒否');
      } catch (error) {
        console.error(`[AFK] ${newMember.user.tag} のニックネーム復元に失敗しました:`, error);
      }
    }
  },
} satisfies BotEvent;