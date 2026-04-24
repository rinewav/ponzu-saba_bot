import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { adoptTemplateFromExistingMessage } from '../../lib/templateManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-message-id')
  .setDescription('既存のEmbedメッセージをテンプレートの内容として採用します。')
  .addStringOption(o => o.setName('message_link').setDescription('Embedメッセージのリンク').setRequired(true))
  .addChannelOption(o => o.setName('channel').setDescription('テンプレートを維持するチャンネル').addChannelTypes(ChannelType.GuildText).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const messageLink = interaction.options.getString('message_link', true);
  const channel = interaction.options.getChannel('channel', true) as import('discord.js').TextChannel;
  const embed = new CustomEmbed(interaction.user);

  try {
    const match = messageLink.match(/\/channels\/\d+\/(\d+)\/(\d+)/);
    if (!match) throw new Error('無効なメッセージリンク形式です。');
    const [, channelId, messageId] = match;
    const sourceChannel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
    if (!sourceChannel?.isTextBased()) throw new Error('指定されたチャンネルが見つかりません。');
    const sourceMessage = await sourceChannel.messages.fetch(messageId).catch(() => null);
    if (!sourceMessage) throw new Error('指定されたメッセージが見つかりません。');

    await adoptTemplateFromExistingMessage(interaction.guild!.id, 'introduction', channel, sourceMessage.id);
    embed.setColor(0x00FF00).setDescription(`✅ テンプレートを ${channel} に適用しました。`);
  } catch (error) {
    embed.setColor(0xFF0000).setDescription(`❌ エラー: ${(error as Error).message}`);
  }

  await interaction.editReply({ embeds: [embed] });
}

const command: BotCommand = { data, execute };
export default command;