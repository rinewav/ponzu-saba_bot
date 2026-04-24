import { EmbedBuilder, type User } from 'discord.js';

const FOOTER_ICON_URL =
  process.env.FOOTER_ICON_URL ||
  'https://images-ext-1.discordapp.net/external/Pu_lp5ZJ-HSprpf6LdXw0ryjI1irJSB03PIdw1hKgWo/%3Fsize%3D1024/https/cdn.discordapp.com/icons/1312756594416554076/a_820e3982adf284631267b5b80815c8d3.gif';

export class CustomEmbed extends EmbedBuilder {
  constructor(_user?: User | null) {
    super();
    this.setColor(0xff0000);
    const currentYear = new Date().getFullYear();
    this.setFooter({
      text: `Copyright © ${currentYear} ぽん酢鯖, All Rights Reserved.`,
      iconURL: FOOTER_ICON_URL,
    });
    this.setTimestamp();
  }
}