import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { miscRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-reban')
  .setDescription('【管理者のみ】サーバー退出時に自動BANする機能を設定します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addBooleanOption(option =>
    option.setName('enabled').setDescription('機能の有効/無効').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const enabled = interaction.options.getBoolean('enabled', true);
  await miscRepo.setRebanSettings(interaction.guild!.id, { enabled });
  const embed = new CustomEmbed(interaction.user)
    .setTitle('🛡️ 追い打ちBAN設定')
    .setColor(0x00FF00)
    .setDescription(`追い打ちBAN機能を**${enabled ? '有効' : '無効'}**にしました。`);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;