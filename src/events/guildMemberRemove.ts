import { Events, type GuildMember, type TextChannel } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { miscRepo } from '../lib/repositories/index.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];

    const ref = miscRepo.getWelcomeMessage(member.id);
    if (!ref || !ref.channelId) return;

    const cached = member.guild.channels.cache.get(ref.channelId);
    const channel = cached ?? await member.guild.channels.fetch(ref.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    try {
      const message = await (channel as TextChannel).messages.fetch(ref.messageId).catch(() => null);
      if (message && message.deletable) {
        await message.delete();
      }
    } catch {
      // メッセージの削除に失敗した場合は無視
    }

    await miscRepo.removeWelcomeMessageId(member.id);
  },
} satisfies BotEvent;
