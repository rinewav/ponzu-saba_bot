import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { kikisenRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-kikisenlog')
  .setDescription('【管理者のみ】聞き専ログチャンネルを設定します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt =>
    opt.setName('channel').setDescription('ログを送信するテキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  await kikisenRepo.setLogChannel(interaction.guild!.id, channel.id);
  const embed = new CustomEmbed(interaction.user)
    .setColor(0x00FF00)
    .setTitle('✅ 設定完了')
    .setDescription(`聞き専ログチャンネルを ${channel} に設定しました。`);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;