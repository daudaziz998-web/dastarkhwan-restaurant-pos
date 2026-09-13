import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { DesktopUpdateState, TrialInfo } from '../types';

interface AppUpdaterProps {
  trial: TrialInfo | null;
  onToast?: (msg: string) => void;
}

const DEFAULT_OWNER = 'daudaziz998-web';
const DEFAULT_REPO = 'dastrkwan-resturant-pose';
const REPO_URL = `https://github.com/${DEFAULT_OWNER}/${DEFAULT_REPO}`;

export const AppUpdater: React.FC<AppUpdaterProps> = ({ trial, onToast }) => {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState<string>('');
  const [downloadedBytes, setDownloadedBytes] = useState<string>('');
  const [updateReady, setUpdateReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Version and release info
  const [currentVersion, setCurrentVersion] = useState('1.0.0');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [releaseName, setReleaseName] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [setupDownloadUrl, setSetupDownloadUrl] = useState<string | null>(null);
  const [portableDownloadUrl, setPortableDownloadUrl] = useState<string | null>(null);
  const [assetName, setAssetName] = useState<string | null>(null);
  const [isUpToDate, setIsUpToDate] = useState(false);

  // System & Environment
  const [dbPath, setDbPath] = useState<string>('');
  const [dataDir, setDataDir] = useState<string>('');
  const [isElectron, setIsElectron] = useState<boolean>(false);
  const [isPortable, setIsPortable] = useState<boolean>(false);

  // Format bytes helper
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  // Load system information and check environment
  useEffect(() => {
    // 1. Check Electron environment
    if (window.electronAPI?.isDesktop) {
      setIsElectron(true);
      if (window.electronAPI.isPortable) {
        setIsPortable(true);
      }
      window.electronAPI.getAppVersion().then((v) => {
        if (v) setCurrentVersion(v);
      });
      window.electronAPI.getDatabaseLocation().then((loc) => {
        if (loc) {
          setDbPath(loc.databasePath);
          setDataDir(loc.dataDir);
        }
      });
    }

    // 2. Fetch server system info for dynamic package.json version and database location
    api.getSystemInfo().then((info) => {
      if (info) {
        if (info.version && (!window.electronAPI?.isDesktop || currentVersion === '1.0.0')) {
          setCurrentVersion(info.version);
        }
        if (info.dbPath) setDbPath(info.dbPath);
        if (info.dataDir) setDataDir(info.dataDir);
      }
    }).catch(() => {});
  }, []);

  // Listen to desktop update status broadcasts
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatusChange) return;

    const unsubscribe = window.electronAPI.onUpdateStatusChange((state: DesktopUpdateState) => {
      if (state.currentVersion) setCurrentVersion(state.currentVersion);
      if (state.isPortable !== undefined) setIsPortable(state.isPortable);

      if (state.status === 'checking') {
        setChecking(true);
        setErrorMessage(null);
      } else if (state.status === 'available') {
        setChecking(false);
        setIsUpToDate(false);
        setAvailableVersion(state.availableVersion || null);
        setReleaseName(state.releaseName || null);
        setReleaseNotes(state.releaseNotes || null);
        setPublishedAt(state.publishedAt || null);
        setDownloadUrl(state.downloadUrl || null);
        setSetupDownloadUrl(state.setupDownloadUrl || null);
        setPortableDownloadUrl(state.portableDownloadUrl || null);
        setLastChecked(new Date());
      } else if (state.status === 'not-available') {
        setChecking(false);
        setIsUpToDate(true);
        setAvailableVersion(null);
        setErrorMessage(null);
        setLastChecked(new Date());
      } else if (state.status === 'downloading') {
        setChecking(false);
        setDownloading(true);
        if (state.progress) {
          setDownloadProgress(state.progress.percent);
          if (state.progress.bytesPerSecond) {
            setDownloadSpeed(`${(state.progress.bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`);
          }
          if (state.progress.transferred && state.progress.total) {
            setDownloadedBytes(`${formatBytes(state.progress.transferred)} / ${formatBytes(state.progress.total)}`);
          }
        }
      } else if (state.status === 'downloaded') {
        setChecking(false);
        setDownloading(false);
        setDownloadProgress(100);
        setUpdateReady(true);
        if (onToast) onToast('Update downloaded and verified! Ready to apply.');
      } else if (state.status === 'error') {
        setChecking(false);
        setDownloading(false);
        setErrorMessage(state.errorMessage || 'An error occurred while communicating with GitHub Releases.');
        setErrorType(state.errorType || 'unknown');
        setLastChecked(new Date());
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [onToast]);

  // Handle Check for Updates action
  const handleCheckForUpdates = useCallback(async () => {
    setChecking(true);
    setErrorMessage(null);
    setErrorType(null);
    setIsUpToDate(false);

    try {
      if (window.electronAPI?.checkForUpdates) {
        const result = await window.electronAPI.checkForUpdates();
        setLastChecked(new Date());
        if (result && result.error) {
          setErrorMessage(result.error);
          setErrorType(result.errorType || 'unknown');
        } else if (result && result.isUpdateAvailable) {
          setAvailableVersion(result.latestVersion);
          setReleaseName(result.releaseName || `Release v${result.latestVersion}`);
          setReleaseNotes(result.releaseNotes || null);
          setPublishedAt(result.publishedAt || null);
          setDownloadUrl(result.downloadUrl || null);
          setSetupDownloadUrl(result.setupDownloadUrl || null);
          setPortableDownloadUrl(result.portableDownloadUrl || null);
          setAssetName(result.assetName || null);
          setIsUpToDate(false);
        } else if (result && result.success && !result.isUpdateAvailable) {
          setIsUpToDate(true);
          setAvailableVersion(null);
        }
      } else {
        // Web / development mode check
        const result = await api.checkUpdates(currentVersion);
        setLastChecked(new Date());
        setChecking(false);

        if (!result.success) {
          setErrorMessage(result.error || `Unable to locate releases at ${REPO_URL}/releases.`);
          setErrorType(result.errorType || 'unknown');
          return;
        }

        if (result.isUpdateAvailable) {
          setIsUpToDate(false);
          setAvailableVersion(result.latestVersion);
          setReleaseName(result.releaseName || `Release v${result.latestVersion}`);
          setReleaseNotes(result.releaseNotes || null);
          setPublishedAt(result.publishedAt || null);
          setDownloadUrl(result.downloadUrl || null);
          setSetupDownloadUrl(result.setupDownloadUrl || null);
          setPortableDownloadUrl(result.portableDownloadUrl || null);
          setAssetName(result.assetName || null);
          if (onToast) onToast(`Update v${result.latestVersion} is available!`);
        } else {
          setIsUpToDate(true);
          setAvailableVersion(null);
          if (onToast) onToast('Your POS application is up to date.');
        }
      }
    } catch (err: any) {
      setChecking(false);
      setLastChecked(new Date());
      setErrorMessage(err.message || 'Failed to connect to the update service.');
      setErrorType('unknown');
    }
  }, [currentVersion, onToast]);

  // Handle Download / Update Now
  const handleUpdateNow = async (targetAsset?: 'setup' | 'portable') => {
    setDownloading(true);
    setErrorMessage(null);
    setDownloadProgress(0);

    if (window.electronAPI?.startUpdateDownload) {
      try {
        await window.electronAPI.startUpdateDownload(targetAsset || (isPortable ? 'portable' : 'setup'));
      } catch (err: any) {
        setDownloading(false);
        setErrorMessage(`Download failed: ${err.message}`);
      }
    } else {
      // In preview / web mode, simulate download
      let progress = 0;
      const interval = setInterval(() => {
        progress += 25;
        setDownloadProgress(progress);
        setDownloadSpeed('5.4 MB/s');
        setDownloadedBytes(`${(progress * 0.48).toFixed(1)} MB / 48 MB`);
        if (progress >= 100) {
          clearInterval(interval);
          setDownloading(false);
          setUpdateReady(true);
          if (onToast) onToast('Update downloaded and verified!');
        }
      }, 300);
    }
  };

  // Handle Restart & Apply Update
  const handleApplyUpdate = () => {
    if (window.electronAPI?.quitAndInstall) {
      window.electronAPI.quitAndInstall();
    } else {
      if (onToast) onToast('Application will restart to apply the update.');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  // Open external URL in default browser
  const openExternalUrl = (url: string) => {
    if (window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="pos-card" id="app-updater-section" style={{ marginBottom: '14px' }}>
      {/* Header with Title and Distribution Badges */}
      <div className="pos-row-between" style={{ alignItems: 'flex-start', marginBottom: '12px' }}>
        <div>
          <div className="pos-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>🔄 Automatic Application Updates</span>
            {isElectron && (
              <span
                id="updater-distribution-badge"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: isPortable ? 'rgba(234, 179, 8, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  color: isPortable ? '#eab308' : '#38bdf8',
                  border: isPortable ? '1px solid rgba(234, 179, 8, 0.3)' : '1px solid rgba(56, 189, 248, 0.3)',
                }}
              >
                {isPortable ? 'Windows Portable' : 'Windows Setup (NSIS)'}
              </span>
            )}
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              Public Repository
            </span>
          </div>
          <div className="pos-muted" style={{ fontSize: '13px', marginTop: '2px' }}>
            Directly connected to official GitHub Releases for production updates.
          </div>
        </div>

        {/* View on GitHub Button */}
        <button
          type="button"
          className="pos-btn outline sm"
          style={{ fontSize: '12px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          onClick={() => openExternalUrl(`${REPO_URL}/releases`)}
          title="Open official GitHub Releases in browser"
        >
          <span>🌐 GitHub Releases</span>
        </button>
      </div>

      {/* Configured Repository Indicator */}
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '8px 12px',
          marginBottom: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="pos-muted">Release Source:</span>
          <a
            href={`${REPO_URL}/releases`}
            onClick={(e) => {
              e.preventDefault();
              openExternalUrl(`${REPO_URL}/releases`);
            }}
            style={{ color: '#38bdf8', textDecoration: 'underline', fontWeight: 600 }}
          >
            {DEFAULT_OWNER}/{DEFAULT_REPO}
          </a>
        </div>
        <div className="pos-muted" style={{ fontSize: '11px' }}>
          No personal token required (Public Repository)
        </div>
      </div>

      {/* Version Status Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: availableVersion ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
          gap: '10px',
          background: 'var(--surface-2)',
          padding: '14px',
          borderRadius: '8px',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="pos-muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Installed Version
            </div>
            <div id="updater-current-version" style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
              v{currentVersion}
            </div>
          </div>
          <span
            style={{
              fontSize: '12px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              fontWeight: 600,
            }}
          >
            Current
          </span>
        </div>

        {availableVersion && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="pos-muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                New Available Version
              </div>
              <div id="updater-available-version" style={{ fontSize: '20px', fontWeight: 700, color: '#38bdf8' }}>
                v{availableVersion}
              </div>
            </div>
            <span
              style={{
                fontSize: '12px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'rgba(56, 189, 248, 0.15)',
                color: '#38bdf8',
                fontWeight: 600,
              }}
            >
              Update Ready
            </span>
          </div>
        )}
      </div>

      {/* Action Button Bar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        {!availableVersion && !updateReady && (
          <button
            id="check-for-updates-btn"
            type="button"
            className="pos-btn"
            disabled={checking}
            onClick={handleCheckForUpdates}
            style={{ minWidth: '170px' }}
          >
            {checking ? '⏳ Checking for Updates...' : '🔍 Check for Updates'}
          </button>
        )}

        {availableVersion && !updateReady && !downloading && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              id="update-now-btn"
              type="button"
              className="pos-btn primary"
              onClick={() => handleUpdateNow(isPortable ? 'portable' : 'setup')}
              style={{
                background: '#0284c7',
                borderColor: '#0284c7',
                color: '#ffffff',
                fontWeight: 600,
                minWidth: '180px',
              }}
            >
              🚀 Update Now (v{availableVersion})
            </button>

            {/* Quick manual download options for Portable or Setup */}
            {portableDownloadUrl && (
              <button
                type="button"
                className="pos-btn outline sm"
                onClick={() => openExternalUrl(portableDownloadUrl!)}
                title="Download Windows Portable executable directly from GitHub"
              >
                📦 Download Portable EXE
              </button>
            )}
            {setupDownloadUrl && (
              <button
                type="button"
                className="pos-btn outline sm"
                onClick={() => openExternalUrl(setupDownloadUrl!)}
                title="Download Windows NSIS Setup installer directly from GitHub"
              >
                💿 Download Setup Installer
              </button>
            )}
          </div>
        )}

        {downloading && (
          <button
            type="button"
            className="pos-btn"
            disabled
            style={{ minWidth: '180px', opacity: 0.9 }}
          >
            ⏳ Downloading Update ({downloadProgress ?? 0}%)...
          </button>
        )}

        {updateReady && (
          <button
            id="restart-and-apply-btn"
            type="button"
            className="pos-btn"
            onClick={handleApplyUpdate}
            style={{
              background: '#16a34a',
              borderColor: '#16a34a',
              color: '#ffffff',
              fontWeight: 700,
              minWidth: '200px',
            }}
          >
            ✨ Restart & Apply Update
          </button>
        )}

        {lastChecked && (
          <span className="pos-muted" style={{ fontSize: '12px' }}>
            Last checked: {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Up To Date Notice */}
      {isUpToDate && !checking && (
        <div
          id="up-to-date-message"
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: '#10b981',
            padding: '12px 14px',
            borderRadius: '8px',
            marginBottom: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '14px',
          }}
        >
          <span style={{ fontSize: '18px' }}>✅</span>
          <div>
            <strong style={{ display: 'block', fontSize: '14px', color: '#10b981' }}>
              You are using the latest version.
            </strong>
            <span style={{ fontSize: '12px', opacity: 0.9 }}>
              Version {currentVersion} matches the latest release published on GitHub ({DEFAULT_OWNER}/{DEFAULT_REPO}).
            </span>
          </div>
        </div>
      )}

      {/* Downloading Progress Bar */}
      {downloading && (
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            padding: '14px',
            borderRadius: '8px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>
              Downloading {isPortable ? 'Portable update' : 'Setup package'} from GitHub...
            </span>
            <span className="pos-mono" style={{ fontWeight: 600 }}>
              {downloadProgress ?? 0}%
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '8px',
            }}
          >
            <div
              style={{
                width: `${downloadProgress ?? 0}%`,
                height: '100%',
                background: '#38bdf8',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
            <span>{downloadedBytes || 'Connecting to GitHub CDN...'}</span>
            <span>{downloadSpeed}</span>
          </div>
        </div>
      )}

      {/* Ready to Install Notice */}
      {updateReady && (
        <div
          style={{
            background: 'rgba(22, 163, 74, 0.12)',
            border: '1px solid rgba(22, 163, 74, 0.3)',
            padding: '14px',
            borderRadius: '8px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '20px' }}>📦</span>
            <div>
              <strong style={{ display: 'block', color: '#16a34a', fontSize: '14px', marginBottom: '4px' }}>
                Update v{availableVersion || 'latest'} is downloaded and verified!
              </strong>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Click <strong>"Restart & Apply Update"</strong> to launch the new version.
                {isPortable ? ' The updated Portable EXE will launch seamlessly.' : ' The NSIS installer will update the app in seconds.'}
              </div>
              <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
                🛡️ All your restaurant orders, menu, customer records, and 30-day trial remain 100% intact.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Release Details Card */}
      {availableVersion && !updateReady && (
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '14px',
            borderRadius: '8px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#38bdf8' }}>
              {releaseName || `Release v${availableVersion}`}
            </div>
            {publishedAt && (
              <span className="pos-muted" style={{ fontSize: '12px' }}>
                Published: {new Date(publishedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          {releaseNotes && (
            <div
              style={{
                fontSize: '12px',
                lineHeight: '1.5',
                color: 'var(--text-muted)',
                background: 'rgba(0,0,0,0.15)',
                padding: '10px',
                borderRadius: '6px',
                whiteSpace: 'pre-line',
                maxHeight: '140px',
                overflowY: 'auto',
                marginBottom: '10px',
              }}
            >
              {releaseNotes}
            </div>
          )}

          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span>📥 Available Artifacts:</span>
            <span className="pos-mono" style={{ color: 'var(--text-primary)' }}>
              Dastarkhwan.Restaurant.POS-Setup-{availableVersion}.exe
            </span>
            <span>&amp;</span>
            <span className="pos-mono" style={{ color: 'var(--text-primary)' }}>
              Dastarkhwan.Restaurant.POS-{availableVersion}.exe (Portable)
            </span>
          </div>
        </div>
      )}

      {/* Error Message Notice */}
      {errorMessage && (
        <div
          id="updater-error-message"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            padding: '12px 14px',
            borderRadius: '8px',
            marginBottom: '14px',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚠️</span>
              <div>
                <strong>Update Service Notice:</strong>
                <p style={{ margin: '4px 0 0 0', lineHeight: 1.4 }}>{errorMessage}</p>
                <p style={{ margin: '6px 0 0 0', fontSize: '12px', opacity: 0.85 }}>
                  Target Repository: <code>{DEFAULT_OWNER}/{DEFAULT_REPO}</code>
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="pos-btn outline sm"
                style={{ fontSize: '11px', padding: '3px 8px', borderColor: '#f87171', color: '#f87171' }}
                onClick={handleCheckForUpdates}
              >
                Retry
              </button>
              <button
                type="button"
                className="pos-btn outline sm"
                style={{ fontSize: '11px', padding: '3px 8px', borderColor: 'var(--border)' }}
                onClick={() => openExternalUrl(`${REPO_URL}/releases`)}
              >
                Open Releases
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRITICAL: User Data Protection & Trial Guarantee Card */}
      <div
        style={{
          background: 'rgba(56, 189, 248, 0.05)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '8px',
          padding: '12px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <span style={{ fontSize: '16px' }}>🛡️</span>
          <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            Database Safety & Trial Guarantee
          </strong>
        </div>

        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
          <li>
            <strong>Persistent Database Location:</strong> The SQLite database is saved in Windows <code>%APPDATA%</code> (per-user storage), completely isolated from the application installation directory.
          </li>
          <li>
            <strong>30-Day Trial Protected:</strong> Updates will never reset, truncate, or overwrite your trial period or license.
            {trial && (
              <span style={{ marginLeft: '4px', color: trial.isExpired ? 'var(--chili)' : 'var(--herb)', fontWeight: 600 }}>
                (Current status: {trial.isExpired ? 'Trial Expired' : `${trial.remainingDays} days remaining`})
              </span>
            )}
          </li>
          <li>
            <strong>Compatible with Setup & Portable:</strong> Both Windows Installer (NSIS) and Portable EXE access the exact same persistent data store.
          </li>
          {dbPath && (
            <li style={{ wordBreak: 'break-all', marginTop: '2px' }}>
              <strong>Database File:</strong> <code style={{ fontSize: '11px' }}>{dbPath}</code>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
