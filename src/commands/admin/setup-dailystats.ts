import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { dailyStatsRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-dailystats')
  .setDescription('【管理者のみ】デイリースタツト機能の設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('set-channel')
      .setDescription('デイリーレポートを送信するチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('レポート用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add-excluded-channel')
      .setDescription('レポート対象外のチャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外にするチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-excluded-channel')
      .setDescription('レポート対象外チャンネルを削除します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外から削除するチャンネル').setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'set-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await dailyStatsRepo.setDailyStatsSettings(guildId, { reportChannelId: channel.id });
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`デイリーレポートチャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'add-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await dailyStatsRepo.addDailyStatsExcludedChannel(guildId, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をレポート対象外に追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await dailyStatsRepo.removeDailyStatsExcludedChannel(guildId, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をレポート対象外から削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;