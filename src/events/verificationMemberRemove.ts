import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { verificationManager } from '../lib/verificationManager.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember | PartialGuildMember];
    if (member.user?.bot) return;

    await verificationManager.handleMemberLeave(member);
  },
} satisfies BotEvent;
