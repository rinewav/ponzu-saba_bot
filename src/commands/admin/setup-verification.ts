import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { BotCommand, VerificationSettings, VerificationQuestion } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-verification')
  .setDescription('【管理者のみ】参加認証システムの設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await sendSetupMenu(interaction);
}

async function getSettings(guildId: string): Promise<VerificationSettings> {
  return (await verificationRepo.getVerificationSettings(guildId)) ?? {};
}

async function saveSettings(guildId: string, settings: VerificationSettings): Promise<void> {
  await verificationRepo.setVerificationSettings(guildId, settings);
}

async function sendSetupMenu(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
): Promise<void> {
  const guildId = interaction.guild!.id;
  const settings = await getSettings(guildId);

  const ch = (id?: string) => id ? `<#${id}>` : '未設定';
  const role = (id?: string) => id ? `<@&${id}>` : '未設定';

  const embed = new CustomEmbed(interaction.user)
    .setColor(0xFFAA00)
    .setTitle('⚙️ 参加認証システム設定')
    .setDescription(
      `システム: ${settings.enabled ? '✅ 有効' : '❌ 無効'}\n` +
      `はじめにチャンネル: ${ch(settings.welcomeChannelId)}\n` +
      `認証済みロール: ${role(settings.verifiedRoleId)}\n` +
      `運営ロール: ${role(settings.staffRoleId)}\n` +
      `レビューチャンネル: ${ch(settings.reviewChannelId)}\n` +
      `アーカイブチャンネル: ${ch(settings.archiveChannelId)}\n` +
      `チケットカテゴリ: ${ch(settings.ticketCategoryId)}\n` +
      `クイズ出題数: ${settings.quizPassCount ?? 3} / 登録問題数: ${settings.questions?.length ?? 0}\n` +
      `バイパス人数: ${settings.bypassList?.length ?? 0}`,
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('sv_menu')
    .setPlaceholder('設定項目を選択...')
    .addOptions([
      { label: 'システム ON/OFF', description: '認証システムの有効/無効を切り替え', value: 'toggle', emoji: '🔌' },
      { label: 'はじめにチャンネル', description: 'ウェルカムメッセージを送信するチャンネル', value: 'welcome_ch', emoji: '📢' },
      { label: '認証済みロール', description: '認証完了後に付与するロール', value: 'verified_role', emoji: '🏷️' },
      { label: '運営ロール', description: '申請レビュー権限を持つロール', value: 'staff_role', emoji: '🛡️' },
      { label: 'レビューチャンネル', description: '申請が投稿される運営用チャンネル', value: 'review_ch', emoji: '👀' },
      { label: 'アーカイブチャンネル', description: '処理済み申請の記録用チャンネル', value: 'archive_ch', emoji: '📁' },
      { label: 'チケットカテゴリ', description: 'チケットチャンネルを作成するカテゴリ', value: 'ticket_cat', emoji: '📂' },
      { label: 'クイズ出題数', description: 'クイズで出題する問題数', value: 'quiz_count', emoji: '🔢' },
      { label: '問題を追加', description: 'クイズ問題を追加する', value: 'add_question', emoji: '➕' },
      { label: '問題一覧・削除', description: '登録済み問題の確認・削除', value: 'list_questions', emoji: '📋' },
      { label: 'ウェルカムメッセージ送信', description: 'はじめにチャンネルにメッセージを送信', value: 'send_welcome', emoji: '✉️' },
      { label: 'ユーザー検索', description: 'ユーザーの申請状況を検索', value: 'search', emoji: '🔍' },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  if (interaction.isChatInputCommand()) {
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } else {
    await interaction.update({ embeds: [embed], components: [row] });
  }
}

export async function handleSetupSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const value = interaction.values[0];
  const guildId = interaction.guild!.id;

  switch (value) {
    case 'toggle': {
      const settings = await getSettings(guildId);
      settings.enabled = !settings.enabled;
      await saveSettings(guildId, settings);
      const embed = new CustomEmbed(interaction.user)
        .setColor(0x00FF00)
        .setTitle('✅ 設定変更')
        .setDescription(`参加認証システムを${settings.enabled ? '**有効**' : '**無効**'}にしました。`);
      await interaction.update({ embeds: [embed], components: [createBackButton()] });
      break;
    }

    case 'welcome_ch': {
      await showChannelSelectModal(interaction, 'sv_modal_welcome_ch', 'はじめにチャンネルID');
      break;
    }

    case 'verified_role': {
      await showIdInputModal(interaction, 'sv_modal_verified_role', '認証済みロールID', '例: 1234567890');
      break;
    }

    case 'staff_role': {
      await showIdInputModal(interaction, 'sv_modal_staff_role', '運営ロールID', '例: 1234567890');
      break;
    }

    case 'review_ch': {
      await showChannelSelectModal(interaction, 'sv_modal_review_ch', 'レビューチャンネルID');
      break;
    }

    case 'archive_ch': {
      await showChannelSelectModal(interaction, 'sv_modal_archive_ch', 'アーカイブチャンネルID');
      break;
    }

    case 'ticket_cat': {
      await showChannelSelectModal(interaction, 'sv_modal_ticket_cat', 'チケットカテゴリID');
      break;
    }

    case 'quiz_count': {
      await showIdInputModal(interaction, 'sv_modal_quiz_count', 'クイズ出題数', '例: 3');
      break;
    }

    case 'add_question': {
      const modal = new ModalBuilder()
        .setCustomId('sv_modal_add_question')
        .setTitle('クイズ問題を追加');

      const qInput = new TextInputBuilder().setCustomId('q').setLabel('問題文').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const a1 = new TextInputBuilder().setCustomId('a1').setLabel('選択肢1（正解）').setStyle(TextInputStyle.Short).setRequired(true);
      const a2 = new TextInputBuilder().setCustomId('a2').setLabel('選択肢2').setStyle(TextInputStyle.Short).setRequired(true);
      const a3 = new TextInputBuilder().setCustomId('a3').setLabel('選択肢3').setStyle(TextInputStyle.Short).setRequired(true);
      const a4 = new TextInputBuilder().setCustomId('a4').setLabel('選択肢4').setStyle(TextInputStyle.Short).setRequired(true);

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(qInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(a1),
        new ActionRowBuilder<TextInputBuilder>().addComponents(a2),
        new ActionRowBuilder<TextInputBuilder>().addComponents(a3),
        new ActionRowBuilder<TextInputBuilder>().addComponents(a4),
      );
      await interaction.showModal(modal);
      break;
    }

    case 'list_questions': {
      const settings = await getSettings(guildId);
      if (!settings.questions || settings.questions.length === 0) {
        const embed = new CustomEmbed(interaction.user)
          .setColor(0xFFAA00)
          .setTitle('📋 問題一覧')
          .setDescription('問題が登録されていません。');
        await interaction.update({ embeds: [embed], components: [createBackButton()] });
        return;
      }

      const embed = new CustomEmbed(interaction.user)
        .setColor(0xFFAA00)
        .setTitle(`📋 問題一覧（${settings.questions.length}問）`);

      const deleteButtons: ActionRowBuilder<ButtonBuilder>[] = [];
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      let currentRow = new ActionRowBuilder<ButtonBuilder>();

      for (let i = 0; i < settings.questions.length; i++) {
        const q = settings.questions[i];
        embed.addFields({
          name: `ID: ${q.id}`,
          value: `**${q.question}**\n正解: ${q.options[q.correctIndex]}`,
          inline: false,
        });

        const btn = new ButtonBuilder()
          .setCustomId(`sv_delq_${q.id}`)
          .setLabel(`削除: ${q.id}`)
          .setStyle(ButtonStyle.Danger);

        currentRow.addComponents(btn);
        if (currentRow.components.length === 5 || i === settings.questions.length - 1) {
          if (currentRow.components.length > 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder<ButtonBuilder>();
          }
        }
      }

      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('sv_back').setLabel('← 戻る').setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ embeds: [embed], components: [...rows.slice(0, 4), backRow] });
      break;
    }

    case 'send_welcome': {
      const settings = await getSettings(guildId);
      if (!settings.welcomeChannelId) {
        const embed = new CustomEmbed(interaction.user)
          .setColor(0xFF0000)
          .setTitle('❌ エラー')
          .setDescription('はじめにチャンネルが設定されていません。先に設定してください。');
        await interaction.update({ embeds: [embed], components: [createBackButton()] });
        return;
      }

      const channel = await interaction.guild!.channels.fetch(settings.welcomeChannelId).catch(() => null) as TextChannel | null;
      if (!channel) {
        const embed = new CustomEmbed(interaction.user)
          .setColor(0xFF0000)
          .setTitle('❌ エラー')
          .setDescription('はじめにチャンネルが見つかりません。');
        await interaction.update({ embeds: [embed], components: [createBackButton()] });
        return;
      }

      const welcomeEmbed = new CustomEmbed()
        .setTitle('🍋 ぽん酢鯖へようこそ！')
        .setDescription(
          'ぽん酢鯖への参加には、以下の認証プロセスが必要です。\n\n' +
          '**参加手順：**\n' +
          '1️⃣ 下のボタンから参加申請フォームを開く\n' +
          '2️⃣ ルールに関するクイズに全問正解する\n' +
          '3️⃣ 参加申請フォームに必要事項を入力する\n' +
          '4️⃣ 運営のレビューを待つ\n' +
          '5️⃣ 承認されたらNDAに署名する\n\n' +
          '「参加申請フォームを開く」ボタンを押して進んでください。',
        )
        .setColor(0xFFAA00);

      const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('参加申請フォームを開く').setStyle(ButtonStyle.Primary),
      );

      const message = await channel.send({ embeds: [welcomeEmbed], components: [button] });
      settings.welcomeMessageId = message.id;
      await saveSettings(guildId, settings);

      const embed = new CustomEmbed(interaction.user)
        .setColor(0x00FF00)
        .setTitle('✅ 送信完了')
        .setDescription(`ウェルカムメッセージを ${channel} に送信しました。`);
      await interaction.update({ embeds: [embed], components: [createBackButton()] });
      break;
    }

    case 'search': {
      await showIdInputModal(interaction, 'sv_modal_search', '検索するユーザーID', '例: 1234567890');
      break;
    }
  }
}

export async function handleSetupModal(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;
  const guildId = interaction.guild!.id;

  switch (customId) {
    case 'sv_modal_welcome_ch': {
      const id = extractChannelId(interaction.fields.getTextInputValue('channel_id'));
      const settings = await getSettings(guildId);
      settings.welcomeChannelId = id;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `はじめにチャンネルを <#${id}> に設定しました。`);
      break;
    }

    case 'sv_modal_verified_role': {
      const id = interaction.fields.getTextInputValue('value').replace(/[<@&>]/g, '').trim();
      const settings = await getSettings(guildId);
      settings.verifiedRoleId = id;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `認証済みロールを <@&${id}> に設定しました。`);
      break;
    }

    case 'sv_modal_staff_role': {
      const id = interaction.fields.getTextInputValue('value').replace(/[<@&>]/g, '').trim();
      const settings = await getSettings(guildId);
      settings.staffRoleId = id;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `運営ロールを <@&${id}> に設定しました。`);
      break;
    }

    case 'sv_modal_review_ch': {
      const id = extractChannelId(interaction.fields.getTextInputValue('channel_id'));
      const settings = await getSettings(guildId);
      settings.reviewChannelId = id;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `レビューチャンネルを <#${id}> に設定しました。`);
      break;
    }

    case 'sv_modal_archive_ch': {
      const id = extractChannelId(interaction.fields.getTextInputValue('channel_id'));
      const settings = await getSettings(guildId);
      settings.archiveChannelId = id;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `アーカイブチャンネルを <#${id}> に設定しました。`);
      break;
    }

    case 'sv_modal_ticket_cat': {
      const id = extractChannelId(interaction.fields.getTextInputValue('channel_id'));
      const settings = await getSettings(guildId);
      settings.ticketCategoryId = id;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `チケットカテゴリを <#${id}> に設定しました。`);
      break;
    }

    case 'sv_modal_quiz_count': {
      const count = parseInt(interaction.fields.getTextInputValue('value').trim(), 10);
      if (isNaN(count) || count < 1) {
        await replyModalError(interaction, '1以上の数値を入力してください。');
        return;
      }
      const settings = await getSettings(guildId);
      settings.quizPassCount = count;
      await saveSettings(guildId, settings);
      await replyModalSuccess(interaction, `クイズ出題数を **${count}** 問に設定しました。`);
      break;
    }

    case 'sv_modal_add_question': {
      const question = interaction.fields.getTextInputValue('q');
      const a1 = interaction.fields.getTextInputValue('a1');
      const a2 = interaction.fields.getTextInputValue('a2');
      const a3 = interaction.fields.getTextInputValue('a3');
      const a4 = interaction.fields.getTextInputValue('a4');

      const options = [a1, a2, a3, a4];
      const shuffledOptions = [...options];
      for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
      }
      const correctIndex = shuffledOptions.indexOf(a1);

      const qId = randomUUID().slice(0, 8);
      const settings = await getSettings(guildId);
      if (!settings.questions) settings.questions = [];
      settings.questions.push({ id: qId, question, options: shuffledOptions, correctIndex });
      await saveSettings(guildId, settings);

      await replyModalSuccess(interaction, `問題を追加しました（ID: \`${qId}\`）\n正解: ${a1}\n現在の問題数: ${settings.questions.length}`);
      break;
    }

    case 'sv_modal_search': {
      const userId = interaction.fields.getTextInputValue('value').trim().replace(/[<@!>]/g, '');
      const applications = verificationRepo.getApplicationsByUser(guildId, userId);

      if (applications.length === 0) {
        await replyModalSuccess(interaction, `<@${userId}> の申請履歴はありません。`);
        return;
      }

      const embed = new CustomEmbed(interaction.user)
        .setColor(0xFFAA00)
        .setTitle(`🔍 検索結果: <@${userId}>（${applications.length}件）`);

      const statusMap: Record<string, string> = {
        quiz: '📝 クイズ中', pending: '⏳ 審査中', approved: '✅ 承認済み',
        rejected: '❌ 却下', nda_pending: '📋 NDA待ち', completed: '🎉 完了',
      };

      for (const app of applications.slice(0, 10)) {
        embed.addFields({
          name: `${statusMap[app.status] ?? app.status} - <t:${Math.floor(app.submittedAt / 1000)}:F>`,
          value: `名前: ${app.displayName} | 活動: ${app.activity.slice(0, 50)}`,
          inline: false,
        });
      }

      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('sv_back').setLabel('← 戻る').setStyle(ButtonStyle.Secondary),
      );

      await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
      break;
    }
  }
}

export async function handleSetupButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'sv_back') {
    await sendSetupMenu(interaction);
    return;
  }

  if (customId.startsWith('sv_delq_')) {
    const qId = customId.slice(8);
    const guildId = interaction.guild!.id;
    const settings = await getSettings(guildId);
    if (!settings.questions) {
      await interaction.update({
        embeds: [new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription('問題がありません。')],
        components: [createBackButton()],
      });
      return;
    }
    const before = settings.questions.length;
    settings.questions = settings.questions.filter((q: VerificationQuestion) => q.id !== qId);
    if (settings.questions.length === before) {
      await interaction.update({
        embeds: [new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription(`問題 \`${qId}\` が見つかりません。`)],
        components: [createBackButton()],
      });
      return;
    }
    await saveSettings(guildId, settings);

    const embed = new CustomEmbed(interaction.user)
      .setColor(0x00FF00)
      .setTitle('✅ 削除完了')
      .setDescription(`問題 \`${qId}\` を削除しました。（残り: ${settings.questions.length}問）`);
    await interaction.update({ embeds: [embed], components: [createBackButton()] });
  }
}

function createBackButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
  );
}

function extractChannelId(input: string): string {
  const cleaned = input.replace(/[<#>]/g, '').trim();
  return cleaned;
}

async function showChannelSelectModal(
  interaction: StringSelectMenuInteraction,
  modalId: string,
  label: string,
): Promise<void> {
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(label);
  const input = new TextInputBuilder()
    .setCustomId('channel_id')
    .setLabel('チャンネルID（または #チャンネルメンション）')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('例: 1234567890 または #channel-name');
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function showIdInputModal(
  interaction: StringSelectMenuInteraction,
  modalId: string,
  label: string,
  placeholder: string,
): Promise<void> {
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(label);
  const input = new TextInputBuilder()
    .setCustomId('value')
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder(placeholder);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  await interaction.showModal(modal);
}

async function replyModalSuccess(interaction: ModalSubmitInteraction, description: string): Promise<void> {
  const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(description);
  await interaction.reply({ embeds: [embed], components: [createBackButton()], ephemeral: true });
}

async function replyModalError(interaction: ModalSubmitInteraction, description: string): Promise<void> {
  const embed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription(description);
  await interaction.reply({ embeds: [embed], components: [createBackButton()], ephemeral: true });
}

const command: BotCommand = { data, execute };
export default command;
