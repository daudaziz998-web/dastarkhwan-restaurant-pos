import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { resolveDataDir } from './db.ts';

export interface UpdateCheckResult {
  success: boolean;
  isUpdateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  setupDownloadUrl?: string;
  portableDownloadUrl?: string;
  assetName?: string;
  assetSize?: number;
  htmlUrl?: string;
  repositoryUrl?: string;
  error?: string;
  errorType?: 'offline' | 'github_unavailable' | 'rate_limited' | 'not_found' | 'auth_failed' | 'corrupted' | 'unknown';
}

// Read application version directly from package.json as single source of truth
export function getPackageVersion(): string {
  try {
    const candidatePaths = [
      path.join(process.cwd(), 'package.json'),
      path.join(__dirname, 'package.json'),
      path.join(__dirname, '..', 'package.json'),
    ];
    for (const pkgPath of candidatePaths) {
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) return pkg.version;
      }
    }
  } catch (_) {}
  return process.env.npm_package_version || '';
}

// Compare semantic version numbers (e.g. 1.0.0 vs 1.0.1, 1.1.0, 2.0.0)
export function compareSemver(v1: string, v2: string): number {
  const clean1 = (v1 || '').replace(/^v/i, '').trim();
  const clean2 = (v2 || '').replace(/^v/i, '').trim();

  const parts1 = clean1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = clean2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export const DEFAULT_GITHUB_OWNER = 'daudaziz998-web';
export const DEFAULT_GITHUB_REPO = 'dastarkhwan-restaurant-pos';

export function getUpdaterConfig(): { owner: string; repo: string } {
  const configPath = path.join(resolveDataDir(), 'updater-config.json');
  // If an old config file exists from earlier versions, clean it up to prevent stale data
  if (fs.existsSync(configPath)) {
    try {
      fs.unlinkSync(configPath);
    } catch (_) {}
  }

  return {
    owner: DEFAULT_GITHUB_OWNER,
    repo: DEFAULT_GITHUB_REPO,
  };
}

export function saveUpdaterConfig(_config: { owner?: string; repo?: string }) {
  return { success: true };
}

// Parse release assets into Setup installer and Portable executable
function extractReleaseAssets(assets: any[] | undefined, latestVersion: string) {
  let setupDownloadUrl: string | undefined = undefined;
  let portableDownloadUrl: string | undefined = undefined;
  let mainDownloadUrl: string | undefined = undefined;
  let primaryAssetName: string | undefined = undefined;
  let primaryAssetSize: number | undefined = undefined;

  if (Array.isArray(assets) && assets.length > 0) {
    for (const asset of assets) {
      const name: string = asset.name || '';
      const lower = name.toLowerCase();

      // NSIS Setup Installer (e.g. Dastarkhwan.Restaurant.POS-Setup-1.0.1.exe or Setup-1.0.0.exe)
      if (lower.endsWith('.exe') && (lower.includes('setup') || lower.includes('installer') || lower.includes('nsis'))) {
        setupDownloadUrl = asset.browser_download_url;
        primaryAssetName = name;
        primaryAssetSize = asset.size;
      }
      // Portable Executable (e.g. Dastarkhwan.Restaurant.POS-1.0.1.exe)
      else if (lower.endsWith('.exe') && (lower.includes('portable') || (!lower.includes('setup') && !lower.includes('installer')))) {
        portableDownloadUrl = asset.browser_download_url;
        if (!primaryAssetName) {
          primaryAssetName = name;
          primaryAssetSize = asset.size;
        }
      }
      // Any other .exe asset
      else if (lower.endsWith('.exe')) {
        if (!setupDownloadUrl) setupDownloadUrl = asset.browser_download_url;
        if (!primaryAssetName) {
          primaryAssetName = name;
          primaryAssetSize = asset.size;
        }
      }
    }
  }

  // Fallback direct release download URLs if not explicitly listed in assets
  if (!setupDownloadUrl) {
    setupDownloadUrl = `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/v${latestVersion}/Dastarkhwan.Restaurant.POS-Setup-${latestVersion}.exe`;
  }
  if (!portableDownloadUrl) {
    portableDownloadUrl = `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/v${latestVersion}/Dastarkhwan.Restaurant.POS-${latestVersion}.exe`;
  }

  mainDownloadUrl = setupDownloadUrl || portableDownloadUrl;

  return {
    setupDownloadUrl,
    portableDownloadUrl,
    mainDownloadUrl,
    primaryAssetName: primaryAssetName || `Dastarkhwan.Restaurant.POS-Setup-${latestVersion}.exe`,
    primaryAssetSize,
  };
}

// Query official GitHub Releases API for updates
export async function checkGitHubReleases(
  currentVersionInput?: string
): Promise<UpdateCheckResult> {
  const currentVersion = currentVersionInput || getPackageVersion();
  const owner = DEFAULT_GITHUB_OWNER;
  const repo = DEFAULT_GITHUB_REPO;
  const repositoryUrl = `https://github.com/${owner}/${repo}`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Dastarkhwan-POS-Updater/1.0',
  };

  // Strategy 1: Try /releases/latest endpoint
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const latestUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const res = await fetch(latestUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const releaseData = (await res.json()) as any;
      const tagName: string = releaseData.tag_name || releaseData.name || '';
      const latestVersion = tagName.replace(/^v/i, '').trim();

      if (latestVersion) {
        const isUpdateAvailable = compareSemver(latestVersion, currentVersion) > 0;
        const assets = extractReleaseAssets(releaseData.assets, latestVersion);

        return {
          success: true,
          isUpdateAvailable,
          currentVersion,
          latestVersion,
          releaseName: releaseData.name || `Release v${latestVersion}`,
          releaseNotes: releaseData.body || 'No release notes provided for this version.',
          publishedAt: releaseData.published_at || new Date().toISOString(),
          downloadUrl: assets.mainDownloadUrl,
          setupDownloadUrl: assets.setupDownloadUrl,
          portableDownloadUrl: assets.portableDownloadUrl,
          assetName: assets.primaryAssetName,
          assetSize: assets.primaryAssetSize,
          htmlUrl: releaseData.html_url || `${repositoryUrl}/releases/tag/${tagName}`,
          repositoryUrl,
        };
      }
    }

    // Strategy 2: If /releases/latest returned 404, query releases list
    if (res.status === 404) {
      const allReleasesController = new AbortController();
      const allReleasesTimeout = setTimeout(() => allReleasesController.abort(), 10000);

      const listUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`;
      const listRes = await fetch(listUrl, {
        method: 'GET',
        headers,
        signal: allReleasesController.signal,
      });
      clearTimeout(allReleasesTimeout);

      if (listRes.ok) {
        const releasesList = (await listRes.json()) as any[];
        if (Array.isArray(releasesList) && releasesList.length > 0) {
          const firstRelease = releasesList[0];
          const tagName: string = firstRelease.tag_name || firstRelease.name || '';
          const latestVersion = tagName.replace(/^v/i, '').trim();

          if (latestVersion) {
            const isUpdateAvailable = compareSemver(latestVersion, currentVersion) > 0;
            const assets = extractReleaseAssets(firstRelease.assets, latestVersion);

            return {
              success: true,
              isUpdateAvailable,
              currentVersion,
              latestVersion,
              releaseName: firstRelease.name || `Release v${latestVersion}`,
              releaseNotes: firstRelease.body || 'No release notes provided for this version.',
              publishedAt: firstRelease.published_at || new Date().toISOString(),
              downloadUrl: assets.mainDownloadUrl,
              setupDownloadUrl: assets.setupDownloadUrl,
              portableDownloadUrl: assets.portableDownloadUrl,
              assetName: assets.primaryAssetName,
              assetSize: assets.primaryAssetSize,
              htmlUrl: firstRelease.html_url || `${repositoryUrl}/releases/tag/${tagName}`,
              repositoryUrl,
            };
          }
        } else {
          // Empty list of releases published
          return {
            success: true,
            isUpdateAvailable: false,
            currentVersion,
            latestVersion: currentVersion,
            repositoryUrl,
          };
        }
      }
    }

    // If rate-limited
    if (res.status === 403) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        error: 'Unable to check for updates at this moment. Please try again in a few minutes.',
        errorType: 'rate_limited',
        repositoryUrl,
      };
    }

    return {
      success: false,
      isUpdateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      error: 'Unable to check for updates. Please try again.',
      errorType: 'not_found',
      repositoryUrl,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        error: 'Unable to check for updates. Please check your internet connection and try again.',
        errorType: 'offline',
        repositoryUrl,
      };
    }

    const msg = String(err?.message || err);
    if (msg.includes('ENOTFOUND') || msg.includes('fetch failed') || msg.includes('network') || msg.includes('EAI_AGAIN')) {
      return {
        success: false,
        isUpdateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        error: 'Unable to check for updates. Please check your internet connection and try again.',
        errorType: 'offline',
        repositoryUrl,
      };
    }

    return {
      success: false,
      isUpdateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      error: 'Unable to check for updates. Please try again.',
      errorType: 'unknown',
      repositoryUrl,
    };
  }
}

// Download file with redirect handling and streaming progress reporting (for Portable update)
export function downloadFileWithProgress(
  url: string,
  destinationPath: string,
  onProgress: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tempPath = `${destinationPath}.downloading`;
    const fileStream = fs.createWriteStream(tempPath);

    function requestUrl(currentUrl: string, redirectCount = 0) {
      if (redirectCount > 8) {
        fileStream.close();
        fs.unlink(tempPath, () => {});
        return reject(new Error('Too many redirects while downloading update file'));
      }

      const client = currentUrl.startsWith('https') ? https : http;
      const parsedUrl = new URL(currentUrl);

      const req = client.get(
        {
          host: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          port: parsedUrl.port || (currentUrl.startsWith('https') ? 443 : 80),
          headers: {
            'User-Agent': 'Dastarkhwan-POS-Updater/1.0',
            Accept: '*/*',
          },
        },
        (res) => {
          // Handle HTTP redirects (GitHub Releases asset downloads redirect to AWS S3/CDN)
          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).href;
            return requestUrl(nextUrl, redirectCount + 1);
          }

          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            fileStream.close();
            fs.unlink(tempPath, () => {});
            return reject(new Error(`Server returned HTTP ${res.statusCode} while downloading update asset`));
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let transferredBytes = 0;
          let lastSampleTime = Date.now();
          let lastSampleBytes = 0;
          let currentSpeed = 0;

          res.on('data', (chunk: Buffer) => {
            transferredBytes += chunk.length;
            const now = Date.now();
            const elapsed = (now - lastSampleTime) / 1000;
            if (elapsed >= 0.5) {
              currentSpeed = (transferredBytes - lastSampleBytes) / elapsed;
              lastSampleTime = now;
              lastSampleBytes = transferredBytes;
            }

            const percent = totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 1000) / 10 : 0;
            onProgress({
              percent,
              bytesPerSecond: currentSpeed,
              transferred: transferredBytes,
              total: totalBytes,
            });
          });

          res.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close(() => {
              // Atomically rename downloaded file
              try {
                if (fs.existsSync(destinationPath)) {
                  fs.unlinkSync(destinationPath);
                }
                fs.renameSync(tempPath, destinationPath);
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          });
        }
      );

      req.on('error', (err) => {
        fileStream.close();
        fs.unlink(tempPath, () => {});
        reject(err);
      });
    }

    requestUrl(url);
  });
}
