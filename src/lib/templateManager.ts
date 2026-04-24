import { IntroductionTemplateEmbed } from './introductionTemplateEmbed.js';
import { CustomEmbed } from './customEmbed.js';
import { miscRepo } from './repositories/index.js';
import type { EmbedData } from '../types/index.js';

interface TemplateDefinition {
  title: string;
  createPayload: () => { embeds: CustomEmbed[] };
}

const TEMPLATE_DEFINITIONS: Record<string, TemplateDefinition> = {
  introduction: {
    title: '📝 自己紹介用テンプレ',
    createPayload: () => ({ embeds: [new IntroductionTemplateEmbed()] }),
  },
};

function buildEmbedFromStoredTemplate(templateKey: string, stored: { embed?: EmbedData } | null | undefined): CustomEmbed | null {
  const definition = TEMPLATE_DEFINITIONS[templateKey];
  const embedData = stored?.embed;
  if (!embedData) return null;

  const embed = new CustomEmbed();

  if (embedData.color != null) embed.setColor(embedData.color);
  if (embedData.title != null) embed.setTitle(embedData.title);
  if (embedData.description != null) embed.setDescription(embedData.description);
  if (embedData.url != null) embed.setURL(embedData.url);
  if (embedData.thumbnailUrl != null) embed.setThumbnail(embedData.thumbnailUrl);
  if (embedData.imageUrl != null) embed.setImage(embedData.imageUrl);

  if (embedData.author?.name) {
    const author: { name: string; iconURL?: string; url?: string } = { name: embedData.author.name };
    if (embedData.author.iconURL) author.iconURL = embedData.author.iconURL;
    if (embedData.author.url) author.url = embedData.author.url;
    embed.setAuthor(author);
  }

  if (Array.isArray(embedData.fields) && embedData.fields.length > 0) {
    embed.setFields(embedData.fields);
  }

  if (!embed.data?.title && definition?.title) {
    embed.setTitle(definition.title);
  }

  return embed;
}

function buildTemplatePayload(guildId: string, templateKey: string, stored: { embed?: EmbedData } | null | undefined): { embeds: CustomEmbed[] } {
  const effectiveStored = stored || miscRepo.getTemplateSetting(guildId, templateKey);
  const embedFromState = buildEmbedFromStoredTemplate(templateKey, effectiveStored);
  if (embedFromState) return { embeds: [embedFromState] };

  const definition = TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) throw new Error(`Unknown templateKey: ${templateKey}`);
  return definition.createPayload();
}

function extractTemplateEmbedDataFromDiscordEmbed(embed: import('discord.js').Embed): EmbedData | null {
  if (!embed) return null;

  const raw = embed.data || (typeof embed.toJSON === 'function' ? embed.toJSON() : null) || {};

  const embedData: EmbedData = {};
  if (raw.color != null) embedData.color = raw.color;
  if (raw.title != null) embedData.title = raw.title;
  if (raw.description != null) embedData.description = raw.description;
  if (raw.url != null) embedData.url = raw.url;

  const thumbnailUrl = raw.thumbnail?.url;
  if (thumbnailUrl) embedData.thumbnailUrl = thumbnailUrl;

  const imageUrl = raw.image?.url;
  if (imageUrl) embedData.imageUrl = imageUrl;

  if (raw.author?.name) {
    const authorRaw = raw.author as unknown as Record<string, unknown>;
    embedData.author = {
      name: raw.author.name,
      iconURL: (authorRaw.iconURL ?? authorRaw.icon_url) as string | undefined,
      url: raw.author.url as string | undefined,
    };
  }

  if (Array.isArray(raw.fields) && raw.fields.length > 0) {
    embedData.fields = raw.fields.map(f => ({
      name: f.name,
      value: f.value,
      inline: !!f.inline,
    }));
  }

  return embedData;
}

async function deleteOldTemplateMessage(guildId: string, templateKey: string, channel: import('discord.js').TextChannel): Promise<void> {
  const current = miscRepo.getTemplateSettingForChannel(guildId, channel.id);

  if (current?.messageId) {
    const msg = await channel.messages.fetch(current.messageId).catch(() => null);
    if (msg && msg.deletable) {
      await msg.delete().catch(() => null);
      return;
    }
  }

  const definition = TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) return;

  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return;

  for (const msg of messages.values()) {
    if (!msg.author?.bot) continue;
    const firstEmbed = msg.embeds?.[0];
    if (firstEmbed?.title === definition.title && msg.deletable) {
      await msg.delete().catch(() => null);
      return;
    }
  }
}

export async function ensureLatestTemplateMessage(guildId: string, templateKey: string | undefined, channel: import('discord.js').TextChannel): Promise<import('discord.js').Message> {
  const current = miscRepo.getTemplateSettingForChannel(guildId, channel.id);
  const effectiveTemplateKey = templateKey || current?.templateKey;

  if (!effectiveTemplateKey || !TEMPLATE_DEFINITIONS[effectiveTemplateKey]) {
    throw new Error(`Unknown templateKey: ${effectiveTemplateKey}`);
  }

  await deleteOldTemplateMessage(guildId, effectiveTemplateKey, channel);

  const sent = await channel.send(buildTemplatePayload(guildId, effectiveTemplateKey, current));
  await miscRepo.setTemplateSettingForChannel(guildId, channel.id, {
    templateKey: effectiveTemplateKey,
    messageId: sent.id,
  } as Record<string, unknown>);

  return sent;
}

export async function adoptTemplateFromExistingMessage(
  guildId: string,
  templateKey: string,
  channel: import('discord.js').TextChannel,
  sourceMessageId: string,
  options: { keepSource?: boolean } = {},
): Promise<{ source: import('discord.js').Message; sent: import('discord.js').Message }> {
  const definition = TEMPLATE_DEFINITIONS[templateKey];
  if (!definition) throw new Error(`Unknown templateKey: ${templateKey}`);

  const source = await channel.messages.fetch(sourceMessageId).catch(() => null);
  if (!source) {
    throw new Error('指定されたメッセージが見つかりませんでした（チャンネル/メッセージIDを確認してください）。');
  }

  const firstEmbed = source.embeds?.[0];
  if (!firstEmbed) {
    throw new Error('指定されたメッセージにEmbedがありません。Embed付きメッセージIDを指定してください。');
  }

  const extracted = extractTemplateEmbedDataFromDiscordEmbed(firstEmbed);
  if (!extracted) {
    throw new Error('Embedの読み取りに失敗しました。');
  }

  await miscRepo.setTemplateSettingForChannel(guildId, channel.id, {
    templateKey,
    embed: extracted,
  } as Record<string, unknown>);

  const sent = await ensureLatestTemplateMessage(guildId, templateKey, channel);

  const keepSource = options.keepSource === true;
  if (!keepSource && source.deletable) {
    await source.delete().catch(() => null);
  }

  return { source, sent };
}

export { TEMPLATE_DEFINITIONS };