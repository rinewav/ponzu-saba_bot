import { Events } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { cleanupRepo } from '../lib/repositories/index.js';
import { CustomEmbed } from '../lib/customEmbed.js';

export default {
  name: Events.InteractionCreate,
  async execute(...args: unknown[]) {
    const [interaction] = args as [import('discord.js').Interaction];
    if (!interaction.isButton() || !interaction.customId.startsWith('cleanup_')) return;

    const guildId = interaction.guildId;
    if (!guildId) return;

    const job = await cleanupRepo.getCleanupJob(guildId);
    if (!job) {
      await interaction.reply({ content: 'アクティブなクリーンアップジョブが見つかりません。', ephemeral: true }).catch(() => {});
      return;
    }

    if (interaction.customId.startsWith('cleanup_pause_')) {
      await cleanupRepo.updateCleanupJob(guildId, { isPaused: true });
      const embed = new CustomEmbed()
        .setTitle('⏸️ クリーンアップ一時停止')
        .setDescription('クリーンアップ処理を一時停止しました。再開するにはボタンを押してください。');
      await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
      console.log(`[クリーンアップ] Guild: ${guildId} の処理が一時停止されました。`);
    } else if (interaction.customId.startsWith('cleanup_resume_')) {
      await cleanupRepo.updateCleanupJob(guildId, { isPaused: false });
      const embed = new CustomEmbed()
        .setTitle('▶️ クリーンアップ再開')
        .setDescription('クリーンアップ処理を再開しました。');
      await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
      console.log(`[クリーンアップ] Guild: ${guildId} の処理が再開されました。`);
    }
  },
} satisfies BotEvent;