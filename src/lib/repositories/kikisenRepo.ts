import { BaseRepository } from './baseRepository.js';
import type { ActiveChannelData, LogEntry } from '../../types/index.js';
import type { Message } from 'discord.js';

export class KikisenRepository extends BaseRepository {
  async setLogChannel(guildId: string, channelId: string): Promise<void> {
    this.getGuildSettings(guildId).logChannelId = channelId;
    await this.save();
  }

  getLogChannel(guildId: string): string | undefined {
    return this.getState().guildSettings[guildId]?.logChannelId;
  }

  getActiveChannelByVoice(vcId: string): ActiveChannelData | null {
    const tcId = Object.keys(this.getState().activeChannels).find(
      (key) => this.getState().activeChannels[key].voiceChannelId === vcId,
    );
    if (!tcId) return null;
    return { id: tcId, ...this.getState().activeChannels[tcId] };
  }

  getActiveChannelByText(tcId: string): ActiveChannelData | null {
    const entry = this.getState().activeChannels[tcId];
    return entry ? { id: tcId, ...entry } : null;
  }

  getAllActiveChannels(): Record<string, Omit<ActiveChannelData, 'id'>> {
    return this.getState().activeChannels;
  }

  async createActiveChannel(guildId: string, vcId: string, tcId: string): Promise<void> {
    this.getState().activeChannels[tcId] = { guildId, voiceChannelId: vcId, log: [] };
    await this.save();
  }

  async deleteActiveChannel(tcId: string): Promise<void> {
    delete this.getState().activeChannels[tcId];
    await this.save();
  }

  getLog(tcId: string): LogEntry[] | undefined {
    return this.getState().activeChannels[tcId]?.log;
  }

  async logMessage(tcId: string, message: Message): Promise<void> {
    const entry = this.getState().activeChannels[tcId];
    if (!entry) return;
    entry.log.push({
      id: message.id,
      timestamp: message.createdTimestamp,
      author: message.author.tag,
      content: message.content || '(添付ファイルのみ)',
      edits: [],
      deleted: false,
    });
    await this.save();
  }

  async logMessageUpdate(tcId: string, newMessage: Message): Promise<void> {
    const entry = this.getState().activeChannels[tcId];
    if (!entry?.log) return;
    const logEntry = entry.log.find((l) => l.id === newMessage.id);
    if (logEntry) {
      logEntry.edits.push({
        timestamp: newMessage.editedTimestamp,
        content: newMessage.content,
      });
      await this.save();
    }
  }

  async logMessageDelete(tcId: string, messageId: string): Promise<void> {
    const entry = this.getState().activeChannels[tcId];
    if (!entry?.log) return;
    const logEntry = entry.log.find((l) => l.id === messageId);
    if (logEntry) {
      logEntry.deleted = true;
      await this.save();
    }
  }
}

export const kikisenRepo = new KikisenRepository();