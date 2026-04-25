import { randomUUID } from 'node:crypto';
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
import { verificationRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';
import type { VerificationApplication, VerificationQuestion, VerificationSettings } from '../types/index.js';

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
      await interaction.reply({ content: 'すでに申請中です。承認をお待ちください。', ephemeral: true });
      return;
    }

    if (this.activeQuizzes.has(userId)) {
      await interaction.reply({ content: 'すでにクイズ進行中です。現在の質問にお答えください。', ephemeral: true });
      return;
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

    const modal = new ModalBuilder()
      .setCustomId(`v_f_${appId}`)
      .setTitle('参加申請フォーム');

    const nameInput = new TextInputBuilder()
      .setCustomId('display_name')
      .setLabel('表示名')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const activityInput = new TextInputBuilder()
      .setCustomId('activity')
      .setLabel('活動内容（何をしている人か）')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    const portfolioInput = new TextInputBuilder()
      .setCustomId('portfolio')
      .setLabel('ポートフォリオのリンク（任意）')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(500);

    const onlineHoursInput = new TextInputBuilder()
      .setCustomId('online_hours')
      .setLabel('おおよそのオンライン時間')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const noteInput = new TextInputBuilder()
      .setCustomId('note')
      .setLabel('一言メッセージ（任意）')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(activityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(portfolioInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(onlineHoursInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(noteInput),
    );

    await interaction.showModal(modal);
  }

  private async processFormSubmission(interaction: ModalSubmitInteraction, appId: string): Promise<void> {
    const application = verificationRepo.getApplication(appId);
    if (!application || application.userId !== interaction.user.id) {
      await interaction.reply({ content: '無効な申請です。', ephemeral: true });
      return;
    }

    const displayName = interaction.fields.getTextInputValue('display_name');
    const activity = interaction.fields.getTextInputValue('activity');
    const portfolio = interaction.fields.getTextInputValue('portfolio') || undefined;
    const onlineHours = interaction.fields.getTextInputValue('online_hours');
    const note = interaction.fields.getTextInputValue('note') || undefined;

    application.displayName = displayName;
    application.activity = activity;
    application.portfolio = portfolio;
    application.onlineHours = onlineHours;
    application.note = note;
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
        { name: '表示名', value: application.displayName, inline: true },
        { name: '活動内容', value: application.activity, inline: false },
      );

    if (application.portfolio) {
      embed.addFields({ name: 'ポートフォリオ', value: application.portfolio, inline: false });
    }

    embed.addFields(
      { name: 'オンライン時間', value: application.onlineHours ?? '未入力', inline: true },
    );

    if (application.note) {
      embed.addFields({ name: '一言メッセージ', value: application.note, inline: false });
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

  private async createTicketChannel(application: VerificationApplication): Promise<void> {
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

    const channelName = `ticket-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

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
        const ndaFileContent = this.generateNdaFile(application, signedAt);
        const filename = `NDA_${application.displayName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_')}_${new Date(application.ndaSignedAt!).toISOString().slice(0, 10)}.txt`;
        const attachment = new AttachmentBuilder(Buffer.from(ndaFileContent, 'utf-8'), { name: filename });

        const embed = new EmbedBuilder()
          .setTitle('✅ NDA署名が完了しました')
          .setDescription(`${member} さんの参加処理が完了しました。\n署名記録ファイルを添付しています。大切に保管してください。`)
          .setColor(0x00FF00)
          .setTimestamp();

        await channel.send({ embeds: [embed], files: [attachment] });

        await channel.permissionOverwrites.edit(application.userId, {
          ViewChannel: true,
          SendMessages: false,
        });
      }
    }

    this.ndaTokens.delete(application.ndaToken ?? '');
    await this.archiveApplication(application, true);

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
        { name: '表示名', value: application.displayName, inline: true },
        { name: '活動内容', value: application.activity, inline: false },
      );

    if (application.portfolio) {
      embed.addFields({ name: 'ポートフォリオ', value: application.portfolio, inline: false });
    }

    embed.addFields(
      { name: 'オンライン時間', value: application.onlineHours ?? '未入力', inline: true },
    );

    if (application.note) {
      embed.addFields({ name: '一言', value: application.note, inline: false });
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
  private generateNdaFile(application: VerificationApplication, signedAt: string): string {
    const ndaText = `【秘密保持契約（NDA）】

「ぽん酢鯖」運営代表 きる山ぽぽ美（以下「甲」という）と、ぽん酢鯖への参加を希望する者（以下「乙」という）は、クリエイターズコミュニティ「ぽん酢鯖」（以下「本サーバー」という）の利用にあたり、以下の通り秘密保持に関する同意書（以下「本契約」という）を締結します。
第1条（秘密情報）
本契約において「秘密情報」とは、本サーバー内で甲または他の参加者が開示・共有した一切の情報（テキスト発言、画像、動画、音声、イラスト、ポートフォリオ、制作過程のアイデア、個人情報などを含みますがこれらに限定されません）を指します。
第2条（秘密保持義務と禁止事項）
	1.	乙は、秘密情報を厳重に管理し、甲および当該情報の開示者の事前の明確な許可なく、いかなる第三者にも開示、提供、漏洩してはなりません。
	2.	乙は、本サーバー内の出来事や話題について、外部のSNS（X、Instagram、Bluesky等）、他のDiscordサーバー、ブログ、動画配信、またはオフラインの会話などで言及することを一切禁止されます。
	3.	乙は、本サーバー内の画面をスクリーンショット等で撮影・保存し、これを外部へ公開または共有する行為を固く禁止されます。
第3条（未成年者の参加）
乙が未成年者（18歳未満）である場合、乙は本契約に同意し本サーバーに参加することについて、必ず親権者等法定代理人の同意を得るものとします。乙が本契約への同意手続きを行った時点で、法定代理人の同意を得ているものとみなします。
第4条（契約違反時の措置）
乙が本契約のいずれかの条項に違反した、または違反する恐れがあると甲が判断した場合、甲は乙に対して事前の通知や勧告を行うことなく、即座に本サーバーからの強制退出（BAN）措置を行うことができるものとします。
第5条（存続条項）
乙が本サーバーを退出（自主的な退出、および前条に基づく強制退出を含みます）した後においても、第1条および第2条に定める秘密保持義務は有効に存続し、乙はこれに従うものとします。
以上、本契約の内容を十分に理解し、すべての条項に同意した証として、以下のフォームより電磁的記録による署名を行います。`;

    return [
      '='.repeat(60),
      'ぽん酢鯖 秘密保持契約（NDA）署名記録',
      '='.repeat(60),
      '',
      `署名日時: ${signedAt}`,
      `署名者表示名: ${application.displayName}`,
      `Discordアカウント: ${application.ndaUserTag ?? '不明'}`,
      `メールアドレス: ${application.ndaEmail ?? '未取得'}`,
      `署名時IPアドレス: ${application.ndaIpAddress ?? '不明'}`,
      '',
      '-'.repeat(60),
      'NDA条項',
      '-'.repeat(60),
      '',
      ndaText,
      '',
      '-'.repeat(60),
      '上記の通り、電磁的記録により署名を行いました。',
      '='.repeat(60),
    ].join('\n');
  }
}

export const verificationManager = new VerificationManager();
