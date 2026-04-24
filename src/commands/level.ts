import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../types/index.js';
import { levelManager } from '../lib/levelManager.js';
import { CustomEmbed } from '../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('ユーザーのレベル/XP情報を表示します。')
  .addUserOption(option =>
    option.setName('user').setDescription('確認するユーザー（省略した場合は自分）'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const member = await interaction.guild!.members.fetch(targetUser.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: '指定されたユーザーが見つかりません。', ephemeral: true });
    return;
  }

  const userData = levelManager.getUserData(interaction.guild!.id, targetUser.id);
  const xpForNext = levelManager.xpForLevel(userData.level);
  const progress = Math.floor((userData.xp / xpForNext) * 10);
  const progressBar = '🟩'.repeat(progress) + '⬛'.repeat(10 - progress);

  const embed = new CustomEmbed(targetUser)
    .setTitle(`📊 ${member.displayName} のレベル情報`)
    .setColor(0x5865F2)
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: 'レベル', value: `**${userData.level}**`, inline: true },
      { name: 'XP', value: `${Math.floor(userData.xp)} / ${xpForNext}`, inline: true },
      { name: '連続ログイン', value: `**${userData.loginStreak}** 日目`, inline: true },
      { name: '最高記録', value: `**${userData.highestLoginStreak}** 日`, inline: true },
      { name: '次のレベルまで', value: `${progressBar}\n(${Math.floor(userData.xp)}/${xpForNext} XP)`, inline: false },
    );

  await interaction.reply({ embeds: [embed] });
}

const command: BotCommand = { data, execute };
export default command;