import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { levelManager } from '../../lib/levelManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('level-edit')
  .setDescription('【管理者のみ】ユーザーのレベル/XP/ストリークデータを編集します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(opt => opt.setName('user').setDescription('編集するユーザー').setRequired(true))
  .addIntegerOption(opt => opt.setName('level').setDescription('レベル').setMinValue(0))
  .addIntegerOption(opt => opt.setName('xp').setDescription('XP').setMinValue(0))
  .addIntegerOption(opt => opt.setName('streak').setDescription('連続ログイン日数').setMinValue(0))
  .addIntegerOption(opt => opt.setName('highest-streak').setDescription('最高連続ログイン日数').setMinValue(0));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser('user', true);
  const level = interaction.options.getInteger('level');
  const xp = interaction.options.getInteger('xp');
  const streak = interaction.options.getInteger('streak');
  const highestStreak = interaction.options.getInteger('highest-streak');

  if (level === null && xp === null && streak === null && highestStreak === null) {
    await interaction.reply({ content: '❌ 少なくとも1つのオプションを指定してください。', ephemeral: true });
    return;
  }

  const update: Record<string, number> = {};
  if (level !== null) update.level = level;
  if (xp !== null) update.xp = xp;
  if (streak !== null) update.loginStreak = streak;
  if (highestStreak !== null) update.highestLoginStreak = highestStreak;

  await levelManager.setUserData(interaction.guild!.id, targetUser.id, update);

  const embed = new CustomEmbed(interaction.user)
    .setColor(0x00FF00)
    .setTitle('✅ レベルデータ更新')
    .setDescription(`${targetUser} のデータを更新しました。`)
    .addFields(
      ...Object.entries(update).map(([key, val]) => ({
        name: key,
        value: `**${val}**`,
        inline: true,
      })),
    );

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;