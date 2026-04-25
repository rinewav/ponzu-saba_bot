import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

export const NDA_TEXT = `【秘密保持契約（NDA）】

「ぽん酢鯖」運営代表 きる山ぽぽ美（以下「甲」という）と、ぽん酢鯖への参加を希望する者（以下「乙」という）は、クリエイターズコミュニティ「ぽん酢鯖」（以下「本サーバー」という）の利用にあたり、以下の通り秘密保持に関する同意書（以下「本契約」という）を締結します。
第1条（秘密情報）
本契約において「秘密情報」とは、本サーバー内で甲または他の参加者が開示・共有した一切の情報（テキスト発言、画像、動画、音声、イラスト、ポートフォリオ、制作過程のアイデア、個人情報などを含みますがこれらに限定されません）を指します。
第2条（秘密保持義務と禁止事項）
	1.	乙は、秘密情報を厳重に管理し、甲および当該情報の開示者の事前の明確な許可なく、いかなる第三者にも開示、提供、漏洩してはなりません。
	2.	乙は、本サーバー内の出来事や話題について、外部のSNS（X、Instagram、Bluesky等）、他のDiscordサーバー、ブログ、動画配信、またはオフラインの会話などで言及することを一切禁止されます。
	3.	乙は、本サーバー内の画面をスクリーンショット等で撮影・保存し、これを外部へ公開または共有する行為を固く禁止されます。
第3条（未成年者の参加）
乙が未成年者（18歳未満）である場合、乙は本契約に同意し本サーバーに参加することについて、必ず親権者等法定代理人の同意を得るものとします。乙が本契約への同意手続きを行った時点で、法定代理人の同意を得ているものとみなします。
第4条（契約違反時の措置）
乙が本契約のいずれかの条項に違反した、または違反する恐れがあると甲が判断した場合、甲は乙に対して事前の通知や勧告を行うことなく、即座に本サーバーからの強制退出（BAN）措置を行うことができるものとします。
第5条（存続条項）
乙が本サーバーを退出（自主的な退出、および前条に基づく強制退出を含みます）した後においても、第1条および第2条に定める秘密保持義務は有効に存続し、乙はこれに従うものとします。
以上、本契約の内容を十分に理解し、すべての条項に同意した証として、以下のフォームより電磁的記録による署名を行います。`;

interface CjkFontConfig {
  path: string;
  family: string;
}

const CJK_FONTS: CjkFontConfig[] =
  platform() === 'win32'
    ? [
        { path: 'C:\\Windows\\Fonts\\yugothic.ttc', family: 'Yu Gothic' },
        { path: 'C:\\Windows\\Fonts\\meiryo.ttc', family: 'Meiryo' },
        { path: 'C:\\Windows\\Fonts\\msgothic.ttc', family: 'MS Gothic' },
      ]
    : platform() === 'darwin'
      ? [
          { path: '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc', family: 'HiraginoSans-W3' },
          { path: '/Library/Fonts/Arial Unicode.ttf', family: 'Arial Unicode MS' },
        ]
      : [
          { path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKsc-Regular' },
          { path: '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', family: 'NotoSansCJKsc-Regular' },
        ];

function findCjkFont(): CjkFontConfig | null {
  for (const font of CJK_FONTS) {
    if (existsSync(font.path)) return font;
  }
  return null;
}

export interface NdaPdfData {
  displayName: string;
  userTag: string;
  discordId: string;
  email?: string;
  ipAddress: string;
  signedAt: string;
  fingerprint?: string;
}

export async function generateNdaPdf(data: NdaPdfData): Promise<Buffer> {
  const font = findCjkFont();
  if (!font) {
    throw new Error(
      `[NDA] CJKフォントが見つかりません。システムに日本語フォントをインストールしてください。検索パス: ${CJK_FONTS.map((f) => f.path).join(', ')}`,
    );
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: 'ぽん酢鯖 NDA署名記録',
        Author: 'ponzubot',
        Subject: '秘密保持契約署名記録',
        Creator: 'ponzubot',
      },
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.registerFont('CJK', font.path, font.family);
    } catch (err) {
      reject(new Error(`[NDA] フォント登録失敗 (${font.path}): ${err}`));
      return;
    }

    doc.font('CJK');

    doc.fontSize(18).text('秘密保持契約（NDA）署名記録', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`署名日時: ${data.signedAt}`);
    doc.text(`署名者表示名: ${data.displayName}`);
    doc.text(`Discordアカウント: ${data.userTag} (ID: ${data.discordId})`);
    doc.text(`メールアドレス: ${data.email ?? '未取得'}`);
    doc.text(`署名時IPアドレス: ${data.ipAddress}`);
    doc.moveDown(0.5);

    const lineY = doc.y;
    doc.moveTo(50, lineY).lineTo(545, lineY).strokeColor('#333333').lineWidth(1).stroke();
    doc.moveDown(0.5);

    doc.fontSize(14).text('NDA条項', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(10).text(NDA_TEXT, { lineGap: 3 });
    doc.moveDown(0.5);

    const lineY2 = doc.y;
    doc.moveTo(50, lineY2).lineTo(545, lineY2).strokeColor('#333333').lineWidth(1).stroke();
    doc.moveDown(0.5);

    doc.fontSize(11).text('上記の通り、電磁的記録により署名を行いました。', { align: 'center' });

    if (data.fingerprint) {
      doc.addPage();
      doc.fontSize(14).text('署名時端末情報（フィンガープリント）', { align: 'center' });
      doc.moveDown(1);

      const lineY3 = doc.y;
      doc.moveTo(50, lineY3).lineTo(545, lineY3).strokeColor('#333333').lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      doc.fontSize(8);

      try {
        const fp = JSON.parse(data.fingerprint) as Record<string, unknown>;
        for (const [key, value] of Object.entries(fp)) {
          const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
          doc.text(`${key}: ${valueStr}`, { lineGap: 2 });
        }
      } catch {
        doc.text(data.fingerprint);
      }
    }

    doc.end();
  });
}
