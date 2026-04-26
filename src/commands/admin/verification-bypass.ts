import { SlashCommandBuilder, PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { BotCommand } from '../../types/index.js';
import { verificationRepo } from '../../lib/repositories/index.js';
import { verificationManager } from '../../lib/verificationManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('verification-bypass')
  .setDescription('【管理者のみ】参加認証のバイパス設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('バイパスリストにユーザーを追加します。')
      .addUserOption(opt => opt.setName('user').setDescription('バイパスするユーザー').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('remove')
      .setDescription('バイパスリストからユーザーを削除します。')
      .addUserOption(opt => opt.setName('user').setDescription('削除するユーザー').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('list').setDescription('バイパスリストを表示します。'),
  )
  .addSubcommand(sub =>
    sub.setName('bulk')
      .setDescription('【一時用】サーバー全メンバーを一括バイパスしNDA署名へ進めます。')
      .addBooleanOption(opt => opt.setName('confirm').setDescription('trueで実行').setRequired(true)),
  )
  .addSubcommand(sub =>
    sub.setName('tickets-only')
      .setDescription('【一時用】チケットがないバイパス済みメンバーのチケットだけを再生成します。')
      .addBooleanOption(opt => opt.setName('confirm').setDescription('trueで実行').setRequired(true)),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'add': {
      const user = interaction.options.getUser('user', true);
      await verificationRepo.addBypass(guildId, user.id);

      const existing = verificationRepo.getActiveApplicationByUser(guildId, user.id);
      if (existing) {
        embed.setColor(0xFFAA00).setTitle('⚠️ 設定完了').setDescription(
          `${user} をバイパスリストに追加しました。\nこのユーザーにはすでにアクティブな申請が存在するため、チケットは作成されませんでした。`,
        );
      } else {
        const appId = randomUUID();
        await verificationRepo.setApplication(appId, {
          id: appId,
          userId: user.id,
          guildId,
          displayName: user.username,
          activity: 'バイパス追加',
          status: 'approved',
          submittedAt: Date.now(),
          reviewedBy: interaction.user.id,
          reviewedAt: Date.now(),
        });

        await verificationManager.createTicketChannel(
          verificationRepo.getApplication(appId)!,
        );

        embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(
          `${user} をバイパスリストに追加し、NDA署名用チケットを作成しました。\n参加時に自動で認証済みロールが付与されます。`,
        );
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'remove': {
      const user = interaction.options.getUser('user', true);
      await verificationRepo.removeBypass(guildId, user.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${user} をバイパスリストから削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'list': {
      const bypassList = verificationRepo.getBypassList(guildId);
      if (bypassList.length === 0) {
        embed.setColor(0xFFAA00).setTitle('📋 バイパスリスト').setDescription('バイパスリストは空です。');
      } else {
        embed.setColor(0xFFAA00).setTitle(`📋 バイパスリスト（${bypassList.length}人）`)
          .setDescription(bypassList.map(id => `<@${id}>`).join('\n'));
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'bulk': {
      const confirm = interaction.options.getBoolean('confirm', true);
      if (!confirm) {
        embed.setColor(0xFF0000).setTitle('❌ キャンセル').setDescription('confirm を true に設定して実行してください。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const settings = await verificationRepo.getVerificationSettings(guildId);
      if (!settings?.enabled) {
        embed.setColor(0xFF0000).setTitle('❌ エラー').setDescription('参加認証が有効ではありません。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const guild = await interaction.client.guilds.fetch(guildId);
      await guild.members.fetch();
      const members = [...guild.members.cache.values()];

      const bypassList = settings.bypassList ?? [];
      const verifiedRoleId = settings.verifiedRoleId;

      const targets = members.filter(m => {
        if (m.user.bot) return false;
        if (bypassList.includes(m.id)) return false;
        if (verifiedRoleId && m.roles.cache.has(verifiedRoleId)) return false;
        if (verificationRepo.getActiveApplicationByUser(guildId, m.id)) return false;
        return true;
      });

      if (targets.length === 0) {
        embed.setColor(0xFFAA00).setTitle('⚠️ 対象なし').setDescription('バイパス対象のメンバーがいません。');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const BATCH_SIZE = 5;
      const BATCH_DELAY_MS = 3000;
      let success = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const batch = targets.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (m) => {
          try {
            await verificationRepo.addBypass(guildId, m.id);

            const appId = randomUUID();
            await verificationRepo.setApplication(appId, {
              id: appId,
              userId: m.id,
              guildId,
              displayName: m.user.username,
              activity: '一括バイパス',
              status: 'approved',
              submittedAt: Date.now(),
              reviewedBy: interaction.user.id,
              reviewedAt: Date.now(),
            });

            await verificationManager.createTicketChannel(
              verificationRepo.getApplication(appId)!,
            );
            success++;
          } catch (e) {
            skipped++;
            errors.push(`${m.user.tag}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }));

        if (i + BATCH_SIZE < targets.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      let desc = `**対象**: ${targets.length}人\n**成功**: ${success}人\n**スキップ**: ${skipped}人`;
      if (errors.length > 0) {
        desc += `\n\n**エラー**:\n${errors.slice(0, 10).join('\n')}`;
      }

      embed.setColor(0x00FF00).setTitle(`✅ 一括バイパス完了`).setDescription(desc);
      await interaction.editReply({ embeds: [embed] });
      break;
    }

    case 'tickets-only': {
      const confirm = interaction.options.getBoolean('confirm', true);
      if (!confirm) {
        embed.setColor(0xFF0000).setTitle('❌ キャンセル').setDescription('confirm を true に設定して実行してください。');
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const guild = await interaction.client.guilds.fetch(guildId);
      await guild.members.fetch();

      const allApps = verificationRepo.getAllApplications(guildId);
      const appsMissingTicket = allApps.filter(
        (app) =>
          (app.status === 'approved' || app.status === 'nda_pending') && !app.ticketChannelId,
      );

      if (appsMissingTicket.length === 0) {
        embed.setColor(0xFFAA00).setTitle('⚠️ 対象なし').setDescription('チケット未作成の申請はありません。');
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const BATCH_SIZE = 5;
      const BATCH_DELAY_MS = 3000;
      let success = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < appsMissingTicket.length; i += BATCH_SIZE) {
        const batch = appsMissingTicket.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (app) => {
          try {
            const member = await guild.members.fetch(app.userId).catch(() => null);
            if (!member) {
              skipped++;
              return;
            }

            const existingChannel = guild.channels.cache.find(ch => ch.name === `ticket-${app.userId}`);
            if (existingChannel) {
              app.ticketChannelId = existingChannel.id;
              await verificationRepo.setApplication(app.id, app);
              skipped++;
              return;
            }

            await verificationManager.createTicketChannel(
              verificationRepo.getApplication(app.id)!,
            );
            success++;
          } catch (e) {
            skipped++;
            errors.push(`<@${app.userId}>: ${e instanceof Error ? e.message : String(e)}`);
          }
        }));

        if (i + BATCH_SIZE < appsMissingTicket.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }

      let desc = `**対象**: ${appsMissingTicket.length}件\n**成功**: ${success}件\n**スキップ**: ${skipped}件`;
      if (errors.length > 0) {
        desc += `\n\n**エラー**:\n${errors.slice(0, 10).join('\n')}`;
      }

      embed.setColor(0x00FF00).setTitle(`✅ チケット再生成完了`).setDescription(desc);
      await interaction.editReply({ embeds: [embed] });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;
