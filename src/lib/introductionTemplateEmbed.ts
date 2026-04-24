import { CustomEmbed } from './customEmbed.js';

export class IntroductionTemplateEmbed extends CustomEmbed {
  constructor() {
    super();
    this.setTitle('📝 自己紹介用テンプレ')
      .setDescription(
        '🌟なまえ\n🌟活動内容\n🌟活動プラットフォーム\n🌟年齢\n🌟SNSリンク\n🌟ポートフォリオ／ホームページ\n🌟何かひとこと',
      );
  }
}