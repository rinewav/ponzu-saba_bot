import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { kikisenRepo } from '../../lib/repositories/index.js';
import { kikisenManager } from '../../lib/kikisenManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('kikisen-manage')
  .setDescription('【管理者のみ】聞き専チャットの管理を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('link')
      .setDescription('聞き専チャットを強制的にリンクします。')
      .addChannelOption(opt =>
        opt.setName('voice').setDescription('ボイスチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildVoice),
      )
      .addChannelOption(opt =>
        opt.setName('text').setDescription('テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('unlink')
      .setDescription('聞き専チャットのリンクを解除します。')
      .addChannelOption(opt =>
        opt.setName('text').setDescription('テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('sync')
      .setDescription('聞き専チャットの整合性チェックを実行します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);

  switch (subcommand) {
    case 'link': {
      const voiceChannel = interaction.options.getChannel('voice', true);
      const textChannel = interaction.options.getChannel('text', true);
      await kikisenRepo.createActiveChannel(interaction.guild!.id, voiceChannel.id, textChannel.id);
      embed.setColor(0x00FF00).setTitle('✅ リンク完了').setDescription(`ボイスチャンネル ${voiceChannel} をテキストチャンネル ${textChannel} にリンクしました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'unlink': {
      const textChannel = interaction.options.getChannel('text', true);
      await kikisenRepo.deleteActiveChannel(textChannel.id);
      embed.setColor(0xFF0000).setTitle('🔓 リンク解除').setDescription(`テキストチャンネル ${textChannel} の聞き専リンクを解除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'sync': {
      await interaction.deferReply({ ephemeral: true });
      await kikisenManager.checkConsistency();
      embed.setColor(0x00FF00).setTitle('🔄 同期完了').setDescription('聞き専チャットの整合性チェックが完了しました。');
      await interaction.editReply({ embeds: [embed] });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;