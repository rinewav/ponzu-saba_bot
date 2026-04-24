import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { workoutRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-workout')
  .setDescription('【管理者のみ】筋トレ通知機能の設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('add-channel')
      .setDescription('筋トレ報告対象チャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-channel')
      .setDescription('筋トレ報告対象チャンネルを削除します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('削除するテキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('list-channels')
      .setDescription('筋トレ報告対象チャンネル一覧を表示します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'add-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = (await workoutRepo.getWorkoutSettings(guildId)) || {};
      if (!settings.targetChannels) settings.targetChannels = [];
      if (!settings.targetChannels.includes(channel.id)) {
        settings.targetChannels.push(channel.id);
      }
      await workoutRepo.setWorkoutSettings(guildId, settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} を筋トレ報告対象に追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = await workoutRepo.getWorkoutSettings(guildId);
      if (settings?.targetChannels) {
        settings.targetChannels = settings.targetChannels.filter((id: string) => id !== channel.id);
        await workoutRepo.setWorkoutSettings(guildId, settings);
      }
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} を筋トレ報告対象から削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'list-channels': {
      const settings = await workoutRepo.getWorkoutSettings(guildId);
      const channels = settings?.targetChannels || [];
      if (channels.length === 0) {
        embed.setColor(0x5865F2).setTitle('📋 筋トレ報告対象チャンネル').setDescription('対象チャンネルは設定されていません。');
      } else {
        const list = channels.map((id: string) => `<#${id}>`).join('\n');
        embed.setColor(0x5865F2).setTitle('📋 筋トレ報告対象チャンネル').setDescription(list);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;