import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import type { AppState } from '../../types/index.js';

const STATE_FILE = path.join(process.cwd(), 'data', 'kikisen-state.json');
const STATE_TMP = STATE_FILE + '.tmp';

const DEFAULT_STATE: AppState = {
  guildSettings: {},
  activeChannels: {},
  dailyStats: {},
  welcomeMessages: {},
  workoutTimestamps: {},
  cleanupJobs: {},
  rolePanels: {},
  crossPostTargets: {},
  reupload: {},
  verificationApplications: {},
};

let state: AppState = structuredClone(DEFAULT_STATE);
let isSaving = false;
let saveQueued = false;

async function saveState(): Promise<void> {
  if (isSaving) {
    saveQueued = true;
    return;
  }
  isSaving = true;
  try {
    const data = JSON.stringify(state, null, 2);
    await writeFile(STATE_TMP, data, 'utf8');
    await rename(STATE_TMP, STATE_FILE);
  } catch (error) {
    console.error('状態の保存に失敗しました:', error);
  } finally {
    isSaving = false;
    if (saveQueued) {
      saveQueued = false;
      await saveState();
    }
  }
}

export class BaseRepository {
  protected getState(): AppState {
    return state;
  }

  protected getGuildSettings(guildId: string) {
    if (!state.guildSettings[guildId]) {
      state.guildSettings[guildId] = {};
    }
    return state.guildSettings[guildId];
  }

  protected async save(): Promise<void> {
    await saveState();
  }

  static async load(): Promise<void> {
    try {
      const data = await readFile(STATE_FILE, 'utf8');
      state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(data) };
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('状態ファイルが見つからないため、新しいファイルを作成します。');
        await saveState();
      } else {
        console.error('状態の読み込みに失敗しました:', error);
      }
    }
  }
}