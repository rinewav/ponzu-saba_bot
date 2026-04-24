import {
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder,
  type Client,
  type GuildMember,
  type VoiceState,
  type Guild,
  type VoiceChannel,
  type TextChannel,
} from 'discord.js';
import { kikisenRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

const processingVCs = new Set<string>();

export class KikisenManager {
  private client: Client | null = null;
  private isFirstConsistencyCheck = true;

  async initialize(client: Client): Promise<void> {
    this.client = client;
    console.log('[Kikisen] 状態をロードしました。');
    await this.checkConsistency();
    this.isFirstConsistencyCheck = false;
    setInterval(() => this.checkConsistency(), 300000);
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const user = newState.member;
    if (!user || user.user.bot) return;

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    if (newChannel && (!oldChannel || oldChannel.id !== newChannel.id)) {
      await this.handleUserJoin(user, newChannel as VoiceChannel);
    }

    if (oldChannel && (!newChannel || oldChannel.id !== newChannel.id)) {
      await this.handleUserLeave(user, oldChannel as VoiceChannel, newState);
    }
  }

  private async handleUserJoin(member: GuildMember, vc: VoiceChannel): Promise<void> {
    if (processingVCs.has(vc.id)) return;

    const membersInVC = vc.members.filter(m => !m.user.bot);
    const activeChannel = kikisenRepo.getActiveChannelByVoice(vc.id);

    if (membersInVC.size === 1 && !activeChannel) {
      processingVCs.add(vc.id);
      try {
        await this.createKikisenChannel(member, vc);
      } catch (error: unknown) {
        console.error(`[Kikisen] チャンネル作成エラー (VC: ${vc.id}):`, error);
      } finally {
        processingVCs.delete(vc.id);
      }
    } else if (activeChannel) {
      const tc = await this.client!.channels.fetch(activeChannel.id).catch(() => null);
      if (tc && tc.isTextBased() && 'permissionOverwrites' in tc) {
        await this.updatePermissions(tc as TextChannel, vc);
        const isBot = member.user.bot;
        const botSuffix = isBot ? ' (ボット🤖)' : '';
        const joinEmbed = new CustomEmbed(member.user)
          .setColor(0x00FF00)
          .setDescription(`**${member}**${botSuffix} が参加しました。`);

        if (!isBot) {
          await (tc as TextChannel).send({ content: `${member} 聞き専チャットはこちらです🍎`, embeds: [joinEmbed] });
        } else {
          await (tc as TextChannel).send({ embeds: [joinEmbed] });
        }
      }
    }
  }

  private async handleUserLeave(member: GuildMember, oldChannel: VoiceChannel, newState: VoiceState): Promise<void> {
    if (processingVCs.has(oldChannel.id)) return;

    const membersInVC = oldChannel.members.filter(m => !m.user.bot);
    const activeChannel = kikisenRepo.getActiveChannelByVoice(oldChannel.id);

    if (!activeChannel) return;

    if (membersInVC.size === 0) {
      processingVCs.add(oldChannel.id);
      try {
        await this.archiveAndDeleteKikisenChannel(oldChannel.guild, oldChannel.id, activeChannel.id);
      } catch (error: unknown) {
        console.error(`[Kikisen] チャンネル削除エラー (VC: ${oldChannel.id}):`, error);
      } finally {
        processingVCs.delete(oldChannel.id);
      }
    } else {
      const tc = await this.client!.channels.fetch(activeChannel.id).catch(() => null);
      if (tc && tc.isTextBased() && 'permissionOverwrites' in tc) {
        await this.updatePermissions(tc as TextChannel, oldChannel);
        const isBot = member.user.bot;
        const botSuffix = isBot ? ' (ボット🤖)' : '';
        let descriptionText: string;
        if (newState.channel) {
          descriptionText = `**${member}**${botSuffix} が ${oldChannel} から ${newState.channel} へ移動しました。`;
        } else {
          descriptionText = `**${member}**${botSuffix} が退出しました。`;
        }
        const leaveEmbed = new CustomEmbed(member.user)
          .setColor(0xFFA500)
          .setDescription(descriptionText);
        await (tc as TextChannel).send({ embeds: [leaveEmbed] });
      }
    }
  }

  private async createKikisenChannel(member: GuildMember, vc: VoiceChannel): Promise<void> {
    const guild = vc.guild;
    const channelName = `👂️｜聞き専-${vc.id}`;

    const permissionOverwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: this.client!.user!.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.ManageChannels] },
    ];
    vc.members.forEach(m => {
      if (!m.user.bot) permissionOverwrites.push({ id: m.id, allow: [PermissionsBitField.Flags.ViewChannel] });
    });

    const tc = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: vc.parent,
      permissionOverwrites,
      topic: `ボイスチャット ${vc} 用の聞き専チャットです。VCが空になると自動で削除されます。`,
    });

    await kikisenRepo.createActiveChannel(guild.id, vc.id, tc.id);

    const embed = new CustomEmbed(member.user)
      .setColor(0x00FF00)
      .setDescription(`**${member}** が参加しました。`);

    await tc.send({ content: `${member} 聞き専チャットを作成しました🍎`, embeds: [embed] });
    console.log(`[Kikisen] チャンネルを作成しました: ${channelName} (VC: ${vc.name})`);
  }

  private async archiveAndDeleteKikisenChannel(guild: Guild, vcId: string, tcId: string): Promise<void> {
    const logChannelId = kikisenRepo.getLogChannel(guild.id);

    if (!logChannelId) {
      console.warn(`[Kikisen] ログチャンネルが未設定のため、ログを保存せずにチャンネルを削除します (Guild: ${guild.id})`);
    } else {
      const logChannel = await this.client!.channels.fetch(logChannelId).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        const logData = kikisenRepo.getLog(tcId);
        if (logData && logData.length > 0) {
          let logContent = `ボイスチャット <#${vcId}> (ID: ${vcId}) のログです。\n\n`;
          logContent += logData.map(log => {
            const time = new Date(log.timestamp).toLocaleString('ja-JP');
            let entry = `${log.deleted ? '【削除済み】 ' : ''}[${time}] ${log.author}: ${log.content}`;
            if (log.edits && log.edits.length > 0) {
              entry += log.edits.map((edit: { timestamp: number | null; content: string }) => {
                const editTime = edit.timestamp ? new Date(edit.timestamp).toLocaleString('ja-JP') : '不明';
                return `\n  └ (編集: ${editTime}) ${edit.content}`;
              }).join('');
            }
            return entry;
          }).join('\n');

          const attachment = new AttachmentBuilder(Buffer.from(logContent, 'utf-8'), { name: `kikisen-log-${vcId}-${Date.now()}.txt` });
          const embed = new CustomEmbed()
            .setColor(0x0000FF)
            .setTitle('📝 聞き専チャット ログ')
            .setDescription(`VC <#${vcId}> のチャットログを保存しました。`);
          await (logChannel as TextChannel).send({ embeds: [embed], files: [attachment] });
        }
      }
    }

    const tc = await this.client!.channels.fetch(tcId).catch(() => null);
    if (tc && 'deletable' in tc && tc.deletable) await tc.delete('VCが空になったため');

    await kikisenRepo.deleteActiveChannel(tcId);
    console.log(`[Kikisen] チャンネルを削除しました: ${tcId}`);
  }

  private async updatePermissions(tc: TextChannel, vc: VoiceChannel): Promise<void> {
    const currentPermissions = new Map(tc.permissionOverwrites.cache.map(p => [p.id, p]));
    const vcMembers = new Set(vc.members.filter(m => !m.user.bot).map(m => m.id));

    for (const memberId of vcMembers) {
      if (!currentPermissions.has(memberId)) {
        await tc.permissionOverwrites.create(memberId, { ViewChannel: true }).catch(console.error);
      }
    }

    for (const [id] of currentPermissions) {
      if (id === tc.guild.roles.everyone.id || id === this.client!.user!.id) continue;
      if (!vcMembers.has(id)) {
        await tc.permissionOverwrites.delete(id).catch(console.error);
      }
    }
  }

  async checkConsistency(): Promise<void> {
    if (!this.client) return;
    console.log('[Kikisen] 整合性チェックを開始します...');
    const allActiveChannels = kikisenRepo.getAllActiveChannels();

    const restartEmbed = new CustomEmbed()
      .setColor(0xFFA500)
      .setDescription('⚙️ ボットが再起動しました。');

    for (const tcId in allActiveChannels) {
      const { guildId, voiceChannelId } = allActiveChannels[tcId];
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) {
        await kikisenRepo.deleteActiveChannel(tcId);
        continue;
      }

      const tc = await guild.channels.fetch(tcId).catch(() => null);
      const vc = await guild.channels.fetch(voiceChannelId).catch(() => null);

      if (!tc || !vc || vc.type !== ChannelType.GuildVoice) {
        const active = kikisenRepo.getActiveChannelByText(tcId);
        if (active) {
          await this.archiveAndDeleteKikisenChannel(guild, voiceChannelId, tcId);
        }
        continue;
      }

      const voiceChannel = vc as VoiceChannel;
      const membersInVC = voiceChannel.members.filter(m => !m.user.bot);
      if (membersInVC.size === 0) {
        const active = kikisenRepo.getActiveChannelByText(tc.id);
        if (active) {
          await this.archiveAndDeleteKikisenChannel(guild, vc.id, tc.id);
        }
      } else {
        if ('permissionOverwrites' in tc) {
          await this.updatePermissions(tc as TextChannel, voiceChannel);
        }
        if (this.isFirstConsistencyCheck && tc.isTextBased()) {
          await (tc as TextChannel).send({ embeds: [restartEmbed] }).catch(console.error);
        }
      }
    }

    for (const guild of this.client.guilds.cache.values()) {
      const channels = await guild.channels.fetch().catch(() => null);
      if (!channels) continue;
      for (const channel of channels.values()) {
        if (channel && channel.type === ChannelType.GuildText && channel.name.startsWith('👂️｜聞き専-')) {
          if (!kikisenRepo.getActiveChannelByText(channel.id)) {
            const vcId = channel.name.split('-')[1];
            const vc = await guild.channels.fetch(vcId).catch(() => null);
            if (!vc || vc.type !== ChannelType.GuildVoice || (vc as VoiceChannel).members.filter(m => !m.user.bot).size === 0) {
              console.log(`[Kikisen] 消し漏れチャンネルを削除します: ${channel.name}`);
              await channel.delete('整合性チェックによる自動削除').catch(console.error);
            } else {
              console.log(`[Kikisen] 消し漏れチャンネルの状態を復元します: ${channel.name}`);
              await kikisenRepo.createActiveChannel(guild.id, vc.id, channel.id);
              await this.updatePermissions(channel as TextChannel, vc as VoiceChannel);
              if (this.isFirstConsistencyCheck) {
                await (channel as TextChannel).send({ embeds: [restartEmbed] }).catch(console.error);
              }
            }
          }
        }
      }
    }
    console.log('[Kikisen] 整合性チェックが完了しました。');
  }
}

export const kikisenManager = new KikisenManager();