import { Events, ActivityType, type Client } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { initializeStatusChannels } from '../lib/updateStatusChannels.js';
import { kikisenManager } from '../lib/kikisenManager.js';
import { levelManager } from '../lib/levelManager.js';
import { afkManager } from '../lib/afkManager.js';
import { voiceRoleManager } from '../lib/voiceRoleManager.js';
import { logManager } from '../lib/logManager.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';
import { vcLogManager } from '../lib/vcLogManager.js';
import { workoutNotifyManager } from '../lib/workoutNotifyManager.js';
import { cleanupManager } from '../lib/cleanupManager.js';
import { rolePanelManager } from '../lib/rolePanelManager.js';
import { crossPostManager } from '../lib/crossPostManager.js';
import { reuploadManager } from '../lib/reuploadManager.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(...args: unknown[]) {
    const [client] = args as [Client];
    if (!client.user) return;
    console.log(`✅ 準備完了！ ${client.user.tag} としてログインしました。`);
    client.user.setActivity('Welcome to ぽん酢鯖！', { type: ActivityType.Playing });

    const steps: { label: string; run: () => Promise<void> | void }[] = [
      {
        label: '日付時刻チャンネル更新マネージャー',
        run: () => {
          initializeStatusChannels(client);
          console.log('⌚ 日付時刻チャンネル更新マネージャーの初期化が完了しました。');
        },
      },
      {
        label: '聞き専チャットマネージャー',
        run: async () => {
          await kikisenManager.initialize(client);
          console.log('👁️‍🗨️ 聞き専チャットマネージャーの初期化が完了しました。');
        },
      },
      {
        label: 'レベルマネージャー',
        run: () => {
          levelManager.initialize(client);
          console.log('🔝 レベルマネージャーの初期化が完了しました。');
        },
      },
      {
        label: 'AFKマネージャー',
        run: () => {
          afkManager.initialize(client);
          console.log('🛌 AFKマネージャーの初期化が完了しました。');
        },
      },
      {
        label: 'VC参加中ロールマネージャー',
        run: () => {
          voiceRoleManager.initialize(client);
          console.log('🎤 VC参加中ロールマネージャーの初期化が完了しました。');
        },
      },
      {
        label: 'ログシステムマネージャー',
        run: () => {
          logManager.initialize(client);
          console.log('👮 ログシステムマネージャーの初期化が完了しました。');
        },
      },
      {
        label: 'デイリー統計機能マネージャー',
        run: () => {
          dailyStatsManager.initialize(client);
          console.log('📝 デイリー統計機能マネージャーの初期化が完了しました。');
        },
      },
      {
        label: 'VC通話ログマネージャー',
        run: () => {
          vcLogManager.initialize(client);
          console.log('📝 VC通話ログマネージャーの初期化が完了しました。');
        },
      },
      {
        label: '筋トレリマインダーシステム',
        run: () => {
          workoutNotifyManager.initialize(client);
          console.log('💪 筋トレリマインダーシステムの初期化が完了しました。');
        },
      },
      {
        label: 'クリーンアップシステム',
        run: () => {
          cleanupManager.initialize(client);
          console.log('🧹 クリーンアップシステムの初期化が完了しました。');
        },
      },
      {
        label: 'ロールパネル',
        run: () => {
          rolePanelManager.initialize(client);
          console.log('📊 ロールパネルの初期化が完了しました。');
        },
      },
      {
        label: '絵文字/スタンプ通知機能',
        run: () => {
          crossPostManager.initialize(client);
          console.log('👽 絵文字/スタンプ通知機能が起動しました。');
        },
      },
      {
        label: 'ファイル再アップロード機能',
        run: () => {
          reuploadManager.initialize(client);
          console.log('📁 ファイル再アップロード機能が起動しました。');
        },
      },
    ];

    for (const { label, run } of steps) {
      try {
        await run();
      } catch (error) {
        console.error(`[Ready] ${label} の初期化に失敗:`, error);
      }
    }
  },
} satisfies BotEvent;