import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../types/index.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';

export const data = new SlashCommandBuilder()
  .setName('stats-now')
  .setDescription('現在のデイリースタツトレポートを生成して表示します。');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  try {
    await dailyStatsManager.generateAndSendReport(interaction.guild!, false);
    await interaction.editReply({ content: '✅ デイリーレポートを送信しました。' });
  } catch (error) {
    await interaction.editReply({ content: `❌ エラー: ${(error as Error).message}` });
  }
}

const command: BotCommand = { data, execute };
export default command;