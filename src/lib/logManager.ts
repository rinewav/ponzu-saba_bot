import { AuditLogEvent, type Client, type Message, type GuildMember, type Role, type VoiceState } from 'discord.js';
import { miscRepo } from './repositories/index.js';
import { CustomEmbed, EMBED_COLORS } from './customEmbed.js';

export class LogManager {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
  }

  private async sendLog(guildId: string, embed: CustomEmbed): Promise<void> {
    if (!this.client) return;
    const logChannelId = miscRepo.getLogChannelId(guildId);
    if (!logChannelId) return;

    const logChannel = await this.client.channels.fetch(logChannelId).catch(() => null);
    if (logChannel && logChannel.isTextBased() && 'send' in logChannel) {
      await (logChannel as import('discord.js').TextChannel).send({ embeds: [embed] }).catch(console.error);
    }
  }

  async handleChannelCreate(channel: import('discord.js').NonThreadGuildBasedChannel): Promise<void> {
    if (!channel.guild) return;
    const embed = new CustomEmbed()
      .setColor(EMBED_COLORS.SUCCESS)
      .setTitle('➕ チャンネル作成')
      .setDescription(`**チャンネル名:** ${channel}\n**種類:** ${channel.type}\n**ID:** ${channel.id}`)
      .setTimestamp();
    await this.sendLog(channel.guild.id, embed);
  }

  async handleChannelDelete(channel: import('discord.js').NonThreadGuildBasedChannel): Promise<void> {
    if (!channel.guild) return;
    const embed = new CustomEmbed()
      .setColor(EMBED_COLORS.ERROR)
      .setTitle('➖ チャンネル削除')
      .setDescription(`**チャンネル名:** \`#${channel.name}\`\n**種類:** ${channel.type}\n**ID:** ${channel.id}`)
      .setTimestamp();
    await this.sendLog(channel.guild.id, embed);
  }

  async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    const embed = new CustomEmbed(member.user)
      .setColor(EMBED_COLORS.SUCCESS)
      .setTitle('📥 メンバー参加')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`${member} **${member.user.tag}** がサーバーに参加しました。`)
      .addFields({ name: 'アカウント作成日', value: member.user.createdAt.toLocaleString('ja-JP') })
      .setTimestamp();
    await this.sendLog(member.guild.id, embed);
  }

  async handleGuildMemberRemove(member: GuildMember): Promise<void> {
    const embed = new CustomEmbed(member.user)
      .setColor(EMBED_COLORS.ERROR)
      .setTitle('📤 メンバー退出')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`${member.user.tag} がサーバーから退出しました。`)
      .setTimestamp();
    await this.sendLog(member.guild.id, embed);
  }

  async handleMessageDelete(message: Message): Promise<void> {
    if (!message.guild || message.author?.bot) return;

    const fetchedLogs = await message.guild.fetchAuditLogs({
      limit: 1,
      type: AuditLogEvent.MessageDelete,
    }).catch(() => null);
    const deletionLog = fetchedLogs?.entries.first();

    let executor = '不明';
    let authorInfo = '不明';
    let content = message.content || '(本文がないか、キャッシュから取得できませんでした)';

    if (deletionLog) {
      const { executor: logExecutor, target } = deletionLog;
      if (message.author && target && target.id === message.author.id && logExecutor) {
        executor = `${logExecutor} (${logExecutor.tag})`;
      }
    }

    if (message.author) {
      authorInfo = `${message.author} (${message.author.tag})`;
    }

    const embed = new CustomEmbed()
      .setColor(EMBED_COLORS.ERROR)
      .setTitle('🗑️ メッセージ削除')
      .setDescription(`**チャンネル:** ${message.channel}`)
      .addFields(
        { name: 'メッセージ送信者', value: authorInfo, inline: true },
        { name: '削除実行者', value: executor, inline: true },
        { name: '内容', value: `\`\`\`${content.slice(0, 1000)}\`\`\`` },
      )
      .setTimestamp();
    await this.sendLog(message.guild.id, embed);
  }

  async handleMessageUpdate(oldMessage: Message, newMessage: Message): Promise<void> {
    // 部分データ(partial)のメッセージは author が null になるため、参照前にガードする
    if (!newMessage.guild || newMessage.partial || !newMessage.author || newMessage.author.bot) return;
    // 編集前の本文が不明な場合はログとして意味がないためスキップする
    if (oldMessage.partial) return;
    if (oldMessage.content === newMessage.content) return;

    const oldContent = (oldMessage.content || '(なし)').slice(0, 1000);
    const newContent = (newMessage.content || '(なし)').slice(0, 1000);

    const embed = new CustomEmbed(newMessage.author)
      .setColor(EMBED_COLORS.INFO)
      .setTitle('✏️ メッセージ編集')
      .setDescription(`**[メッセージへ飛ぶ](${newMessage.url})**`)
      .addFields(
        { name: '送信者', value: `${newMessage.author}`, inline: true },
        { name: 'チャンネル', value: `${newMessage.channel}`, inline: true },
        { name: '変更前', value: `\`\`\`${oldContent}\`\`\`` },
        { name: '変更後', value: `\`\`\`${newContent}\`\`\`` },
      )
      .setTimestamp();
    await this.sendLog(newMessage.guild.id, embed);
  }

  async handleRoleCreate(role: Role): Promise<void> {
    const embed = new CustomEmbed()
      .setColor(EMBED_COLORS.SUCCESS)
      .setTitle('➕ ロール作成')
      .setDescription(`**ロール名:** ${role}\n**ID:** ${role.id}`)
      .setTimestamp();
    await this.sendLog(role.guild.id, embed);
  }

  async handleRoleDelete(role: Role): Promise<void> {
    const embed = new CustomEmbed()
      .setColor(EMBED_COLORS.ERROR)
      .setTitle('➖ ロール削除')
      .setDescription(`**ロール名:** \`@${role.name}\`\n**ID:** ${role.id}`)
      .setTimestamp();
    await this.sendLog(role.guild.id, embed);
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member) return;

    let description = '';
    let color: number = EMBED_COLORS.NEUTRAL;

    if (!oldState.channel && newState.channel) {
      description = `${member} がVC **${newState.channel.name}** に参加しました。`;
      color = EMBED_COLORS.SUCCESS;
    } else if (oldState.channel && !newState.channel) {
      description = `${member} がVC **${oldState.channel.name}** から退出しました。`;
      color = EMBED_COLORS.ERROR;
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      description = `${member} がVCを移動しました。\n**移動元:** ${oldState.channel.name}\n**移動先:** ${newState.channel.name}`;
      color = EMBED_COLORS.INFO;
    } else {
      return;
    }

    const embed = new CustomEmbed(member.user)
      .setColor(color)
      .setTitle('🎤 VCログ')
      .setDescription(description)
      .setTimestamp();
    await this.sendLog(newState.guild.id, embed);
  }

  async handleGuildMemberUpdate(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
    // 部分データ(partial)の場合は変更前の情報が信用できないためスキップする
    if (!oldMember.partial && !newMember.partial && oldMember.nickname !== newMember.nickname) {
      const embed = new CustomEmbed(newMember.user)
        .setColor(EMBED_COLORS.INFO)
        .setTitle('✏️ ニックネーム変更')
        .setThumbnail(newMember.user.displayAvatarURL())
        .setDescription(`${newMember} のニックネームが変更されました。`)
        .addFields(
          { name: '変更前', value: `\`${oldMember.nickname || 'なし'}\``, inline: true },
          { name: '変更後', value: `\`${newMember.nickname || 'なし'}\``, inline: true },
        )
        .setTimestamp();
      await this.sendLog(newMember.guild.id, embed);
    }

    // oldMember が partial の場合、全ロールが「付与された」ように見えてしまうため差分を取らない
    if (oldMember.partial) return;

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
    const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));
    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const embed = new CustomEmbed(newMember.user)
        .setColor(EMBED_COLORS.INFO)
        .setTitle('🏷️ ロール変更')
        .setThumbnail(newMember.user.displayAvatarURL())
        .setDescription(`${newMember} のロールが変更されました。`);

      if (addedRoles.size > 0) {
        embed.addFields({ name: '付与されたロール', value: addedRoles.map(r => r.toString()).join(' ') });
      }

      if (removedRoles.size > 0) {
        embed.addFields({ name: '剥奪されたロール', value: removedRoles.map(r => r.toString()).join(' ') });
      }
      await this.sendLog(newMember.guild.id, embed);
    }
  }

  async handleUserUpdate(oldUser: import('discord.js').User, newUser: import('discord.js').User): Promise<void> {
    if (oldUser.username !== newUser.username) {
      for (const guild of this.client!.guilds.cache.values()) {
        if (guild.members.cache.has(newUser.id)) {
          const embed = new CustomEmbed(newUser)
            .setColor(EMBED_COLORS.INFO)
            .setTitle('✏️ ユーザー名変更')
            .setThumbnail(newUser.displayAvatarURL())
            .setDescription(`${newUser} のユーザー名が変更されました。`)
            .addFields(
              { name: '変更前', value: `\`${oldUser.tag}\``, inline: true },
              { name: '変更後', value: `\`${newUser.tag}\``, inline: true },
            )
            .setTimestamp();
          await this.sendLog(guild.id, embed);
        }
      }
    }
  }
}

export const logManager = new LogManager();