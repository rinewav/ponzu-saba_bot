export interface LogEntry {
  id: string;
  timestamp: number;
  author: string;
  content: string;
  edits: { timestamp: number | null; content: string }[];
  deleted: boolean;
}

export interface ActiveChannelData {
  id: string;
  guildId: string;
  voiceChannelId: string;
  log: LogEntry[];
}

export interface GuildSettings {
  logChannelId?: string;
  logging?: Record<string, boolean>;
  kikisenlogChannelId?: string;
  cleanup?: CleanupSettings;
  afk?: AfkSettings;
  verification?: VerificationSettings;
  dailyStats?: DailyStatsSettings;
  vcNotify?: VcNotifySettings;
  voiceRole?: VoiceRoleSettings;
  workoutNotify?: WorkoutSettings;
  levelSystem?: LevelSettings;
  reupload?: ReuploadSettings;
  rebanOnLeave?: RebanSettings;
  virusScan?: VirusScanSettings;
  templates?: Record<string, TemplateSettings>;
  templatesByChannel?: Record<string, ChannelTemplateSettings>;
}

export interface CleanupSettings {
  enabled?: boolean;
  logChannelId?: string;
  excludedChannels?: string[];
}

export interface AfkSettings {
  afkChannelId?: string;
  notifyChannelId?: string;
  afkTimeout?: number;
  afkExcludedChannels?: string[];
}

export interface FormFieldConfig {
  id: string;
  label: string;
  style: 'short' | 'paragraph';
  required: boolean;
  maxLength: number;
  placeholder?: string;
}

export interface VerificationSettings {
  channelId?: string;
  roleId?: string;
  password?: string;
  enabled?: boolean;
  welcomeChannelId?: string;
  welcomeMessageId?: string;
  verifiedRoleId?: string;
  staffRoleId?: string;
  reviewChannelId?: string;
  archiveChannelId?: string;
  ticketCategoryId?: string;
  ndaWebUrl?: string;
  questions?: VerificationQuestion[];
  quizPassCount?: number;
  bypassList?: string[];
  formFields?: FormFieldConfig[];
  /** 会話ありチケットの移動先カテゴリ（満杯時に自動作成される。作成順） */
  ticketArchiveCategoryIds?: string[];
}

export interface VerificationQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface VerificationApplication {
  id: string;
  userId: string;
  guildId: string;
  displayName: string;
  activity: string;
  portfolio?: string;
  onlineHours?: string;
  note?: string;
  status: 'quiz' | 'pending' | 'approved' | 'rejected' | 'archived' | 'nda_pending' | 'completed';
  submittedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  ticketChannelId?: string;
  ndaToken?: string;
  ndaTokenExpiresAt?: number;
  ndaSignedAt?: number;
  ndaEmail?: string;
  ndaIpAddress?: string;
  ndaUserTag?: string;
  ndaFingerprint?: string;
  formData?: Record<string, string>;
  /** NDA記録PDFを本人のDMへ送付できたか */
  ndaDmDelivered?: boolean;
  /** NDA記録PDFをアーカイブチャンネルへ投稿できたか */
  ndaArchived?: boolean;
  /** チケットチャンネルの後処理（削除 or アーカイブ移動）が完了したか */
  ticketFinalized?: boolean;
}

export interface DailyStatsSettings {
  reportChannelId?: string;
  excludedChannels?: string[];
}

export interface VcNotifySettings {
  notificationChannelId?: string;
  excludedChannels?: string[];
  channelColors?: Record<string, string>;
}

export interface VoiceRoleSettings {
  roleId?: string;
}

export interface WorkoutSettings {
  targetChannels?: string[];
}

export interface LevelSettings {
  levelUpChannelId?: string;
  xpPerMessage?: number;
  /** メッセージXPのクールダウン秒数（既定60） */
  xpCooldownSeconds?: number;
  xpPerSecondVoice?: number;
  loginBonusBaseXp?: number;
  excludedChannels?: string[];
  levelRoles?: Record<string, string>;
}

export interface ReuploadSettings {
  destinationChannelId?: string;
}

export interface RebanSettings {
  enabled?: boolean;
}

export interface VirusScanSettings {
  /** 画像/動画/音声の添付をスキャン対象から除外する（既定: true） */
  skipMediaAttachments?: boolean;
}

export interface TemplateSettings {
  channelId?: string;
  messageId?: string;
  templateKey?: string;
  embed?: EmbedData;
}

export interface ChannelTemplateSettings {
  templateKey?: string;
  messageId?: string;
  embed?: EmbedData;
  channelId?: string;
}

export interface EmbedData {
  color?: number;
  title?: string;
  description?: string;
  url?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  author?: { name: string; iconURL?: string; url?: string };
  fields?: { name: string; value: string; inline?: boolean }[];
}

export interface VoiceSessionData {
  userId: string;
  channelId: string;
  startedAt: number;
  duration: number;
}

export interface LevelUserData {
  xp: number;
  level: number;
  lastLogin: number | null;
  loginStreak: number;
  highestLoginStreak: number;
}

export interface CleanupJobData {
  memberIds: string[];
  channelsToScan: string[];
  totalChannels: number;
  deletedMessages: number;
  deletedReactions: number;
  isPaused: boolean;
  progressMessageId: string | null;
}

export interface RolePanelData {
  guildId: string;
  channelId: string;
  title: string;
  description: string;
  roles: string[];
}

export interface VcLogSession {
  messageId: string;
  logChannelId: string;
  vcChannelId: string;
  guildId: string;
  startedAt: number;
  participants: string[];
}

export interface WelcomeMessageRef {
  messageId: string;
  channelId: string;
}

export interface AppState {
  guildSettings: Record<string, GuildSettings>;
  activeChannels: Record<string, Omit<ActiveChannelData, 'id'>>;
  dailyStats: Record<string, DailyStatsData>;
  /** 旧形式は messageId 文字列のみ。新形式は { messageId, channelId } */
  welcomeMessages: Record<string, string | WelcomeMessageRef>;
  workoutTimestamps: Record<string, WorkoutTimestampData>;
  cleanupJobs: Record<string, CleanupJobData>;
  rolePanels: Record<string, RolePanelData>;
  crossPostTargets: Record<string, string>;
  reupload: Record<string, ReuploadSettings>;
  lockedNicknames?: Record<string, Record<string, string>>;
  verificationApplications: Record<string, VerificationApplication>;
  vcLogSessions?: Record<string, VcLogSession>;
}

export interface DailyStatsData {
  date: string;
  voiceSessions: VoiceSessionData[];
  userActivity: Record<string, number>;
}

export interface WorkoutTimestampData {
  channelId: string;
  timestamp: number;
}

export { type GuildSettings as GuildSettingsType };
