import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { verificationManager } from '../../lib/verificationManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('verification-reset')
  .setDescription('【管理者のみ】ユーザーの参加認証申請をリセットします。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(opt => opt.setName('user').setDescription('リセットするユーザー').setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const user = interaction.options.getUser('user', true);
  const guildId = interaction.guild!.id;

  const active = verificationRepo.getActiveApplicationByUser(guildId, user.id);

  if (!active) {
    const embed = new CustomEmbed(interaction.user)
      .setColor(0xFFAA00)
      .setTitle('⚠️ 該当なし')
      .setDescription(`${user} にアクティブな申請はありません。`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  const statusMap: Record<string, string> = {
    quiz: '📝 クイズ中', pending: '⏳ 審査中', approved: '✅ 承認済み',
    nda_pending: '📋 NDA待ち',
  };

  const beforeStatus = statusMap[active.status] ?? active.status;

  const result = await verificationManager.resetUserApplication(guildId, user.id);

  const embed = new CustomEmbed(interaction.user)
    .setColor(0x00FF00)
    .setTitle('✅ リセット完了')
    .setDescription(
      `${user} の申請をリセットしました。\n\n` +
      `**リセット前の状態**: ${beforeStatus}\n` +
      `**削除した申請数**: ${result.deletedApps}\n` +
      `**削除したチケット**: ${result.closedTickets.length > 0 ? result.closedTickets.map(id => `<#${id}>`).join(', ') : 'なし'}\n\n` +
      'ユーザーは再度参加申請を行うことができます。',
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;
