import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { BotCommand, VerificationSettings } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { CustomEmbed } from '../../lib/customEmbed.js';
import { randomUUID } from 'node:crypto';

export const data = new SlashCommandBuilder()
  .setName('setup-verification')
  .setDescription('【管理者のみ】参加認証システムの設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('enable').setDescription('参加認証システムを有効にします。'),
  )
  .addSubcommand(sub =>
    sub.setName('disable').setDescription('参加認証システムを無効にします。'),
  )
  .addSubcommand(sub =>
    sub.setName('set-welcome-channel')
      .setDescription('はじめにチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('はじめにチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-role')
      .setDescription('認証済みロールを設定します。')
      .addRoleOption(opt =>
        opt.setName('role').setDescription('認証後に付与するロール').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-staff-role')
      .setDescription('運営ロールを設定します。')
      .addRoleOption(opt =>
        opt.setName('role').setDescription('申請レビュー権限を持つロール').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-review-channel')
      .setDescription('運営用レビューチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('運営専用チャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-archive-channel')
      .setDescription('アーカイブチャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('アーカイブ用チャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-ticket-category')
      .setDescription('チケットチャンネルを作成するカテゴリを設定します。')
      .addChannelOption(opt =>
        opt.setName('category').setDescription('チケット用カテゴリ').setRequired(true).addChannelTypes(ChannelType.GuildCategory),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-nda-url')
      .setDescription('NDA署名ページのURLを設定します。')
      .addStringOption(opt =>
        opt.setName('url').setDescription('例: https://nda.ponzu-saba.com').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add-question')
      .setDescription('クイズ問題を追加します。')
      .addStringOption(opt => opt.setName('question').setDescription('問題文').setRequired(true))
      .addStringOption(opt => opt.setName('option1').setDescription('選択肢1（正解）').setRequired(true))
      .addStringOption(opt => opt.setName('option2').setDescription('選択肢2').setRequired(true))
      .addStringOption(opt => opt.setName('option3').setDescription('選択肢3').setRequired(true))
      .addStringOption(opt => opt.setName('option4').setDescription('選択肢4').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('remove-question')
      .setDescription('クイズ問題を削除します。')
      .addStringOption(opt => opt.setName('id').setDescription('問題ID（list-questionsで確認）').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('list-questions').setDescription('クイズ問題一覧を表示します。'),
  )
  .addSubcommand(sub =>
    sub.setName('set-quiz-count')
      .setDescription('クイズの出題数を設定します。')
      .addIntegerOption(opt => opt.setName('count').setDescription('出題数（1以上）').setRequired(true).setMinValue(1)),
  )
  .addSubcommand(sub =>
    sub.setName('send-welcome-message')
      .setDescription('はじめにチャンネルにボタン付きウェルカムメッセージを送信します。'),
  )
  .addSubcommand(sub =>
    sub.setName('show-config').setDescription('現在の設定一覧を表示します。'),
  )
  .addSubcommand(sub =>
    sub.setName('search')
      .setDescription('ユーザーの申請状況を検索します。')
      .addStringOption(opt => opt.setName('user-id').setDescription('DiscordユーザーID').setRequired(true)),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  const getSettings = async () => ((await verificationRepo.getVerificationSettings(guildId)) ?? {}) as Record<string, unknown> & VerificationSettings;
  const saveSettings = async (s: Record<string, unknown>) => {
    await verificationRepo.setVerificationSettings(guildId, s as unknown as VerificationSettings);
  };

  switch (subcommand) {
    case 'enable': {
      const settings = await getSettings();
      settings.enabled = true;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription('参加認証システムを有効にしました。');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'disable': {
      const settings = await getSettings();
      settings.enabled = false;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription('参加認証システムを無効にしました。');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-welcome-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = await getSettings();
      settings.welcomeChannelId = channel.id;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`はじめにチャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-role': {
      const role = interaction.options.getRole('role', true);
      const settings = await getSettings();
      settings.verifiedRoleId = role.id;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`認証済みロールを ${role} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-staff-role': {
      const role = interaction.options.getRole('role', true);
      const settings = await getSettings();
      settings.staffRoleId = role.id;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`運営ロールを ${role} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-review-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = await getSettings();
      settings.reviewChannelId = channel.id;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`レビューチャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-archive-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = await getSettings();
      settings.archiveChannelId = channel.id;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`アーカイブチャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-ticket-category': {
      const category = interaction.options.getChannel('category', true);
      const settings = await getSettings();
      settings.ticketCategoryId = category.id;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`チケットカテゴリを ${category.name} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-nda-url': {
      const url = interaction.options.getString('url', true);
      const settings = await getSettings();
      settings.ndaWebUrl = url;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`NDA署名ページURLを \`${url}\` に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'add-question': {
      const question = interaction.options.getString('question', true);
      const option1 = interaction.options.getString('option1', true);
      const option2 = interaction.options.getString('option2', true);
      const option3 = interaction.options.getString('option3', true);
      const option4 = interaction.options.getString('option4', true);

      const options = [option1, option2, option3, option4];
      const shuffledOptions = [...options];
      const correctIndex = 0;
      for (let i = shuffledOptions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
        if (i === correctIndex) {
        } else if (j === correctIndex) {
        }
      }
      const newCorrectIndex = shuffledOptions.indexOf(option1);

      const qId = randomUUID().slice(0, 8);
      const settings = await getSettings();
      if (!settings.questions) settings.questions = [];
      settings.questions!.push({
        id: qId,
        question,
        options: shuffledOptions,
        correctIndex: newCorrectIndex,
      });
      await saveSettings(settings);

      embed.setColor(0x00FF00).setTitle('✅ 問題追加完了')
        .setDescription(`問題を追加しました（ID: \`${qId}\`）`)
        .addFields(
          { name: '問題', value: question, inline: false },
          { name: '正解', value: option1, inline: true },
          { name: '現在の問題数', value: `${settings.questions!.length}`, inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'remove-question': {
      const qId = interaction.options.getString('id', true);
      const settings = await getSettings();
      if (!settings.questions) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('問題が登録されていません。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      const before = settings.questions.length;
      settings.questions = settings.questions.filter((q: { id: string }) => q.id !== qId);
      if (settings.questions.length === before) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription(`ID \`${qId}\` の問題が見つかりません。`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 削除完了').setDescription(`問題 \`${qId}\` を削除しました。（残り: ${settings.questions.length}問）`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'list-questions': {
      const settings = await getSettings();
      if (!settings.questions || settings.questions.length === 0) {
        embed.setColor(0xFFAA00).setTitle('📋 問題一覧').setDescription('問題が登録されていません。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      embed.setColor(0xFFAA00).setTitle(`📋 問題一覧（${settings.questions.length}問）`);
      for (const q of settings.questions.slice(0, 25)) {
        embed.addFields({
          name: `ID: ${q.id}`,
          value: `**${q.question}**\n正解: ${q.options[q.correctIndex]}`,
          inline: false,
        });
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'set-quiz-count': {
      const count = interaction.options.getInteger('count', true);
      const settings = await getSettings();
      settings.quizPassCount = count;
      await saveSettings(settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`クイズ出題数を **${count}** 問に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'send-welcome-message': {
      const settings = await getSettings();
      if (!settings.welcomeChannelId) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('はじめにチャンネルが設定されていません。先に `set-welcome-channel` を実行してください。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const channel = await interaction.guild!.channels.fetch(settings.welcomeChannelId).catch(() => null) as import('discord.js').TextChannel | null;
      if (!channel) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('はじめにチャンネルが見つかりません。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
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
        new ButtonBuilder()
          .setCustomId('v_start')
          .setLabel('参加申請フォームを開く')
          .setStyle(ButtonStyle.Primary),
      );

      const message = await channel.send({ embeds: [welcomeEmbed], components: [button] });

      settings.welcomeMessageId = message.id;
      await saveSettings(settings);

      embed.setColor(0x00FF00).setTitle('✅ 送信完了').setDescription(`ウェルカムメッセージを ${channel} に送信しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'show-config': {
      const settings = await getSettings();
      const fetchChannel = async (id?: string) => id ? `<#${id}>` : '未設定';
      const fetchRole = async (id?: string) => id ? `<@&${id}>` : '未設定';

      embed.setColor(0xFFAA00).setTitle('⚙️ 参加認証システム設定')
        .addFields(
          { name: '有効', value: settings.enabled ? '✅ 有効' : '❌ 無効', inline: true },
          { name: 'はじめにチャンネル', value: await fetchChannel(settings.welcomeChannelId), inline: true },
          { name: '認証済みロール', value: await fetchRole(settings.verifiedRoleId), inline: true },
          { name: '運営ロール', value: await fetchRole(settings.staffRoleId), inline: true },
          { name: 'レビューチャンネル', value: await fetchChannel(settings.reviewChannelId), inline: true },
          { name: 'アーカイブチャンネル', value: await fetchChannel(settings.archiveChannelId), inline: true },
          { name: 'チケットカテゴリ', value: settings.ticketCategoryId ? await fetchChannel(settings.ticketCategoryId) : '未設定', inline: true },
          { name: 'NDA URL', value: settings.ndaWebUrl ?? '未設定', inline: true },
          { name: 'クイズ出題数', value: `${settings.quizPassCount ?? 3}`, inline: true },
          { name: '登録問題数', value: `${settings.questions?.length ?? 0}`, inline: true },
          { name: 'バイパス人数', value: `${settings.bypassList?.length ?? 0}`, inline: true },
        );
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'search': {
      const userId = interaction.options.getString('user-id', true);
      const applications = verificationRepo.getApplicationsByUser(guildId, userId);

      if (applications.length === 0) {
        embed.setColor(0xFFAA00).setTitle('🔍 検索結果').setDescription(`<@${userId}> の申請履歴はありません。`);
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      embed.setColor(0xFFAA00).setTitle(`🔍 検索結果: <@${userId}>（${applications.length}件）`);
      for (const app of applications.slice(0, 10)) {
        const statusMap: Record<string, string> = {
          quiz: '📝 クイズ中',
          pending: '⏳ 審査中',
          approved: '✅ 承認済み',
          rejected: '❌ 却下',
          nda_pending: '📋 NDA待ち',
          completed: '🎉 完了',
        };
        embed.addFields({
          name: `${statusMap[app.status] ?? app.status} - <t:${Math.floor(app.submittedAt / 1000)}:F>`,
          value: `名前: ${app.displayName} | 活動: ${app.activity.slice(0, 50)}`,
          inline: false,
        });
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;
