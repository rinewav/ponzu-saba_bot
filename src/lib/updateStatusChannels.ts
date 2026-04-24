import { ChannelType, type Client } from 'discord.js';

const DATE_CHANNEL_ID = process.env.DATE_CHANNEL_ID || '1353782716226867310';
const TIME_CHANNEL_ID = process.env.TIME_CHANNEL_ID || '1353768671717228604';

function getFormattedDateTime(dateObject?: Date): { date: string; time: string } {
  const now = dateObject ?? new Date();
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', timeZone: 'Asia/Tokyo',
  };
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo',
  };
  const date = new Intl.DateTimeFormat('ja-JP', dateOptions).format(now);
  const time = new Intl.DateTimeFormat('ja-JP', timeOptions).format(now);
  return { date, time };
}

async function setChannelName(client: Client, channelId: string, newName: string): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel.type === ChannelType.GuildVoice) {
      if (channel.name !== newName) {
        await channel.setName(newName);
        console.log(`[ステータス更新] チャンネル名を「${newName}」に変更しました。`);
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[エラー] チャンネルID: ${channelId} の更新に失敗しました。`, msg);
  }
}

export function initializeStatusChannels(client: Client): void {
  const updateTask = (dateForUpdate?: Date) => {
    const { date, time } = getFormattedDateTime(dateForUpdate);
    setChannelName(client, DATE_CHANNEL_ID, `📅 日付: ${date}`);
    setChannelName(client, TIME_CHANNEL_ID, `⏰ 時刻: ${time} (JST)`);
  };

  const scheduleUpdates = () => {
    const tenMinutesInMs = 10 * 60 * 1000;
    const now = Date.now();
    const delay = tenMinutesInMs - (now % tenMinutesInMs);
    console.log(`[スケジューラ] 次回の更新は ${Math.round(delay / 1000)} 秒後です。`);
    setTimeout(() => {
      updateTask();
      setInterval(() => updateTask(), tenMinutesInMs);
    }, delay);
  };

  const startupDate = new Date();
  const currentMinutes = startupDate.getMinutes();
  startupDate.setMinutes(currentMinutes - (currentMinutes % 10));
  startupDate.setSeconds(0, 0);
  console.log(`[起動時] 初期時刻を ${getFormattedDateTime(startupDate).time} に設定します。`);
  updateTask(startupDate);
  scheduleUpdates();
  console.log('[ステータス更新] 日付と時刻の自動更新をスケジュールしました。');
}