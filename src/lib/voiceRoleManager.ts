import type { Client, VoiceState } from 'discord.js';
import { miscRepo } from './repositories/index.js';

export class VoiceRoleManager {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
    this.syncAllGuilds();
  }

  private async syncAllGuilds(): Promise<void> {
    if (!this.client) return;

    for (const guild of this.client.guilds.cache.values()) {
      const settings = miscRepo.getVoiceRoleSettings(guild.id);
      const roleId = settings?.roleId;
      if (!roleId) continue;

      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) continue;

      console.log(`[VoiceRole] ${guild.name} のロール状態を同期中...`);

      let members;
      try {
        members = await guild.members.fetch();
      } catch {
        console.warn(`[VoiceRole] ${guild.name} のメンバー取得に失敗、キャッシュで代用します`);
        members = guild.members.cache;
      }
      for (const member of members.values()) {
        if (member.user.bot) continue;

        const hasRole = member.roles.cache.has(roleId);
        const inVoice = member.voice.channel !== null;

        if (inVoice && !hasRole) {
          await member.roles.add(role).catch(console.error);
        } else if (!inVoice && hasRole) {
          await member.roles.remove(role).catch(console.error);
        }
      }
    }
  }

  async handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member;
    if (!member || member.user.bot) return;

    const settings = miscRepo.getVoiceRoleSettings(newState.guild.id);
    const roleId = settings?.roleId;
    if (!roleId) return;

    const role = await newState.guild.roles.fetch(roleId).catch(() => null);
    if (!role) return;

    const wasInVc = oldState.channel !== null;
    const isInVc = newState.channel !== null;

    if (!wasInVc && isInVc) {
      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(role).catch(console.error);
      }
    } else if (wasInVc && !isInVc) {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role).catch(console.error);
      }
    }
  }
}

export const voiceRoleManager = new VoiceRoleManager();