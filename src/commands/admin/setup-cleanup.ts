import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { cleanupRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-cleanup')
  .setDescription('【管理者のみ】クリーンアップ機能の設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('toggle')
      .setDescription('退出時の自動クリーンアップをON/OFFします。'),
  )
  .addSubcommand(sub =>
    sub.setName('set-log-channel')
      .setDescription('クリーンアップログを送信するチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('ログ用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add-excluded-channel')
      .setDescription('クリーンアップ対象外のチャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外にするチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-excluded-channel')
      .setDescription('クリーンアップ対象外チャンネルを削除します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外から削除するチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('show-settings')
      .setDescription('現在のクリーンアップ設定を表示します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);

  switch (subcommand) {
    case 'toggle': {
      const settings = await cleanupRepo.getCleanupSettings(interaction.guild!.id);
      const newState = !(settings?.enabled);
      await cleanupRepo.setCleanupSetting(interaction.guild!.id, { enabled: newState });
      embed.setColor(newState ? 0x00FF00 : 0xFFAA00)
        .setTitle(newState ? '✅ 自動クリーンアップ ON' : '⛔ 自動クリーンアップ OFF')
        .setDescription(`退出時の自動クリーンアップを${newState ? '有効' : '無効'}にしました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'set-log-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await cleanupRepo.setCleanupSetting(interaction.guild!.id, { logChannelId: channel.id });
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`クリーンアップログチャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'add-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await cleanupRepo.addCleanupExcludedChannel(interaction.guild!.id, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をクリーンアップ対象外に追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await cleanupRepo.removeCleanupExcludedChannel(interaction.guild!.id, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をクリーンアップ対象外から削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'show-settings': {
      const settings = await cleanupRepo.getCleanupSettings(interaction.guild!.id);
      if (!settings) {
        embed.setColor(0xFF0000).setTitle('⚠️ 設定なし').setDescription('クリーンアップ設定がまだ行われていません。');
      } else {
        const logChannel = settings.logChannelId ? `<#${settings.logChannelId}>` : '未設定';
        const excluded = settings.excludedChannels?.map((id: string) => `<#${id}>`).join(', ') || 'なし';
        embed.setColor(0x5865F2).setTitle('📋 クリーンアップ設定')
          .addFields(
            { name: '自動クリーンアップ', value: settings.enabled ? '✅ ON' : '⛔ OFF', inline: true },
            { name: 'ログチャンネル', value: logChannel, inline: true },
            { name: '対象外チャンネル', value: excluded, inline: false },
          );
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;