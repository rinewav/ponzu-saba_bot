import { StringSelectMenuBuilder, ActionRowBuilder, type ChatInputCommandInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { rolePanelRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

export class RolePanelManager {
  // RolePanelManagerはクライアントを必要としないが、一貫性のために初期化メソッドを維持
  initialize(_client: import('discord.js').Client): void {
    // 何もしない
  }

  async createPanel(interaction: ChatInputCommandInteraction): Promise<import('discord.js').Message> {
    const channel = interaction.options.getChannel('channel', true) as import('discord.js').TextChannel;
    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description') || '下のメニューからロールを選択してください。';

    const embed = new CustomEmbed(interaction.user)
      .setTitle(title)
      .setDescription(description)
      .setColor(0x5865F2);

    const panelMessage = await (channel as import('discord.js').TextChannel).send({ embeds: [embed], content: 'ロールパネルをセットアップ中です...' });

    await rolePanelRepo.addRolePanel(panelMessage.id, {
      guildId: interaction.guild!.id,
      channelId: channel.id,
      title,
      description,
      roles: [],
    });

    await this.updatePanel(interaction.guild!, panelMessage.id);
    return panelMessage;
  }

  async updatePanel(guild: import('discord.js').Guild, messageId: string): Promise<void> {
    const panelData = await rolePanelRepo.getRolePanel(messageId);
    if (!panelData) throw new Error('指定されたパネルデータが見つかりません。');

    const channel = await guild.channels.fetch(panelData.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    const message = await (channel as import('discord.js').TextChannel).messages.fetch(messageId).catch(() => null);
    if (!message) return;

    const embed = new CustomEmbed()
      .setTitle(panelData.title)
      .setDescription(panelData.description)
      .setColor(0x5865F2);

    const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
    if (panelData.roles.length > 0) {
      const roleChunks: string[][] = [];
      for (let i = 0; i < panelData.roles.length; i += 25) {
        roleChunks.push(panelData.roles.slice(i, i + 25));
      }

      for (let i = 0; i < Math.min(roleChunks.length, 5); i++) {
        const chunk = roleChunks[i];
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`role_panel_select_${i}`)
          .setPlaceholder(`ロールを選択して更新 (${i * 25 + 1}～${i * 25 + chunk.length})`)
          .setMinValues(0)
          .setMaxValues(chunk.length)
          .addOptions(
            await Promise.all(chunk.map(async roleId => {
              const role = await guild.roles.fetch(roleId).catch(() => null);
              return {
                label: role ? role.name : '不明なロール',
                value: roleId,
                description: `ロール「${role ? role.name : ''}」の現在の状態を更新します。`,
              };
            })),
          );
        components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
      }
    }

    await message.edit({ content: '', embeds: [embed], components });
  }

  async handleInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
    if (!interaction.customId.startsWith('role_panel_select')) return;

    const panelData = await rolePanelRepo.getRolePanel(interaction.message.id);
    if (!panelData) return;

    await interaction.deferReply({ ephemeral: true });

    const member = interaction.member as import('discord.js').GuildMember;

    const selectedRoleIds = new Set<string>(interaction.values);
    const managedRoleIds = new Set<string>(panelData.roles);

    const rolesToAdd: string[] = [];
    const rolesToRemove: string[] = [];

    for (const selectedId of selectedRoleIds) {
      if (managedRoleIds.has(selectedId) && !member.roles.cache.has(selectedId)) {
        rolesToAdd.push(selectedId);
      }
    }

    for (const managedId of managedRoleIds) {
      if (!selectedRoleIds.has(managedId) && member.roles.cache.has(managedId)) {
        rolesToRemove.push(managedId);
      }
    }

    try {
      let replyMessage = 'ロールを更新しました。\n';
      if (rolesToAdd.length > 0) {
        await member.roles.add(rolesToAdd);
        replyMessage += `\n**付与:** ${rolesToAdd.map(id => `<@&${id}>`).join(' ')}`;
      }
      if (rolesToRemove.length > 0) {
        await member.roles.remove(rolesToRemove);
        replyMessage += `\n**剥奪:** ${rolesToRemove.map(id => `<@&${id}>`).join(' ')}`;
      }
      if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
        replyMessage = 'ロールに変更はありませんでした。';
      }

      await interaction.editReply({ content: replyMessage });

    } catch (error) {
      console.error('[RolePanel] ロールの操作に失敗しました:', error);
      await interaction.editReply({ content: 'ロールの操作に失敗しました。ボットの権限が正しいか確認してください。' });
    }
  }
}

export const rolePanelManager = new RolePanelManager();