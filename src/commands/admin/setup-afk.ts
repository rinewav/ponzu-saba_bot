import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { afkRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-afk')
  .setDescription('【管理者のみ】AFK機能の設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('set-channel')
      .setDescription('AFK用のボイスチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('AFK用ボイスチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildVoice),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-notify-channel')
      .setDescription('AFK通知用のテキストチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('通知用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-timeout')
      .setDescription('AFK判定までの時間（分）を設定します。')
      .addIntegerOption(opt =>
        opt.setName('minutes').setDescription('タイムアウト時間（分）').setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add-excluded-channel')
      .setDescription('AFK対象外のチャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外にするチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-excluded-channel')
      .setDescription('AFK対象外チャンネルを削除します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外から削除するチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('show-settings')
      .setDescription('現在のAFK設定を表示します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);

  switch (subcommand) {
    case 'set-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await afkRepo.setAfkSetting(interaction.guild!.id, { afkChannelId: channel.id });
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`AFKチャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'set-notify-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await afkRepo.setAfkSetting(interaction.guild!.id, { notifyChannelId: channel.id });
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`AFK通知チャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'set-timeout': {
      const minutes = interaction.options.getInteger('minutes', true);
      await afkRepo.setAfkSetting(interaction.guild!.id, { afkTimeout: minutes * 60 * 1000 });
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`AFKタイムアウトを **${minutes}分** に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'add-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await afkRepo.addAfkExcludedChannel(interaction.guild!.id, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をAFK対象外に追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove-excluded-channel': {
      const channel = interaction.options.getChannel('channel', true);
      await afkRepo.removeAfkExcludedChannel(interaction.guild!.id, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をAFK対象外から削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'show-settings': {
      const settings = await afkRepo.getAfkSettings(interaction.guild!.id);
      if (!settings) {
        embed.setColor(0xFF0000).setTitle('⚠️ 設定なし').setDescription('AFK設定がまだ行われていません。');
      } else {
        const afkChannel = settings.afkChannelId ? `<#${settings.afkChannelId}>` : '未設定';
        const notifyChannel = settings.notifyChannelId ? `<#${settings.notifyChannelId}>` : '未設定';
        const timeout = settings.afkTimeout ? `${Math.round(settings.afkTimeout / 60000)}分` : '未設定（デフォルト: 180分）';
        const excluded = settings.afkExcludedChannels?.map((id: string) => `<#${id}>`).join(', ') || 'なし';
        embed.setColor(0x5865F2).setTitle('📋 AFK設定')
          .addFields(
            { name: 'AFKチャンネル', value: afkChannel, inline: true },
            { name: '通知チャンネル', value: notifyChannel, inline: true },
            { name: 'タイムアウト', value: timeout, inline: true },
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