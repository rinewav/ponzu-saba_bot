import { EmbedBuilder, type User } from 'discord.js';

const FOOTER_ICON_URL = process.env.FOOTER_ICON_URL || undefined;

export class CustomEmbed extends EmbedBuilder {
  constructor(_user?: User | null) {
    super();
    this.setColor(0xff0000);
    const currentYear = new Date().getFullYear();
    this.setFooter({
      text: `Copyright © ${currentYear} ぽん酢鯖, All Rights Reserved.`,
      ...(FOOTER_ICON_URL ? { iconURL: FOOTER_ICON_URL } : {}),
    });
    this.setTimestamp();
  }
}