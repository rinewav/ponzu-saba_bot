import { createHash } from 'node:crypto';
import axios from 'axios';
import type { Client } from 'discord.js';

const BASE_URL = 'https://www.virustotal.com/api/v3';

/** 無料枠は4リクエスト/分のため、ポーリングは20秒間隔×最大4回に抑える */
const POLL_INTERVAL_MS = 20000;
const MAX_POLL_ATTEMPTS = 4;
/** ポーリング中に429を受けた場合の待機時間 */
const RATE_LIMIT_BACKOFF_MS = 60000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
/** VirusTotalの通常アップロードで扱えるファイルサイズの上限 */
const MAX_FILE_SIZE_BYTES = 32 * 1024 * 1024;

interface ScanStats {
  malicious: number;
  suspicious: number;
  undetected: number;
  harmless: number;
  timeout: number;
}

interface ScanResult {
  stats: ScanStats;
  analysisId: string;
}

interface FileScanResult {
  stats: ScanStats;
  fileHash: string;
}

interface AnalysisResponse {
  data: {
    attributes: {
      status?: string;
      stats: ScanStats;
    };
  };
  meta?: {
    file_info?: {
      sha256?: string;
    };
  };
}

interface FileReportResponse {
  data: {
    attributes: {
      last_analysis_stats?: ScanStats;
    };
  };
}

interface SubmissionResponse {
  data: {
    id: string;
  };
}

interface CacheEntry<T> {
  result: T;
  cachedAt: number;
}

export class VirusTotalManager {
  private urlScanCache = new Map<string, CacheEntry<ScanResult>>();
  private fileScanCache = new Map<string, CacheEntry<FileScanResult>>();
  /** VirusTotal APIへのリクエストを1件ずつ直列化するためのキュー（無料枠は4リクエスト/分） */
  private queue: Promise<unknown> = Promise.resolve();
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VIRUSTOTAL_API_KEY ?? '';
    if (!this.apiKey) {
      console.warn('[VirusTotal] VIRUSTOTAL_API_KEY が設定されていません。URL/ファイルスキャン機能は無効になります。');
    } else {
      console.log(`[VirusTotal] API Key設定済み (${this.apiKey.slice(0, 8)}...)`);
    }
  }

  initialize(_client: Client): void {
    // VirusTotalはクライアント不要
  }

  /** 同時実行を1件に制限してVirusTotal APIを呼び出します。 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn(), () => fn());
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private isRateLimited(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 429;
  }

  private getCachedEntry<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.result;
  }

  private setCachedEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, result: T): void {
    cache.set(key, { result, cachedAt: Date.now() });
    while (cache.size > CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }
  }

  /** 解析が完了するまでポーリングします。完了しなかった場合は null を返します。 */
  private async pollAnalysis(analysisId: string): Promise<AnalysisResponse | null> {
    let backedOff = false;
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

      let reportResponse;
      try {
        reportResponse = await axios.get<AnalysisResponse>(
          `${BASE_URL}/analyses/${analysisId}`,
          { headers: { 'x-apikey': this.apiKey } },
        );
      } catch (error: unknown) {
        // ポーリング中のレート制限は1回だけ待って再試行する
        if (this.isRateLimited(error) && !backedOff) {
          backedOff = true;
          console.warn(`[VirusTotal] ポーリング中にレート制限。${RATE_LIMIT_BACKOFF_MS / 1000}秒待機します: ${analysisId}`);
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS));
          attempt--;
          continue;
        }
        throw error;
      }

      if (reportResponse.data?.data?.attributes?.status === 'completed') {
        return reportResponse.data;
      }
      console.log(`[VirusTotal] 解析がまだ完了していません (${attempt}/${MAX_POLL_ATTEMPTS}): ${analysisId}`);
    }
    return null;
  }

  async getUrlReport(url: string): Promise<ScanResult | null> {
    if (!this.apiKey) return null;

    const cached = this.getCachedEntry(this.urlScanCache, url);
    if (cached) {
      console.log(`[VirusTotal] キャッシュからURLの結果を返しました: ${url}`);
      return cached;
    }

    return this.enqueue(async () => {
      // 順番待ちの間に他のスキャンがキャッシュを埋めている可能性がある
      const queuedCache = this.getCachedEntry(this.urlScanCache, url);
      if (queuedCache) return queuedCache;

      try {
        const submissionResponse = await axios.post<SubmissionResponse>(
          `${BASE_URL}/urls`,
          new URLSearchParams({ url }).toString(),
          {
            headers: {
              'x-apikey': this.apiKey,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        );
        const analysisId = submissionResponse.data.data.id;

        const analysis = await this.pollAnalysis(analysisId);
        if (!analysis) {
          console.warn(`[VirusTotal] 解析が完了しなかったため、結果をキャッシュしません: ${url}`);
          return null;
        }

        const result: ScanResult = {
          stats: analysis.data.attributes.stats,
          analysisId,
        };

        this.setCachedEntry(this.urlScanCache, url, result);
        console.log(`[VirusTotal] URLをスキャンし、結果をキャッシュに保存しました: ${url}`);
        return result;

      } catch (error: unknown) {
        if (this.isRateLimited(error)) {
          console.error('[VirusTotal] APIレート制限に達しました');
          return null;
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[VirusTotal] URLスキャン処理エラー:', msg);
        return null;
      }
    });
  }

  /** VirusTotalに既存レポートがあれば取得します。未登録(404)の場合は null を返します。 */
  private async getExistingFileStats(fileHash: string): Promise<ScanStats | null> {
    try {
      const reportResponse = await axios.get<FileReportResponse>(
        `${BASE_URL}/files/${fileHash}`,
        { headers: { 'x-apikey': this.apiKey } },
      );
      return reportResponse.data?.data?.attributes?.last_analysis_stats ?? null;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async getFileReport(file: Buffer, filename: string): Promise<FileScanResult | null> {
    if (!this.apiKey) return null;

    if (file.length > MAX_FILE_SIZE_BYTES) {
      console.warn(`[VirusTotal] ファイルサイズが上限(32MB)を超えているためスキャンしません: ${filename} (${file.length} bytes)`);
      return null;
    }

    const fileHash = createHash('sha256').update(file).digest('hex');

    const cached = this.getCachedEntry(this.fileScanCache, fileHash);
    if (cached) {
      console.log(`[VirusTotal] キャッシュからファイルの結果を返しました: ${filename}`);
      return cached;
    }

    return this.enqueue(async () => {
      // 順番待ちの間に他のスキャンがキャッシュを埋めている可能性がある
      const queuedCache = this.getCachedEntry(this.fileScanCache, fileHash);
      if (queuedCache) return queuedCache;

      try {
        // まず既存レポートを確認し、あればアップロードせずにAPIクォータを節約する
        let stats = await this.getExistingFileStats(fileHash);

        if (stats) {
          console.log(`[VirusTotal] 既存のファイルレポートを利用しました: ${filename}`);
        } else {
          const formData = new FormData();
          formData.append('file', new Blob([file]), filename);

          const submissionResponse = await axios.post<SubmissionResponse>(
            `${BASE_URL}/files`,
            formData,
            {
              headers: { 'x-apikey': this.apiKey },
              maxContentLength: Infinity,
              maxBodyLength: Infinity,
            },
          );
          const analysisId = submissionResponse.data.data.id;

          const analysis = await this.pollAnalysis(analysisId);
          if (!analysis) {
            console.warn(`[VirusTotal] ファイル解析が完了しませんでした: ${filename}`);
            return null;
          }
          stats = analysis.data.attributes.stats;
        }

        const result: FileScanResult = { stats, fileHash };

        this.setCachedEntry(this.fileScanCache, fileHash, result);
        console.log(`[VirusTotal] ファイルをスキャンし、結果をキャッシュに保存しました: ${filename}`);
        return result;

      } catch (error: unknown) {
        if (this.isRateLimited(error)) {
          console.error('[VirusTotal] APIレート制限に達しました');
          return null;
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[VirusTotal] ファイルスキャン処理エラー:', msg);
        return null;
      }
    });
  }
}

export const virusTotalManager = new VirusTotalManager();
