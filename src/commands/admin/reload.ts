import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('【管理者のみ】ボットを再起動します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: '🔄 ボットを再起動しています...', ephemeral: true });
  interaction.client.destroy();
  process.exit(0);
}

const command: BotCommand = { data, execute };
export default command;