import { SlashCommandBuilder, ChannelType, PermissionsBitField, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { miscRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-logs')
  .setDescription('【管理者のみ】ログを送信するチャンネルを設定します。')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addChannelOption(option =>
    option.setName('channel').setDescription('ログを送信するテキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  await miscRepo.setLogChannelId(interaction.guild!.id, channel.id);
  const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`ログチャンネルを ${channel} に設定しました。`);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;