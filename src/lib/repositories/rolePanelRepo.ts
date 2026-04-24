import { BaseRepository } from './baseRepository.js';
import type { RolePanelData } from '../../types/index.js';

export class RolePanelRepository extends BaseRepository {
  async addRolePanel(messageId: string, data: RolePanelData): Promise<void> {
    if (!this.getState().rolePanels) this.getState().rolePanels = {};
    this.getState().rolePanels[messageId] = data;
    await this.save();
  }

  async getRolePanel(messageId: string): Promise<RolePanelData | undefined> {
    return this.getState().rolePanels?.[messageId];
  }

  async removeRolePanel(messageId: string): Promise<void> {
    if (this.getState().rolePanels?.[messageId]) {
      delete this.getState().rolePanels[messageId];
      await this.save();
    }
  }
}

export const rolePanelRepo = new RolePanelRepository();