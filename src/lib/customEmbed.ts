import { EmbedBuilder, type User } from 'discord.js';

const FOOTER_ICON_URL = process.env.FOOTER_ICON_URL || undefined;

export const EMBED_COLORS = {
  SUCCESS: 0x00FF00,
  ERROR: 0xFF0000,
  WARN: 0xFFAA00,
  INFO: 0x5865F2,
  GOLD: 0xFFD700,
  NEUTRAL: 0x99AAB5,
} as const;

export class CustomEmbed extends EmbedBuilder {
  constructor(_user?: User | null) {
    super();
    this.setColor(EMBED_COLORS.ERROR);
    const currentYear = new Date().getFullYear();
    this.setFooter({
      text: `Copyright © ${currentYear} ぽん酢鯖, All Rights Reserved.`,
      ...(FOOTER_ICON_URL ? { iconURL: FOOTER_ICON_URL } : {}),
    });
    this.setTimestamp();
  }
}
