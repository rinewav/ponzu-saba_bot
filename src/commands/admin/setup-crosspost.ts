import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { miscRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-crosspost')
  .setDescription('【管理者のみ】絵文字/スタンプクロスポストの設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('クロスポスト通知先チャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('通知先テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('クロスポスト通知先を削除します。'),
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('現在のクロスポスト通知先一覧を表示します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'add': {
      const channel = interaction.options.getChannel('channel', true);
      await miscRepo.addCrossPostTarget(guildId, channel.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`クロスポスト通知先を ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove': {
      await miscRepo.removeCrossPostTarget(guildId);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription('クロスポスト通知先を削除しました。');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'list': {
      const targets = await miscRepo.getCrossPostTargets();
      const guildTarget = targets[guildId];
      if (!guildTarget) {
        embed.setColor(0xFF0000).setTitle('⚠️ 設定なし').setDescription('クロスポスト通知先が設定されていません。');
      } else {
        const targetChannel = `<#${guildTarget}>`;
        embed.setColor(0x5865F2).setTitle('📋 クロスポスト設定').setDescription(`通知先チャンネル: ${targetChannel}`);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;