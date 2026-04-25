import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('verification-bypass')
  .setDescription('【管理者のみ】参加認証のバイパス設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('バイパスリストにユーザーを追加します。')
      .addUserOption(opt => opt.setName('user').setDescription('バイパスするユーザー').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('バイパスリストからユーザーを削除します。')
      .addUserOption(opt => opt.setName('user').setDescription('削除するユーザー').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('list').setDescription('バイパスリストを表示します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'add': {
      const user = interaction.options.getUser('user', true);
      await verificationRepo.addBypass(guildId, user.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${user} をバイパスリストに追加しました。\n参加時に自動で認証済みロールが付与されます。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'remove': {
      const user = interaction.options.getUser('user', true);
      await verificationRepo.removeBypass(guildId, user.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${user} をバイパスリストから削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'list': {
      const bypassList = verificationRepo.getBypassList(guildId);
      if (bypassList.length === 0) {
        embed.setColor(0xFFAA00).setTitle('📋 バイパスリスト').setDescription('バイパスリストは空です。');
      } else {
        embed.setColor(0xFFAA00).setTitle(`📋 バイパスリスト（${bypassList.length}人）`)
          .setDescription(bypassList.map(id => `<@${id}>`).join('\n'));
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;
