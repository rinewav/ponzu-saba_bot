import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
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
import type { BotCommand, VerificationSettings, VerificationQuestion, FormFieldConfig } from '../../types/index.js';
import {
  levelRepo, afkRepo, cleanupRepo, miscRepo,
  vcNotifyRepo, workoutRepo, kikisenRepo, dailyStatsRepo,
  verificationRepo, rolePanelRepo,
} from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';
import { rolePanelManager } from '../../lib/rolePanelManager.js';
import { ensureLatestTemplateMessage, TEMPLATE_DEFINITIONS, adoptTemplateFromExistingMessage } from '../../lib/templateManager.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('【管理者のみ】ボットの各種設定を一元管理します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await sendMainMenu(interaction);
  } catch (error) {
    console.error('[Setup] /setup コマンドエラー:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true }).catch(() => {});
    }
  }
}

const ch = (id?: string) => id ? `<#${id}>` : '未設定';
const role = (id?: string) => id ? `<@&${id}>` : '未設定';
const yn = (v?: boolean) => v ? '✅ ON' : '❌ OFF';
const list = (arr?: string[]) => arr?.length ? arr.map(id => `<#${id}>`).join(', ') : 'なし';

function mainMenuComponents(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('setup_menu')
      .setPlaceholder('設定する機能を選択...')
      .addOptions([
        { label: '参加認証', description: 'クイズ・フォーム・NDA署名の設定', value: 'verification' },
        { label: 'レベル', description: 'XP・レベルアップ・報酬ロール', value: 'level' },
        { label: 'AFK', description: '放置検知・自動移動', value: 'afk' },
        { label: 'クリーンアップ', description: '退出メンバーのメッセージ削除', value: 'cleanup' },
        { label: 'VC通話ログ', description: '通話開始・終了ログの記録', value: 'vclog' },
        { label: 'VCロール', description: '通話参加中ロール付与', value: 'voicerole' },
        { label: '筋トレ通知', description: '24時間未報告リマインダー', value: 'workout' },
        { label: 'デイリー統計', description: 'サーバー活動レポート', value: 'dailystats' },
        { label: 'ロールパネル', description: 'セレクトメニュー式ロール選択', value: 'rolepanel' },
        { label: 'クロスポスト', description: '他サーバーでの絵文字使用通知', value: 'crosspost' },
        { label: 'ファイル再アップ', description: '添付ファイル自動バックアップ', value: 'reupload' },
        { label: 'テンプレート', description: '自己紹介・定型メッセージ', value: 'template' },
        { label: 'ログ', description: '各種イベントのログ記録', value: 'logs' },
        { label: '聞き専ログ', description: '聞き専チャンネルのログ', value: 'kikisenlog' },
        { label: '追い打ちBAN', description: '退出時の自動BAN', value: 'reban' },
      ]),
  );
}

function backButton(customId = 'setup_back'): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(customId).setLabel('← メインメニューに戻る').setStyle(ButtonStyle.Secondary),
  );
}

async function sendMainMenu(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction | ButtonInteraction,
): Promise<void> {
  const embed = new CustomEmbed(interaction.user)
    .setColor(0x5865F2)
    .setTitle('⚙️ ぽん酢鯖ボット 設定メニュー')
    .setDescription('設定したい機能を選択してください。');

  const payload = { embeds: [embed], components: [mainMenuComponents()] };
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(payload);
  } else if (interaction.isChatInputCommand()) {
    await interaction.reply({ ...payload, ephemeral: true });
  } else {
    await interaction.update(payload);
  }
}

export async function handleSetupSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const value = interaction.values[0];
  const guildId = interaction.guild!.id;

  if (value === 'verification') {
    await sendVerificationMenu(interaction);
    return;
  }

  const handlers: Record<string, () => Promise<void>> = {
    level: async () => {
      const s = await levelRepo.getLevelSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🔝 レベル設定')
        .setDescription(
          `通知チャンネル: ${ch(s?.levelUpChannelId)}\n` +
          `ログインボーナスXP: ${s?.loginBonusBaseXp ?? '未設定'}\n` +
          `除外チャンネル: ${list(s?.excludedChannels)}`,
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_level_notify').setLabel('📢 通知チャンネル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_level_bonus').setLabel('🎁 ログインボーナスXP').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_level_addex').setLabel('➕ 除外追加').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('setup_level_delex').setLabel('➖ 除外削除').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    afk: async () => {
      const s = await afkRepo.getAfkSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🛌 AFK設定')
        .setDescription(
          `AFKチャンネル: ${ch(s?.afkChannelId)}\n` +
          `通知チャンネル: ${ch(s?.notifyChannelId)}\n` +
          `タイムアウト: ${s?.afkTimeout ? `${s.afkTimeout / 60000}分` : '未設定'}\n` +
          `除外チャンネル: ${list(s?.afkExcludedChannels)}`,
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_afk_ch').setLabel('📢 AFKチャンネル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_afk_notify').setLabel('🔔 通知チャンネル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_afk_time').setLabel('⏱️ タイムアウト').setStyle(ButtonStyle.Primary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    cleanup: async () => {
      const s = await cleanupRepo.getCleanupSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🧹 クリーンアップ設定')
        .setDescription(
          `自動クリーンアップ: ${yn(s?.enabled)}\n` +
          `ログチャンネル: ${ch(s?.logChannelId)}\n` +
          `除外チャンネル: ${list(s?.excludedChannels)}`,
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_cleanup_toggle').setLabel(yn(s?.enabled)).setStyle(s?.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('setup_cleanup_log').setLabel('📋 ログチャンネル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_cleanup_run').setLabel('▶️ 今すぐ実行').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    vclog: async () => {
      const s = await vcNotifyRepo.getVcNotifySettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('📝 VC通話ログ設定')
        .setDescription(
          `ログチャンネル: ${ch(s?.notificationChannelId)}\n` +
          `除外チャンネル: ${list(s?.excludedChannels)}`,
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_vcn_ch').setLabel('📢 ログチャンネル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_vcn_addex').setLabel('➕ 除外追加').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('setup_vcn_delex').setLabel('➖ 除外削除').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    voicerole: async () => {
      const s = await miscRepo.getVoiceRoleSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🎤 VCロール設定')
        .setDescription(`通話参加中ロール: ${s?.roleId ? role(s.roleId) : '未設定'}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_vr_set').setLabel('🔧 ロール設定').setStyle(ButtonStyle.Primary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    workout: async () => {
      const s = await workoutRepo.getWorkoutSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('💪 筋トレ通知設定')
        .setDescription(`通知チャンネル: ${list(s?.targetChannels)}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_wo_add').setLabel('➕ 通知チャンネル追加').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_wo_del').setLabel('➖ 通知チャンネル削除').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    dailystats: async () => {
      const s = await dailyStatsRepo.getDailyStatsSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('📊 デイリー統計設定')
        .setDescription(
          `レポートチャンネル: ${ch(s?.reportChannelId)}\n` +
          `除外チャンネル: ${list(s?.excludedChannels)}`,
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_ds_ch').setLabel('📢 レポートチャンネル').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_ds_addex').setLabel('➕ 除外追加').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('setup_ds_delex').setLabel('➖ 除外削除').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    rolepanel: async () => {
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🗳️ ロールパネル設定')
        .setDescription('ロールパネルの作成・ロール追加・ロール削除を行います。');
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_rp_create').setLabel('➕ パネル作成').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_rp_add').setLabel('🏷️ ロール追加').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_rp_remove').setLabel('🗑️ ロール削除').setStyle(ButtonStyle.Danger),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    crosspost: async () => {
      const targets = await miscRepo.getCrossPostTargets();
      const targetId = targets[guildId];
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('👽 クロスポスト設定')
        .setDescription(`通知先チャンネル: ${targetId ? `<#${targetId}>` : '未設定'}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_cp_add').setLabel('➕ 通知先追加').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_cp_del').setLabel('➖ 通知先削除').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    reupload: async () => {
      const s = await miscRepo.getReuploadSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('📁 ファイル再アップ設定')
        .setDescription(`送信先チャンネル: ${ch(s?.destinationChannelId)}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_ru_set').setLabel('🔧 送信先チャンネル').setStyle(ButtonStyle.Primary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    template: async () => {
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🧩 テンプレート設定')
        .setDescription(
          'テンプレートの管理を行います。\n\n' +
          '• **テンプレート設定** — テンプレートキーとチャンネルを指定して設定\n' +
          '• **自己紹介初期化** — 自己紹介テンプレートをチャンネルに設定\n' +
          '• **既存メッセージ採用** — 既存のEmbedメッセージをテンプレートとして採用',
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_tpl_set').setLabel('📋 テンプレート設定').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_tpl_intro').setLabel('👤 自己紹介初期化').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('setup_tpl_adopt').setLabel('📨 既存メッセージ採用').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    logs: async () => {
      const logCh = await miscRepo.getLogChannelId(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('📝 ログ設定')
        .setDescription(`ログチャンネル: ${ch(logCh)}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_log_set').setLabel('🔧 ログチャンネル').setStyle(ButtonStyle.Primary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    kikisenlog: async () => {
      const s = await kikisenRepo.getLogChannel(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('👁️‍🗨️ 聞き専ログ設定')
        .setDescription(`ログチャンネル: ${ch(s)}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_ksl_set').setLabel('🔧 ログチャンネル').setStyle(ButtonStyle.Primary),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
    reban: async () => {
      const s = await miscRepo.getRebanSettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🔨 追い打ちBAN設定')
        .setDescription(`自動BAN: ${yn(s?.enabled)}`);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_reban_toggle').setLabel(yn(s?.enabled)).setStyle(s?.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
      );
      await interaction.update({ embeds: [embed], components: [row, backButton()] });
    },
  };

  const handler = handlers[value];
  if (handler) await handler();
  else await interaction.update({ content: '不明な設定項目です。', components: [] });
}

function channelModal(customId: string, title: string, label: string, placeholder: string): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(placeholder),
    ),
  );
  return modal;
}

function multiFieldModal(customId: string, title: string, fields: { id: string; label: string; placeholder: string; style: TextInputStyle; required: boolean; maxLength?: number }[]): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
  for (const f of fields) {
    const input = new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(f.style).setRequired(f.required).setPlaceholder(f.placeholder);
    if (f.maxLength) input.setMaxLength(f.maxLength);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

async function resolveChannelId(_guildId: string, input: string): Promise<string | null> {
  const cleaned = input.replace(/[<#>]/g, '').trim();
  return cleaned || null;
}

async function replySuccess(interaction: ModalSubmitInteraction | ButtonInteraction, text: string): Promise<void> {
  const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(text);
  await interaction.reply({ embeds: [embed, ...(await buildStatusEmbeds(interaction))], ephemeral: true });
}

async function replyError(interaction: ModalSubmitInteraction | ButtonInteraction, text: string): Promise<void> {
  const embed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription(text);
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function buildStatusEmbeds(interaction: ModalSubmitInteraction | ButtonInteraction): Promise<CustomEmbed[]> {
  return [new CustomEmbed(interaction.user).setColor(0x5865F2).setDescription('← メインメニューに戻るには `/setup` を実行してください。')];
}

async function getVerificationSettings(guildId: string): Promise<VerificationSettings> {
  return (await verificationRepo.getVerificationSettings(guildId)) ?? {};
}

async function saveVerificationSettings(guildId: string, settings: VerificationSettings): Promise<void> {
  await verificationRepo.setVerificationSettings(guildId, settings);
}

async function sendVerificationMenu(
  interaction: StringSelectMenuInteraction | ButtonInteraction,
): Promise<void> {
  const guildId = interaction.guild!.id;
  const settings = await getVerificationSettings(guildId);

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
      `申請フォーム: ${settings.formFields ? `${settings.formFields.length}項目（カスタム）` : 'デフォルト（5項目）'}\n` +
      `バイパス人数: ${settings.bypassList?.length ?? 0}`,
    );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('sv_menu')
    .setPlaceholder('設定項目を選択...')
    .addOptions([
      { label: 'システム ON/OFF', description: '認証システムの有効/無効を切り替え', value: 'toggle' },
      { label: 'はじめにチャンネル', description: 'ウェルカムメッセージを送信するチャンネル', value: 'welcome_ch' },
      { label: '認証済みロール', description: '認証完了後に付与するロール', value: 'verified_role' },
      { label: '運営ロール', description: '申請レビュー権限を持つロール', value: 'staff_role' },
      { label: 'レビューチャンネル', description: '申請が投稿される運営用チャンネル', value: 'review_ch' },
      { label: 'アーカイブチャンネル', description: '処理済み申請の記録用チャンネル', value: 'archive_ch' },
      { label: 'チケットカテゴリ', description: 'チケットチャンネルを作成するカテゴリ', value: 'ticket_cat' },
      { label: 'クイズ出題数', description: 'クイズで出題する問題数', value: 'quiz_count' },
      { label: '問題を追加', description: 'クイズ問題を追加する', value: 'add_question' },
      { label: '問題一覧・削除', description: '登録済み問題の確認・削除', value: 'list_questions' },
      { label: 'ウェルカムメッセージ送信', description: 'はじめにチャンネルにメッセージを送信', value: 'send_welcome' },
      { label: 'ユーザー検索', description: 'ユーザーの申請状況を検索', value: 'search' },
      { label: '申請フォーム設定', description: '申請フォームの項目をカスタマイズ', value: 'form_fields' },
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
  await interaction.update({ embeds: [embed], components: [row] });
}

export async function handleVerificationSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const value = interaction.values[0];
  const guildId = interaction.guild!.id;
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
  );

  switch (value) {
    case 'toggle': {
      const settings = await getVerificationSettings(guildId);
      settings.enabled = !settings.enabled;
      await saveVerificationSettings(guildId, settings);
      const embed = new CustomEmbed(interaction.user)
        .setColor(0x00FF00)
        .setTitle('✅ 設定変更')
        .setDescription(`参加認証システムを${settings.enabled ? '**有効**' : '**無効**'}にしました。`);
      await interaction.update({ embeds: [embed], components: [backRow] });
      break;
    }
    case 'welcome_ch': {
      await interaction.showModal(channelModal('sv_modal_welcome_ch', 'はじめにチャンネルID', 'チャンネルID（または #チャンネルメンション）', '例: 1234567890'));
      break;
    }
    case 'verified_role': {
      await interaction.showModal(channelModal('sv_modal_verified_role', '認証済みロールID', 'ロールID または @ロール', '例: 1234567890'));
      break;
    }
    case 'staff_role': {
      await interaction.showModal(channelModal('sv_modal_staff_role', '運営ロールID', 'ロールID または @ロール', '例: 1234567890'));
      break;
    }
    case 'review_ch': {
      await interaction.showModal(channelModal('sv_modal_review_ch', 'レビューチャンネルID', 'チャンネルID（または #チャンネルメンション）', '例: 1234567890'));
      break;
    }
    case 'archive_ch': {
      await interaction.showModal(channelModal('sv_modal_archive_ch', 'アーカイブチャンネルID', 'チャンネルID（または #チャンネルメンション）', '例: 1234567890'));
      break;
    }
    case 'ticket_cat': {
      await interaction.showModal(channelModal('sv_modal_ticket_cat', 'チケットカテゴリID', 'カテゴリID', '例: 1234567890'));
      break;
    }
    case 'quiz_count': {
      await interaction.showModal(channelModal('sv_modal_quiz_count', 'クイズ出題数', '出題数（1以上）', '例: 3'));
      break;
    }
    case 'add_question': {
      const modal = multiFieldModal('sv_modal_add_question', 'クイズ問題を追加', [
        { id: 'q', label: '問題文', placeholder: 'ルールについて...', style: TextInputStyle.Paragraph, required: true },
        { id: 'a1', label: '選択肢1（正解）', placeholder: '正解の選択肢', style: TextInputStyle.Short, required: true },
        { id: 'a2', label: '選択肢2', placeholder: 'ダミー選択肢', style: TextInputStyle.Short, required: true },
        { id: 'a3', label: '選択肢3', placeholder: 'ダミー選択肢', style: TextInputStyle.Short, required: true },
        { id: 'a4', label: '選択肢4', placeholder: 'ダミー選択肢', style: TextInputStyle.Short, required: true },
      ]);
      await interaction.showModal(modal);
      break;
    }
    case 'list_questions': {
      const settings = await getVerificationSettings(guildId);
      if (!settings.questions || settings.questions.length === 0) {
        const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('📋 問題一覧').setDescription('問題が登録されていません。');
        await interaction.update({ embeds: [embed], components: [backRow] });
        return;
      }
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle(`📋 問題一覧（${settings.questions.length}問）`);
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      let currentRow = new ActionRowBuilder<ButtonBuilder>();
      for (let i = 0; i < settings.questions.length; i++) {
        const q = settings.questions[i];
        embed.addFields({ name: `ID: ${q.id}`, value: `**${q.question}**\n正解: ${q.options[q.correctIndex]}`, inline: false });
        currentRow.addComponents(new ButtonBuilder().setCustomId(`sv_delq_${q.id}`).setLabel(`削除: ${q.id}`).setStyle(ButtonStyle.Danger));
        if (currentRow.components.length === 5 || i === settings.questions.length - 1) {
          if (currentRow.components.length > 0) {
            rows.push(currentRow);
            currentRow = new ActionRowBuilder<ButtonBuilder>();
          }
        }
      }
      await interaction.update({ embeds: [embed], components: [...rows.slice(0, 4), backRow] });
      break;
    }
    case 'send_welcome': {
      const settings = await getVerificationSettings(guildId);
      if (!settings.welcomeChannelId) {
        const embed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription('はじめにチャンネルが設定されていません。');
        await interaction.update({ embeds: [embed], components: [backRow] });
        return;
      }
      const channel = await interaction.guild!.channels.fetch(settings.welcomeChannelId).catch(() => null) as TextChannel | null;
      if (!channel) {
        const embed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription('はじめにチャンネルが見つかりません。');
        await interaction.update({ embeds: [embed], components: [backRow] });
        return;
      }
      const welcomeEmbed = new CustomEmbed()
        .setTitle('🔰 ぽん酢鯖へようこそ！')
        .setDescription(
          'ぽん酢鯖へご興味を持っていただき、ありがとうございます！このメッセージでは参加後の認証手順について説明しております！\n\n' +
          '**認証手順：**\n' +
          '1️⃣ 一番上までスクロールしてルールを読む\n' +
          '2️⃣ 下のボタンを押してルールに関するクイズを解く\n' +
          '3️⃣ 参加申請フォームに必要事項を入力する\n' +
          '4️⃣ 運営からの返答を待つ（通常24時間〜72時間ほど要します）\n' +
          '5️⃣ 承認されたらNDA（秘密保持契約）に署名して認証完了！\n\n' +
          '準備ができましたら、「参加申請フォームを開く」ボタンを押して進んでください。',
        )
        .setColor(0xFFAA00);
      const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('参加申請フォームを開く').setStyle(ButtonStyle.Primary),
      );
      const message = await channel.send({ embeds: [welcomeEmbed], components: [button] });
      settings.welcomeMessageId = message.id;
      await saveVerificationSettings(guildId, settings);
      const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 送信完了').setDescription(`ウェルカムメッセージを ${channel} に送信しました。`);
      await interaction.update({ embeds: [embed], components: [backRow] });
      break;
    }
    case 'search': {
      await interaction.showModal(channelModal('sv_modal_search', '検索するユーザーID', 'ユーザーID または @メンション', '例: 1234567890'));
      break;
    }
    case 'form_fields': {
      const settings = await getVerificationSettings(guildId);
      const fields = settings.formFields;
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('📝 申請フォーム設定');
      if (!fields || fields.length === 0) {
        embed.setDescription('現在デフォルトのフォームが使用されています。\n\n項目を追加するには下のボタンを押してください。\n（最大5項目。1行/複数行、必須/任意を設定可能）');
      } else {
        embed.setDescription(`現在 ${fields.length}/5 項目が設定されています。\n\n` +
          fields.map((f, i) => `${i + 1}. **${f.label}** (${f.style === 'paragraph' ? '複数行' : '1行'}${f.required ? '・必須' : '・任意'}・最大${f.maxLength}文字)`).join('\n'));
      }
      const btnRows: ActionRowBuilder<ButtonBuilder>[] = [];
      const btnRow = new ActionRowBuilder<ButtonBuilder>();
      if ((fields?.length ?? 0) < 5) {
        btnRow.addComponents(new ButtonBuilder().setCustomId('sv_form_add').setLabel('➕ 項目を追加').setStyle(ButtonStyle.Primary));
      }
      if (fields && fields.length > 0) {
        btnRow.addComponents(new ButtonBuilder().setCustomId('sv_form_reset').setLabel('🗑️ デフォルトに戻す').setStyle(ButtonStyle.Danger));
      }
      if (btnRow.components.length > 0) btnRows.push(btnRow);
      if (fields && fields.length > 0) {
        const delRow = new ActionRowBuilder<ButtonBuilder>();
        for (const f of fields) {
          delRow.addComponents(new ButtonBuilder().setCustomId(`sv_formdel_${f.id}`).setLabel(`❌ ${f.label.slice(0, 70)}`).setStyle(ButtonStyle.Secondary));
          if (delRow.components.length === 5) { btnRows.push(delRow); break; }
        }
        if (delRow.components.length > 0 && !btnRows.includes(delRow)) btnRows.push(delRow);
      }
      btnRows.push(backRow);
      await interaction.update({ embeds: [embed], components: btnRows.slice(0, 5) });
      break;
    }
  }
}

export async function handleSetupButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;
  const guildId = interaction.guild!.id;

  if (id === 'setup_back') {
    await sendMainMenu(interaction);
    return;
  }

  if (id === 'sv_back') {
    await sendVerificationMenu(interaction);
    return;
  }

  if (id.startsWith('sv_delq_')) {
    const qId = id.slice(8);
    const settings = await getVerificationSettings(guildId);
    if (!settings.questions) {
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription('問題がありません。')], components: [backRow] });
      return;
    }
    const before = settings.questions.length;
    settings.questions = settings.questions.filter((q: VerificationQuestion) => q.id !== qId);
    if (settings.questions.length === before) {
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ embeds: [new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription(`問題 \`${qId}\` が見つかりません。`)], components: [backRow] });
      return;
    }
    await saveVerificationSettings(guildId, settings);
    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
    );
    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 削除完了').setDescription(`問題 \`${qId}\` を削除しました。（残り: ${settings.questions.length}問）`);
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  if (id === 'sv_form_add') {
    const modal = multiFieldModal('sv_modal_form_add', '申請フォーム項目を追加', [
      { id: 'form_label', label: '項目名（ラベル）', placeholder: '例: 表示名', style: TextInputStyle.Short, required: true, maxLength: 45 },
      { id: 'form_style', label: '入力スタイル (short / paragraph)', placeholder: 'short', style: TextInputStyle.Short, required: true, maxLength: 10 },
      { id: 'form_required', label: '必須 (true / false)', placeholder: 'true', style: TextInputStyle.Short, required: true, maxLength: 5 },
      { id: 'form_maxlength', label: '最大文字数', placeholder: '100', style: TextInputStyle.Short, required: true, maxLength: 4 },
    ]);
    await interaction.showModal(modal);
    return;
  }

  if (id === 'sv_form_reset') {
    const settings = await getVerificationSettings(guildId);
    settings.formFields = undefined;
    await saveVerificationSettings(guildId, settings);
    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
    );
    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ リセット完了').setDescription('申請フォームをデフォルトに戻しました。');
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  if (id.startsWith('sv_formdel_')) {
    const fieldId = id.slice(11);
    const settings = await getVerificationSettings(guildId);
    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
    );
    if (!settings.formFields) {
      await interaction.update({ embeds: [new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription('カスタムフォーム項目がありません。')], components: [backRow] });
      return;
    }
    const before = settings.formFields.length;
    settings.formFields = settings.formFields.filter((f: FormFieldConfig) => f.id !== fieldId);
    if (settings.formFields.length === before) {
      await interaction.update({ embeds: [new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription('項目が見つかりません。')], components: [backRow] });
      return;
    }
    if (settings.formFields.length === 0) settings.formFields = undefined;
    await saveVerificationSettings(guildId, settings);
    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 削除完了').setDescription(`フォーム項目を削除しました。（残り: ${settings.formFields?.length ?? 0}項目）`);
    await interaction.update({ embeds: [embed], components: [backRow] });
    return;
  }

  if (id === 'setup_rp_create') {
    const modal = multiFieldModal('setup_m_rp_create', 'ロールパネル作成', [
      { id: 'channel_id', label: 'チャンネルID', placeholder: '#roles', style: TextInputStyle.Short, required: true },
      { id: 'title', label: 'パネルタイトル', placeholder: 'ロール選択', style: TextInputStyle.Short, required: true },
      { id: 'description', label: 'パネル説明（任意）', placeholder: '下のメニューからロールを選択してください。', style: TextInputStyle.Paragraph, required: false },
    ]);
    await interaction.showModal(modal);
    return;
  }

  if (id === 'setup_rp_add') {
    const modal = multiFieldModal('setup_m_rp_add', 'ロールパネルにロール追加', [
      { id: 'message_id', label: 'パネルのメッセージID', placeholder: '1234567890', style: TextInputStyle.Short, required: true },
      { id: 'role_id', label: 'ロールID または @ロール', placeholder: '@RoleName', style: TextInputStyle.Short, required: true },
    ]);
    await interaction.showModal(modal);
    return;
  }

  if (id === 'setup_rp_remove') {
    const modal = multiFieldModal('setup_m_rp_remove', 'ロールパネルからロール削除', [
      { id: 'message_id', label: 'パネルのメッセージID', placeholder: '1234567890', style: TextInputStyle.Short, required: true },
      { id: 'role_id', label: 'ロールID または @ロール', placeholder: '@RoleName', style: TextInputStyle.Short, required: true },
    ]);
    await interaction.showModal(modal);
    return;
  }

  if (id === 'setup_tpl_set') {
    const keys = Object.keys(TEMPLATE_DEFINITIONS);
    const modal = multiFieldModal('setup_m_tpl_set', 'テンプレート設定', [
      { id: 'template_key', label: `テンプレートキー (${keys.join('/')})`, placeholder: keys[0], style: TextInputStyle.Short, required: true },
      { id: 'channel_id', label: 'チャンネルID', placeholder: '#templates', style: TextInputStyle.Short, required: true },
    ]);
    await interaction.showModal(modal);
    return;
  }

  if (id === 'setup_tpl_intro') {
    const modal = channelModal('setup_m_tpl_intro', '自己紹介テンプレート初期化', 'チャンネルID', '#introduction');
    await interaction.showModal(modal);
    return;
  }

  if (id === 'setup_tpl_adopt') {
    const modal = multiFieldModal('setup_m_tpl_adopt', '既存メッセージをテンプレートに採用', [
      { id: 'message_link', label: 'メッセージリンク', placeholder: 'https://discord.com/channels/...', style: TextInputStyle.Short, required: true },
      { id: 'channel_id', label: 'テンプレートを維持するチャンネルID', placeholder: '#introduction', style: TextInputStyle.Short, required: true },
    ]);
    await interaction.showModal(modal);
    return;
  }

  const modalHandlers: Record<string, { modal: ModalBuilder; handler: (value: string) => Promise<string> }> = {
    setup_level_notify: {
      modal: channelModal('setup_m_level_notify', 'レベル通知チャンネル', 'チャンネルID または #チャンネル', '#level-up'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
        s.levelUpChannelId = cid;
        await levelRepo.setLevelSettings(guildId, s);
        return `レベル通知チャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_level_bonus: {
      modal: channelModal('setup_m_level_bonus', 'ログインボーナスXP', 'XP数値（1以上）', '50'),
      handler: async (v) => {
        const xp = parseInt(v, 10);
        if (isNaN(xp) || xp < 1) throw new Error('1以上の数値を入力してください');
        const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
        s.loginBonusBaseXp = xp;
        await levelRepo.setLevelSettings(guildId, s);
        return `ログインボーナスXPを ${xp} に設定しました。`;
      },
    },
    setup_afk_ch: {
      modal: channelModal('setup_m_afk_ch', 'AFKチャンネル', 'ボイスチャンネルID', '#afk-room'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await afkRepo.setAfkSetting(guildId, { afkChannelId: cid });
        return `AFKチャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_afk_notify: {
      modal: channelModal('setup_m_afk_notify', 'AFK通知チャンネル', 'テキストチャンネルID', '#afk-log'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await afkRepo.setAfkSetting(guildId, { notifyChannelId: cid });
        return `AFK通知チャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_afk_time: {
      modal: channelModal('setup_m_afk_time', 'AFKタイムアウト', '分単位で入力', '10'),
      handler: async (v) => {
        const mins = parseInt(v, 10);
        if (isNaN(mins) || mins < 1) throw new Error('1以上の数値を入力してください');
        await afkRepo.setAfkSetting(guildId, { afkTimeout: mins * 60 * 1000 });
        return `AFKタイムアウトを ${mins}分 に設定しました。`;
      },
    },
    setup_cleanup_log: {
      modal: channelModal('setup_m_cleanup_log', 'クリーンアップログチャンネル', 'テキストチャンネルID', '#cleanup-log'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await cleanupRepo.setCleanupSetting(guildId, { logChannelId: cid });
        return `クリーンアップログチャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_vcn_ch: {
      modal: channelModal('setup_m_vcn_ch', 'VC通話ログチャンネル', 'テキストチャンネルID', '#vc-log'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await vcNotifyRepo.setVcNotifySettings(guildId, { notificationChannelId: cid });
        return `VC通話ログチャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_vr_set: {
      modal: channelModal('setup_m_vr_set', 'VCロール設定', 'ロールID または @ロール', '@InVoice'),
      handler: async (v) => {
        const rid = v.replace(/[<@&>]/g, '').trim();
        if (!rid) throw new Error('無効なロール');
        await miscRepo.setVoiceRoleSettings(guildId, { roleId: rid });
        return `VCロールを <@&${rid}> に設定しました。`;
      },
    },
    setup_wo_add: {
      modal: channelModal('setup_m_wo_add', '筋トレ通知チャンネル追加', 'テキストチャンネルID', '#workout'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await workoutRepo.getWorkoutSettings(guildId)) ?? {};
        if (!s.targetChannels) s.targetChannels = [];
        if (!s.targetChannels.includes(cid)) s.targetChannels.push(cid);
        await workoutRepo.setWorkoutSettings(guildId, s);
        return `筋トレ通知チャンネルに <#${cid}> を追加しました。`;
      },
    },
    setup_ds_ch: {
      modal: channelModal('setup_m_ds_ch', 'デイリー統計レポートチャンネル', 'テキストチャンネルID', '#stats'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await dailyStatsRepo.setDailyStatsSettings(guildId, { reportChannelId: cid });
        return `レポートチャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_cp_add: {
      modal: channelModal('setup_m_cp_add', 'クロスポスト通知先追加', 'テキストチャンネルID', '#emoji-log'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await miscRepo.addCrossPostTarget(guildId, cid);
        return `クロスポスト通知先に <#${cid}> を追加しました。`;
      },
    },
    setup_ru_set: {
      modal: channelModal('setup_m_ru_set', 'ファイル再アップ送信先', 'テキストチャンネルID', '#reupload'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await miscRepo.setReuploadSettings(guildId, { destinationChannelId: cid });
        return `ファイル再アップ送信先を <#${cid}> に設定しました。`;
      },
    },
    setup_log_set: {
      modal: channelModal('setup_m_log_set', 'ログチャンネル', 'テキストチャンネルID', '#bot-log'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await miscRepo.setLogChannelId(guildId, cid);
        return `ログチャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_ksl_set: {
      modal: channelModal('setup_m_ksl_set', '聞き専ログチャンネル', 'テキストチャンネルID', '#kikisen-log'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await kikisenRepo.setLogChannel(guildId, cid);
        return `聞き専ログチャンネルを <#${cid}> に設定しました。`;
      },
    },
    setup_level_addex: {
      modal: channelModal('setup_m_level_addex', 'レベル除外チャンネル追加', 'チャンネルID または #チャンネル', '#off-topic'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
        if (!s.excludedChannels) s.excludedChannels = [];
        if (!s.excludedChannels.includes(cid)) s.excludedChannels.push(cid);
        await levelRepo.setLevelSettings(guildId, s);
        return `<#${cid}> をレベル除外チャンネルに追加しました。`;
      },
    },
    setup_level_delex: {
      modal: channelModal('setup_m_level_delex', 'レベル除外チャンネル削除', 'チャンネルID または #チャンネル', '#off-topic'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
        if (!s.excludedChannels?.includes(cid)) throw new Error('このチャンネルは除外リストにありません');
        s.excludedChannels = s.excludedChannels.filter(i => i !== cid);
        await levelRepo.setLevelSettings(guildId, s);
        return `<#${cid}> をレベル除外チャンネルから削除しました。`;
      },
    },
    setup_vcn_addex: {
      modal: channelModal('setup_m_vcn_addex', 'VC通知除外チャンネル追加', 'ボイスチャンネルID', '#afk-room'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await vcNotifyRepo.addVcNotifyExcludedChannel(guildId, cid);
        return `<#${cid}> をVC通知除外チャンネルに追加しました。`;
      },
    },
    setup_vcn_delex: {
      modal: channelModal('setup_m_vcn_delex', 'VC通知除外チャンネル削除', 'ボイスチャンネルID', '#afk-room'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await vcNotifyRepo.removeVcNotifyExcludedChannel(guildId, cid);
        return `<#${cid}> をVC通知除外チャンネルから削除しました。`;
      },
    },
    setup_wo_del: {
      modal: channelModal('setup_m_wo_del', '筋トレ通知チャンネル削除', 'テキストチャンネルID', '#workout'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await workoutRepo.getWorkoutSettings(guildId)) ?? {};
        if (!s.targetChannels?.includes(cid)) throw new Error('このチャンネルは通知リストにありません');
        s.targetChannels = s.targetChannels.filter(i => i !== cid);
        await workoutRepo.setWorkoutSettings(guildId, s);
        return `<#${cid}> を筋トレ通知チャンネルから削除しました。`;
      },
    },
    setup_ds_addex: {
      modal: channelModal('setup_m_ds_addex', 'デイリー統計除外チャンネル追加', 'チャンネルID または #チャンネル', '#bot-cmd'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await dailyStatsRepo.getDailyStatsSettings(guildId)) ?? {};
        if (!s.excludedChannels) s.excludedChannels = [];
        if (!s.excludedChannels.includes(cid)) s.excludedChannels.push(cid);
        await dailyStatsRepo.setDailyStatsSettings(guildId, s);
        return `<#${cid}> をデイリー統計除外チャンネルに追加しました。`;
      },
    },
    setup_ds_delex: {
      modal: channelModal('setup_m_ds_delex', 'デイリー統計除外チャンネル削除', 'チャンネルID または #チャンネル', '#bot-cmd'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        const s = (await dailyStatsRepo.getDailyStatsSettings(guildId)) ?? {};
        if (!s.excludedChannels?.includes(cid)) throw new Error('このチャンネルは除外リストにありません');
        s.excludedChannels = s.excludedChannels.filter(i => i !== cid);
        await dailyStatsRepo.setDailyStatsSettings(guildId, s);
        return `<#${cid}> をデイリー統計除外チャンネルから削除しました。`;
      },
    },
    setup_cp_del: {
      modal: channelModal('setup_m_cp_del', 'クロスポスト通知先削除', '削除するには「削除」と入力', '削除'),
      handler: async (v) => {
        if (v !== '削除') throw new Error('「削除」と入力してください');
        await miscRepo.removeCrossPostTarget(guildId);
        return 'クロスポスト通知先を削除しました。';
      },
    },
  };

  const toggleHandlers: Record<string, () => Promise<string>> = {
    setup_cleanup_toggle: async () => {
      const s = await cleanupRepo.getCleanupSettings(guildId);
      const newState = !(s?.enabled);
      await cleanupRepo.setCleanupSetting(guildId, { enabled: newState });
      return `自動クリーンアップを${newState ? '有効' : '無効'}にしました。`;
    },
    setup_reban_toggle: async () => {
      const s = await miscRepo.getRebanSettings(guildId);
      const newState = !(s?.enabled);
      await miscRepo.setRebanSettings(guildId, { enabled: newState });
      return `追い打ちBANを${newState ? '有効' : '無効'}にしました。`;
    },
  };

  if (id === 'setup_cleanup_run') {
    const { cleanupManager } = await import('../../lib/cleanupManager.js');
    await interaction.reply({ content: '🧹 クリーンアップ処理を開始します...', ephemeral: true });
    await cleanupManager.executeCleanup(interaction.guild!);
    return;
  }

  const toggle = toggleHandlers[id];
  if (toggle) {
    const msg = await toggle();
    await replySuccess(interaction, msg);
    return;
  }

  const entry = modalHandlers[id];
  if (entry) {
    await interaction.showModal(entry.modal);
    return;
  }

  await replyError(interaction, `未対応のボタンです: ${id}`);
}

export async function handleSetupModal(interaction: ModalSubmitInteraction): Promise<void> {
  const id = interaction.customId;
  const guildId = interaction.guild!.id;
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sv_back').setLabel('← 設定メニューに戻る').setStyle(ButtonStyle.Secondary),
  );

  if (id.startsWith('sv_modal_')) {
    await handleVerificationModal(interaction, id, guildId, backRow);
    return;
  }

  if (id === 'setup_m_rp_create') {
    await handleRolePanelCreate(interaction, guildId);
    return;
  }
  if (id === 'setup_m_rp_add') {
    await handleRolePanelAdd(interaction, guildId);
    return;
  }
  if (id === 'setup_m_rp_remove') {
    await handleRolePanelRemove(interaction, guildId);
    return;
  }
  if (id === 'setup_m_tpl_set') {
    await handleTemplateSet(interaction, guildId);
    return;
  }
  if (id === 'setup_m_tpl_intro') {
    await handleIntroductionInit(interaction, guildId);
    return;
  }
  if (id === 'setup_m_tpl_adopt') {
    await handleTemplateAdopt(interaction, guildId);
    return;
  }

  const value = interaction.fields.getTextInputValue('value').trim();

  const handlers: Record<string, (v: string) => Promise<string>> = {
    setup_m_level_notify: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
      s.levelUpChannelId = cid;
      await levelRepo.setLevelSettings(guildId, s);
      return `レベル通知チャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_level_bonus: async (v) => {
      const xp = parseInt(v, 10);
      if (isNaN(xp) || xp < 1) throw new Error('1以上の数値を入力してください');
      const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
      s.loginBonusBaseXp = xp;
      await levelRepo.setLevelSettings(guildId, s);
      return `ログインボーナスXPを ${xp} に設定しました。`;
    },
    setup_m_afk_ch: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await afkRepo.setAfkSetting(guildId, { afkChannelId: cid });
      return `AFKチャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_afk_notify: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await afkRepo.setAfkSetting(guildId, { notifyChannelId: cid });
      return `AFK通知チャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_afk_time: async (v) => {
      const mins = parseInt(v, 10);
      if (isNaN(mins) || mins < 1) throw new Error('1以上の数値を入力してください');
      await afkRepo.setAfkSetting(guildId, { afkTimeout: mins * 60 * 1000 });
      return `AFKタイムアウトを ${mins}分 に設定しました。`;
    },
    setup_m_cleanup_log: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await cleanupRepo.setCleanupSetting(guildId, { logChannelId: cid });
      return `クリーンアップログチャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_vcn_ch: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await vcNotifyRepo.setVcNotifySettings(guildId, { notificationChannelId: cid });
      return `VC通話ログチャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_vr_set: async (v) => {
      const rid = v.replace(/[<@&>]/g, '').trim();
      if (!rid) throw new Error('無効なロール');
      await miscRepo.setVoiceRoleSettings(guildId, { roleId: rid });
      return `VCロールを <@&${rid}> に設定しました。`;
    },
    setup_m_wo_add: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await workoutRepo.getWorkoutSettings(guildId)) ?? {};
      if (!s.targetChannels) s.targetChannels = [];
      if (!s.targetChannels.includes(cid)) s.targetChannels.push(cid);
      await workoutRepo.setWorkoutSettings(guildId, s);
      return `筋トレ通知チャンネルに <#${cid}> を追加しました。`;
    },
    setup_m_ds_ch: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await dailyStatsRepo.setDailyStatsSettings(guildId, { reportChannelId: cid });
      return `レポートチャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_cp_add: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await miscRepo.addCrossPostTarget(guildId, cid);
      return `クロスポスト通知先に <#${cid}> を追加しました。`;
    },
    setup_m_ru_set: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await miscRepo.setReuploadSettings(guildId, { destinationChannelId: cid });
      return `ファイル再アップ送信先を <#${cid}> に設定しました。`;
    },
    setup_m_log_set: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await miscRepo.setLogChannelId(guildId, cid);
      return `ログチャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_ksl_set: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await kikisenRepo.setLogChannel(guildId, cid);
      return `聞き専ログチャンネルを <#${cid}> に設定しました。`;
    },
    setup_m_level_addex: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
      if (!s.excludedChannels) s.excludedChannels = [];
      if (!s.excludedChannels.includes(cid)) s.excludedChannels.push(cid);
      await levelRepo.setLevelSettings(guildId, s);
      return `<#${cid}> をレベル除外チャンネルに追加しました。`;
    },
    setup_m_level_delex: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await levelRepo.getLevelSettings(guildId)) ?? {};
      if (!s.excludedChannels?.includes(cid)) throw new Error('このチャンネルは除外リストにありません');
      s.excludedChannels = s.excludedChannels.filter(i => i !== cid);
      await levelRepo.setLevelSettings(guildId, s);
      return `<#${cid}> をレベル除外チャンネルから削除しました。`;
    },
    setup_m_vcn_addex: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await vcNotifyRepo.addVcNotifyExcludedChannel(guildId, cid);
      return `<#${cid}> をVC通知除外チャンネルに追加しました。`;
    },
    setup_m_vcn_delex: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      await vcNotifyRepo.removeVcNotifyExcludedChannel(guildId, cid);
      return `<#${cid}> をVC通知除外チャンネルから削除しました。`;
    },
    setup_m_wo_del: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await workoutRepo.getWorkoutSettings(guildId)) ?? {};
      if (!s.targetChannels?.includes(cid)) throw new Error('このチャンネルは通知リストにありません');
      s.targetChannels = s.targetChannels.filter(i => i !== cid);
      await workoutRepo.setWorkoutSettings(guildId, s);
      return `<#${cid}> を筋トレ通知チャンネルから削除しました。`;
    },
    setup_m_ds_addex: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await dailyStatsRepo.getDailyStatsSettings(guildId)) ?? {};
      if (!s.excludedChannels) s.excludedChannels = [];
      if (!s.excludedChannels.includes(cid)) s.excludedChannels.push(cid);
      await dailyStatsRepo.setDailyStatsSettings(guildId, s);
      return `<#${cid}> をデイリー統計除外チャンネルに追加しました。`;
    },
    setup_m_ds_delex: async (v) => {
      const cid = await resolveChannelId(guildId, v);
      if (!cid) throw new Error('無効なチャンネル');
      const s = (await dailyStatsRepo.getDailyStatsSettings(guildId)) ?? {};
      if (!s.excludedChannels?.includes(cid)) throw new Error('このチャンネルは除外リストにありません');
      s.excludedChannels = s.excludedChannels.filter(i => i !== cid);
      await dailyStatsRepo.setDailyStatsSettings(guildId, s);
      return `<#${cid}> をデイリー統計除外チャンネルから削除しました。`;
    },
    setup_m_cp_del: async (v) => {
      if (v !== '削除') throw new Error('「削除」と入力してください');
      await miscRepo.removeCrossPostTarget(guildId);
      return 'クロスポスト通知先を削除しました。';
    },
  };

  const handler = handlers[id];
  if (!handler) {
    await replyError(interaction, '不明なモーダルです。');
    return;
  }

  try {
    const msg = await handler(value);
    await replySuccess(interaction, msg);
  } catch (e) {
    await replyError(interaction, e instanceof Error ? e.message : 'エラーが発生しました。');
  }
}

async function handleVerificationModal(interaction: ModalSubmitInteraction, customId: string, guildId: string, backRow: ActionRowBuilder<ButtonBuilder>): Promise<void> {
  const embed = new CustomEmbed(interaction.user);

  try {
    switch (customId) {
      case 'sv_modal_welcome_ch': {
        const channelId = interaction.fields.getTextInputValue('value').replace(/[<#>]/g, '').trim();
        const settings = await getVerificationSettings(guildId);
        settings.welcomeChannelId = channelId;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`はじめにチャンネルを <#${channelId}> に設定しました。`);
        break;
      }
      case 'sv_modal_verified_role': {
        const roleId = interaction.fields.getTextInputValue('value').replace(/[<@&>]/g, '').trim();
        const settings = await getVerificationSettings(guildId);
        settings.verifiedRoleId = roleId;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`認証済みロールを <@&${roleId}> に設定しました。`);
        break;
      }
      case 'sv_modal_staff_role': {
        const roleId = interaction.fields.getTextInputValue('value').replace(/[<@&>]/g, '').trim();
        const settings = await getVerificationSettings(guildId);
        settings.staffRoleId = roleId;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`運営ロールを <@&${roleId}> に設定しました。`);
        break;
      }
      case 'sv_modal_review_ch': {
        const channelId = interaction.fields.getTextInputValue('value').replace(/[<#>]/g, '').trim();
        const settings = await getVerificationSettings(guildId);
        settings.reviewChannelId = channelId;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`レビューチャンネルを <#${channelId}> に設定しました。`);
        break;
      }
      case 'sv_modal_archive_ch': {
        const channelId = interaction.fields.getTextInputValue('value').replace(/[<#>]/g, '').trim();
        const settings = await getVerificationSettings(guildId);
        settings.archiveChannelId = channelId;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`アーカイブチャンネルを <#${channelId}> に設定しました。`);
        break;
      }
      case 'sv_modal_ticket_cat': {
        const catId = interaction.fields.getTextInputValue('value').replace(/[<#>]/g, '').trim();
        const settings = await getVerificationSettings(guildId);
        settings.ticketCategoryId = catId;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`チケットカテゴリを <#${catId}> に設定しました。`);
        break;
      }
      case 'sv_modal_quiz_count': {
        const count = parseInt(interaction.fields.getTextInputValue('value').trim(), 10);
        if (isNaN(count) || count < 1) {
          embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('1以上の数値を入力してください。');
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        const settings = await getVerificationSettings(guildId);
        settings.quizPassCount = count;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`クイズ出題数を **${count}** 問に設定しました。`);
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
        const settings = await getVerificationSettings(guildId);
        if (!settings.questions) settings.questions = [];
        settings.questions.push({ id: qId, question, options: shuffledOptions, correctIndex });
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`問題を追加しました（ID: \`${qId}\`）\n正解: ${a1}\n現在の問題数: ${settings.questions.length}`);
        break;
      }
      case 'sv_modal_search': {
        const userId = interaction.fields.getTextInputValue('value').trim().replace(/[<@!>]/g, '');
        const applications = verificationRepo.getApplicationsByUser(guildId, userId);
        if (applications.length === 0) {
          embed.setColor(0x00FF00).setTitle('🔍 検索結果').setDescription(`<@${userId}> の申請履歴はありません。`);
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        embed.setColor(0xFFAA00).setTitle(`🔍 検索結果: <@${userId}>（${applications.length}件）`);
        const statusMap: Record<string, string> = {
          quiz: '📝 クイズ中', pending: '⏳ 審査中', approved: '✅ 承認済み',
          rejected: '❌ 却下', nda_pending: '📋 NDA待ち', completed: '🎉 完了',
        };
        for (const app of applications.slice(0, 10)) {
          embed.addFields({ name: `${statusMap[app.status] ?? app.status} - <t:${Math.floor(app.submittedAt / 1000)}:F>`, value: `名前: ${app.displayName} | 活動: ${app.activity.slice(0, 50)}`, inline: false });
        }
        await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
        return;
      }
      case 'sv_modal_form_add': {
        const label = interaction.fields.getTextInputValue('form_label').trim();
        const style = interaction.fields.getTextInputValue('form_style').trim().toLowerCase();
        const required = interaction.fields.getTextInputValue('form_required').trim().toLowerCase();
        const maxLength = parseInt(interaction.fields.getTextInputValue('form_maxlength').trim(), 10);
        if (!label || label.length > 45) {
          embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('ラベルは1〜45文字で入力してください。');
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        if (style !== 'short' && style !== 'paragraph') {
          embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('スタイルは short または paragraph で入力してください。');
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        if (required !== 'true' && required !== 'false') {
          embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('必須設定は true または false で入力してください。');
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        if (isNaN(maxLength) || maxLength < 1 || maxLength > 4000) {
          embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('最大文字数は1〜4000の数値で入力してください。');
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        const settings = await getVerificationSettings(guildId);
        const fields = settings.formFields ?? [];
        if (fields.length >= 5) {
          embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('フォーム項目は最大5つまでです。');
          await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
          return;
        }
        const fieldId = `field_${randomUUID().slice(0, 8)}`;
        fields.push({ id: fieldId, label, style: style as 'short' | 'paragraph', required: required === 'true', maxLength });
        settings.formFields = fields;
        await saveVerificationSettings(guildId, settings);
        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`フォーム項目「**${label}**」を追加しました。\n現在 ${fields.length}/5 項目。`);
        break;
      }
      default: {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('不明なモーダルです。');
        break;
      }
    }
  } catch (e) {
    embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
  }

  await interaction.reply({ embeds: [embed], components: [backRow], ephemeral: true });
}

async function handleRolePanelCreate(interaction: ModalSubmitInteraction, guildId: string): Promise<void> {
  const channelId = interaction.fields.getTextInputValue('channel_id').replace(/[<#>]/g, '').trim();
  const title = interaction.fields.getTextInputValue('title').trim();
  const description = interaction.fields.getTextInputValue('description')?.trim() || '下のメニューからロールを選択してください。';

  try {
    const guild = interaction.guild!;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('指定されたチャンネルが見つかりません。');

    const embed = new CustomEmbed(interaction.user).setTitle(title).setDescription(description).setColor(0x5865F2);
    const panelMessage = await (channel as TextChannel).send({ embeds: [embed], content: 'ロールパネルをセットアップ中です...' });

    await rolePanelRepo.addRolePanel(panelMessage.id, {
      guildId,
      channelId: channel.id,
      title,
      description,
      roles: [],
    });

    const successEmbed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ パネル作成完了')
      .setDescription(`ロールパネルを <#${channel.id}> に作成しました。\nメッセージID: \`${panelMessage.id}\`\n\nロールを追加するには再度「ロールパネル」→「ロール追加」から操作してください。`);
    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  } catch (e) {
    const errorEmbed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

async function handleRolePanelAdd(interaction: ModalSubmitInteraction, _guildId: string): Promise<void> {
  const messageId = interaction.fields.getTextInputValue('message_id').trim();
  const roleId = interaction.fields.getTextInputValue('role_id').replace(/[<@&>]/g, '').trim();

  try {
    const panelData = await rolePanelRepo.getRolePanel(messageId);
    if (!panelData) throw new Error('指定されたパネルが見つかりません。');
    if (panelData.roles.includes(roleId)) throw new Error('このロールは既にパネルに追加されています。');

    panelData.roles.push(roleId);
    await rolePanelRepo.addRolePanel(messageId, panelData);
    await rolePanelManager.updatePanel(interaction.guild!, messageId);

    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ ロール追加完了').setDescription(`<@&${roleId}> をパネルに追加しました。`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (e) {
    const errorEmbed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

async function handleRolePanelRemove(interaction: ModalSubmitInteraction, _guildId: string): Promise<void> {
  const messageId = interaction.fields.getTextInputValue('message_id').trim();
  const roleId = interaction.fields.getTextInputValue('role_id').replace(/[<@&>]/g, '').trim();

  try {
    const panelData = await rolePanelRepo.getRolePanel(messageId);
    if (!panelData) throw new Error('指定されたパネルが見つかりません。');

    panelData.roles = panelData.roles.filter((id: string) => id !== roleId);
    await rolePanelRepo.addRolePanel(messageId, panelData);

    if (panelData.roles.length === 0) {
      const channel = await interaction.guild!.channels.fetch(panelData.channelId).catch(() => null);
      if (channel?.isTextBased()) {
        const message = await (channel as TextChannel).messages.fetch(messageId).catch(() => null);
        if (message) await message.delete().catch(() => {});
      }
      await rolePanelRepo.removeRolePanel(messageId);
      const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ ロール削除完了').setDescription(`<@&${roleId}> をパネルから削除しました。パネルにロールがなくなったためパネルも削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
      await rolePanelManager.updatePanel(interaction.guild!, messageId);
      const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ ロール削除完了').setDescription(`<@&${roleId}> をパネルから削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  } catch (e) {
    const errorEmbed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

async function handleTemplateSet(interaction: ModalSubmitInteraction, _guildId: string): Promise<void> {
  const templateKey = interaction.fields.getTextInputValue('template_key').trim();
  const channelId = interaction.fields.getTextInputValue('channel_id').replace(/[<#>]/g, '').trim();

  try {
    if (!TEMPLATE_DEFINITIONS[templateKey]) throw new Error(`無効なテンプレートキーです。有効: ${Object.keys(TEMPLATE_DEFINITIONS).join(', ')}`);
    const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('指定されたチャンネルが見つかりません。');

    await ensureLatestTemplateMessage(interaction.guild!.id, templateKey, channel as TextChannel);
    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`テンプレート「${templateKey}」を <#${channelId}> に設定しました。`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (e) {
    const errorEmbed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

async function handleIntroductionInit(interaction: ModalSubmitInteraction, _guildId: string): Promise<void> {
  const channelId = interaction.fields.getTextInputValue('value').replace(/[<#>]/g, '').trim();

  try {
    const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('指定されたチャンネルが見つかりません。');

    await ensureLatestTemplateMessage(interaction.guild!.id, 'introduction', channel as TextChannel);
    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`自己紹介チャンネルを <#${channelId}> に設定しました。`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (e) {
    const errorEmbed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

async function handleTemplateAdopt(interaction: ModalSubmitInteraction, _guildId: string): Promise<void> {
  const messageLink = interaction.fields.getTextInputValue('message_link').trim();
  const channelId = interaction.fields.getTextInputValue('channel_id').replace(/[<#>]/g, '').trim();

  try {
    const match = messageLink.match(/\/channels\/\d+\/(\d+)\/(\d+)/);
    if (!match) throw new Error('無効なメッセージリンク形式です。');
    const [, sourceChannelId, messageId] = match;

    const sourceChannel = await interaction.guild!.channels.fetch(sourceChannelId).catch(() => null);
    if (!sourceChannel?.isTextBased()) throw new Error('指定されたチャンネルが見つかりません。');
    const sourceMessage = await (sourceChannel as TextChannel).messages.fetch(messageId).catch(() => null);
    if (!sourceMessage) throw new Error('指定されたメッセージが見つかりません。');

    const channel = await interaction.guild!.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) throw new Error('テンプレート先チャンネルが見つかりません。');

    await adoptTemplateFromExistingMessage(interaction.guild!.id, 'introduction', channel as TextChannel, sourceMessage.id);
    const embed = new CustomEmbed(interaction.user).setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`テンプレートを <#${channelId}> に適用しました。`);
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (e) {
    const errorEmbed = new CustomEmbed(interaction.user).setColor(0xFF0000).setTitle('❌ エラー').setDescription((e as Error).message);
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}

const command: BotCommand = { data, execute };
export default command;
