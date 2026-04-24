import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { cleanupManager } from '../../lib/cleanupManager.js';

export const data = new SlashCommandBuilder()
  .setName('cleanup')
  .setDescription('【管理者のみ】サーバーのクリーンアップを実行します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: '🧹 クリーンアップ処理を開始します...', ephemeral: true });
  await cleanupManager.executeCleanup(interaction.guild!);
}

const command: BotCommand = { data, execute };
export default command;