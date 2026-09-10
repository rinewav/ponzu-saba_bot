import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { BotCommand, VerificationApplication } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { isInactiveStatus } from '../../lib/repositories/verificationRepo.js';
import { verificationManager, type NdaPdfBundle, type TicketFinalizeResult } from '../../lib/verificationManager.js';
import { CustomEmbed, EMBED_COLORS } from '../../lib/customEmbed.js';

/** カテゴリのチャンネル数上限と、警告を出すしきい値 */
const CATEGORY_LIMIT = 50;
const CATEGORY_WARN_THRESHOLD = 45;
/** 申請1件ごとの待機時間（レート制限対策） */
const MIGRATE_DELAY_MS = 1500;
const MAX_PREVIEW_LINES = 25;

export const data = new SlashCommandBuilder()
  .setName('verification-tickets')
  .setDescription('【管理者のみ】NDAチケットの状況確認・後処理を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('status').setDescription('チケットとNDA記録の処理状況を表示します。'),
  )
  .addSubcommand(sub =>
    sub.setName('migrate')
      .setDescription('既存の署名済み申請にNDA記録の保存・DM送付・チケット後処理をまとめて実行します。')
      .addBooleanOption(opt => opt.setName('confirm').setDescription('trueで実行').setRequired(true))
      .addBooleanOption(opt => opt.setName('dry_run').setDescription('trueで実行内容の確認のみ').setRequired(false)),
  )
  .addSubcommandGroup(group =>
    group.setName('archive-category')
      .setDescription('チケットのアーカイブ先カテゴリを管理します。')
      .addSubcommand(sub =>
        sub.setName('add')
          .setDescription('アーカイブ先カテゴリを追加します。')
          .addChannelOption(opt =>
            opt.setName('category')
              .setDescription('追加するカテゴリ')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('remove')
          .setDescription('アーカイブ先カテゴリを削除します。')
          .addChannelOption(opt =>
            opt.setName('category')
              .setDescription('削除するカテゴリ')
              .addChannelTypes(ChannelType.GuildCategory)
              .setRequired(true),
          ),
      )
      .addSubcommand(sub =>
        sub.setName('list').setDescription('アーカイブ先カテゴリの一覧を表示します。'),
      ),
  );

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** カテゴリ配下のチャンネル数 */
function countChildren(guild: Guild, categoryId: string): number {
  return guild.channels.cache.filter(c => c.parentId === categoryId).size;
}

/** 「name: n/50」形式の行を作る（しきい値超過で⚠️） */
function categoryLine(guild: Guild, categoryId: string): string {
  const category = guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    return `⚠️ 削除済みのカテゴリ (\`${categoryId}\`)`;
  }
  const count = countChildren(guild, categoryId);
  const mark = count >= CATEGORY_WARN_THRESHOLD ? '⚠️ ' : '';
  return `${mark}**${category.name}**: ${count}/${CATEGORY_LIMIT}`;
}

/** 直近20件にDM案内（v_dm_ボタン）がすでに投稿されているか */
async function hasDmInstruction(channel: TextChannel): Promise<boolean> {
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!recent) return false;

  return recent.some((message) => {
    if (!message.author.bot) return false;
    return message.components.some((row) => {
      const components = (row as unknown as { components?: unknown[] }).components ?? [];
      return components.some((component) => {
        const customId = (component as { customId?: string | null }).customId ?? '';
        return customId.startsWith('v_dm_');
      });
    });
  });
}

function finalizeLabel(action: TicketFinalizeResult, categoryName?: string): string {
  switch (action) {
    case 'deleted':
      return '削除';
    case 'moved':
      return `移動→${categoryName ?? '（未定）'}`;
    case 'kept':
      return 'そのまま(アーカイブ済)';
    default:
      return 'チケットなし';
  }
}

/**
 * 移行対象:
 * - 署名済みで、記録保存・DM送付・チケット後処理のいずれかが未完了のもの
 * - 未署名でチケットが残っているもの（退出済みの場合のみ実際に処理される）
 */
function isMigrateTarget(app: VerificationApplication): boolean {
  if (app.status === 'completed') {
    if (!app.ndaArchived) return true;
    if (!app.ndaDmDelivered) return true;
    return !!app.ticketChannelId && !app.ticketFinalized;
  }
  if (!isInactiveStatus(app.status)) return !!app.ticketChannelId;
  return false;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand();
  const guild = interaction.guild!;
  const guildId = guild.id;
  const embed = new CustomEmbed(interaction.user);

  if (group === 'archive-category') {
    await handleArchiveCategory(interaction, subcommand);
    return;
  }

  switch (subcommand) {
    case 'status': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await guild.channels.fetch();
      await guild.members.fetch();

      const settings = await verificationRepo.getVerificationSettings(guildId);
      const apps = verificationRepo.getAllApplications(guildId);
      const completed = apps.filter(a => a.status === 'completed');
      const unfinalized = completed.filter(a => !a.ticketFinalized && a.ticketChannelId);
      const dmPending = completed.filter(a => !a.ndaDmDelivered);
      const archivePending = completed.filter(a => !a.ndaArchived);
      const leftUnprocessed = completed.filter(
        a => !guild.members.cache.has(a.userId) && !a.ticketFinalized,
      );
      const leftUnsigned = apps.filter(
        a => !isInactiveStatus(a.status) && !guild.members.cache.has(a.userId),
      );

      const archiveIds = settings?.ticketArchiveCategoryIds ?? [];
      const archiveLines = archiveIds.length > 0
        ? archiveIds.map(id => categoryLine(guild, id)).join('\n')
        : '未設定（必要時に自動作成されます）';

      const ticketCategoryLine = settings?.ticketCategoryId
        ? categoryLine(guild, settings.ticketCategoryId)
        : '未設定';

      embed.setColor(EMBED_COLORS.WARN)
        .setTitle('📊 NDAチケットの状況')
        .addFields(
          { name: '完了済み申請', value: `${completed.length}件`, inline: true },
          { name: 'うちチケット未処理', value: `${unfinalized.length}件`, inline: true },
          { name: 'うちDM未送付', value: `${dmPending.length}件`, inline: true },
          { name: 'うちアーカイブ未投稿', value: `${archivePending.length}件`, inline: true },
          { name: '退出済みで未処理', value: `${leftUnprocessed.length}件`, inline: true },
          { name: '未署名のまま退出', value: `${leftUnsigned.length}件`, inline: true },
          { name: 'チケットカテゴリ', value: ticketCategoryLine, inline: false },
          { name: 'アーカイブ先カテゴリ', value: archiveLines, inline: false },
        );

      if (settings?.ticketCategoryId
        && countChildren(guild, settings.ticketCategoryId) >= CATEGORY_WARN_THRESHOLD) {
        embed.setColor(EMBED_COLORS.ERROR).setDescription(
          '⚠️ チケットカテゴリが上限(50)に近づいています。`/verification-tickets migrate` で後処理を実行してください。',
        );
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'migrate': {
      const confirm = interaction.options.getBoolean('confirm', true);
      const dryRun = interaction.options.getBoolean('dry_run') ?? false;

      if (!confirm) {
        embed.setColor(EMBED_COLORS.ERROR).setTitle('❌ キャンセル').setDescription('confirm を true に設定して実行してください。');
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await guild.channels.fetch();
      await guild.members.fetch();

      const targets = verificationRepo.getAllApplications(guildId).filter(isMigrateTarget);

      if (targets.length === 0) {
        embed.setColor(EMBED_COLORS.WARN).setTitle('⚠️ 対象なし').setDescription('後処理が必要な申請はありません。');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (dryRun) {
        await runDryRun(interaction, guild, targets);
        return;
      }

      await runMigrate(interaction, guild, targets);
      break;
    }
  }
}

/** dry_run: 実行せずに予定内容だけを列挙する */
async function runDryRun(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  targets: VerificationApplication[],
): Promise<void> {
  const embed = new CustomEmbed(interaction.user);
  const lines: string[] = [];
  let archiveCount = 0;
  let dmCount = 0;
  let ticketCount = 0;
  let leftCompletedCount = 0;
  let leftUnsignedCount = 0;

  for (const [index, app] of targets.entries()) {
    const actions: string[] = [];
    const member = await guild.members.fetch(app.userId).catch(() => null);

    if (!member) {
      if (app.status === 'completed') {
        leftCompletedCount++;
        actions.push('退出者: 記録投稿→チケット削除');
      } else {
        leftUnsignedCount++;
        actions.push('退出者(未署名): チケット・申請削除');
      }

      if (index < MAX_PREVIEW_LINES) {
        lines.push(`<@${app.userId}>: ${actions.join(' / ')}`);
      }
      continue;
    }

    if (app.status !== 'completed') {
      if (index < MAX_PREVIEW_LINES) {
        lines.push(`<@${app.userId}>: スキップ（在籍中の未署名）`);
      }
      continue;
    }

    if (!app.ndaArchived) {
      archiveCount++;
      actions.push('記録投稿');
    }
    if (!app.ndaDmDelivered) {
      dmCount++;
      actions.push('DM送付（失敗時はDM案内を投稿）');
    }
    if (app.ndaDmDelivered && !app.ticketFinalized) {
      ticketCount++;
      if (index < MAX_PREVIEW_LINES) {
        const preview = await verificationManager.previewTicketFinalization(app, guild);
        actions.push(finalizeLabel(preview.action, preview.categoryName));
      } else {
        actions.push('チケット後処理');
      }
    }

    if (index < MAX_PREVIEW_LINES) {
      lines.push(`<@${app.userId}>: ${actions.length > 0 ? actions.join(' / ') : '対応なし'}`);
    }
  }

  let desc = `**対象**: ${targets.length}件\n`
    + `**記録投稿予定**: ${archiveCount}件\n`
    + `**DM送付予定**: ${dmCount}件\n`
    + `**チケット後処理予定**: ${ticketCount}件\n`
    + `**退出者チケット削除予定**: ${leftCompletedCount}件\n`
    + `**未署名退出者削除予定**: ${leftUnsignedCount}件`;

  if (lines.length > 0) {
    desc += `\n\n**内訳（最大${MAX_PREVIEW_LINES}件）**:\n${lines.join('\n')}`;
  }
  if (targets.length > MAX_PREVIEW_LINES) {
    desc += `\n…ほか ${targets.length - MAX_PREVIEW_LINES}件`;
  }

  embed.setColor(EMBED_COLORS.WARN).setTitle('🔍 移行プレビュー（dry_run）').setDescription(desc.slice(0, 4000));
  await interaction.editReply({ embeds: [embed] });
}

/** 実際にNDA記録の保存・DM送付・チケット後処理を行う */
async function runMigrate(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  targets: VerificationApplication[],
): Promise<void> {
  const embed = new CustomEmbed(interaction.user);
  const errors: string[] = [];
  let archived = 0;
  let dmSuccess = 0;
  let dmFailed = 0;
  let deleted = 0;
  let moved = 0;
  let leftDeleted = 0;
  let leftUnsignedDeleted = 0;
  let errorCount = 0;
  /** resetUserApplication は同一ユーザーの申請をまとめて削除するため、二重処理を避ける */
  const resetUsers = new Set<string>();

  for (const [index, app] of targets.entries()) {
    try {
      const member = await guild.members.fetch(app.userId).catch(() => null);

      // 退出済みメンバーはDM送付もアーカイブ移動も行わず、記録を残してチケットを削除する
      if (!member) {
        if (app.status === 'completed') {
          const result = await verificationManager.archiveAndDeleteTicketForLeftMember(app, guild);
          if (result === 'skipped') {
            errorCount++;
            errors.push(`<@${app.userId}>: 退出者のNDA記録を保存できずチケットを残しました`);
          } else {
            leftDeleted++;
          }
        } else if (!resetUsers.has(app.userId)) {
          resetUsers.add(app.userId);
          const { deletedApps } = await verificationManager.resetUserApplication(guild.id, app.userId);
          if (deletedApps > 0) leftUnsignedDeleted += deletedApps;
        }

        if (index < targets.length - 1) {
          await sleep(MIGRATE_DELAY_MS);
        }
        continue;
      }

      // 在籍中の未署名申請には手を加えない
      if (app.status !== 'completed') {
        if (index < targets.length - 1) {
          await sleep(MIGRATE_DELAY_MS);
        }
        continue;
      }

      const needsPdf = !app.ndaArchived || !app.ndaDmDelivered;

      let pdf: NdaPdfBundle | null = null;
      if (needsPdf) {
        pdf = await verificationManager.buildNdaPdf(app);
      }

      if (!app.ndaArchived && pdf) {
        const ok = await verificationManager.postNdaArchiveRecord(app, pdf);
        if (ok) {
          archived++;
        } else {
          errorCount++;
          errors.push(`<@${app.userId}>: アーカイブ投稿に失敗しました`);
        }
      }

      if (!app.ndaDmDelivered && pdf) {
        // 既存メンバーのため、ロール付与とウェルカム通知は行わない
        const ok = await verificationManager.sendNdaDm(member, app, pdf);
        if (ok) {
          dmSuccess++;
        } else {
          dmFailed++;
          const channel = await verificationManager.fetchTicketChannel(app, guild);
          if (channel && !(await hasDmInstruction(channel))) {
            await verificationManager.postDmInstruction(app, channel);
          }
        }
      }

      if (app.ndaDmDelivered && !app.ticketFinalized) {
        const result = await verificationManager.finalizeTicket(app, guild);
        if (result === 'deleted') deleted++;
        else if (result === 'moved') moved++;
      }
    } catch (e) {
      errorCount++;
      errors.push(`<@${app.userId}>: ${e instanceof Error ? e.message : String(e)}`);
    }

    if (index < targets.length - 1) {
      await sleep(MIGRATE_DELAY_MS);
    }
  }

  let desc = `**対象**: ${targets.length}件\n`
    + `**アーカイブ投稿**: ${archived}件\n`
    + `**DM送付成功**: ${dmSuccess}件\n`
    + `**DM失敗**: ${dmFailed}件\n`
    + `**チケット削除**: ${deleted}件\n`
    + `**チケット移動**: ${moved}件\n`
    + `**退出者チケット削除**: ${leftDeleted}件\n`
    + `**未署名退出者削除**: ${leftUnsignedDeleted}件\n`
    + `**エラー**: ${errorCount}件`;

  if (errors.length > 0) {
    desc += `\n\n**エラー内容**:\n${errors.slice(0, 10).join('\n')}`;
  }

  embed.setColor(errorCount > 0 ? EMBED_COLORS.WARN : EMBED_COLORS.SUCCESS)
    .setTitle('✅ チケット移行完了')
    .setDescription(desc.slice(0, 4000));
  await interaction.editReply({ embeds: [embed] });
}

/** アーカイブ先カテゴリの追加・削除・一覧 */
async function handleArchiveCategory(
  interaction: ChatInputCommandInteraction,
  subcommand: string,
): Promise<void> {
  const guild = interaction.guild!;
  const guildId = guild.id;
  const embed = new CustomEmbed(interaction.user);
  const settings = (await verificationRepo.getVerificationSettings(guildId)) ?? {};
  const ids = settings.ticketArchiveCategoryIds ?? [];

  switch (subcommand) {
    case 'add': {
      const category = interaction.options.getChannel('category', true);

      if (ids.includes(category.id)) {
        embed.setColor(EMBED_COLORS.WARN).setTitle('⚠️ 追加済み')
          .setDescription(`**${category.name}** はすでにアーカイブ先カテゴリに登録されています。`);
      } else {
        settings.ticketArchiveCategoryIds = [...ids, category.id];
        await verificationRepo.setVerificationSettings(guildId, settings);
        embed.setColor(EMBED_COLORS.SUCCESS).setTitle('✅ 追加しました')
          .setDescription(`**${category.name}** をアーカイブ先カテゴリに追加しました。`);
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      break;
    }

    case 'remove': {
      const category = interaction.options.getChannel('category', true);

      if (!ids.includes(category.id)) {
        embed.setColor(EMBED_COLORS.WARN).setTitle('⚠️ 未登録')
          .setDescription(`**${category.name}** はアーカイブ先カテゴリに登録されていません。`);
      } else {
        settings.ticketArchiveCategoryIds = ids.filter(id => id !== category.id);
        await verificationRepo.setVerificationSettings(guildId, settings);
        embed.setColor(EMBED_COLORS.SUCCESS).setTitle('✅ 削除しました')
          .setDescription(`**${category.name}** をアーカイブ先カテゴリから削除しました。`);
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      break;
    }

    case 'list': {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await guild.channels.fetch();

      if (ids.length === 0) {
        embed.setColor(EMBED_COLORS.WARN).setTitle('📁 アーカイブ先カテゴリ')
          .setDescription('登録されていません。必要になった時点で自動作成されます。');
      } else {
        const lines = ids.map(id => `${categoryLine(guild, id)}\n　\`${id}\``);
        embed.setColor(EMBED_COLORS.WARN).setTitle(`📁 アーカイブ先カテゴリ（${ids.length}件）`)
          .setDescription(lines.join('\n'));
      }

      await interaction.editReply({ embeds: [embed] });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;
