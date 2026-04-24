import { Events, type GuildMember, type TextChannel } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { miscRepo } from '../lib/repositories/index.js';
import { CustomEmbed } from '../lib/customEmbed.js';

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || '1312756594878054402';
const INTRO_CHANNEL_ID = process.env.INTRO_CHANNEL_ID || '1312756594416554076';

export default {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];
    if (member.user.bot) return;

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID) as TextChannel | null;
    if (!channel) {
      const fetched = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
      if (!fetched || !fetched.isTextBased()) return;
    }

    const targetChannel = channel ?? (await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null)) as TextChannel | null;
    if (!targetChannel) return;

    const embed = new CustomEmbed(member.user)
      .setTitle('🎉 新しいメンバーが参加しました！')
      .setDescription(`ようこそ ${member} ！ぽん酢鯖へ参加いただきありがとうございます。\n<#${INTRO_CHANNEL_ID}> で自己紹介をしてみましょう！`)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor(0x00FF00);

    const welcomeMessage = await targetChannel.send({ embeds: [embed] });
    await miscRepo.setWelcomeMessageId(member.id, welcomeMessage.id);
  },
} satisfies BotEvent;