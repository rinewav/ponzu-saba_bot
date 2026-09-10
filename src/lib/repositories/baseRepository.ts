import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { AppState } from '../../types/index.js';

/** 保存先ファイルの分割単位 */
export type StateSlice = 'settings' | 'runtime' | 'applications';

const DATA_DIR = path.join(process.cwd(), 'data');
const LEGACY_STATE_FILE = path.join(DATA_DIR, 'kikisen-state.json');

const ALL_SLICES: StateSlice[] = ['settings', 'runtime', 'applications'];

const SLICE_FILES: Record<StateSlice, string> = {
  settings: path.join(DATA_DIR, 'settings.json'),
  runtime: path.join(DATA_DIR, 'runtime.json'),
  applications: path.join(DATA_DIR, 'applications.json'),
};

const SLICE_KEYS: Record<StateSlice, (keyof AppState)[]> = {
  settings: ['guildSettings', 'rolePanels', 'crossPostTargets', 'reupload', 'lockedNicknames'],
  runtime: ['activeChannels', 'dailyStats', 'welcomeMessages', 'workoutTimestamps', 'cleanupJobs', 'vcLogSessions'],
  applications: ['verificationApplications'],
};

/** 保存をまとめるためのデバウンス時間（ミリ秒） */
const SAVE_DEBOUNCE_MS = 500;

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
  lockedNicknames: {},
  verificationApplications: {},
  vcLogSessions: {},
};

let state: AppState = structuredClone(DEFAULT_STATE);

const isSaving: Record<StateSlice, boolean> = { settings: false, runtime: false, applications: false };
const saveQueued: Record<StateSlice, boolean> = { settings: false, runtime: false, applications: false };

const dirtySlices = new Set<StateSlice>();
let saveTimer: NodeJS.Timeout | null = null;
let dataDirEnsured = false;
let exitHooksRegistered = false;

async function ensureDataDir(): Promise<void> {
  if (dataDirEnsured) return;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    dataDirEnsured = true;
  } catch (error) {
    console.error('[State] データディレクトリの作成に失敗しました:', error);
  }
}

/** 指定スライスに属するキーだけを抜き出したオブジェクトを返します。 */
function buildSlice(slice: StateSlice): Record<string, unknown> {
  const source = state as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of SLICE_KEYS[slice]) {
    const value = source[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** 1スライスをtmp+renameで原子的に書き込みます（スライスごとに合流制御）。 */
async function writeSlice(slice: StateSlice): Promise<void> {
  if (isSaving[slice]) {
    saveQueued[slice] = true;
    return;
  }
  isSaving[slice] = true;
  try {
    await ensureDataDir();
    const file = SLICE_FILES[slice];
    const data = JSON.stringify(buildSlice(slice), null, 2);
    await writeFile(`${file}.tmp`, data, 'utf8');
    await rename(`${file}.tmp`, file);
  } catch (error) {
    console.error(`[State] 状態(${slice})の保存に失敗しました:`, error);
  } finally {
    isSaving[slice] = false;
    if (saveQueued[slice]) {
      saveQueued[slice] = false;
      await writeSlice(slice);
    }
  }
}

async function flushDirtySlices(): Promise<void> {
  if (dirtySlices.size === 0) return;
  const slices = [...dirtySlices];
  dirtySlices.clear();
  await Promise.all(slices.map((slice) => writeSlice(slice)));
}

/** 指定スライスをdirtyにして、500ms後の一括書き込みを予約します。 */
export function scheduleSave(slice: StateSlice): void {
  dirtySlices.add(slice);
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushDirtySlices().catch((error) => console.error('[State] 状態の保存に失敗しました:', error));
  }, SAVE_DEBOUNCE_MS);
}

/** 予約をキャンセルし、dirtyなスライスを即座に書き込みます。 */
export async function flushNow(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await flushDirtySlices();
}

/** SIGINT/SIGTERM/beforeExit で未保存の状態を書き出すハンドラを登録します（冪等）。 */
export function flushStateOnExit(): void {
  if (exitHooksRegistered) return;
  exitHooksRegistered = true;

  const handleSignal = (signal: NodeJS.Signals): void => {
    void (async () => {
      console.log(`[State] ${signal} を受信しました。未保存の状態を書き出して終了します。`);
      try {
        await flushNow();
      } catch (error) {
        console.error('[State] 終了時の状態保存に失敗しました:', error);
      }
      process.exit(0);
    })();
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('beforeExit', () => {
    void flushNow().catch((error) => console.error('[State] 終了前の状態保存に失敗しました:', error));
  });
}

type SliceFileRead = { exists: boolean; data: Record<string, unknown> | null };

async function readJsonFile(file: string): Promise<SliceFileRead> {
  try {
    const raw = await readFile(file, 'utf8');
    return { exists: true, data: JSON.parse(raw) as Record<string, unknown> };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { exists: false, data: null };
    }
    console.error(`[State] ${path.basename(file)} の読み込みに失敗しました:`, error);
    // 破損した可能性があるファイルを既定値で上書きしないよう退避する
    const corrupt = `${file}.corrupt-${Date.now()}`;
    try {
      await rename(file, corrupt);
      console.error(`[State] 破損した可能性のあるファイルを退避しました: ${path.basename(corrupt)}`);
    } catch (renameError) {
      console.error('[State] 破損ファイルの退避に失敗しました:', renameError);
    }
    return { exists: true, data: null };
  }
}

/** 読み込んだJSONから、そのスライスに属するキーだけをstateへ反映します。 */
function applySlice(slice: StateSlice, data: Record<string, unknown>): void {
  const target = state as unknown as Record<string, unknown>;
  for (const key of SLICE_KEYS[slice]) {
    if (data[key] !== undefined) target[key] = data[key];
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

  /**
   * 変更を保存予約します（即時書き込みはしません）。
   * sliceを省略した場合は安全側に倒して全スライスをdirtyにします。
   */
  protected async save(slice?: StateSlice): Promise<void> {
    if (slice) {
      scheduleSave(slice);
      return;
    }
    for (const s of ALL_SLICES) scheduleSave(s);
  }

  static async load(): Promise<void> {
    flushStateOnExit();
    state = structuredClone(DEFAULT_STATE);
    await ensureDataDir();

    const reads = await Promise.all(ALL_SLICES.map((slice) => readJsonFile(SLICE_FILES[slice])));
    const hasNewFiles = reads.some((r) => r.exists);

    if (!hasNewFiles) {
      const legacy = await readJsonFile(LEGACY_STATE_FILE);
      if (legacy.exists && legacy.data) {
        state = { ...structuredClone(DEFAULT_STATE), ...(legacy.data as Partial<AppState>) };
        await Promise.all(ALL_SLICES.map((slice) => writeSlice(slice)));
        const archived = `${LEGACY_STATE_FILE}.migrated-${Date.now()}`;
        try {
          await rename(LEGACY_STATE_FILE, archived);
          console.log(
            `[State] 旧状態ファイルを settings.json / runtime.json / applications.json へ移行しました。旧ファイルは ${path.basename(archived)} として保存しています。`,
          );
        } catch (error) {
          console.error('[State] 旧状態ファイルの退避に失敗しました:', error);
        }
        return;
      }
      console.log('[State] 状態ファイルが見つからないため、新しいファイルを作成します。');
      await Promise.all(ALL_SLICES.map((slice) => writeSlice(slice)));
      return;
    }

    const missing: string[] = [];
    ALL_SLICES.forEach((slice, index) => {
      const read = reads[index];
      if (!read.exists) {
        missing.push(path.basename(SLICE_FILES[slice]));
        return;
      }
      if (read.data) applySlice(slice, read.data);
    });

    if (missing.length > 0) {
      console.log(`[State] 次の状態ファイルが見つからないため既定値を使用します: ${missing.join(', ')}`);
    }
    console.log('[State] 状態を settings.json / runtime.json / applications.json から読み込みました。');
  }
}
