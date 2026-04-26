import { Events, ActivityType, type Client } from 'discord.js';
import type { BotEvent } from '../types/index.js';
import { initializeStatusChannels } from '../lib/updateStatusChannels.js';
import { kikisenManager } from '../lib/kikisenManager.js';
import { levelManager } from '../lib/levelManager.js';
import { afkManager } from '../lib/afkManager.js';
import { voiceRoleManager } from '../lib/voiceRoleManager.js';
import { logManager } from '../lib/logManager.js';
import { dailyStatsManager } from '../lib/dailyStatsManager.js';
import { vcNotifyManager } from '../lib/vcNotifyManager.js';
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
    initializeStatusChannels(client);
    console.log('⌚ 日付時刻チャンネル更新マネージャーの初期化が完了しました。');
    await kikisenManager.initialize(client);
    console.log('👁️‍🗨️ 聞き専チャットマネージャーの初期化が完了しました。');
    levelManager.initialize(client);
    console.log('🔝 レベルマネージャーの初期化が完了しました。');
    afkManager.initialize(client);
    console.log('🛌 AFKマネージャーの初期化が完了しました。');
    voiceRoleManager.initialize(client);
    console.log('🎤 ボイスチャット中ロールマネージャーの初期化が完了しました。');
    logManager.initialize(client);
    console.log('👮 ログシステムマネージャーの初期化が完了しました。');
    dailyStatsManager.initialize(client);
    console.log('📝 デイリー統計機能マネージャーの初期化が完了しました。');
    vcNotifyManager.initialize(client);
    console.log('🔔 通話開始通知マネージャーの初期化が完了しました。');
    workoutNotifyManager.initialize(client);
    console.log('💪 筋トレリマインダーシステムの初期化が完了しました。');
    cleanupManager.initialize(client);
    console.log('🧹 クリーンアップシステムの初期化が完了しました。');
    rolePanelManager.initialize(client);
    console.log('📊 ロールパネルの初期化が完了しました。');
    crossPostManager.initialize(client);
    console.log('👽️ 絵文字/スタンプ通知機能が起動しました。');
    reuploadManager.initialize(client);
    console.log('📁 ファイル再アップロード機能が起動しました。');
  },
} satisfies BotEvent;