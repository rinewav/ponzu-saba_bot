import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { miscRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-voicerole')
  .setDescription('【管理者のみ】VC参加時に付与するロールを設定します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addRoleOption(opt =>
    opt.setName('role').setDescription('VC参加時に付与するロール').setRequired(true),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const role = interaction.options.getRole('role', true);
  await miscRepo.setVoiceRoleSettings(interaction.guild!.id, { roleId: role.id });
  const embed = new CustomEmbed(interaction.user)
    .setColor(0x00FF00)
    .setTitle('✅ 設定完了')
    .setDescription(`VC参加時ロールを ${role} に設定しました。`);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;