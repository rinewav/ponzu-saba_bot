import express, { type Express, type Request, type Response } from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { join } from 'node:path';
import axios from 'axios';
import { verificationManager } from './verificationManager.js';
import { verificationRepo } from './repositories/index.js';
import { NDA_TEXT, generateNdaPdf } from './ndaPdfGenerator.js';

const getClientId = () => process.env.CLIENT_ID ?? '';
const getClientSecret = () => process.env.DISCORD_CLIENT_SECRET ?? '';
const getNdaPublicUrl = () => process.env.NDA_PUBLIC_URL ?? 'http://localhost:3001';
const getProxyCheckKey = () => process.env.PROXYCHECK_API_KEY ?? '';

const HTML_HEAD = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ぽん酢鯖 - NDA署名</title><style>
*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}
.card{background:#16213e;border-radius:16px;padding:40px;max-width:600px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3)}
h1{color:#ffd700;margin-bottom:20px;font-size:1.5em}
.nda-text{background:#0f3460;border-radius:8px;padding:20px;margin:20px 0;max-height:300px;overflow-y:auto;line-height:1.8;white-space:pre-wrap;font-size:.9em}
.btn{display:inline-block;padding:14px 32px;border:none;border-radius:8px;font-size:1em;cursor:pointer;text-decoration:none;transition:transform .1s}
.btn:hover{transform:scale(1.02)}
.btn-primary{background:#e94560;color:#fff}
.btn-secondary{background:#533483;color:#fff}
.btn:disabled{opacity:0.4;cursor:not-allowed;transform:none}
.center{text-align:center}
.error{color:#e94560}
.success{color:#00c853}
p{margin:12px 0;line-height:1.6}
.warn{background:#2d1b4e;border:1px solid #533483;border-radius:8px;padding:16px;margin:16px 0;font-size:.9em;line-height:1.6}
.warn-scroll{background:#3d2b1b;border:1px solid #e94560;border-radius:8px;padding:16px;margin:16px 0;font-size:.9em;line-height:1.6;text-align:center}
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

async function isVpnOrProxy(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return false;
  const apiKey = getProxyCheckKey();
  if (!apiKey) return false;

  try {
    const url = `https://proxycheck.io/v2/${ip}?key=${apiKey}&risk=1&vpn=1`;
    const res = await axios.get(url, { timeout: 8000 });
    const data = res.data as { status?: string; [ip: string]: unknown };
    if (data.status !== 'ok') return false;
    const info = data[ip] as { proxy?: string; type?: string; risk?: number } | undefined;
    if (!info) return false;
    if (info.proxy === 'yes') return true;
    if (info.type && info.type !== '' && info.type !== 'Not a Proxy/Direct Connection') return true;
    if (typeof info.risk === 'number' && info.risk >= 66) return true;
    return false;
  } catch (error) {
    console.error('[NDA] proxycheck.io チェックエラー:', error instanceof Error ? error.message : String(error));
    return false;
  }
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

      if (await isVpnOrProxy(ip)) {
        console.warn(`[NDA] VPN/Proxy検出: IP=${ip}, userId=${tokenInfo.userId}`);
        res.status(403).send(this.renderError(
          'VPNまたはプロキシ経由の接続が検出されました。\nNDA署名を行うには、VPN/プロキシを無効にしてアクセスし直してください。',
        ));
        return;
      }

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
    const tokenInfo = verificationManager.getNdaTokenInfo(token);

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

      if (await isVpnOrProxy(ip)) {
        console.warn(`[NDA] 署名時VPN/Proxy検出: IP=${ip}, userId=${tokenInfo.userId}`);
        res.status(403).json({ success: false, error: 'VPNまたはプロキシ経由の接続が検出されました。VPN/プロキシを無効にしてやり直してください。' });
        return;
      }

      verificationManager.consumeNdaToken(token);

      application.ndaEmail = session?.email;
      application.ndaIpAddress = ip;
      application.ndaUserTag = session?.userTag;

      const fingerprint = req.body?.fingerprint;
      application.ndaFingerprint = typeof fingerprint === 'string' ? fingerprint : JSON.stringify(fingerprint ?? {});

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

    try {
      const pdfBuffer = await generateNdaPdf({
        displayName: application.displayName,
        userTag: application.ndaUserTag ?? '不明',
        discordId: application.userId,
        email: application.ndaEmail,
        ipAddress: application.ndaIpAddress ?? '不明',
        signedAt,
        fingerprint: application.ndaFingerprint,
      });

      const filename = `NDA_${application.displayName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_')}_${application.ndaSignedAt ? new Date(application.ndaSignedAt).toISOString().slice(0, 10) : 'unknown'}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error('[NDA] PDF生成エラー:', error);
      res.status(500).send(this.renderError('PDF生成中にエラーが発生しました。'));
    }
  }

  private renderNdaConsentPage(token: string, _displayName: string, discordName: string): string {
    const escapedNda = NDA_TEXT.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `${HTML_HEAD}
<h1>🍋 NDA署名</h1>
<p><strong>${discordName}</strong> として認証されました。</p>
<p>以下のNDA内容を確認のうえ、署名してください。</p>
<div class="nda-text" id="ndaText">${escapedNda}</div>
<div class="warn-scroll" id="scrollWarning">
  ⚠️ <strong>NDA内容を最後までスクロールして読まないと署名ボタンは押せません。下までスクロールしてください。</strong>
</div>
<div class="warn">
  ⚠️ <strong>署名ボタンを押すと署名が完了すると同時に、契約記録PDFがダウンロードされます。紛失しないようしっかり保管してください。</strong>
</div>
<div class="center" style="margin-top:24px">
  <button onclick="signNda('${token}')" class="btn btn-primary" id="signBtn" disabled>同意して署名する</button>
</div>
<p id="status" class="center"></p>
<script>
async function collectFingerprint(){
  var fp={};
  fp.userAgent=navigator.userAgent;
  fp.platform=navigator.platform;
  fp.language=navigator.language;
  fp.languages=(navigator.languages||[]).join(', ');
  fp.cookieEnabled=String(navigator.cookieEnabled);
  fp.doNotTrack=navigator.doNotTrack||'unspecified';
  fp.hardwareConcurrency=navigator.hardwareConcurrency||'N/A';
  fp.maxTouchPoints=navigator.maxTouchPoints||0;
  if(navigator.deviceMemory)fp.deviceMemory=navigator.deviceMemory+'GB';
  fp.screenWidth=screen.width;
  fp.screenHeight=screen.height;
  fp.screenAvailWidth=screen.availWidth;
  fp.screenAvailHeight=screen.availHeight;
  fp.colorDepth=screen.colorDepth;
  fp.pixelDepth=screen.pixelDepth;
  fp.devicePixelRatio=window.devicePixelRatio;
  fp.timezoneOffset=new Date().getTimezoneOffset();
  try{fp.timezone=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}
  if(navigator.connection){
    fp.connectionEffectiveType=navigator.connection.effectiveType;
    fp.connectionDownlink=navigator.connection.downlink;
    fp.connectionRtt=navigator.connection.rtt;
    fp.connectionSaveData=String(navigator.connection.saveData);
  }
  try{
    var c=document.createElement('canvas');c.width=200;c.height=50;
    var ctx=c.getContext('2d');ctx.textBaseline='top';ctx.font='14px Arial';
    ctx.fillStyle='#f60';ctx.fillRect(125,1,62,20);
    ctx.fillStyle='#069';ctx.fillText('NDA verify 2026',2,15);
    ctx.fillStyle='rgba(102,204,0,0.7)';ctx.fillText('NDA verify 2026',4,17);
    fp.canvasDataLen=String(c.toDataURL().length);
  }catch(e){}
  try{
    var c2=document.createElement('canvas');
    var gl=c2.getContext('webgl')||c2.getContext('experimental-webgl');
    if(gl){
      var dbg=gl.getExtension('WEBGL_debug_renderer_info');
      if(dbg){
        fp.webglVendor=gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        fp.webglRenderer=gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
      fp.webglVersion=gl.getParameter(gl.VERSION);
      fp.webglShadingLang=gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      fp.webglMaxTextureSize=String(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      fp.webglMaxRenderbufferSize=String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      fp.webglMaxViewportDims=JSON.stringify(gl.getParameter(gl.MAX_VIEWPORT_DIMS));
    }
  }catch(e){}
  try{
    if(navigator.getBattery){
      var b=await navigator.getBattery();
      fp.batteryCharging=String(b.charging);
      fp.batteryLevel=(b.level*100)+'%';
    }
  }catch(e){}
  fp.pdfViewerEnabled=String(navigator.pdfViewerEnabled||'unknown');
  try{fp.storageEstimate=JSON.stringify(await navigator.storage.estimate())}catch(e){}
  fp.webdriver=String(navigator.webdriver||false);
  fp.vendor=navigator.vendor||'unknown';
  fp.productSub=navigator.productSub||'unknown';
  return fp;
}

var ndaText=document.getElementById('ndaText');
var signBtn=document.getElementById('signBtn');
var scrollWarning=document.getElementById('scrollWarning');
var scrolledToBottom=false;

ndaText.addEventListener('scroll',function(){
  var atBottom=ndaText.scrollHeight-ndaText.scrollTop-ndaText.clientHeight<5;
  if(atBottom&&!scrolledToBottom){
    scrolledToBottom=true;
    signBtn.disabled=false;
    scrollWarning.style.display='none';
  }
});

var fpData=null;
collectFingerprint().then(function(fp){fpData=fp});

async function signNda(token){
  var btn=document.getElementById('signBtn');
  var status=document.getElementById('status');
  btn.disabled=true;
  btn.textContent='処理中...';
  try{
    var res=await fetch('/nda/'+token+'/sign',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fingerprint:fpData||{}})
    });
    var data=await res.json();
    if(data.success){
      status.className='success center';
      status.textContent='署名が完了しました！契約記録PDFをダウンロードしています...';
      btn.style.display='none';
      var a=document.createElement('a');
      a.href='/nda/'+token+'/download';
      a.download='';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){
        status.textContent='署名が完了しました！契約記録PDFをダウンロードしています... 完了。Discordに戻ってください。';
      },2000);
    }else{
      status.className='error center';
      status.textContent=data.error||'エラーが発生しました。';
      btn.disabled=false;
      btn.textContent='同意して署名する';
    }
  }catch(e){
    status.className='error center';
    status.textContent='通信エラーが発生しました。';
    btn.disabled=false;
    btn.textContent='同意して署名する';
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
