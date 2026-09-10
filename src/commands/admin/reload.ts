import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { flushNow } from '../../lib/repositories/baseRepository.js';

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('【管理者のみ】ボットを再起動します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: '🔄 ボットを再起動しています...', flags: MessageFlags.Ephemeral });
  await interaction.client.destroy();
  await flushNow();
  process.exit(0);
}

const command: BotCommand = { data, execute };
export default command;
