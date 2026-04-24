import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { rolePanelManager } from '../../lib/rolePanelManager.js';
import { rolePanelRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-role-panel')
  .setDescription('【管理者のみ】ロールパネルの設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('create')
      .setDescription('新しいロールパネルを作成します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('パネルを配置するテキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      )
      .addStringOption(opt =>
        opt.setName('title').setDescription('パネルのタイトル').setRequired(true),
      )
      .addStringOption(opt =>
        opt.setName('description').setDescription('パネルの説明'),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('ロールパネルにロールを追加します。')
      .addStringOption(opt =>
        opt.setName('message_id').setDescription('パネルのメッセージID').setRequired(true),
      )
      .addRoleOption(opt =>
        opt.setName('role').setDescription('追加するロール').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('ロールパネルからロールを削除し、パネルを更新します。')
      .addStringOption(opt =>
        opt.setName('message_id').setDescription('パネルのメッセージID').setRequired(true),
      )
      .addRoleOption(opt =>
        opt.setName('role').setDescription('削除するロール').setRequired(true),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);

  switch (subcommand) {
    case 'create': {
      await interaction.deferReply({ ephemeral: true });
      try {
        const panelMessage = await rolePanelManager.createPanel(interaction);
        embed.setColor(0x00FF00).setTitle('✅ パネル作成完了').setDescription(`ロールパネルを作成しました。\nメッセージID: \`${panelMessage.id}\``);
      } catch (error) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription(`パネルの作成に失敗しました: ${(error as Error).message}`);
      }
      await interaction.editReply({ embeds: [embed] });
      break;
    }
    case 'add': {
      const messageId = interaction.options.getString('message_id', true);
      const role = interaction.options.getRole('role', true);
      const panelData = await rolePanelRepo.getRolePanel(messageId);

      if (!panelData) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('指定されたパネルが見つかりません。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (panelData.roles.includes(role.id)) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('このロールは既にパネルに追加されています。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      panelData.roles.push(role.id);
      await rolePanelRepo.addRolePanel(messageId, panelData);
      await rolePanelManager.updatePanel(interaction.guild!, messageId);
      embed.setColor(0x00FF00).setTitle('✅ ロール追加完了').setDescription(`${role} をパネルに追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove': {
      const messageId = interaction.options.getString('message_id', true);
      const role = interaction.options.getRole('role', true);
      const panelData = await rolePanelRepo.getRolePanel(messageId);

      if (!panelData) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('指定されたパネルが見つかりません。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      panelData.roles = panelData.roles.filter((id: string) => id !== role.id);
      await rolePanelRepo.addRolePanel(messageId, panelData);

      if (panelData.roles.length === 0) {
        const channel = await interaction.guild!.channels.fetch(panelData.channelId).catch(() => null);
        if (channel?.isTextBased()) {
          const message = await (channel as import('discord.js').TextChannel).messages.fetch(messageId).catch(() => null);
          if (message) await message.delete().catch(() => {});
        }
        await rolePanelRepo.removeRolePanel(messageId);
        embed.setColor(0x00FF00).setTitle('✅ ロール削除完了').setDescription(`${role} をパネルから削除しました。パネルにロールがなくなったため削除しました。`);
      } else {
        await rolePanelManager.updatePanel(interaction.guild!, messageId);
        embed.setColor(0x00FF00).setTitle('✅ ロール削除完了').setDescription(`${role} をパネルから削除しました。`);
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;