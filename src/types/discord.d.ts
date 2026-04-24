import type { Client, Collection, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';

type SlashCommandData = SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;

export interface BotCommand {
  data: SlashCommandData;
  execute(interaction: import('discord.js').ChatInputCommandInteraction): Promise<void>;
}

export interface BotEvent {
  name: string;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void> | void;
}

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}