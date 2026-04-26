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
} from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import {
  levelRepo, afkRepo, cleanupRepo, miscRepo,
  vcNotifyRepo, workoutRepo, kikisenRepo, dailyStatsRepo,
} from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('【管理者のみ】ボットの各種設定を一元管理します。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await sendMainMenu(interaction);
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
        { label: '参加認証', description: 'クイズ・フォーム・NDA署名の設定', value: 'verification', emoji: '🛡️' },
        { label: 'レベル', description: 'XP・レベルアップ・報酬ロール', value: 'level', emoji: '🔝' },
        { label: 'AFK', description: '放置検知・自動移動', value: 'afk', emoji: '🛌' },
        { label: 'クリーンアップ', description: '退出メンバーのメッセージ削除', value: 'cleanup', emoji: '🧹' },
        { label: 'VC通知', description: '通話開始時の通知', value: 'vcnotify', emoji: '🔔' },
        { label: 'VCロール', description: '通話参加中ロール付与', value: 'voicerole', emoji: '🎤' },
        { label: '筋トレ通知', description: '24時間未報告リマインダー', value: 'workout', emoji: '💪' },
        { label: 'デイリー統計', description: 'サーバー活動レポート', value: 'dailystats', emoji: '📊' },
        { label: 'ロールパネル', description: 'セレクトメニュー式ロール選択', value: 'rolepanel', emoji: '🗳️' },
        { label: 'クロスポスト', description: '他サーバーでの絵文字使用通知', value: 'crosspost', emoji: '👽' },
        { label: 'ファイル再アップ', description: '添付ファイル自動バックアップ', value: 'reupload', emoji: '📁' },
        { label: 'テンプレート', description: '自己紹介・定型メッセージ', value: 'template', emoji: '🧩' },
        { label: 'ログ', description: '各種イベントのログ記録', value: 'logs', emoji: '📝' },
        { label: '聞き専ログ', description: '聞き専チャンネルのログ', value: 'kikisenlog', emoji: '👁️‍🗨️' },
        { label: '追い打ちBAN', description: '退出時の自動BAN', value: 'reban', emoji: '🔨' },
      ]),
  );
}

function backButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('setup_back').setLabel('← メインメニューに戻る').setStyle(ButtonStyle.Secondary),
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
    await interaction.reply({ content: '参加認証の設定は `/setup-verification` を使用してください。', ephemeral: true });
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
    vcnotify: async () => {
      const s = await vcNotifyRepo.getVcNotifySettings(guildId);
      const embed = new CustomEmbed(interaction.user).setColor(0xFFAA00).setTitle('🔔 VC通知設定')
        .setDescription(
          `通知チャンネル: ${ch(s?.notificationChannelId)}\n` +
          `除外チャンネル: ${list(s?.excludedChannels)}`,
        );
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('setup_vcn_ch').setLabel('📢 通知チャンネル').setStyle(ButtonStyle.Primary),
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
        .setDescription('ロールパネルの作成・管理は `/role-panel` コマンドを使用してください。');
      await interaction.update({ embeds: [embed], components: [backButton()] });
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
          'テンプレートの管理は以下のコマンドを使用してください。\n\n' +
          '• `/setup-template` — テンプレートの作成\n' +
          '• `/setup-introduction` — 自己紹介テンプレートの初期化\n' +
          '• `/setup-message-id` — 既存メッセージをテンプレートに採用',
        );
      await interaction.update({ embeds: [embed], components: [backButton()] });
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

async function resolveChannelId(guildId: string, input: string): Promise<string | null> {
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

export async function handleSetupButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;
  const guildId = interaction.guild!.id;

  if (id === 'setup_back') {
    await sendMainMenu(interaction);
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
      modal: channelModal('setup_m_vcn_ch', 'VC通知チャンネル', 'テキストチャンネルID', '#vc-notify'),
      handler: async (v) => {
        const cid = await resolveChannelId(guildId, v);
        if (!cid) throw new Error('無効なチャンネル');
        await vcNotifyRepo.setVcNotifySettings(guildId, { notificationChannelId: cid });
        return `VC通知チャンネルを <#${cid}> に設定しました。`;
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
      return `VC通知チャンネルを <#${cid}> に設定しました。`;
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

const command: BotCommand = { data, execute };
export default command;
