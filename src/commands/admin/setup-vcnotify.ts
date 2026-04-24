import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { vcNotifyRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-vcnotify')
  .setDescription('【管理者のみ】VC通知機能の設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('set-channel')
      .setDescription('VC通知の送信先チャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('通知用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add-excluded-channel')
      .setDescription('VC通知対象外のチャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外にするボイスチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildVoice),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-excluded-channel')
      .setDescription('VC通知対象外チャンネルを削除します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外から削除するボイスチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildVoice),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'set-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await vcNotifyRepo.setVcNotifySettings(guildId, { notificationChannelId: channel.id });
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`VC通知チャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'add-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await vcNotifyRepo.addVcNotifyExcludedChannel(guildId, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をVC通知対象外に追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await vcNotifyRepo.removeVcNotifyExcludedChannel(guildId, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をVC通知対象外から削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;