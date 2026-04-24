import { SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '../types/index.js';
import { levelRepo } from '../lib/repositories/index.js';
import { CustomEmbed } from '../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('level-role')
  .setDescription('レベルアップ報酬ロールを表示します。');

export async function execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void> {
  const roles = await levelRepo.getLevelRoles(interaction.guild!.id);
  const entries = Object.entries(roles);

  const embed = new CustomEmbed(interaction.user)
    .setTitle('🎖️ レベルアップ報酬ロール')
    .setColor(0x5865F2);

  if (entries.length === 0) {
    embed.setDescription('現在、レベルアップ報酬ロールは設定されていません。');
  } else {
    const description = entries
      .sort(([, a], [, b]) => Number(a) - Number(b))
      .map(([level, roleId]) => `レベル **${level}** → <@&${roleId}>`)
      .join('\n');
    embed.setDescription(description);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;