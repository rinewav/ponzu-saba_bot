import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { ensureLatestTemplateMessage } from '../../lib/templateManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-introduction')
  .setDescription('【管理者のみ】自己紹介チャンネルを初期化します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(opt =>
    opt.setName('channel').setDescription('自己紹介用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const embed = new CustomEmbed(interaction.user);

  try {
    await ensureLatestTemplateMessage(interaction.guild!.id, 'introduction', channel);
    embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`自己紹介チャンネルを ${channel} に設定しました。`);
  } catch (error) {
    embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription(`自己紹介チャンネルの設定に失敗しました: ${(error as Error).message}`);
  }

  await interaction.editReply({ embeds: [embed] });
}

const command: BotCommand = { data, execute };
export default command;