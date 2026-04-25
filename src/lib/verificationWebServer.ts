import express, { type Express, type Request, type Response } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import { verificationManager } from './verificationManager.js';
import { verificationRepo } from './repositories/index.js';

const getClientId = () => process.env.CLIENT_ID ?? '';
const getClientSecret = () => process.env.DISCORD_CLIENT_SECRET ?? '';
const getNdaPublicUrl = () => process.env.NDA_PUBLIC_URL ?? 'http://localhost:3001';

const NDA_TEXT = `【秘密保持契約（NDA）】

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

const HTML_HEAD = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ぽん酢鯖 - NDA署名</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.card{background:#16213e;border-radius:16px;padding:40px;max-width:600px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}
h1{color:#ffd700;margin-bottom:20px;font-size:1.5em}
.nda-text{background:#0f3460;border-radius:8px;padding:20px;margin:20px 0;max-height:300px;overflow-y:auto;line-height:1.8;white-space:pre-wrap;font-size:.9em}
.btn{display:inline-block;padding:14px 32px;border:none;border-radius:8px;font-size:1em;cursor:pointer;text-decoration:none;transition:transform .1s}
.btn:hover{transform:scale(1.02)}
.btn-primary{background:#e94560;color:#fff}
.btn-secondary{background:#533483;color:#fff}
.center{text-align:center}
.error{color:#e94560}
.success{color:#00c853}
p{margin:12px 0;line-height:1.6}
.warn{background:#2d1b4e;border:1px solid #533483;border-radius:8px;padding:16px;margin:16px 0;font-size:.9em;line-height:1.6}
.footer{text-align:center;margin-top:24px;color:#666;font-size:.8em}
</style></head><body><div class="card">`;

const HTML_FOOT = `</div><div class="footer">Copyright &copy; ${new Date().getFullYear()} ぽん酢鯖, All Rights Reserved.</div></body></html>`;

const oauthSessions = new Map<string, { email?: string; userTag: string; ip: string }>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function generateNdaFileContent(data: {
  displayName: string;
  userTag: string;
  email?: string;
  ipAddress: string;
  signedAt: string;
}): string {
  return [
    '='.repeat(60),
    'ぽん酢鯖 秘密保持契約（NDA）署名記録',
    '='.repeat(60),
    '',
    `署名日時: ${data.signedAt}`,
    `署名者表示名: ${data.displayName}`,
    `Discordアカウント: ${data.userTag}`,
    `メールアドレス: ${data.email ?? '未取得'}`,
    `署名時IPアドレス: ${data.ipAddress}`,
    '',
    '-'.repeat(60),
    'NDA条項',
    '-'.repeat(60),
    '',
    NDA_TEXT,
    '',
    '-'.repeat(60),
    '上記の通り、電磁的記録により署名を行いました。',
    '='.repeat(60),
  ].join('\n');
}

export class VerificationWebServer {
  private app: Express;
  private server: ReturnType<Express['listen']> | null = null;

  constructor() {
    this.app = express();
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/nda/callback', this.handleOAuthCallback.bind(this));
    this.app.get('/nda/:token/download', this.handleDownload.bind(this));
    this.app.get('/nda/:token', this.handleNdaPage.bind(this));
    this.app.post('/nda/:token/sign', this.handleSign.bind(this));
  }

  private async handleNdaPage(req: Request<{ token: string }>, res: Response): Promise<void> {
    const { token } = req.params;
    const tokenInfo = verificationManager.getNdaTokenInfo(token);

    if (!tokenInfo) {
      res.status(404).send(this.renderError('このリンクは無効または期限切れです。'));
      return;
    }

    const application = verificationRepo.getApplication(tokenInfo.appId);
    if (!application || application.status !== 'nda_pending') {
      res.status(404).send(this.renderError('申請が見つかりません。'));
      return;
    }

    const redirectUri = encodeURIComponent(`${getNdaPublicUrl()}/nda/callback`);
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${getClientId()}&redirect_uri=${redirectUri}&response_type=code&scope=${encodeURIComponent('identify email')}&state=${token}`;

    res.send(`${HTML_HEAD}
<h1>🍋 NDA署名ページ</h1>
<p>ぽん酢鯖への参加には、NDA（秘密保持契約）への署名が必要です。</p>
<p>続行するには、Discordアカウントで認証を行ってください。</p>
<div class="center" style="margin-top:24px">
  <a href="${oauthUrl}" class="btn btn-primary">Discordアカウントで認証</a>
</div>
${HTML_FOOT}`);
  }

  private async handleOAuthCallback(req: Request, res: Response): Promise<void> {
    const { code, state: token } = req.query as { code?: string; state?: string };

    if (!code || !token) {
      res.status(400).send(this.renderError('無効なリクエストです。'));
      return;
    }

    const tokenInfo = verificationManager.getNdaTokenInfo(token);
    if (!tokenInfo) {
      res.status(404).send(this.renderError('リンクが期限切れです。もう一度Discordからやり直してください。'));
      return;
    }

    try {
      const redirectUri = `${getNdaPublicUrl()}/nda/callback`;
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: getClientId(),
          client_secret: getClientSecret(),
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Token exchange failed');
      }

      const tokenData = await tokenResponse.json() as { access_token: string };

      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        throw new Error('User fetch failed');
      }

      const userData = await userResponse.json() as { id: string; username: string; email?: string };

      if (userData.id !== tokenInfo.userId) {
        res.status(403).send(this.renderError('認証されたDiscordアカウントが申請者と一致しません。'));
        return;
      }

      const application = verificationRepo.getApplication(tokenInfo.appId);
      if (!application) {
        res.status(404).send(this.renderError('申請が見つかりません。'));
        return;
      }

      const ip = getClientIp(req);
      oauthSessions.set(token, {
        email: userData.email,
        userTag: userData.username,
        ip,
      });

      res.send(this.renderNdaConsentPage(token, application.displayName, userData.username));
    } catch (error) {
      console.error('[NDA] OAuth処理エラー:', error);
      res.status(500).send(this.renderError('認証処理中にエラーが発生しました。'));
    }
  }

  private async handleSign(req: Request<{ token: string }>, res: Response): Promise<void> {
    const { token } = req.params;
    const tokenInfo = verificationManager.consumeNdaToken(token);

    if (!tokenInfo) {
      res.status(400).json({ success: false, error: '無効または期限切れのトークンです。' });
      return;
    }

    const application = verificationRepo.getApplication(tokenInfo.appId);
    if (!application || application.status !== 'nda_pending') {
      res.status(400).json({ success: false, error: '無効な申請です。' });
      return;
    }

    try {
      const session = oauthSessions.get(token);
      const ip = session?.ip ?? getClientIp(req);

      application.ndaEmail = session?.email;
      application.ndaIpAddress = ip;
      application.ndaUserTag = session?.userTag;
      await verificationRepo.setApplication(application.id, application);

      await verificationManager.completeNdaSigning(tokenInfo.appId);
      oauthSessions.delete(token);

      res.json({ success: true });
    } catch (error) {
      console.error('[NDA] 署名処理エラー:', error);
      res.status(500).json({ success: false, error: '署名処理中にエラーが発生しました。' });
    }
  }

  private async handleDownload(req: Request<{ token: string }>, res: Response): Promise<void> {
    const { token } = req.params;
    const application = verificationRepo.getApplicationByNdaToken(token);

    if (!application || application.status !== 'completed') {
      res.status(404).send(this.renderError('署名記録が見つかりません。'));
      return;
    }

    const signedAt = application.ndaSignedAt
      ? new Date(application.ndaSignedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
      : '不明';

    const content = generateNdaFileContent({
      displayName: application.displayName,
      userTag: application.ndaUserTag ?? '不明',
      email: application.ndaEmail,
      ipAddress: application.ndaIpAddress ?? '不明',
      signedAt,
    });

    const filename = `NDA_${application.displayName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_')}_${application.ndaSignedAt ? new Date(application.ndaSignedAt).toISOString().slice(0, 10) : 'unknown'}.txt`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(content);
  }

  private renderNdaConsentPage(token: string, displayName: string, discordName: string): string {
    const escapedNda = NDA_TEXT.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `${HTML_HEAD}
<h1>🍋 NDA署名</h1>
<p><strong>${discordName}</strong> として認証されました。</p>
<p>以下のNDA内容を確認のうえ、署名してください。</p>
<div class="nda-text">${escapedNda}</div>
<div class="warn">
⚠️ <strong>署名ボタンを押すと署名が完了すると同時に、契約記録ファイルがダウンロードされます。紛失しないようしっかり保管してください。</strong>
</div>
<div class="center" style="margin-top:24px">
  <button onclick="signNda('${token}')" class="btn btn-primary" id="signBtn">同意して署名する</button>
</div>
<p id="status" class="center"></p>
<script>
async function signNda(token) {
  const btn = document.getElementById('signBtn');
  const status = document.getElementById('status');
  btn.disabled = true;
  btn.textContent = '処理中...';
  try {
    const res = await fetch('/nda/' + token + '/sign', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      status.className = 'success center';
      status.textContent = '署名が完了しました！契約記録をダウンロードしています...';
      btn.style.display = 'none';
      const a = document.createElement('a');
      a.href = '/nda/' + token + '/download';
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function() {
        status.textContent = '署名が完了しました！契約記録をダウンロードしています... 完了。Discordに戻ってください。';
      }, 2000);
    } else {
      status.className = 'error center';
      status.textContent = data.error || 'エラーが発生しました。';
      btn.disabled = false;
      btn.textContent = '同意して署名する';
    }
  } catch (e) {
    status.className = 'error center';
    status.textContent = '通信エラーが発生しました。';
    btn.disabled = false;
    btn.textContent = '同意して署名する';
  }
}
</script>
${HTML_FOOT}`;
  }

  private renderError(message: string): string {
    return `${HTML_HEAD}
<h1>⚠️ エラー</h1>
<p class="error">${message}</p>
<div class="center" style="margin-top:24px">
  <a href="https://discord.com/channels/@me" class="btn btn-secondary">Discordに戻る</a>
</div>
${HTML_FOOT}`;
  }

  start(port: number): void {
    const certsDir = join(process.cwd(), 'certs');
    const keyPath = join(certsDir, 'key.pem');
    const certPath = join(certsDir, 'cert.pem');

    if (existsSync(keyPath) && existsSync(certPath)) {
      const options = {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      };
      this.server = createHttpsServer(options, this.app).listen(port, () => {
        console.log(`[NDA WebServer] HTTPS ポート ${port} で起動しました。`);
      });
    } else {
      this.server = this.app.listen(port, () => {
        console.log(`[NDA WebServer] HTTP ポート ${port} で起動しました。（証明書なし）`);
      });
    }
  }
}

export const verificationWebServer = new VerificationWebServer();
