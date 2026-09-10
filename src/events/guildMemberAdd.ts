import { Events, type GuildMember, type TextChannel } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { miscRepo } from '../lib/repositories/index.js';
import { verificationManager } from '../lib/verificationManager.js';
import { verificationRepo } from '../lib/repositories/index.js';
import { CustomEmbed, EMBED_COLORS } from '../lib/customEmbed.js';

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID!;
const INTRO_CHANNEL_ID = process.env.INTRO_CHANNEL_ID!;

export default {
  name: Events.GuildMemberAdd,
  async execute(...args: unknown[]) {
    const [member] = args as [GuildMember];
    if (member.user.bot) return;

    const settings = await verificationRepo.getVerificationSettings(member.guild.id);
    if (settings?.enabled) {
      await verificationManager.handleMemberJoin(member);
      return;
    }

    const cached = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    const channel = cached ?? await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const targetChannel = channel as TextChannel;

    const embed = new CustomEmbed(member.user)
      .setTitle('🎉 新しいメンバーが参加しました！')
      .setDescription(`ようこそ ${member} ！ぽん酢鯖へ参加いただきありがとうございます。\n<#${INTRO_CHANNEL_ID}> で自己紹介をしてみましょう！`)
      .setThumbnail(member.user.displayAvatarURL())
      .setColor(EMBED_COLORS.SUCCESS);

    const welcomeMessage = await targetChannel.send({ embeds: [embed] });
    await miscRepo.setWelcomeMessageId(member.id, welcomeMessage.id, targetChannel.id);
  },
} satisfies BotEvent;
