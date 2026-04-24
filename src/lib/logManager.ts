import { AuditLogEvent, type Client, type Message, type GuildMember, type Role, type VoiceState } from 'discord.js';
import { miscRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

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

  handleChannelCreate(channel: import('discord.js').NonThreadGuildBasedChannel): void {
    if (!channel.guild) return;
    const embed = new CustomEmbed()
      .setColor(0x00FF00)
      .setTitle('チャンネル作成')
      .setDescription(`**チャンネル名:** ${channel}\n**種類:** ${channel.type}\n**ID:** ${channel.id}`)
      .setTimestamp();
    this.sendLog(channel.guild.id, embed);
  }

  handleChannelDelete(channel: import('discord.js').NonThreadGuildBasedChannel): void {
    if (!channel.guild) return;
    const embed = new CustomEmbed()
      .setColor(0xFF0000)
      .setTitle('チャンネル削除')
      .setDescription(`**チャンネル名:** \`#${channel.name}\`\n**種類:** ${channel.type}\n**ID:** ${channel.id}`)
      .setTimestamp();
    this.sendLog(channel.guild.id, embed);
  }

  handleGuildMemberAdd(member: GuildMember): void {
    const embed = new CustomEmbed(member.user)
      .setColor(0x00FF00)
      .setTitle('メンバー参加')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`${member} **${member.user.tag}** がサーバーに参加しました。`)
      .addFields({ name: 'アカウント作成日', value: member.user.createdAt.toLocaleString('ja-JP') })
      .setTimestamp();
    this.sendLog(member.guild.id, embed);
  }

  handleGuildMemberRemove(member: GuildMember): void {
    const embed = new CustomEmbed(member.user)
      .setColor(0xFF0000)
      .setTitle('メンバー退出')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`${member.user.tag} がサーバーから退出しました。`)
      .setTimestamp();
    this.sendLog(member.guild.id, embed);
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
      .setColor(0xFF0000)
      .setTitle('メッセージ削除')
      .setDescription(`**チャンネル:** ${message.channel}`)
      .addFields(
        { name: 'メッセージ送信者', value: authorInfo, inline: true },
        { name: '削除実行者', value: executor, inline: true },
        { name: '内容', value: `\`\`\`${content.slice(0, 1000)}\`\`\`` },
      )
      .setTimestamp();
    this.sendLog(message.guild.id, embed);
  }

  handleMessageUpdate(oldMessage: Message, newMessage: Message): void {
    if (!newMessage.guild || newMessage.author.bot || oldMessage.content === newMessage.content) return;
    const embed = new CustomEmbed(newMessage.author)
      .setColor(0x0000FF)
      .setTitle('メッセージ編集')
      .setDescription(`**[メッセージへ飛ぶ](${newMessage.url})**`)
      .addFields(
        { name: '送信者', value: `${newMessage.author}`, inline: true },
        { name: 'チャンネル', value: `${newMessage.channel}`, inline: true },
        { name: '変更前', value: `\`\`\`${oldMessage.content || '(なし)'}\`\`\`` },
        { name: '変更後', value: `\`\`\`${newMessage.content || '(なし)'}\`\`\`` },
      )
      .setTimestamp();
    this.sendLog(newMessage.guild.id, embed);
  }

  handleRoleCreate(role: Role): void {
    const embed = new CustomEmbed()
      .setColor(0x00FF00)
      .setTitle('ロール作成')
      .setDescription(`**ロール名:** ${role}\n**ID:** ${role.id}`)
      .setTimestamp();
    this.sendLog(role.guild.id, embed);
  }

  handleRoleDelete(role: Role): void {
    const embed = new CustomEmbed()
      .setColor(0xFF0000)
      .setTitle('ロール削除')
      .setDescription(`**ロール名:** \`@${role.name}\`\n**ID:** ${role.id}`)
      .setTimestamp();
    this.sendLog(role.guild.id, embed);
  }

  handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
    const member = newState.member;
    if (!member) return;

    let description = '';
    let color = 0xAAAAAA;

    if (!oldState.channel && newState.channel) {
      description = `${member} がボイスチャット **${newState.channel.name}** に参加しました。`;
      color = 0x00FF00;
    } else if (oldState.channel && !newState.channel) {
      description = `${member} がボイスチャット **${oldState.channel.name}** から退出しました。`;
      color = 0xFF0000;
    } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
      description = `${member} がVCを移動しました。\n**移動元:** ${oldState.channel.name}\n**移動先:** ${newState.channel.name}`;
      color = 0x0000FF;
    } else {
      return;
    }

    const embed = new CustomEmbed(member.user)
      .setColor(color)
      .setTitle('ボイスチャットログ')
      .setDescription(description)
      .setTimestamp();
    this.sendLog(newState.guild.id, embed);
  }

  handleGuildMemberUpdate(oldMember: GuildMember, newMember: GuildMember): void {
    if (oldMember.nickname !== newMember.nickname) {
      const embed = new CustomEmbed(newMember.user)
        .setColor(0x0000FF)
        .setTitle('ニックネーム変更')
        .setThumbnail(newMember.user.displayAvatarURL())
        .setDescription(`${newMember} のニックネームが変更されました。`)
        .addFields(
          { name: '変更前', value: `\`${oldMember.nickname || 'なし'}\``, inline: true },
          { name: '変更後', value: `\`${newMember.nickname || 'なし'}\``, inline: true },
        )
        .setTimestamp();
      this.sendLog(newMember.guild.id, embed);
    }

    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;
    if (oldRoles.size !== newRoles.size) {
      const embed = new CustomEmbed(newMember.user)
        .setColor(0x0000FF)
        .setTitle('ロール変更')
        .setThumbnail(newMember.user.displayAvatarURL())
        .setDescription(`${newMember} のロールが変更されました。`);

      const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
      if (addedRoles.size > 0) {
        embed.addFields({ name: '付与されたロール', value: addedRoles.map(r => r.toString()).join(' ') });
      }

      const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));
      if (removedRoles.size > 0) {
        embed.addFields({ name: '剥奪されたロール', value: removedRoles.map(r => r.toString()).join(' ') });
      }
      this.sendLog(newMember.guild.id, embed);
    }
  }

  handleUserUpdate(oldUser: import('discord.js').User, newUser: import('discord.js').User): void {
    if (oldUser.username !== newUser.username) {
      for (const guild of this.client!.guilds.cache.values()) {
        if (guild.members.cache.has(newUser.id)) {
          const embed = new CustomEmbed(newUser)
            .setColor(0x0000FF)
            .setTitle('ユーザー名変更')
            .setThumbnail(newUser.displayAvatarURL())
            .setDescription(`${newUser} のユーザー名が変更されました。`)
            .addFields(
              { name: '変更前', value: `\`${oldUser.tag}\``, inline: true },
              { name: '変更後', value: `\`${newUser.tag}\``, inline: true },
            )
            .setTimestamp();
          this.sendLog(guild.id, embed);
        }
      }
    }
  }
}

export const logManager = new LogManager();