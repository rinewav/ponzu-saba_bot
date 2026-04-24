import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction, type TextChannel } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { ensureLatestTemplateMessage, TEMPLATE_DEFINITIONS } from '../../lib/templateManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-template')
  .setDescription('【管理者のみ】常に最新のテンプレートメッセージを設定します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('template').setDescription('テンプレートキー').setRequired(true)
      .addChoices(...Object.keys(TEMPLATE_DEFINITIONS).map(key => ({ name: key, value: key }))),
  )
  .addChannelOption(opt =>
    opt.setName('channel').setDescription('テンプレートを維持するチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const templateKey = interaction.options.getString('template', true);
  const channel = interaction.options.getChannel('channel', true) as TextChannel;
  const embed = new CustomEmbed(interaction.user);

  try {
    await ensureLatestTemplateMessage(interaction.guild!.id, templateKey, channel);
    embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`テンプレート「${templateKey}」を ${channel} に設定しました。`);
  } catch (error) {
    embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription(`テンプレートの設定に失敗しました: ${(error as Error).message}`);
  }

  await interaction.editReply({ embeds: [embed] });
}

const command: BotCommand = { data, execute };
export default command;