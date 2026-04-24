import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand } from '../../types/index.js';
import { levelRepo } from '../../lib/repositories/index.js';
import { levelManager } from '../../lib/levelManager.js';
import { CustomEmbed } from '../../lib/customEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('setup-level')
  .setDescription('【管理者のみ】レベルシステムの設定を行います。')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub.setName('set-notify-channel')
      .setDescription('レベルアップ通知チャンネルを設定します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('通知用テキストチャンネル').setRequired(true).addChannelTypes(ChannelType.GuildText),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('set-login-bonus')
      .setDescription('ログインボーナスXPを設定します。')
      .addIntegerOption(opt =>
        opt.setName('xp').setDescription('ログインボーナスXP').setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('add-excluded')
      .setDescription('XP対象外チャンネルを追加します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外にするチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-excluded')
      .setDescription('XP対象外チャンネルを削除します。')
      .addChannelOption(opt =>
        opt.setName('channel').setDescription('対象外から削除するチャンネル').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('list-excluded')
      .setDescription('XP対象外チャンネル一覧を表示します。'),
  )
  .addSubcommand(sub =>
    sub.setName('add-role')
      .setDescription('レベルアップ報酬ロールを追加します。')
      .addIntegerOption(opt =>
        opt.setName('level').setDescription('ロールを付与するレベル').setRequired(true).setMinValue(1),
      )
      .addRoleOption(opt =>
        opt.setName('role').setDescription('付与するロール').setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('remove-role')
      .setDescription('レベルアップ報酬ロールを削除します。')
      .addIntegerOption(opt =>
        opt.setName('level').setDescription('ロールを削除するレベル').setRequired(true).setMinValue(1),
      ),
  )
  .addSubcommand(sub =>
    sub.setName('list-roles')
      .setDescription('レベルアップ報酬ロール一覧を表示します。'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const embed = new CustomEmbed(interaction.user);
  const guildId = interaction.guild!.id;

  switch (subcommand) {
    case 'set-notify-channel': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = (await levelRepo.getLevelSettings(guildId)) || {};
      settings.levelUpChannelId = channel.id;
      await levelRepo.setLevelSettings(guildId, settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`レベルアップ通知チャンネルを ${channel} に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'set-login-bonus': {
      const xp = interaction.options.getInteger('xp', true);
      const settings = (await levelRepo.getLevelSettings(guildId)) || {};
      settings.loginBonusBaseXp = xp;
      await levelRepo.setLevelSettings(guildId, settings);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`ログインボーナスXPを **${xp}** に設定しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'add-excluded': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = (await levelRepo.getLevelSettings(guildId)) || {};
      if (!settings.excludedChannels) settings.excludedChannels = [];
      if (!settings.excludedChannels.includes(channel.id)) {
        settings.excludedChannels.push(channel.id);
        await levelRepo.setLevelSettings(guildId, settings);
      }
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をXP対象外に追加しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'remove-excluded': {
      const channel = interaction.options.getChannel('channel', true);
      const settings = await levelRepo.getLevelSettings(guildId);
      if (settings?.excludedChannels) {
        settings.excludedChannels = settings.excludedChannels.filter((id: string) => id !== channel.id);
        await levelRepo.setLevelSettings(guildId, settings);
      }
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`${channel} をXP対象外から削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'list-excluded': {
      const settings = await levelRepo.getLevelSettings(guildId);
      const excluded = settings?.excludedChannels || [];
      if (excluded.length === 0) {
        embed.setColor(0x5865F2).setTitle('📋 XP対象外チャンネル').setDescription('対象外チャンネルはありません。');
      } else {
        const list = excluded.map((id: string) => `<#${id}>`).join('\n');
        embed.setColor(0x5865F2).setTitle('📋 XP対象外チャンネル').setDescription(list);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'add-role': {
      const level = interaction.options.getInteger('level', true);
      const role = interaction.options.getRole('role', true);
      await levelRepo.setLevelRole(guildId, level, role.id);
      const appliedCount = await levelManager.applyRetroactiveRole(interaction.guild!, level, role.id);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了')
        .setDescription(`レベル **${level}** の報酬ロールを ${role} に設定しました。`)
        .addFields({ name: '遡及適用', value: `${appliedCount} 人にロールを付与しました。`, inline: false });
      await interaction.reply({ embeds: [embed] });
      break;
    }
    case 'remove-role': {
      const level = interaction.options.getInteger('level', true);
      await levelRepo.removeLevelRole(guildId, level);
      embed.setColor(0x00FF00).setTitle('✅ 設定完了').setDescription(`レベル **${level}** の報酬ロールを削除しました。`);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
    case 'list-roles': {
      const roles = await levelRepo.getLevelRoles(guildId);
      const entries = Object.entries(roles);
      if (entries.length === 0) {
        embed.setColor(0x5865F2).setTitle('📋 レベルアップ報酬ロール').setDescription('報酬ロールは設定されていません。');
      } else {
        const list = entries
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([lvl, roleId]) => `レベル **${lvl}** → <@&${roleId}>`)
          .join('\n');
        embed.setColor(0x5865F2).setTitle('📋 レベルアップ報酬ロール').setDescription(list);
      }
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }
  }
}

const command: BotCommand = { data, execute };
export default command;