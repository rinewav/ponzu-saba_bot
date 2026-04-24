import type { Client, GuildMember, VoiceState } from 'discord.js';
import cron from 'node-cron';
import { levelRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

export class LevelManager {
  private client: Client | null = null;
  private voiceIntervals = new Map<string, NodeJS.Timeout>();
  private loginTimers = new Map<string, NodeJS.Timeout>();

  async initialize(client: Client): Promise<void> {
    this.client = client;
    await levelRepo.loadLevelData();
    this.restoreVoiceXP();

    cron.schedule('5 0 * * *', () => {
      this.checkCrossDayLogins();
    }, { timezone: 'Asia/Tokyo' });
  }

  xpForLevel(level: number): number {
    return 100 * (level + 1);
  }

  getUserData(guildId: string, userId: string) {
    return levelRepo.getUserData(guildId, userId);
  }

  async setUserData(guildId: string, userId: string, data: Partial<import('../types/index.js').LevelUserData>) {
    return levelRepo.setUserData(guildId, userId, data);
  }

  async awardXp(member: GuildMember, amount: number): Promise<void> {
    if (!member || member.user.bot) return;
    const record = levelRepo.getUserData(member.guild.id, member.id);
    record.xp += amount;

    let levelUp = false;
    while (record.xp >= this.xpForLevel(record.level)) {
      record.xp -= this.xpForLevel(record.level);
      record.level += 1;
      levelUp = true;

      const levelSettings = await levelRepo.getLevelSettings(member.guild.id);
      const roleId = levelSettings?.levelRoles?.[record.level.toString()];
      if (roleId) {
        try {
          const role = await member.guild.roles.fetch(roleId);
          if (role) await member.roles.add(role).catch(console.error);
        } catch (err) {
          console.error(`[LevelSystem] ロール付与エラー (RoleID: ${roleId}):`, err);
        }
      }
    }

    if (levelUp) {
      const levelSettings = await levelRepo.getLevelSettings(member.guild.id);
      const levelUpChannelId = levelSettings?.levelUpChannelId;
      if (!levelUpChannelId) {
        await levelRepo.saveLevelData();
        return;
      }

      const embed = new CustomEmbed(member.user)
        .setTitle('🎉 レベルアップ！')
        .setDescription(`${member} が **レベル ${record.level}** に到達しました！`)
        .setColor('#f50004')
        .setThumbnail(member.user.displayAvatarURL());

      const channel = await member.guild.channels.fetch(levelUpChannelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        channel.send({ embeds: [embed] }).catch(console.error);
      }
    }

    await levelRepo.saveLevelData();
  }

  async handleMessage(message: import('discord.js').Message): Promise<void> {
    if (!message.member || message.author.bot) return;

    const levelSettings = await levelRepo.getLevelSettings(message.guild!.id);
    const excluded = levelSettings?.excludedChannels || [];
    if (excluded.includes(message.channel.id) || (message.channel.isTextBased() && 'parentId' in message.channel && message.channel.parentId && excluded.includes(message.channel.parentId))) return;

    if (message.member?.voice?.channel) return;

    await this.awardXp(message.member, levelSettings?.xpPerMessage || 30);
  }

  async handleVoiceState(oldState: VoiceState | null, newState: VoiceState): Promise<void> {
    const member = newState.member || (oldState?.member);
    if (!member || member.user.bot) return;

    const oldChannel = oldState?.channel ?? null;
    const newChannel = newState.channel;

    if (oldChannel && !newChannel) {
      if (this.loginTimers.has(member.id)) {
        clearTimeout(this.loginTimers.get(member.id)!);
        this.loginTimers.delete(member.id);
      }
    } else if (newChannel && (!oldChannel || oldChannel.id !== newChannel.id)) {
      if (this.loginTimers.has(member.id)) {
        clearTimeout(this.loginTimers.get(member.id)!);
        this.loginTimers.delete(member.id);
      }
      await this.setLoginBonusTimer(member, newChannel);
    }

    const levelSettings = await levelRepo.getLevelSettings(newState.guild.id);
    const excluded = levelSettings?.excludedChannels || [];

    const stopInterval = () => {
      const interval = this.voiceIntervals.get(member.id);
      if (interval) {
        clearInterval(interval);
        this.voiceIntervals.delete(member.id);
      }
    };

    const startInterval = () => {
      if (!newChannel || excluded.includes(newChannel.id) || excluded.includes(newChannel.parentId ?? '')) return;
      stopInterval();
      const interval = setInterval(() => {
        const currentMember = newState.guild.members.cache.get(member.id);
        if (!currentMember?.voice?.channel) {
          clearInterval(interval);
          this.voiceIntervals.delete(member.id);
          return;
        }
        const voiceState = currentMember.voice;
        if (voiceState.deaf && !voiceState.streaming && !voiceState.selfVideo) return;
        this.awardXp(member, (levelSettings?.xpPerSecondVoice || 0.15) * 10);
      }, 10000);
      this.voiceIntervals.set(member.id, interval);
    };

    if (!oldChannel && newChannel) {
      startInterval();
    } else if (oldChannel && !newChannel) {
      stopInterval();
    } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      stopInterval();
      startInterval();
    }
  }

  private restoreVoiceXP(): void {
    if (!this.client) return;
    for (const guild of this.client.guilds.cache.values()) {
      for (const member of guild.members.cache.values()) {
        if (member.voice.channel) {
          this.handleVoiceState(null, member.voice);
        }
      }
    }
  }

  private async setLoginBonusTimer(member: GuildMember, channel: import('discord.js').VoiceBasedChannel): Promise<void> {
    const levelSettings = await levelRepo.getLevelSettings(member.guild.id);

    if (levelSettings?.excludedChannels?.includes(channel.id) || (channel.parentId && levelSettings?.excludedChannels?.includes(channel.parentId))) {
      return;
    }

    const timer = setTimeout(() => {
      if (member.voice.channel) {
        this.grantLoginBonus(member);
      }
      this.loginTimers.delete(member.id);
    }, 5 * 60 * 1000);

    this.loginTimers.set(member.id, timer);
  }

  async checkCrossDayLogins(): Promise<void> {
    console.log('[LevelSystem] 日付をまたいだログインボーナスのチェックを開始します...');
    if (!this.client) return;

    for (const guild of this.client.guilds.cache.values()) {
      const levelSettings = await levelRepo.getLevelSettings(guild.id);
      if (!levelSettings) continue;

      const excluded = levelSettings.excludedChannels || [];

      for (const member of guild.members.cache.values()) {
        if (member.user.bot || !member.voice.channel) continue;
        if (excluded.includes(member.voice.channel.id) || (member.voice.channel.parentId && excluded.includes(member.voice.channel.parentId))) continue;

        await this.grantLoginBonus(member);
      }
    }
  }

  async grantLoginBonus(member: GuildMember): Promise<void> {
    const userData = levelRepo.getUserData(member.guild.id, member.id);
    const now = new Date();

    const lastLoginDate = userData.lastLogin ? new Date(userData.lastLogin).toLocaleDateString('ja-JP') : null;
    const todayDate = now.toLocaleDateString('ja-JP');
    if (lastLoginDate === todayDate) return;

    if (this.loginTimers.has(member.id)) {
      clearTimeout(this.loginTimers.get(member.id)!);
      this.loginTimers.delete(member.id);
    }

    const levelSettings = await levelRepo.getLevelSettings(member.guild.id);

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (userData.lastLogin && new Date(userData.lastLogin).toLocaleDateString('ja-JP') === yesterday.toLocaleDateString('ja-JP')) {
      userData.loginStreak += 1;
    } else {
      userData.loginStreak = 1;
    }

    if (userData.loginStreak > userData.highestLoginStreak) {
      userData.highestLoginStreak = userData.loginStreak;
    }

    userData.lastLogin = now.getTime();

    const baseXP = levelSettings?.loginBonusBaseXp || 100;
    const streakBonus = userData.loginStreak * 10;
    const totalXP = baseXP + streakBonus;

    await this.awardXp(member, totalXP);

    console.log(`[LevelSystem] ${member.user.tag} にログインボーナスを付与しました。`);

    const notifyChannelId = levelSettings?.levelUpChannelId;
    if (!notifyChannelId) return;

    const notifyChannel = await this.client!.channels.fetch(notifyChannelId).catch(() => null);
    if (notifyChannel && notifyChannel.isTextBased()) {
      const xpForNextLevel = this.xpForLevel(userData.level);
      const progress = Math.floor((userData.xp / xpForNextLevel) * 10);
      const progressBar = '🟩'.repeat(progress) + '⬛'.repeat(10 - progress);

      const embed = new CustomEmbed(member.user)
        .setTitle('🎉 ログインボーナス！')
        .setColor(0xFFD700)
        .setDescription(`${member} がログインしました！`)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: '獲得XP', value: `${totalXP} XP`, inline: false },
          { name: '連続ログイン', value: `**${userData.loginStreak}** 日目`, inline: true },
          { name: '最高記録', value: `**${userData.highestLoginStreak}** 日`, inline: true },
          { name: '次のレベルまで', value: `${progressBar}\n(${Math.floor(userData.xp)}/${xpForNextLevel} XP)`, inline: false },
        );
      await (notifyChannel as import('discord.js').TextChannel).send({ embeds: [embed] });
    }
  }

  async applyRetroactiveRole(guild: import('discord.js').Guild, level: number, roleId: string): Promise<number> {
    const members = await guild.members.fetch();
    let appliedCount = 0;

    for (const [userId, member] of members) {
      const userData = levelRepo.getUserData(guild.id, userId);
      if (userData.level >= level) {
        if (!member.roles.cache.has(roleId)) {
          try {
            await member.roles.add(roleId, `レベル ${level} 到達報酬の遡及適用`);
            appliedCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err) {
            console.error(`[LevelSystem] ${member.user.tag} への遡及ロール付与に失敗 (RoleID: ${roleId}):`, err);
          }
        }
      }
    }

    console.log(`[LevelSystem] ${guild.name} でレベル ${level} ロール (ID: ${roleId}) を ${appliedCount} 人に遡及適用しました。`);
    return appliedCount;
  }
}

export const levelManager = new LevelManager();