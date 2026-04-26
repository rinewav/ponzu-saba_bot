import { Events, type Interaction } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { rolePanelManager } from '../lib/rolePanelManager.js';
import { verificationManager } from '../lib/verificationManager.js';
import { cleanupRepo } from '../lib/repositories/index.js';
import { handleSetupSelectMenu, handleSetupModal, handleSetupButton, handleVerificationSelectMenu } from '../commands/admin/setup.js';

export default {
  name: Events.InteractionCreate,
  async execute(...args: unknown[]) {
    const [interaction] = args as [Interaction];
    if (!interaction || !interaction.inCachedGuild?.()) return;

    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`[Interaction] コマンド "${interaction.commandName}" が見つかりませんでした。`);
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[Interaction] コマンド "${interaction.commandName}" の実行中にエラーが発生しました:`, error);
        const errorMsg = 'コマンドの実行中にエラーが発生しました。';
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMsg, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: errorMsg, ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId === 'sv_back' || customId.startsWith('sv_delq_') || customId === 'sv_form_add' || customId === 'sv_form_reset' || customId.startsWith('sv_formdel_')) {
        await handleSetupButton(interaction);
        return;
      }

      if (customId.startsWith('setup_')) {
        await handleSetupButton(interaction);
        return;
      }

      if (customId.startsWith('v_')) {
        await verificationManager.handleButtonInteraction(interaction);
        return;
      }

      if (customId.startsWith('cleanup_')) {
        const guildId = interaction.guildId;
        if (!guildId) return;

        const job = await cleanupRepo.getCleanupJob(guildId);
        if (!job) {
          await interaction.reply({ content: 'クリーンアップジョブが見つかりません。', ephemeral: true }).catch(() => {});
          return;
        }

        if (customId.startsWith('cleanup_pause_')) {
          await cleanupRepo.updateCleanupJob(guildId, { isPaused: true });
          await interaction.reply({ content: 'クリーンアップを一時停止しました。', ephemeral: true }).catch(() => {});
        } else if (customId.startsWith('cleanup_resume_')) {
          await cleanupRepo.updateCleanupJob(guildId, { isPaused: false });
          await interaction.reply({ content: 'クリーンアップを再開しました。', ephemeral: true }).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('sv_modal_')) {
        await handleSetupModal(interaction);
        return;
      }
      if (interaction.customId.startsWith('setup_m_')) {
        await handleSetupModal(interaction);
        return;
      }
      if (interaction.customId.startsWith('v_')) {
        await verificationManager.handleModalSubmit(interaction);
        return;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'sv_menu') {
        await handleVerificationSelectMenu(interaction);
        return;
      }
      if (interaction.customId === 'setup_menu') {
        await handleSetupSelectMenu(interaction);
        return;
      }
      if (interaction.customId.startsWith('role_panel_select')) {
        await rolePanelManager.handleInteraction(interaction);
      }
      return;
    }
  },
} satisfies BotEvent;
