import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-verification')
  .setDescription('【管理者のみ】認証機能の設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('set-channel')
      .setDescription('認証用チャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('認証用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-role')
      .setDescription('認証後に付与するロールを設定します。')
      .addRoleOption(opt =>
        opt.setName('role').setDescription('認証後に付与するロール').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-password')
      .setDescription('認証用のパスワードを設定します。')
      .addStringOption(opt =>
        opt.setName('password').setDescription('認証パスワード').setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'set-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = (await verificationRepo.getVerificationSettings(guildId)) || {};
      settings.channelId = channel.id;
      await verificationRepo.setVerificationSettings(guildId, settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`認証チャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'set-role': {
      const role = interaction.options.getRole('role', true);
      const settings = (await verificationRepo.getVerificationSettings(guildId)) || {};
      settings.roleId = role.id;
      await verificationRepo.setVerificationSettings(guildId, settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`認証ロールを ${role} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'set-password': {
      const password = interaction.options.getString('password', true);
      const settings = (await verificationRepo.getVerificationSettings(guildId)) || {};
      settings.password = password;
      await verificationRepo.setVerificationSettings(guildId, settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription('認証パスワードを設定しました。');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;