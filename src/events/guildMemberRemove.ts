import { Events, type GuildMember } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { miscRepo } from '../lib/repositories/index.js';

const LEAVE_CHANNEL_ID = process.env.LEAVE_CHANNEL_ID || '1312756594416554076';

export default {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];

    const messageId = miscRepo.getWelcomeMessageId(member.id);
    if (!messageId) return;

    const channel = member.guild.channels.cache.get(LEAVE_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    try {
      const message = await (channel as import('discord.js').TextChannel).messages.fetch(messageId).catch(() => null);
      if (message && message.deletable) {
        await message.delete();
      }
    } catch {
      // メッセージの削除に失敗した場合は無視
    }

    await miscRepo.removeWelcomeMessageId(member.id);
  },
} satisfies BotEvent;