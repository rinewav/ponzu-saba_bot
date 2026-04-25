import { randomUUID, createHash } from 'node:crypto';
import {
  type Client,
  GuildMember,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type CategoryChannel,
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
} from 'discord.js';
import { verificationRepo, miscRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';
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
    }
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'v' || parts[1] !== 'f') return;

    await this.processFormSubmission(interaction, parts[2]);
  }

  private async startQuiz(interaction: ButtonInteraction): Promise<void> {
    const guildId = interaction.guild!.id;
    const userId = interaction.user.id;

    const settings = await verificationRepo.getVerificationSettings(guildId);
    if (!settings?.enabled) {
      await interaction.reply({ content: '認証システムが有効ではありません。', ephemeral: true });
      return;
    }

    if (!settings.questions || settings.questions.length === 0) {
      await interaction.reply({ content: 'クイズ問題が設定されていません。運営にお問い合わせください。', ephemeral: true });
      return;
    }

    if (settings.verifiedRoleId && interaction.member) {
      const memberRoles = interaction.member.roles;
      if (memberRoles instanceof Map && memberRoles.has(settings.verifiedRoleId)) {
        await interaction.reply({ content: 'すでに認証済みです。', ephemeral: true });
        return;
      }
    }

    const existing = verificationRepo.getActiveApplicationByUser(guildId, userId);
    if (existing) {
      if (existing.status === 'quiz') {
        this.activeQuizzes.delete(userId);
        await verificationRepo.deleteApplication(existing.id);
      } else {
        await interaction.reply({ content: 'すでに申請中です。承認をお待ちください。', ephemeral: true });
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
      .setColor(0xFFAA00);

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
      await interaction.followUp({ embeds: [embed], components: rows, ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
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
      await interaction.reply({ content: 'セッションが無効です。もう一度お試しください。', ephemeral: true });
      return;
    }

    const question = quiz.questions[questionIdx];
    if (!question) {
      await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
      this.activeQuizzes.delete(userId);
      return;
    }

    const isCorrect = selectedIdx === question.correctIndex;

    if (!isCorrect) {
      const embed = new CustomEmbed(interaction.user)
        .setTitle('❌ 不正解です')
        .setDescription(`正解は「**${question.options[question.correctIndex]}**」でした。\nもう一度挑戦してください。`)
        .setColor(0xFF0000);

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
        .setColor(0x00FF00);

      const formButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`v_form_${appId}`).setLabel('参加申請フォームを開く').setStyle(ButtonStyle.Success),
      );

      await interaction.update({ embeds: [embed], components: [formButton] });
      return;
    }

    const correctEmbed = new CustomEmbed(interaction.user)
      .setTitle('✅ 正解！')
      .setDescription('次の問題に進みます...')
      .setColor(0x00FF00);

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
      await interaction.reply({ content: '無効な申請です。', ephemeral: true });
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
      await interaction.reply({ content: '無効な申請です。', ephemeral: true });
      return;
    }

    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    const fields = settings?.formFields ?? DEFAULT_FORM_FIELDS;

    const formData: Record<string, string> = {};
    for (const field of fields.slice(0, 5)) {
      const value = interaction.fields.getTextInputValue(field.id);
      if (value) formData[field.label] = value;
    }
    application.formData = formData;

    application.displayName = formData['表示名'] || formData[fields[0]?.label] || interaction.user.username;
    application.activity = formData['活動内容（何をしている人か）'] || formData[fields[1]?.label] || '';
    application.portfolio = formData['ポートフォリオのリンク（任意）'] || undefined;
    application.onlineHours = formData['おおよそのオンライン時間'] || undefined;
    application.note = formData['一言メッセージ（任意）'] || undefined;
    application.status = 'pending';
    application.submittedAt = Date.now();

    await verificationRepo.setApplication(appId, application);
    this.activeQuizzes.delete(interaction.user.id);

    await interaction.reply({
      content: '申請を送信しました。運営のレビューをお待ちください。',
      ephemeral: true,
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
      .setColor(0xFFAA00)
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

    console.log(`[Verification] ${member?.user.tag ?? application.userId} の参加申請をレビューチャンネルに送信しました。`);
  }

  private async handleApprove(interaction: ButtonInteraction, appId: string): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    if (!settings?.staffRoleId || !(interaction.member instanceof GuildMember) || !interaction.member.roles.cache.has(settings.staffRoleId)) {
      await interaction.reply({ content: 'この操作を行う権限がありません。', ephemeral: true });
      return;
    }

    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'pending') {
      await interaction.reply({ content: '無効な申請、またはすでに処理済みです。', ephemeral: true });
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

    await this.createTicketChannel(application);
    await this.archiveApplication(application, true);
  }

  private async handleReject(interaction: ButtonInteraction, appId: string): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    if (!settings?.staffRoleId || !(interaction.member instanceof GuildMember) || !interaction.member.roles.cache.has(settings.staffRoleId)) {
      await interaction.reply({ content: 'この操作を行う権限がありません。', ephemeral: true });
      return;
    }

    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'pending') {
      await interaction.reply({ content: '無効な申請、またはすでに処理済みです。', ephemeral: true });
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

    await this.archiveApplication(application, false);
  }

  private async handleArchiveOnly(interaction: ButtonInteraction, appId: string): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(interaction.guild!.id);
    if (!settings?.staffRoleId || !(interaction.member instanceof GuildMember) || !interaction.member.roles.cache.has(settings.staffRoleId)) {
      await interaction.reply({ content: 'この操作を行う権限がありません。', ephemeral: true });
      return;
    }

    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'pending') {
      await interaction.reply({ content: '無効な申請、またはすでに処理済みです。', ephemeral: true });
      return;
    }

    application.status = 'rejected';
    application.reviewedBy = interaction.user.id;
    application.reviewedAt = Date.now();
    await verificationRepo.setApplication(appId, application);

    await interaction.update({
      content: `📁 ${interaction.user} がこの申請を**アーカイブ**しました。`,
      components: [],
    });

    await this.archiveApplication(application, false);
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

    const channel = await guild.channels.create({
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

    application.ticketChannelId = channel.id;
    await verificationRepo.setApplication(application.id, application);

    const embed = new CustomEmbed(member.user)
      .setTitle('🎉 審査の結果、参加が承認されました！')
      .setDescription(
        `参加審査にご協力いただき、ありがとうございました！\n\n` +
        '参加を完了するには、**NDA（秘密保持契約）**に署名していただく必要があります。\n' +
        '下のボタンから署名用リンクを発行してください。わからない点がございましたら、このチャットにてご質問ください。',
      )
      .setColor(0x00FF00);

    const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`v_n_${application.id}`).setLabel('NDA署名用リンクを発行する').setStyle(ButtonStyle.Primary),
    );

    await channel.send({ content: `${member}`, embeds: [embed], components: [button] });

    console.log(`[Verification] ${member.user.tag} のチケットチャンネルを作成しました: #${channel.name}`);
  }

  private async handleNdaButton(interaction: ButtonInteraction, appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'nda_pending') {
      await interaction.reply({ content: '無効な申請です。', ephemeral: true });
      return;
    }

    const ndaPublicUrl = process.env.NDA_PUBLIC_URL;
    if (!ndaPublicUrl) {
      await interaction.reply({ content: 'NDAページURLが設定されていません。運営にお問い合わせください。', ephemeral: true });
      return;
    }

    const ndaToken = randomUUID();
    application.ndaToken = ndaToken;
    await verificationRepo.setApplication(appId, application);

    this.ndaTokens.set(ndaToken, {
      appId: application.id,
      userId: application.userId,
      guildId: application.guildId,
      expiresAt: Date.now() + NDA_TOKEN_EXPIRY_MS,
    });

    const ndaUrl = `${ndaPublicUrl.replace(/\/+$/, '')}/nda/${ndaToken}`;
    await interaction.reply({ content: `以下のリンクからNDA署名ページにアクセスしてください（1時間有効）:\n${ndaUrl}`, ephemeral: true });
  }

  async completeNdaSigning(appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.status !== 'nda_pending') return;

    application.status = 'completed';
    application.ndaSignedAt = Date.now();
    await verificationRepo.setApplication(appId, application);

    const guild = await this.client!.guilds.fetch(application.guildId);
    const member = await guild.members.fetch(application.userId).catch(() => null);
    const settings = await verificationRepo.getVerificationSettings(application.guildId);

    if (member && settings?.verifiedRoleId) {
      const role = await guild.roles.fetch(settings.verifiedRoleId).catch(() => null);
      if (role) {
        await member.roles.add(role, 'NDA署名完了による認証');
      }
    }

    if (application.ticketChannelId) {
      const channel = await guild.channels.fetch(application.ticketChannelId).catch(() => null) as TextChannel | null;
      if (channel) {
        const signedAt = new Date(application.ndaSignedAt!).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

        try {
          const pdfBuffer = await generateNdaPdf({
            displayName: application.displayName,
            userTag: application.ndaUserTag ?? '不明',
            discordId: application.userId,
            email: application.ndaEmail,
            ipAddress: application.ndaIpAddress ?? '不明',
            signedAt,
            fingerprint: application.ndaFingerprint,
          });

          const hash = createHash('sha256').update(pdfBuffer).digest('hex');
          const filename = `NDA_${application.displayName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_')}_${new Date(application.ndaSignedAt!).toISOString().slice(0, 10)}.pdf`;
          const attachment = new AttachmentBuilder(pdfBuffer, { name: filename });

          const embed = new EmbedBuilder()
            .setTitle('✅ NDA署名が完了しました')
            .setDescription(`${member} さんの参加処理が完了しました。\n署名記録PDFを添付しています。大切に保管してください。`)
            .setColor(0x00FF00)
            .addFields({ name: 'PDFハッシュ (SHA-256)', value: `\`${hash}\`` })
            .setTimestamp();

          await channel.send({ embeds: [embed], files: [attachment] });
        } catch (error) {
          console.error('[NDA] PDF生成エラー:', error);
          const fallbackEmbed = new EmbedBuilder()
            .setTitle('✅ NDA署名が完了しました')
            .setDescription(`${member} さんの参加処理は完了しましたが、PDF生成に失敗しました。`)
            .setColor(0xFFAA00)
            .setTimestamp();
          await channel.send({ embeds: [fallbackEmbed] });
        }

        await channel.permissionOverwrites.edit(application.userId, {
          ViewChannel: true,
          SendMessages: false,
        });
      }
    }

    this.ndaTokens.delete(application.ndaToken ?? '');
    await this.archiveApplication(application, true);

    if (member) {
      const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
      const introChannelId = process.env.INTRO_CHANNEL_ID;
      if (welcomeChannelId) {
        const welcomeChannel = await guild.channels.fetch(welcomeChannelId).catch(() => null) as TextChannel | null;
        if (welcomeChannel) {
          await guild.members.fetch({ withPresences: false });
          const memberCount = guild.members.cache.filter(m => !m.user.bot).size;
          const welcomeEmbed = new CustomEmbed(member.user)
            .setTitle('🎉 新しいメンバーが参加しました！')
            .setDescription(
              `${member} さん、ぽん酢鯖へようこそ！\n` +
              `現在のサーバー人数: **${memberCount}人**` +
              (introChannelId ? `\n<#${introChannelId}> で自己紹介をしてみましょう！` : ''),
            )
            .setThumbnail(member.user.displayAvatarURL())
            .setColor(0x00FF00);

          const welcomeMessage = await welcomeChannel.send({ embeds: [welcomeEmbed] });
          await miscRepo.setWelcomeMessageId(member.id, welcomeMessage.id);
        }
      }
    }

    console.log(`[Verification] ${member?.user.tag ?? application.userId} のNDA署名が完了し、認証されました。`);
  }

  getNdaTokenInfo(token: string): { appId: string; userId: string; guildId: string } | undefined {
    const info = this.ndaTokens.get(token);
    if (info && info.expiresAt >= Date.now()) {
      return { appId: info.appId, userId: info.userId, guildId: info.guildId };
    }
    if (info) this.ndaTokens.delete(token);

    const application = verificationRepo.getApplicationByNdaToken(token);
    if (application && application.status === 'nda_pending') {
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
    const active = applications.filter(a => a.status !== 'rejected' && a.status !== 'completed');

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

  private async archiveApplication(application: VerificationApplication, approved: boolean): Promise<void> {
    const settings = await verificationRepo.getVerificationSettings(application.guildId);
    if (!settings?.archiveChannelId) return;

    const channel = await this.client!.channels.fetch(settings.archiveChannelId).catch(() => null) as TextChannel | null;
    if (!channel) return;

    const guild = await this.client!.guilds.fetch(application.guildId);
    const member = await guild.members.fetch(application.userId).catch(() => null);
    const reviewer = application.reviewedBy
      ? await guild.members.fetch(application.reviewedBy).catch(() => null)
      : null;

    const statusEmoji = approved ? '✅' : '❌';
    const statusText = approved ? '承認' : '却下';

    const embed = new CustomEmbed()
      .setTitle(`${statusEmoji} 参加申請アーカイブ [${statusText}]`)
      .setColor(approved ? 0x00FF00 : 0xFF0000)
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

    if (approved && application.ndaSignedAt) {
      embed.addFields({ name: 'NDA署名日時', value: `<t:${Math.floor(application.ndaSignedAt / 1000)}:F>`, inline: true });
    }

    await channel.send({ embeds: [embed] });
  }
}

export const verificationManager = new VerificationManager();
