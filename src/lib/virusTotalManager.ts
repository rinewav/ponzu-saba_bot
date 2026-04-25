import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import axios from 'axios';
import type { Client } from 'discord.js';

const BASE_URL = 'https://www.virustotal.com/api/v3';

interface ScanResult {
  stats: {
    malicious: number;
    suspicious: number;
    undetected: number;
    harmless: number;
    timeout: number;
  };
  analysisId: string;
}

interface FileScanResult {
  stats: {
    malicious: number;
    suspicious: number;
    undetected: number;
    harmless: number;
    timeout: number;
  };
  fileHash: string;
}

export class VirusTotalManager {
  private urlScanCache = new Map<string, ScanResult>();
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.VIRUSTOTAL_API_KEY ?? '';
    if (!this.apiKey) {
      console.warn('[VirusTotal] VIRUSTOTAL_API_KEY が設定されていません。URL/ファイルスキャン機能は無効になります。');
    }
  }

  initialize(_client: Client): void {
    // VirusTotalはクライアント不要
  }

  async getUrlReport(url: string): Promise<ScanResult | null> {
    if (this.urlScanCache.has(url)) {
      console.log(`[VirusTotal] キャッシュからURLの結果を返しました: ${url}`);
      return this.urlScanCache.get(url)!;
    }

    try {
      const submissionResponse = await axios.post(
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
      await new Promise(resolve => setTimeout(resolve, 15000));

      const reportResponse = await axios.get(
        `${BASE_URL}/analyses/${analysisId}`,
        { headers: { 'x-apikey': this.apiKey } },
      );

      const result: ScanResult = {
        stats: reportResponse.data.data.attributes.stats,
        analysisId,
      };

      this.urlScanCache.set(url, result);
      console.log(`[VirusTotal] URLをスキャンし、結果をキャッシュに保存しました: ${url}`);
      return result;

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('VirusTotal URLスキャン処理エラー:', msg);
      return null;
    }
  }

  async getFileReport(filePath: string): Promise<FileScanResult | null> {
    try {
      const fileBuffer = await readFile(filePath);
      const formData = new FormData();
      formData.append('file', new Blob([fileBuffer]), basename(filePath));

      const submissionResponse = await axios.post(
        `${BASE_URL}/files`,
        formData,
        {
          headers: { 'x-apikey': this.apiKey },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );
      const analysisId = submissionResponse.data.data.id;
      await new Promise(resolve => setTimeout(resolve, 15000));

      const reportResponse = await axios.get(
        `${BASE_URL}/analyses/${analysisId}`,
        { headers: { 'x-apikey': this.apiKey } },
      );

      return {
        stats: reportResponse.data.data.attributes.stats,
        fileHash: reportResponse.data.meta.file_info.sha256,
      };

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('VirusTotal ファイルスキャン処理エラー:', msg);
      return null;
    }
  }
}

export const virusTotalManager = new VirusTotalManager();