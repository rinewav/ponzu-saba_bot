import { randomUUID, createHash } from 'node:crypto';
import {
  type Client,
  GuildMember,
  type Guild,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type CategoryChannel,
  DiscordAPIError,
  ButtonStyle,
  ComponentType,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ModalBuilder,
  TextInputBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import { verificationRepo, miscRepo } from './repositories/index.js';
import { isInactiveStatus } from './repositories/verificationRepo.js';
import { CustomEmbed, EMBED_COLORS } from './customEmbed.js';
import { generateNdaPdf } from './ndaPdfGenerator.js';
import type { VerificationApplication, VerificationQuestion, VerificationSettings, FormFieldConfig } from '../types/index.js';

const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
  { id: 'display_name', label: '表示名', style: 'short', required: true, maxLength: 100 },
  { id: 'activity', label: '活動内容（何をしている人か）', style: 'paragraph', required: true, maxLength: 1000 },
  { id: 'portfolio', label: 'ポートフォリオのリンク（任意）', style: 'short', required: false, maxLength: 500 },
  { id: 'online_hours', label: 'おおよそのオンライン時間', style: 'short', required: true, maxLength: 100 },
  { id: 'note', label: '一言メッセージ（任意）', style: 'paragraph', required: false, maxLength: 1000 },
];

interface ActiveQuiz {
  applicationId: string;
  questions: VerificationQuestion[];
  currentIndex: number;
}

const NDA_TOKEN_EXPIRY_MS = 60 * 60 * 1000;

/** アーカイブ用カテゴリ1つあたりのチャンネル数上限（Discordの仕様） */
const CATEGORY_CHANNEL_LIMIT = 50;

const DM_INSTRUCTION_TEXT =
  'NDA署名記録（PDF）をDMでお送りする必要がありますが、DMを受け取れない設定になっています。\n\n' +
  '**設定手順:**\n' +
  '1. サーバー名「ぽん酢鯖」を右クリック → 「プライバシー設定」 → 「ダイレクトメッセージを許可する」をON\n' +
  '　（またはユーザー設定 → プライバシー・安全 → 「サーバーのメンバーからのダイレクトメッセージ」をON）\n' +
  '2. 設定後、下の「もう一度送る」ボタンを押してください。\n\n' +
  'DMが届くまで認証は完了しません（認証済みロールは付与されません）。';

/** 生成済みNDA記録PDFと、その検証用ハッシュ */
export interface NdaPdfBundle {
  buffer: Buffer;
  hash: string;
  filename: string;
}

/** チケット後処理の結果 */
export type TicketFinalizeResult = 'deleted' | 'moved' | 'kept' | 'skipped';

export class VerificationManager {
  private client: Client | null = null;
  private activeQuizzes = new Map<string, ActiveQuiz>();
  private ndaTokens = new Map<string, { appId: string; userId: string; guildId: string; expiresAt: number }>();

  initialize(client: Client): void {
    this.client = client;
  }

  async handleMemberJoin(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (!member.guild) return;

    const settings = await verificationRepo.getVerificationSettings(member.guild.id);
    if (!settings?.enabled) return;

    const bypassList = settings.bypassList ?? [];
    if (bypassList.includes(member.id)) {
      if (settings.verifiedRoleId) {
        const role = await member.guild.roles.fetch(settings.verifiedRoleId).catch(() => null);
        if (role) {
          await member.roles.add(role, 'バイパスリストによる自動認証');
          console.log(`[Verification] ${member.user.tag} はバイパスリストにより自動認証されました。`);
        }
      }
      return;
    }
  }

  async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'v') return;

    switch (parts[1]) {
      case 'start':
        await this.startQuiz(interaction);
        break;
      case 'q':
        await this.processQuizAnswer(interaction, parts[2], parseInt(parts[3]), parseInt(parts[4]));
        break;
      case 'form':
        await this.showFormModal(interaction, parts[2]);
        break;
      case 'a':
        await this.handleApprove(interaction, parts[2]);
        break;
      case 'r':
        await this.handleReject(interaction, parts[2]);
        break;
      case 'c':
        await this.handleArchiveOnly(interaction, parts[2]);
        break;
      case 'n':
        await this.handleNdaButton(interaction, parts[2]);
        break;
      case 'dm':
        await this.handleDmRetry(interaction, parts[2]);
        break;
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'v' || parts[1] !== 'f') return;

    await this.processFormSubmission(interaction, parts[2]);
  }

  private async startQuiz(interaction: ButtonInteraction<'cached'>): Promise<void> {
    const guildId = interaction.guild!.id;
    const userId = interaction.user.id;

    const settings = await verificationRepo.getVerificationSettings(guildId);
    if (!settings?.enabled) {
      await interaction.reply({ content: '認証システムが有効ではありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    if (!settings.questions || settings.questions.length === 0) {
      await interaction.reply({ content: 'クイズ問題が設定されていません。運営にお問い合わせください。', flags: MessageFlags.Ephemeral });
      return;
    }

    if (settings.verifiedRoleId && interaction.member?.roles.cache.has(settings.verifiedRoleId)) {
      await interaction.reply({ content: 'すでに認証済みです。', flags: MessageFlags.Ephemeral });
      return;
    }

    const existing = verificationRepo.getActiveApplicationByUser(guildId, userId);
    if (existing) {
      if (existing.status === 'quiz') {
        this.activeQuizzes.delete(userId);
        await verificationRepo.deleteApplication(existing.id);
      } else {
        await interaction.reply({ content: 'すでに申請中です。審査結果をお待ちください。', flags: MessageFlags.Ephemeral });
        return;
      }
    }

    const appId = randomUUID();
    const quizCount = Math.min(settings.quizPassCount ?? 3, settings.questions.length);
    const shuffled = [...settings.questions].sort(() => Math.random() - 0.5);
    const selectedQuestions = shuffled.slice(0, quizCount);

    const application: VerificationApplication = {
      id: appId,
      userId,
      guildId,
      displayName: '',
      activity: '',
      status: 'quiz',
      submittedAt: Date.now(),
    };

    await verificationRepo.setApplication(appId, application);

    this.activeQuizzes.set(userId, {
      applicationId: appId,
      questions: selectedQuestions,
      currentIndex: 0,
    });

    await this.sendQuizQuestion(interaction, selectedQuestions[0], 0, selectedQuestions.length, appId);
  }

  private async sendQuizQuestion(
    interaction: ButtonInteraction,
    question: VerificationQuestion,
    index: number,
    total: number,
    appId: string,
  ): Promise<void> {
    const embed = new CustomEmbed(interaction.user)
      .setTitle(`📝 ルールクイズ (${index + 1}/${total})`)
      .setDescription(question.question)
      .setColor(EMBED_COLORS.WARN);

    const buttons = question.options.map((option, optIdx) =>
      new ButtonBuilder()
        .setCustomId(`v_q_${appId}_${index}_${optIdx}`)
        .setLabel(option.length > 80 ? option.slice(0, 77) + '...' : option)
        .setStyle(ButtonStyle.Secondary),
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
    }
  }

  private async processQuizAnswer(
    interaction: ButtonInteraction,
    appId: string,
    questionIdx: number,
    selectedIdx: number,
  ): Promise<void> {
    const userId = interaction.user.id;
    const quiz = this.activeQuizzes.get(userId);

    if (!quiz || quiz.applicationId !== appId) {
      await interaction.reply({ content: 'セッションが無効です。もう一度お試しください。', flags: MessageFlags.Ephemeral });
      return;
    }

    const question = quiz.questions[questionIdx];
    if (!question) {
      await interaction.reply({ content: 'エラーが発生しました。', flags: MessageFlags.Ephemeral });
      this.activeQuizzes.delete(userId);
      return;
    }

    const isCorrect = selectedIdx === question.correctIndex;

    if (!isCorrect) {
      const embed = new CustomEmbed(interaction.user)
        .setTitle('❌ 不正解です')
        .setDescription(`正解は「**${question.options[question.correctIndex]}**」でした。\nもう一度挑戦してください。`)
        .setColor(EMBED_COLORS.ERROR);

      const retryButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('v_start').setLabel('もう一度挑戦する').setStyle(ButtonStyle.Primary),
      );

      await interaction.update({ embeds: [embed], components: [retryButton] });
      await verificationRepo.deleteApplication(appId);
      this.activeQuizzes.delete(userId);
      return;
    }

    const isLast = questionIdx >= quiz.questions.length - 1;

    if (isLast) {
      const embed = new CustomEmbed(interaction.user)
        .setTitle('✅ 全問正解！')
        .setDescription('ルールクイズをクリアしました。次は参加申請フォームに進んでください。')
        .setColor(EMBED_COLORS.SUCCESS);

      const formButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`v_form_${appId}`).setLabel('参加申請フォームを開く').setStyle(ButtonStyle.Success),
      );

      await interaction.update({ embeds: [embed], components: [formButton] });
      return;
    }

    const correctEmbed = new CustomEmbed(interaction.user)
      .setTitle('✅ 正解！')
      .setDescription('次の問題に進みます...')
      .setColor(EMBED_COLORS.SUCCESS);

    await interaction.update({ embeds: [correctEmbed], components: [] });

    quiz.currentIndex = questionIdx + 1;
    this.activeQuizzes.set(userId, quiz);

    await this.sendQuizQuestion(
      interaction,
      quiz.questions[quiz.currentIndex],
      quiz.currentIndex,
      quiz.questions.length,
      appId,
    );
  }

  private async showFormModal(interaction: ButtonInteraction, appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.userId !== interaction.user.id) {
      await interaction.reply({ content: '無効な申請です。', flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    const fields = settings?.formFields ?? DEFAULT_FORM_FIELDS;
    const formFields = fields.slice(0, 5);

    const modal = new ModalBuilder()
      .setCustomId(`v_f_${appId}`)
      .setTitle('参加申請フォーム');

    for (const field of formFields) {
      const input = new TextInputBuilder()
        .setCustomId(field.id)
        .setLabel(field.label)
        .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(field.required)
        .setMaxLength(field.maxLength);
      if (field.placeholder) input.setPlaceholder(field.placeholder);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }

    await interaction.showModal(modal);
  }

  private async processFormSubmission(interaction: ModalSubmitInteraction, appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.userId !== interaction.user.id) {
      await interaction.reply({ content: '無効な申請です。', flags: MessageFlags.Ephemeral });
      return;
    }

    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    const fields = settings?.formFields ?? DEFAULT_FORM_FIELDS;

    const formData: Record<string, string> = {};
    for (const field of fields.slice(0, 5)) {
      // モーダルを開いた後にフォーム項目が変更されると getTextInputValue が例外を投げるため、未入力扱いにする
      let value = '';
      try {
        value = interaction.fields.getTextInputValue(field.id);
      } catch {
        value = '';
      }
      if (value) formData[field.label] = value;
    }
    application.formData = formData;

    application.displayName = formData['表示名'] || interaction.user.username;
    const fieldValues = Object.values(formData);
    application.activity = formData['活動内容（何をしている人か）'] || fieldValues[1] || '';
    application.portfolio = formData['ポートフォリオのリンク（任意）'] || undefined;
    application.onlineHours = formData['おおよそのオンライン時間'] || undefined;
    application.note = formData['一言メッセージ（任意）'] || undefined;
    application.status = 'pending';
    application.submittedAt = Date.now();

    await verificationRepo.setApplication(appId, application);
    this.activeQuizzes.delete(interaction.user.id);

    await interaction.reply({
      content: '申請を送信しました。運営の審査をお待ちください。',
      flags: MessageFlags.Ephemeral,
    });

    await this.sendToReviewChannel(application);
  }

  private async sendToReviewChannel(application: VerificationApplication): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(application.guildId);
    if (!settings?.reviewChannelId) return;

    const channel = await this.client!.channels.fetch(settings.reviewChannelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    const member = await channel.guild.members.fetch(application.userId).catch(() => null);

    const embed = new CustomEmbed()
      .setTitle('📋 新しい参加申請')
      .setColor(EMBED_COLORS.WARN)
      .addFields(
        { name: '申請者', value: member ? `${member} (${member.user.tag})` : `<@${application.userId}>`, inline: true },
      );

    if (application.formData && Object.keys(application.formData).length > 0) {
      for (const [label, value] of Object.entries(application.formData)) {
        embed.addFields({ name: label, value: value || '未入力', inline: false });
      }
    } else {
      embed.addFields(
        { name: '表示名', value: application.displayName, inline: true },
        { name: '活動内容', value: application.activity, inline: false },
      );
      if (application.portfolio) {
        embed.addFields({ name: 'ポートフォリオ', value: application.portfolio, inline: false });
      }
      embed.addFields({ name: 'オンライン時間', value: application.onlineHours ?? '未入力', inline: true });
      if (application.note) {
        embed.addFields({ name: '一言メッセージ', value: application.note, inline: false });
      }
    }

    embed.addFields(
      { name: '申請日時', value: `<t:${Math.floor(application.submittedAt / 1000)}:F>`, inline: false },
    );

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`v_a_${application.id}`).setLabel('✅ 承認').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`v_r_${application.id}`).setLabel('❌ 却下（BAN）').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`v_c_${application.id}`).setLabel('📁 アーカイブのみ').setStyle(ButtonStyle.Secondary),
    );

    const staffRole = settings.staffRoleId ? `<@&${settings.staffRoleId}>` : '';
    await channel.send({ content: staffRole, embeds: [embed], components: [buttons] });

    console.log(`[Verification] ${member?.user.tag ?? application.userId} の参加申請を審査チャンネルに送信しました。`);
  }

  /** 管理者権限を持つメンバー、またはスタッフロール保持者のみ審査できる */
  private canReview(interaction: ButtonInteraction, settings: VerificationSettings | null | undefined): boolean {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (settings?.staffRoleId && interaction.member instanceof GuildMember) {
      return interaction.member.roles.cache.has(settings.staffRoleId);
    }
    return false;
  }

  private async handleApprove(interaction: ButtonInteraction, appId: string): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    if (!this.canReview(interaction, settings)) {
      await interaction.reply({ content: 'この操作を行う権限がありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'pending') {
      await interaction.reply({ content: '無効な申請、またはすでに処理済みです。', flags: MessageFlags.Ephemeral });
      return;
    }

    application.status = 'approved';
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = Date.now();
    await verificationRepo.setApplication(appId, application);

    await interaction.update({
      content: `✅ ${interaction.user} がこの申請を**承認**しました。`,
      components: [],
    });

    try {
      await this.createTicketChannel(application);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[Verification] チケットチャンネルの作成に失敗:', msg);
      await interaction.followUp({
        content: `⚠️ ${msg}\n解消後に \`/verification-bypass tickets-only\` で再試行できます。`,
        flags: MessageFlags.Ephemeral,
      }).catch(console.error);
    }

    await this.archiveApplication(application, 'approved');
  }

  private async handleReject(interaction: ButtonInteraction, appId: string): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    if (!this.canReview(interaction, settings)) {
      await interaction.reply({ content: 'この操作を行う権限がありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'pending') {
      await interaction.reply({ content: '無効な申請、またはすでに処理済みです。', flags: MessageFlags.Ephemeral });
      return;
    }

    application.status = 'rejected';
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = Date.now();
    await verificationRepo.setApplication(appId, application);

    await interaction.update({
      content: `❌ ${interaction.user} がこの申請を**却下**しました。`,
      components: [],
    });

    const guild = interaction.guild!;
    const member = await guild.members.fetch(application.userId).catch(() => null);
    if (member) {
      await member.ban({ reason: `参加申請却下 (審査員: ${interaction.user.tag})` }).catch(console.error);
      console.log(`[Verification] ${member.user.tag} を参加申請却下によりBANしました。`);
    }

    await this.archiveApplication(application, 'rejected');
  }

  private async handleArchiveOnly(interaction: ButtonInteraction, appId: string): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    if (!this.canReview(interaction, settings)) {
      await interaction.reply({ content: 'この操作を行う権限がありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'pending') {
      await interaction.reply({ content: '無効な申請、またはすでに処理済みです。', flags: MessageFlags.Ephemeral });
      return;
    }

    application.status = 'archived';
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = Date.now();
    await verificationRepo.setApplication(appId, application);

    await interaction.update({
      content: `📁 ${interaction.user} がこの申請を**アーカイブ**しました。`,
      components: [],
    });

    await this.archiveApplication(application, 'archived');
    console.log(`[Verification] ${application.userId} の申請をアーカイブのみで処理しました。`);
  }

  async createTicketChannel(application: VerificationApplication): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(application.guildId);
    if (!settings) return;

    const guild = await this.client!.guilds.fetch(application.guildId);
    const member = await guild.members.fetch(application.userId).catch(() => null);
    if (!member) return;

    const category = settings.ticketCategoryId
      ? await guild.channels.fetch(settings.ticketCategoryId).catch(() => null) as CategoryChannel | null
      : null;

    application.status = 'nda_pending';
    await verificationRepo.setApplication(application.id, application);

    const channelName = `ticket-${application.userId}`;

    let channel: TextChannel;
    try {
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: category ?? undefined,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: application.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          ...(settings.staffRoleId ? [{
            id: settings.staffRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          }] : []),
        ],
      });
    } catch (error: unknown) {
      // カテゴリのチャンネル数上限（50）などで失敗した場合、再試行できるようステータスを戻す
      application.status = 'approved';
      await verificationRepo.setApplication(application.id, application);
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`チケットチャンネルの作成に失敗しました（カテゴリのチャンネル数上限50に達している可能性があります）: ${msg}`);
    }

    application.ticketChannelId = channel.id;
    await verificationRepo.setApplication(application.id, application);

    const embed = new CustomEmbed(member.user)
      .setTitle('🎉 審査の結果、参加が承認されました！')
      .setDescription(
        `参加審査にご協力いただき、ありがとうございました！\n\n` +
        '参加を完了するには、**NDA（秘密保持契約）**に署名していただく必要があります。\n' +
        '下のボタンから署名用リンクを発行してください。わからない点がございましたら、このチャットにてご質問ください。',
      )
      .setColor(EMBED_COLORS.SUCCESS);

    const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`v_n_${application.id}`).setLabel('NDA署名用リンクを発行する').setStyle(ButtonStyle.Primary),
    );

    await channel.send({ content: `${member}`, embeds: [embed], components: [button] });

    console.log(`[Verification] ${member.user.tag} のチケットチャンネルを作成しました: #${channel.name}`);
  }

  private async handleNdaButton(interaction: ButtonInteraction, appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'nda_pending') {
      await interaction.reply({ content: '無効な申請です。', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.user.id !== application.userId) {
      await interaction.reply({ content: '申請者本人のみ操作できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    const ndaPublicUrl = process.env.NDA_PUBLIC_URL;
    if (!ndaPublicUrl) {
      await interaction.reply({ content: 'NDAページURLが設定されていません。運営にお問い合わせください。', flags: MessageFlags.Ephemeral });
      return;
    }

    const ndaToken = randomUUID();
    const expiresAt = Date.now() + NDA_TOKEN_EXPIRY_MS;
    application.ndaToken = ndaToken;
    application.ndaTokenExpiresAt = expiresAt;
    await verificationRepo.setApplication(appId, application);

    this.ndaTokens.set(ndaToken, {
      appId: application.id,
      userId: application.userId,
      guildId: application.guildId,
      expiresAt,
    });

    const ndaUrl = `${ndaPublicUrl.replace(/\/+$/, '')}/nda/${ndaToken}`;
    await interaction.reply({ content: `以下のリンクからNDA署名ページにアクセスしてください（1時間有効）:\n${ndaUrl}`, flags: MessageFlags.Ephemeral });
  }

  async completeNdaSigning(appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'nda_pending') return;

    application.status = 'completed';
    application.ndaSignedAt = Date.now();
    await verificationRepo.setApplication(appId, application);

    this.ndaTokens.delete(application.ndaToken ?? '');

    const guild = await this.client!.guilds.fetch(application.guildId);
    const member = await guild.members.fetch(application.userId).catch(() => null);

    let pdf: NdaPdfBundle | null = null;
    try {
      pdf = await this.buildNdaPdf(application);
    } catch (error) {
      console.error('[NDA] PDF生成エラー:', error);
    }

    if (!pdf) {
      // PDFが無いとDM送付もアーカイブもできないため、従来どおりロール付与のみ行いチケットは残す
      await this.completeVerification(application, guild, member, null);
      await this.archiveApplication(application, 'approved');
      console.log(`[Verification] ${member?.user.tag ?? application.userId} のNDA署名が完了しました（PDF生成に失敗）。`);
      return;
    }

    await this.postNdaArchiveRecord(application, pdf);
    await this.archiveApplication(application, 'approved');

    const delivered = member ? await this.sendNdaDm(member, application, pdf) : false;

    if (delivered) {
      await this.completeVerification(application, guild, member, pdf);
      console.log(`[Verification] ${member?.user.tag ?? application.userId} のNDA署名が完了し、認証されました。`);
      return;
    }

    const channel = await this.fetchTicketChannel(application, guild);
    if (channel) await this.postDmInstruction(application, channel);
    console.warn(
      `[Verification] ${member?.user.tag ?? application.userId} にNDA記録のDMを送付できなかったため、認証を保留しました。`,
    );
  }

  /** 「もう一度送る」ボタン: DM設定を直したユーザーがNDA記録DMを再送し、認証を完了させる */
  private async handleDmRetry(interaction: ButtonInteraction<'cached'>, appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application) {
      await interaction.reply({ content: '無効な申請です。', flags: MessageFlags.Ephemeral });
      return;
    }

    if (interaction.user.id !== application.userId) {
      await interaction.reply({ content: '申請者本人のみ操作できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    if (application.status !== 'completed') {
      await interaction.reply({ content: '無効な申請です。', flags: MessageFlags.Ephemeral });
      return;
    }

    if (application.ndaDmDelivered) {
      await interaction.reply({ content: 'この操作は不要です。', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const member = await guild.members.fetch(application.userId).catch(() => null);
    if (!member) {
      await interaction.editReply({ content: '❌ サーバー内でメンバー情報を取得できませんでした。運営にお問い合わせください。' });
      return;
    }

    let pdf: NdaPdfBundle;
    try {
      pdf = await this.buildNdaPdf(application);
    } catch (error) {
      console.error('[NDA] PDF生成エラー:', error);
      await interaction.editReply({ content: '❌ 署名記録PDFの生成に失敗しました。運営にお問い合わせください。' });
      return;
    }

    if (!application.ndaArchived) {
      await this.postNdaArchiveRecord(application, pdf);
    }

    const delivered = await this.sendNdaDm(member, application, pdf);
    if (!delivered) {
      await interaction.editReply({
        content: '❌ まだDMを受け取れない設定です。手順を確認してから、もう一度お試しください。',
      });
      return;
    }

    // チケットが削除される場合があるため、後処理より先に結果を返す
    await interaction.editReply({ content: '✅ DMを送信しました。認証が完了しました！' });
    await this.completeVerification(application, guild, member, pdf);
    console.log(`[Verification] ${member.user.tag} がDM再送により認証を完了しました。`);
  }

  /** NDA記録PDFを生成し、SHA-256ハッシュと添付ファイル名を添えて返す */
  async buildNdaPdf(application: VerificationApplication): Promise<NdaPdfBundle> {
    const signedAtMs = application.ndaSignedAt ?? Date.now();
    const signedAt = new Date(signedAtMs).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const buffer = await generateNdaPdf({
      displayName: application.displayName,
      userTag: application.ndaUserTag ?? '不明',
      discordId: application.userId,
      email: application.ndaEmail,
      ipAddress: application.ndaIpAddress ?? '不明',
      signedAt,
      fingerprint: application.ndaFingerprint,
    });

    const hash = createHash('sha256').update(buffer).digest('hex');
    const safeName = application.displayName.replace(/[^a-zA-Z0-9぀-ゟ゠-ヿ一-鿿]/g, '_');
    const filename = `NDA_${safeName}_${new Date(signedAtMs).toISOString().slice(0, 10)}.pdf`;

    return { buffer, hash, filename };
  }

  /** アーカイブチャンネルへNDA署名記録（PDF付き）を永久保存する */
  async postNdaArchiveRecord(application: VerificationApplication, pdf: NdaPdfBundle): Promise<boolean> {
    const settings = await verificationRepo.getVerificationSettings(application.guildId);
    if (!settings?.archiveChannelId) {
      console.warn('[NDA] アーカイブチャンネルが未設定のため、NDA署名記録を保存できませんでした。');
      return false;
    }

    const channel = await this.client!.channels.fetch(settings.archiveChannelId).catch(() => null) as TextChannel | null;
    if (!channel) {
      console.warn('[NDA] アーカイブチャンネルを取得できないため、NDA署名記録を保存できませんでした。');
      return false;
    }

    try {
      const guild = await this.client!.guilds.fetch(application.guildId);
      const member = await guild.members.fetch(application.userId).catch(() => null);
      const signedAtMs = application.ndaSignedAt ?? Date.now();

      const embed = new EmbedBuilder()
        .setTitle('📋 NDA署名記録')
        .setColor(EMBED_COLORS.SUCCESS)
        .addFields(
          {
            name: '署名者',
            value: member
              ? `${member} (${member.user.tag} / ${application.userId})`
              : `<@${application.userId}> (${application.ndaUserTag ?? '不明'} / ${application.userId})`,
            inline: false,
          },
          { name: '署名日時', value: `<t:${Math.floor(signedAtMs / 1000)}:F>`, inline: false },
          { name: 'PDFハッシュ (SHA-256)', value: `\`${pdf.hash}\``, inline: false },
        )
        .setTimestamp();

      if (application.ndaEmail) {
        embed.addFields({ name: 'メール', value: application.ndaEmail, inline: true });
      }
      embed.addFields({ name: 'IP', value: application.ndaIpAddress ?? '不明', inline: true });

      await channel.send({
        embeds: [embed],
        files: [new AttachmentBuilder(pdf.buffer, { name: pdf.filename })],
      });

      application.ndaArchived = true;
      await verificationRepo.setApplication(application.id, application);
      return true;
    } catch (error) {
      console.error('[NDA] NDA署名記録のアーカイブ投稿に失敗:', error);
      return false;
    }
  }

  /** 申請者本人へNDA記録PDFの控えをDMで送る */
  async sendNdaDm(
    member: GuildMember,
    application: VerificationApplication,
    pdf: NdaPdfBundle,
  ): Promise<boolean> {
    const signedAtMs = application.ndaSignedAt ?? Date.now();

    const embed = new EmbedBuilder()
      .setTitle('📋 NDA署名記録（控え）')
      .setDescription(
        'ぽん酢鯖のNDA（秘密保持契約）にご署名いただき、ありがとうございます。\n' +
        '添付のPDFは、あなたが署名したNDAの控えです。内容の証明に必要となる場合がありますので、大切に保管してください。',
      )
      .setColor(EMBED_COLORS.SUCCESS)
      .addFields(
        { name: '署名日時', value: `<t:${Math.floor(signedAtMs / 1000)}:F>`, inline: false },
        { name: 'PDFハッシュ (SHA-256)', value: `\`${pdf.hash}\``, inline: false },
      )
      .setTimestamp();

    try {
      await member.send({
        embeds: [embed],
        files: [new AttachmentBuilder(pdf.buffer, { name: pdf.filename })],
      });

      application.ndaDmDelivered = true;
      await verificationRepo.setApplication(application.id, application);
      return true;
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === 50007) {
        console.warn(`[NDA] ${member.user.tag} はDMを受け取れない設定のため、NDA記録を送付できませんでした。`);
      } else {
        console.error('[NDA] NDA記録のDM送信に失敗:', error);
      }

      application.ndaDmDelivered = false;
      await verificationRepo.setApplication(application.id, application);
      return false;
    }
  }

  /** DMが送れなかったときの案内（再送ボタン付き）をチケットへ投稿する */
  async postDmInstruction(application: VerificationApplication, channel: TextChannel): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ DMを送信できませんでした')
      .setDescription(DM_INSTRUCTION_TEXT)
      .setColor(EMBED_COLORS.WARN)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`v_dm_${application.id}`).setLabel('もう一度送る').setStyle(ButtonStyle.Primary),
    );

    await channel.send({ content: `<@${application.userId}>`, embeds: [embed], components: [row] });
  }

  /** ロール付与・ウェルカム通知・チケット完了通知・チケット後処理（DM送付成功後にのみ呼ぶ） */
  private async completeVerification(
    application: VerificationApplication,
    guild: Guild,
    member: GuildMember | null,
    pdf: NdaPdfBundle | null,
  ): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(application.guildId);

    if (member && settings?.verifiedRoleId) {
      const role = await guild.roles.fetch(settings.verifiedRoleId).catch(() => null);
      if (role) {
        await member.roles.add(role, 'NDA署名完了による認証').catch((e: unknown) => {
          console.error('[Verification] 認証済みロールの付与に失敗しました:', e);
        });
      }
    }

    await this.sendWelcomeMessage(application, guild, member);

    const mention = member ? `${member}` : `<@${application.userId}>`;
    const channel = await this.fetchTicketChannel(application, guild);

    if (channel) {
      const embed = pdf
        ? new EmbedBuilder()
          .setTitle('✅ NDA署名が完了しました')
          .setDescription(
            `${mention} さんの参加処理が完了しました。\n` +
            '署名記録PDFはDMでお送りしましたので、大切に保管してください。',
          )
          .setColor(EMBED_COLORS.SUCCESS)
          .addFields({ name: 'PDFハッシュ (SHA-256)', value: `\`${pdf.hash}\`` })
          .setTimestamp()
        : new EmbedBuilder()
          .setTitle('✅ NDA署名が完了しました')
          .setDescription(`${mention} さんの参加処理は完了しましたが、PDF生成に失敗しました。`)
          .setColor(EMBED_COLORS.WARN)
          .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(console.error);
      await channel.permissionOverwrites.edit(application.userId, {
        ViewChannel: true,
        SendMessages: false,
      }).catch(console.error);
    }

    // PDFが生成できなかった場合は記録が残らないため、チケットは削除・移動せず残す
    if (pdf) {
      await this.finalizeTicket(application, guild).catch((e: unknown) => {
        console.error('[Verification] チケットの後処理に失敗しました:', e);
      });
    }
  }

  /** ウェルカムチャンネルへ参加通知を送る */
  private async sendWelcomeMessage(
    application: VerificationApplication,
    guild: Guild,
    member: GuildMember | null,
  ): Promise<void> {
    const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
    const introChannelId = process.env.INTRO_CHANNEL_ID;
    if (!welcomeChannelId) return;

    const welcomeChannel = await guild.channels.fetch(welcomeChannelId).catch(() => null) as TextChannel | null;
    if (!welcomeChannel) return;

    const fetchedMember = member ?? await guild.members.fetch(application.userId).catch(() => null);
    await guild.members.fetch({ withPresences: false });
    const memberCount = guild.members.cache.filter(m => !m.user.bot).size;
    const user = fetchedMember?.user ?? (await this.client!.users.fetch(application.userId).catch(() => null));
    const displayName = `<@${application.userId}>`;

    const welcomeEmbed = new CustomEmbed(user ?? undefined)
      .setTitle('🎉 新しいメンバーが参加しました！')
      .setDescription(
        `${displayName} さん、ぽん酢鯖へようこそ！\n` +
        `現在のサーバー人数: **${memberCount}人**` +
        (introChannelId ? `\n<#${introChannelId}> で自己紹介をしてみましょう！` : ''),
      )
      .setThumbnail(user?.displayAvatarURL() ?? null)
      .setColor(EMBED_COLORS.SUCCESS);

    try {
      const welcomeMessage = await welcomeChannel.send({ embeds: [welcomeEmbed] });
      await miscRepo.setWelcomeMessageId(application.userId, welcomeMessage.id, welcomeChannel.id);
    } catch (e) {
      console.error('[Verification] ウェルカムメッセージの送信に失敗しました:', e);
    }
  }

  /** 申請に紐づくチケットチャンネルを取得する */
  async fetchTicketChannel(application: VerificationApplication, guild: Guild): Promise<TextChannel | null> {
    if (!application.ticketChannelId) return null;
    return await guild.channels.fetch(application.ticketChannelId).catch(() => null) as TextChannel | null;
  }

  /** チケット内の人間（Bot以外）の発言数を数える */
  async countHumanMessages(channel: TextChannel): Promise<number> {
    let count = 0;
    let before: string | undefined;

    for (;;) {
      const batch = await channel.messages.fetch(before ? { limit: 100, before } : { limit: 100 });
      if (batch.size === 0) break;
      for (const message of batch.values()) {
        if (!message.author.bot) count++;
      }
      before = batch.last()?.id;
      if (batch.size < 100 || !before) break;
    }

    return count;
  }

  /** チケットに対して実行される後処理の内容を、実行せずに調べる */
  async previewTicketFinalization(
    application: VerificationApplication,
    guild: Guild,
  ): Promise<{ action: TicketFinalizeResult; categoryName?: string }> {
    const channel = await this.fetchTicketChannel(application, guild);
    if (!channel) return { action: 'skipped' };

    const humanMessages = await this.countHumanMessages(channel);
    if (humanMessages === 0) return { action: 'deleted' };

    const settings = await verificationRepo.getVerificationSettings(guild.id);
    const archiveIds = settings?.ticketArchiveCategoryIds ?? [];
    if (channel.parentId && archiveIds.includes(channel.parentId)) {
      return { action: 'kept', categoryName: channel.parent?.name };
    }

    for (const id of archiveIds) {
      const category = guild.channels.cache.get(id);
      if (!category || category.type !== ChannelType.GuildCategory) continue;
      if (guild.channels.cache.filter(c => c.parentId === category.id).size < CATEGORY_CHANNEL_LIMIT) {
        return { action: 'moved', categoryName: category.name };
      }
    }

    return { action: 'moved', categoryName: '（新規カテゴリを作成）' };
  }

  /**
   * NDA署名完了後のチケット後処理。
   * 会話がなければ削除し、会話があればアーカイブ用カテゴリへ移動して読み取り専用にする。
   */
  async finalizeTicket(application: VerificationApplication, guild: Guild): Promise<TicketFinalizeResult> {
    const channel = await this.fetchTicketChannel(application, guild);

    if (!channel) {
      application.ticketFinalized = true;
      await verificationRepo.setApplication(application.id, application);
      return 'skipped';
    }

    const humanMessages = await this.countHumanMessages(channel);

    if (humanMessages === 0) {
      await channel.delete('NDA署名完了・会話なしのため削除');
      application.ticketChannelId = undefined;
      application.ticketFinalized = true;
      await verificationRepo.setApplication(application.id, application);
      console.log(`[Verification] チケット #${channel.name} を削除しました（会話なし）。`);
      return 'deleted';
    }

    const settings = await verificationRepo.getVerificationSettings(guild.id);
    const archiveIds = settings?.ticketArchiveCategoryIds ?? [];
    const alreadyArchived = !!channel.parentId && archiveIds.includes(channel.parentId);

    let moveFailed = false;
    if (!alreadyArchived) {
      const category = await this.resolveTicketArchiveCategory(guild);
      if (category) {
        await channel.setParent(category, { lockPermissions: false });
        console.log(`[Verification] チケット #${channel.name} を ${category.name} へ移動しました（発言 ${humanMessages}件）。`);
      } else {
        moveFailed = true;
        console.warn(`[Verification] チケット #${channel.name} の移動先カテゴリを用意できませんでした。`);
      }
    } else {
      console.log(`[Verification] チケット #${channel.name} はすでにアーカイブカテゴリ内のため移動しませんでした。`);
    }

    await channel.permissionOverwrites.edit(application.userId, {
      ViewChannel: true,
      SendMessages: false,
    }).catch(console.error);

    // 移動先を用意できなかった場合は未完了のままにして、後から再実行できるようにする
    if (moveFailed) return 'skipped';

    application.ticketFinalized = true;
    await verificationRepo.setApplication(application.id, application);
    return alreadyArchived ? 'kept' : 'moved';
  }

  /**
   * 空きのあるアーカイブ用カテゴリを返す。存在しない場合は新規作成し設定へ登録する。
   * 併せて、削除済みカテゴリのIDを設定から取り除く。
   */
  private async resolveTicketArchiveCategory(guild: Guild): Promise<CategoryChannel | null> {
    const settings = (await verificationRepo.getVerificationSettings(guild.id)) ?? {};
    const configuredIds = settings.ticketArchiveCategoryIds ?? [];

    const aliveIds: string[] = [];
    const aliveCategories: CategoryChannel[] = [];
    for (const id of configuredIds) {
      const channel = await guild.channels.fetch(id).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildCategory) continue;
      aliveIds.push(id);
      aliveCategories.push(channel);
    }

    let target = aliveCategories.find(
      category => guild.channels.cache.filter(c => c.parentId === category.id).size < CATEGORY_CHANNEL_LIMIT,
    ) ?? null;

    if (!target) {
      const template = aliveCategories.at(-1) ?? null;
      const name = this.nextArchiveCategoryName(template?.name ?? null, configuredIds.length + 1);
      const permissionOverwrites = template
        ? template.permissionOverwrites.cache.map(overwrite => ({
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield,
        }))
        : [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          ...(settings.staffRoleId ? [{ id: settings.staffRoleId, allow: [PermissionFlagsBits.ViewChannel] }] : []),
        ];

      try {
        target = await guild.channels.create({
          name,
          type: ChannelType.GuildCategory,
          permissionOverwrites,
        });
        aliveIds.push(target.id);
        console.log(`[Verification] アーカイブ用カテゴリ「${name}」を作成しました。`);
      } catch (error) {
        console.error('[Verification] アーカイブ用カテゴリの作成に失敗しました:', error);
        target = null;
      }
    }

    if (aliveIds.length !== configuredIds.length || aliveIds.some((id, i) => id !== configuredIds[i])) {
      settings.ticketArchiveCategoryIds = aliveIds;
      await verificationRepo.setVerificationSettings(guild.id, settings);
    }

    return target;
  }

  /** 直近のアーカイブカテゴリ名から次の名前を作る（末尾の丸数字をインクリメント） */
  private nextArchiveCategoryName(lastName: string | null, fallbackIndex: number): string {
    if (!lastName) return `ticket-archive-${fallbackIndex}`;

    const lastChar = [...lastName].at(-1) ?? '';
    const code = lastChar.codePointAt(0) ?? 0;

    // ①(U+2460) 〜 ⑳(U+2473)
    if (code >= 0x2460 && code < 0x2473) {
      return lastName.slice(0, -1) + String.fromCodePoint(code + 1);
    }
    if (code === 0x2473) return `ticket-archive-${fallbackIndex}`;

    return `${lastName}②`;
  }

  getNdaTokenInfo(token: string): { appId: string; userId: string; guildId: string } | undefined {
    const info = this.ndaTokens.get(token);
    if (info && info.expiresAt >= Date.now()) {
      return { appId: info.appId, userId: info.userId, guildId: info.guildId };
    }
    if (info) this.ndaTokens.delete(token);

    // 再起動などでメモリ上のトークンが失われた場合の永続化フォールバック。
    // 有効期限が保存されており、かつ期限内のときのみ有効とする（期限切れはボタンから再発行してもらう）。
    const application = verificationRepo.getApplicationByNdaToken(token);
    if (
      application &&
      application.status === 'nda_pending' &&
      typeof application.ndaTokenExpiresAt === 'number' &&
      application.ndaTokenExpiresAt >= Date.now()
    ) {
      return { appId: application.id, userId: application.userId, guildId: application.guildId };
    }
    return undefined;
  }

  consumeNdaToken(token: string): { appId: string; userId: string; guildId: string } | undefined {
    const info = this.getNdaTokenInfo(token);
    if (!info) return undefined;
    this.ndaTokens.delete(token);
    return info;
  }

  async resetUserApplication(guildId: string, userId: string): Promise<{ deletedApps: number; closedTickets: string[] }> {
    this.activeQuizzes.delete(userId);

    const tokenEntries = [...this.ndaTokens.entries()];
    for (const [token, info] of tokenEntries) {
      if (info.userId === userId && info.guildId === guildId) {
        this.ndaTokens.delete(token);
      }
    }

    const applications = verificationRepo.getApplicationsByUser(guildId, userId);
    const active = applications.filter(a => !isInactiveStatus(a.status));

    const closedTickets: string[] = [];
    for (const app of active) {
      if (app.ticketChannelId) {
        try {
          const guild = await this.client!.guilds.fetch(guildId);
          const channel = await guild.channels.fetch(app.ticketChannelId).catch(() => null) as TextChannel | null;
          if (channel) {
            await channel.delete('申請リセットによりチケットを削除');
            closedTickets.push(app.ticketChannelId);
          }
        } catch {
          // channel already gone
        }
      }
      await verificationRepo.deleteApplication(app.id);
    }

    return { deletedApps: active.length, closedTickets };
  }

  private async archiveApplication(
    application: VerificationApplication,
    outcome: 'approved' | 'rejected' | 'archived',
  ): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(application.guildId);
    if (!settings?.archiveChannelId) return;

    const channel = await this.client!.channels.fetch(settings.archiveChannelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    const guild = await this.client!.guilds.fetch(application.guildId);
    const member = await guild.members.fetch(application.userId).catch(() => null);
    const reviewer = application.reviewedBy
      ? await guild.members.fetch(application.reviewedBy).catch(() => null)
      : null;

    const outcomeLabel = {
      approved: { emoji: '✅', text: '承認', color: EMBED_COLORS.SUCCESS },
      rejected: { emoji: '❌', text: '却下', color: EMBED_COLORS.ERROR },
      archived: { emoji: '📁', text: 'アーカイブ', color: EMBED_COLORS.NEUTRAL },
    }[outcome];

    const embed = new CustomEmbed()
      .setTitle(`${outcomeLabel.emoji} 参加申請アーカイブ [${outcomeLabel.text}]`)
      .setColor(outcomeLabel.color)
      .addFields(
        { name: '申請者', value: member ? `${member.user.tag} (${member.id})` : application.userId, inline: true },
      );

    if (application.formData && Object.keys(application.formData).length > 0) {
      for (const [label, value] of Object.entries(application.formData)) {
        embed.addFields({ name: label, value: value || '未入力', inline: false });
      }
    } else {
      embed.addFields(
        { name: '表示名', value: application.displayName, inline: true },
        { name: '活動内容', value: application.activity, inline: false },
      );
      if (application.portfolio) {
        embed.addFields({ name: 'ポートフォリオ', value: application.portfolio, inline: false });
      }
      embed.addFields({ name: 'オンライン時間', value: application.onlineHours ?? '未入力', inline: true });
      if (application.note) {
        embed.addFields({ name: '一言', value: application.note, inline: false });
      }
    }

    embed.addFields(
      { name: '申請日時', value: `<t:${Math.floor(application.submittedAt / 1000)}:F>`, inline: true },
      { name: '審査員', value: reviewer ? `${reviewer.user.tag}` : 'N/A', inline: true },
      { name: '審査日時', value: application.reviewedAt ? `<t:${Math.floor(application.reviewedAt / 1000)}:F>` : 'N/A', inline: true },
    );

    if (outcome === 'approved' && application.ndaSignedAt) {
      embed.addFields({ name: 'NDA署名日時', value: `<t:${Math.floor(application.ndaSignedAt / 1000)}:F>`, inline: true });
    }

    await channel.send({ embeds: [embed] });
  }
}

export const verificationManager = new VerificationManager();
