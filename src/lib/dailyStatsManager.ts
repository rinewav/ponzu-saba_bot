import type { Client, Message, VoiceState } from 'discord.js';
import cron from 'node-cron';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { dailyStatsRepo } from './repositories/index.js';
import { CustomEmbed } from './customEmbed.js';

interface VoiceSession {
  channelId: string;
  joinedAt: number;
}

export class DailyStatsManager {
  private client: Client | null = null;
  private currentVoiceSessions = new Map<string, VoiceSession>();

  initialize(client: Client): void {
    this.client = client;
    this.restoreVoiceSessions();

    cron.schedule('50 23 * * *', () => {
      console.log('[DailyStats] デイリーレポートの送信時間です。');
      this.sendAllReports();
    }, { timezone: 'Asia/Tokyo' });
  }

  private restoreVoiceSessions(): void {
    if (!this.client) return;
    for (const guild of this.client.guilds.cache.values()) {
      void guild.members.fetch({ withPresences: false }).catch(() => {});
      for (const member of guild.members.cache.values()) {
        if (member.voice.channel) {
          this.currentVoiceSessions.set(member.id, {
            channelId: member.voice.channel.id,
            joinedAt: Date.now(),
          });
        }
      }
    }
  }

  async trackMessage(message: Message): Promise<void> {
    if (!message.guild || message.author.bot) return;
    const settings = await dailyStatsRepo.getDailyStatsSettings(message.guild.id);
    if (settings?.excludedChannels?.includes(message.channel.id)) return;

    await dailyStatsRepo.logUserActivity(message.guild.id, message.author.id);
  }

  async trackVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const guildId = newState.guild.id;
    const settings = await dailyStatsRepo.getDailyStatsSettings(guildId);

    const wasInVc = this.currentVoiceSessions.has(member.id);
    const isInVc = newState.channel !== null;

    if (!wasInVc && isInVc) {
      if (settings?.excludedChannels?.includes(newState.channel!.id)) return;
      this.currentVoiceSessions.set(member.id, {
        channelId: newState.channel!.id,
        joinedAt: Date.now(),
      });
    } else if (wasInVc && !isInVc) {
      const session = this.currentVoiceSessions.get(member.id);
      if (session && settings?.excludedChannels?.includes(session.channelId)) {
        this.currentVoiceSessions.delete(member.id);
        return;
      }

      if (session) {
        const duration = Date.now() - session.joinedAt;
        await dailyStatsRepo.logVoiceSession(guildId, {
          userId: member.id,
          channelId: session.channelId,
          startedAt: session.joinedAt,
          duration,
        });
      }
      this.currentVoiceSessions.delete(member.id);
    } else if (wasInVc && isInVc && oldState.channel?.id !== newState.channel?.id) {
      const oldSession = this.currentVoiceSessions.get(member.id);
      if (oldSession && !settings?.excludedChannels?.includes(oldSession.channelId)) {
        const duration = Date.now() - oldSession.joinedAt;
        await dailyStatsRepo.logVoiceSession(guildId, {
          userId: member.id,
          channelId: oldSession.channelId,
          startedAt: oldSession.joinedAt,
          duration,
        });
      }
      if (newState.channel && !settings?.excludedChannels?.includes(newState.channel.id)) {
        this.currentVoiceSessions.set(member.id, {
          channelId: newState.channel.id,
          joinedAt: Date.now(),
        });
      } else {
        this.currentVoiceSessions.delete(member.id);
      }
    }
  }

  async sendAllReports(): Promise<void> {
    if (!this.client) return;
    for (const guild of this.client.guilds.cache.values()) {
      await this.generateAndSendReport(guild, true);
    }
  }

  async generateAndSendReport(guild: import('discord.js').Guild, shouldClearData = false): Promise<void> {
    const settings = await dailyStatsRepo.getDailyStatsSettings(guild.id);
    if (!settings || !settings.reportChannelId) {
      if (!shouldClearData) throw new Error('レポートチャンネルが設定されていません。');
      return;
    }

    const reportChannel = await guild.channels.fetch(settings.reportChannelId).catch(() => null);
    if (!reportChannel || !reportChannel.isTextBased()) {
      if (!shouldClearData) throw new Error('レポートチャンネルが見つかりません。');
      return;
    }

    const statsData = await dailyStatsRepo.getDailyStatsData(guild.id);
    if (!statsData || (!statsData.voiceSessions?.length && !Object.keys(statsData.userActivity || {}).length)) {
      if (!shouldClearData) throw new Error('レポート対象の活動データがまだありません。');
      return;
    }

    const embed = new CustomEmbed()
      .setTitle(`📈 ${new Date().toLocaleDateString('ja-JP')} のサーバー活動レポート`)
      .setDescription('本日1日のサーバー活動の概要です。');

    const userActivity = statsData.userActivity || {};
    const sortedUsers = Object.entries(userActivity)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10);

    if (sortedUsers.length > 0) {
      const userRanking = sortedUsers.map(([userId, count], index) => {
        return `${index + 1}. <@${userId}> (${count}回)`;
      });
      embed.addFields({ name: '💬 テキストアクティブユーザーランキング', value: userRanking.join('\n') });
    }

    const voiceSessions = statsData.voiceSessions || [];
    if (voiceSessions.length > 0) {
      const chartImage = await this.createVoiceChart(voiceSessions);
      embed.setImage('attachment://voice-activity.png');
      await (reportChannel as import('discord.js').TextChannel).send({
        embeds: [embed],
        files: [{ attachment: chartImage, name: 'voice-activity.png' }],
      });
    } else {
      await (reportChannel as import('discord.js').TextChannel).send({ embeds: [embed] });
    }

    if (shouldClearData) {
      await dailyStatsRepo.clearDailyStatsData(guild.id);
    }
  }

  private async createVoiceChart(sessions: import('../types/index.js').VoiceSessionData[]): Promise<Buffer> {
    const hourlyData = Array(24).fill(0);
    for (const session of sessions) {
      const start = new Date(session.startedAt);
      const startHour = start.getHours();
      const durationHours = session.duration / (1000 * 60 * 60);

      for (let i = 0; i < Math.ceil(durationHours); i++) {
        const hourIndex = (startHour + i) % 24;
        hourlyData[hourIndex] += Math.min(1, durationHours - i) * 60;
      }
    }

    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width: 800, height: 400, backgroundColour: '#2F3136' });
    const configuration = {
      type: 'bar' as const,
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        datasets: [{
          label: 'VC利用時間グラフ (分)',
          data: hourlyData.map((d: number) => Math.round(d)),
          backgroundColor: 'rgba(88, 101, 242, 0.8)',
          borderColor: 'rgba(88, 101, 242, 1)',
          borderWidth: 1,
        }],
      },
      options: {
        scales: {
          y: { ticks: { color: '#FFFFFF' } },
          x: { ticks: { color: '#FFFFFF' } },
        },
        plugins: {
          legend: { labels: { color: '#FFFFFF' } },
        },
      },
    };
    return chartJSNodeCanvas.renderToBuffer(configuration);
  }
}

export const dailyStatsManager = new DailyStatsManager();