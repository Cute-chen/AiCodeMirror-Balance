// Author: Cute-chen
// Project: AiCodeMirror Balance Tray (Electron)
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  session,
  nativeImage,
  shell,
  Notification,
  clipboard,
  ipcMain,
  screen
} = require('electron');
const fs = require('fs');
const path = require('path');

const IS_MAC = process.platform === 'darwin';
const IS_WINDOWS = process.platform === 'win32';
const FORCE_SOFTWARE_RENDERING = process.env.AICM_DISABLE_GPU === '1';

// Keep GPU acceleration on by default. Transparent windows with software rendering
// are noticeably sluggish on Windows. For problematic environments, allow opt-in fallback.
if (FORCE_SOFTWARE_RENDERING) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-gpu-compositing');
}

const BASE_URL = 'https://www.aicodemirror.com';
const API_WALLET = `${BASE_URL}/api/wallet`;
const API_SESSION = `${BASE_URL}/api/auth/session`;
const API_APIKEYS = `${BASE_URL}/api/apikeys?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc`;
const API_PROFILE = `${BASE_URL}/api/user/profile`;
const API_INVITE_INFO = `${BASE_URL}/api/user/invite/info`;
const API_MODEL_PRICING = `${BASE_URL}/api/model-pricing`;
const API_USAGE_CHART = `${BASE_URL}/api/user/usage/chart?granularity=hour`;
const API_USAGE_TOKEN_STATS = `${BASE_URL}/api/user/usage/token-stats?granularity=hour`;
const API_DASHBOARD_RSC_CANDIDATES = [
  `${BASE_URL}/dashboard?_rsc=1vufg`,
  `${BASE_URL}/dashboard?_rsc=8aq9o`,
  `${BASE_URL}/dashboard`
];
const LOGIN_URL = `${BASE_URL}/login`;
const DASHBOARD_URL = `${BASE_URL}/dashboard/wallet`;
const DASHBOARD_API_KEYS_URL = `${BASE_URL}/dashboard/apikeys`;
const DASHBOARD_ANNOUNCEMENTS_URL = `${BASE_URL}/dashboard/announcements`;
const DASHBOARD_ANNOUNCEMENTS_RSC_CANDIDATES = [
  `${DASHBOARD_ANNOUNCEMENTS_URL}?_rsc=1ewx3`,
  `${DASHBOARD_ANNOUNCEMENTS_URL}?_rsc=75xl0`,
  `${DASHBOARD_ANNOUNCEMENTS_URL}?_rsc=8aq9o`,
  DASHBOARD_ANNOUNCEMENTS_URL
];
const PARTITION = 'persist:aicm';
const ICON_PATH = path.join(__dirname, 'tray.ico');
const ICON_TEMPLATE_PATH = path.join(__dirname, 'trayTemplate.png');
const ICON_MASTER_PATH = path.join(__dirname, 'icon-master.png');
const PANEL_HTML_PATH = path.join(__dirname, 'panel.html');
const PANEL_PRELOAD_PATH = path.join(__dirname, 'preload.js');
const OPACITY_HTML_PATH = path.join(__dirname, 'opacity.html');
const PANEL_WIDTH = 420;
const DEFAULT_PANEL_HEIGHT = 740;
const MIN_PANEL_HEIGHT = 520;
const MAX_PANEL_HEIGHT = 920;
const OPACITY_WIDTH = 332;
const OPACITY_HEIGHT = 584;
const WINDOWS_PANEL_BACKGROUND = '#e6f2fb';
const WINDOWS_OPACITY_BACKGROUND = '#edf6fd';
const MAC_TRAY_FALLBACK_TITLE = 'AICM';
const SETTINGS_FILE_NAME = 'tray-settings.json';
const DEFAULT_PANEL_OPACITY_PERCENT = 90;
const DEFAULT_THEME_COLOR = '#252b31';
const TRAY_TITLE_MODES = [
  { key: 'app', label: 'AICM' },
  { key: 'balance', label: '总余额' },
  { key: 'hidden', label: '关闭文字' }
];
const WINDOW_BLUR_GUARD_MS = 240;
const TRAY_CLICK_GUARD_MS = 220;
const MODEL_PRODUCTS = [
  { key: 'claude', label: 'Claude', product: 'CLAUDECODE' },
  { key: 'codex', label: 'Codex', product: 'CODEX' },
  { key: 'gemini', label: 'Gemini', product: 'GEMINI' }
];
const REFRESH_OPTIONS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

let tray = null;
let loginWin = null;
let panelWin = null;
let opacityWin = null;
let refreshTimer = null;
let loginDetectTimer = null;
let settingsSaveTimer = null;
let trayMenuRefreshTimer = null;
let currentContextMenu = null;
let refreshSeconds = 60;
let panelOpacityPercent = DEFAULT_PANEL_OPACITY_PERCENT;
let themeColorHex = DEFAULT_THEME_COLOR;
let panelHeight = DEFAULT_PANEL_HEIGHT;
let trayTitleMode = 'app';
let isFetching = false;
let panelBlurGuardUntil = 0;
let opacityBlurGuardUntil = 0;
let trayClickGuardUntil = 0;
let panelReadyToShow = false;
let pendingPanelShowBounds = null;

let lastBalanceText = '未登录';
let lastDetailText = '-';
let lastPlanText = '-';
let lastKeysText = 'API Keys: -';
let lastAccountText = '账号: -';
let lastInviteCodeText = '邀请码: -';
let lastInviteLink = '';
let lastModelPricing = createEmptyModelPricing();
let lastUsageStats = createEmptyUsageStats();
let lastAccountData = createEmptyAccountData();
let lastAnnouncement = createEmptyAnnouncement();

function createEmptyModelPricing() {
  return MODEL_PRODUCTS.reduce((acc, group) => {
    acc[group.key] = null;
    return acc;
  }, {});
}

function createEmptyUsageStats() {
  return MODEL_PRODUCTS.reduce((acc, group) => {
    acc[group.key] = {
      consumed: null,
      recordCount: null,
      inputTokens: null,
      outputTokens: null,
      cacheCreationTokens: null,
      cacheReadTokens: null,
      trend: 'flat',
      trendDelta: 0,
      series: []
    };
    return acc;
  }, {});
}

function createEmptyAccountData() {
  return {
    loggedIn: false,
    totalBalance: null,
    subscriptionBalance: null,
    usageBalance: null,
    plan: '-',
    daysLeft: null,
    account: '-',
    inviteCode: '',
    inviteLink: '',
    apiKeys: [],
    updatedAt: null
  };
}

function createEmptyAnnouncement() {
  return {
    title: '',
    url: DASHBOARD_ANNOUNCEMENTS_URL
  };
}

function createEmptyIcon() {
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAE0lEQVR42mP8z8AARMAgGg0AAHkUAf6W2CYAAAAASUVORK5CYII=';
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
}

function createMacStatusIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
      <path fill="#000000" d="M8.98 1.5 3.55 16.5h2.58l1.15-3.35h3.45l1.17 3.35h2.55L9.02 1.5Zm.02 4.3 1.12 3.36H7.86Z"/>
    </svg>
  `;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );
  if (icon.isEmpty()) {
    return createEmptyIcon();
  }
  const resized = icon.resize({ width: 18, height: 18, quality: 'best' });
  resized.setTemplateImage(true);
  return resized;
}

function createTrayIcon() {
  let icon;
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromPath(ICON_TEMPLATE_PATH);
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 18, height: 18, quality: 'best' });
      icon.setTemplateImage(true);
    } else {
      icon = createMacStatusIcon();
    }
  } else {
    icon = nativeImage.createFromPath(ICON_PATH);
    if (!icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16, quality: 'best' });
    }
  }
  if (!icon.isEmpty()) return icon;
  return createEmptyIcon();
}

function restartRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchWalletBalance, refreshSeconds * 1000);
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE_NAME);
}

function persistSettings() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(
      getSettingsPath(),
      JSON.stringify({
        refreshSeconds,
        panelOpacityPercent,
        themeColorHex,
        panelHeight,
        trayTitleMode
      }, null, 2),
      'utf8'
    );
  } catch (error) {
    console.warn('[tray-settings] save failed:', error?.message || error);
  }
}

function schedulePersistSettings() {
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
  }
  settingsSaveTimer = setTimeout(() => {
    settingsSaveTimer = null;
    persistSettings();
  }, 160);
}

function scheduleTrayMenuRefresh() {
  if (trayMenuRefreshTimer) {
    clearTimeout(trayMenuRefreshTimer);
  }
  trayMenuRefreshTimer = setTimeout(() => {
    trayMenuRefreshTimer = null;
    updateTrayMenu();
  }, 120);
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const data = JSON.parse(raw);

    if (REFRESH_OPTIONS.includes(data?.refreshSeconds)) {
      refreshSeconds = data.refreshSeconds;
    }
    const opacity = Math.round(Number(data?.panelOpacityPercent));
    if (Number.isFinite(opacity)) {
      panelOpacityPercent = clamp(opacity, 0, 100);
    }
    const color = normalizeThemeColorHex(data?.themeColorHex);
    if (color) {
      themeColorHex = color;
    }
    const savedPanelHeight = normalizePanelHeight(data?.panelHeight);
    if (Number.isFinite(savedPanelHeight)) {
      panelHeight = savedPanelHeight;
    }
    if (TRAY_TITLE_MODES.some((item) => item.key === data?.trayTitleMode)) {
      trayTitleMode = data.trayTitleMode;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('[tray-settings] load failed:', error?.message || error);
    }
  }
}

function formatCredits(value) {
  return Number.isFinite(value) ? `${(value / 1000).toFixed(2)}` : '-';
}

function formatInteger(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('zh-CN').format(value) : '-';
}

function formatModelLine(model) {
  const parts = [
    `入${model?.inputPrice ?? '-'}`,
    `出${model?.outputPrice ?? '-'}`
  ];
  if (model?.cacheCreationPrice !== null && model?.cacheCreationPrice !== undefined) {
    parts.push(`写${model.cacheCreationPrice}`);
  }
  if (model?.cacheReadPrice !== null && model?.cacheReadPrice !== undefined) {
    parts.push(`读${model.cacheReadPrice}`);
  }
  return `${model?.modelName || '(未命名模型)'} | ${parts.join(' / ')}`;
}

function getTrayTitleModeLabel(mode = trayTitleMode) {
  return TRAY_TITLE_MODES.find((item) => item.key === mode)?.label || MAC_TRAY_FALLBACK_TITLE;
}

function getTrayTitleText() {
  if (trayTitleMode === 'hidden') {
    return '';
  }

  if (trayTitleMode === 'balance') {
    if (Number.isFinite(lastAccountData.totalBalance)) {
      return formatCredits(lastAccountData.totalBalance);
    }
    if (lastBalanceText && !['已登录', '未登录'].includes(lastBalanceText)) {
      return lastBalanceText;
    }
  }

  return MAC_TRAY_FALLBACK_TITLE;
}

function buildReadonlyItem(label) {
  return { label, enabled: false };
}

function hasUsageData(stats) {
  return !!stats && [
    stats.consumed,
    stats.recordCount,
    stats.inputTokens,
    stats.outputTokens,
    stats.cacheCreationTokens,
    stats.cacheReadTokens
  ].some((value) => Number.isFinite(value));
}

function hasModelPricingData(rows) {
  return Array.isArray(rows);
}

function buildModelMenuTemplate() {
  return MODEL_PRODUCTS.map((group) => {
    const rows = lastModelPricing[group.key];
    const submenu = Array.isArray(rows) && rows.length
      ? rows.map((model) => buildReadonlyItem(formatModelLine(model)))
      : [buildReadonlyItem(rows === null ? '暂无数据' : '暂无模型')];

    return {
      label: group.label,
      submenu
    };
  });
}

function buildUsageGroupTemplate(stats) {
  if (!hasUsageData(stats)) {
    return [buildReadonlyItem('暂无数据')];
  }

  return [
    buildReadonlyItem(`消耗: ${formatCredits(stats.consumed)}`),
    buildReadonlyItem(`记录数: ${formatInteger(stats.recordCount)}`),
    buildReadonlyItem(`输入 Token: ${formatInteger(stats.inputTokens)}`),
    buildReadonlyItem(`输出 Token: ${formatInteger(stats.outputTokens)}`),
    buildReadonlyItem(`Cache 写入: ${formatInteger(stats.cacheCreationTokens)}`),
    buildReadonlyItem(`Cache 读取: ${formatInteger(stats.cacheReadTokens)}`)
  ];
}

function buildUsageMenuTemplate() {
  return [
    buildReadonlyItem('统计维度: 小时'),
    { type: 'separator' },
    ...MODEL_PRODUCTS.map((group) => ({
      label: group.label,
      submenu: buildUsageGroupTemplate(lastUsageStats[group.key])
    }))
  ];
}

function getSession() {
  return session.fromPartition(PARTITION);
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalizeAnnouncementTitle(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/\\u([\da-fA-F]{4})/g, (_match, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLatestAnnouncementTitle(pageText) {
  if (typeof pageText !== 'string' || !pageText) return '';

  const matches = [];
  const rscTitleRegex = /"h4",null,\{[^{}]*"children":"([^"]+)"/g;
  for (const match of pageText.matchAll(rscTitleRegex)) {
    const title = normalizeAnnouncementTitle(match[1]);
    if (title) {
      matches.push(title);
    }
  }

  const htmlTitleRegex = /<h4\b[^>]*>(.*?)<\/h4>/gis;
  for (const match of pageText.matchAll(htmlTitleRegex)) {
    const title = normalizeAnnouncementTitle(match[1]);
    if (title) {
      matches.push(title);
    }
  }

  const blacklist = new Set(['网站公告', '全部公告']);
  const deduped = [...new Set(matches)].filter((title) => !blacklist.has(title));
  return deduped[0] || '';
}

function copyInviteLink(notify = true) {
  if (!lastInviteLink) return false;
  clipboard.writeText(lastInviteLink);
  if (notify && Notification.isSupported()) {
    new Notification({
      title: 'AiCodeMirror 余额工具',
      body: '邀请链接已复制'
    }).show();
  }
  return true;
}

function createPanelState() {
  return {
    platform: process.platform,
    statusText: lastBalanceText,
    detailText: lastDetailText,
    planText: lastPlanText,
    accountText: lastAccountText,
    inviteCodeText: lastInviteCodeText,
    keysText: lastKeysText,
    refreshSeconds,
    isFetching,
    groups: MODEL_PRODUCTS.map(({ key, label }) => ({ key, label })),
    accountData: lastAccountData,
    announcement: lastAnnouncement,
    modelPricing: lastModelPricing,
    usageStats: lastUsageStats,
    usageWindowHours: 48,
    panelOpacityPercent,
    themeColorHex,
    display: {
      totalBalance: Number.isFinite(lastAccountData.totalBalance)
        ? formatCredits(lastAccountData.totalBalance)
        : (lastBalanceText || '-').replace(/^余额:\s*/, ''),
      subscriptionBalance: Number.isFinite(lastAccountData.subscriptionBalance)
        ? formatCredits(lastAccountData.subscriptionBalance)
        : '-',
      usageBalance: Number.isFinite(lastAccountData.usageBalance)
        ? formatCredits(lastAccountData.usageBalance)
        : '-'
    }
  };
}

function getUsageTrend(values) {
  const series = values.filter((value) => Number.isFinite(value));
  if (series.length < 2) {
    return {
      trend: 'flat',
      trendDelta: 0
    };
  }

  const segmentSize = Math.max(1, Math.min(6, Math.floor(series.length / 2)));
  const recent = series.slice(-segmentSize).reduce((sum, value) => sum + value, 0);
  const previous = series.slice(-(segmentSize * 2), -segmentSize).reduce((sum, value) => sum + value, 0);
  const delta = recent - previous;
  const baseline = Math.max(Math.abs(previous), 1);
  const ratio = delta / baseline;

  if (ratio >= 0.15) {
    return { trend: 'up', trendDelta: delta };
  }
  if (ratio <= -0.15) {
    return { trend: 'down', trendDelta: delta };
  }
  return { trend: 'flat', trendDelta: delta };
}

function sendPanelState() {
  if (!panelWin || panelWin.isDestroyed()) return;
  panelWin.webContents.send('panel:state', createPanelState());
}

function createOpacityState() {
  return {
    panelOpacityPercent,
    defaultPanelOpacityPercent: DEFAULT_PANEL_OPACITY_PERCENT,
    themeColorHex,
    defaultThemeColorHex: DEFAULT_THEME_COLOR,
    panelHeight,
    defaultPanelHeight: DEFAULT_PANEL_HEIGHT,
    minPanelHeight: MIN_PANEL_HEIGHT,
    maxPanelHeight: MAX_PANEL_HEIGHT
  };
}

function sendOpacityState() {
  if (!opacityWin || opacityWin.isDestroyed()) return;
  opacityWin.webContents.send('opacity:state', createOpacityState());
}

function applyPanelOpacity() {
  const opacity = IS_WINDOWS
    ? clamp(panelOpacityPercent / 100, 0.35, 1)
    : 1;

  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.setOpacity(opacity);
  }
  if (opacityWin && !opacityWin.isDestroyed()) {
    opacityWin.setOpacity(opacity);
  }
}

function applyWindowsBackdrop(win, material) {
  if (!IS_WINDOWS || !win || win.isDestroyed()) return;
  try {
    if (typeof win.setBackgroundMaterial === 'function') {
      win.setBackgroundMaterial(material);
    }
  } catch {
    // Windows 10 or unsupported Windows 11 builds will ignore this path.
  }
}

function armPanelBlurGuard() {
  panelBlurGuardUntil = Date.now() + WINDOW_BLUR_GUARD_MS;
}

function armOpacityBlurGuard() {
  opacityBlurGuardUntil = Date.now() + WINDOW_BLUR_GUARD_MS;
}

function armTrayClickGuard() {
  trayClickGuardUntil = Date.now() + TRAY_CLICK_GUARD_MS;
}

function shouldIgnorePanelBlur() {
  return IS_WINDOWS && Date.now() < panelBlurGuardUntil;
}

function shouldIgnoreOpacityBlur() {
  return IS_WINDOWS && Date.now() < opacityBlurGuardUntil;
}

function shouldIgnoreTrayClick() {
  return IS_WINDOWS && Date.now() < trayClickGuardUntil;
}

function buildPanelQuery() {
  return {
    state: Buffer.from(JSON.stringify(createPanelState()), 'utf8').toString('base64url')
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizePanelOpacityPercent(value) {
  const numeric = Math.round(Number(value));
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : DEFAULT_PANEL_OPACITY_PERCENT;
}

function normalizePanelHeight(value) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return DEFAULT_PANEL_HEIGHT;
  return clamp(Math.round(numeric / 10) * 10, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT);
}

function normalizeThemeColorHex(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const matched = trimmed.match(/^#?([0-9a-fA-F]{6})$/);
  if (!matched) return null;
  return `#${matched[1].toLowerCase()}`;
}

function getTrayBounds(fallbackBounds) {
  const candidate = fallbackBounds || (tray ? tray.getBounds() : null);
  if (
    candidate &&
    Number.isFinite(candidate.x) &&
    Number.isFinite(candidate.y) &&
    Number.isFinite(candidate.width) &&
    Number.isFinite(candidate.height)
  ) {
    return candidate;
  }
  return { x: 0, y: 0, width: 0, height: 0 };
}

function calculatePanelPosition(fallbackBounds) {
  const trayBounds = getTrayBounds(fallbackBounds);
  const anchor = {
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2)
  };
  const display = screen.getDisplayNearestPoint(anchor);
  const { workArea } = display;
  const minX = workArea.x + 12;
  const maxX = workArea.x + workArea.width - PANEL_WIDTH - 12;
  const minY = workArea.y + 12;
  const maxY = workArea.y + workArea.height - panelHeight - 12;
  const preferAbove = anchor.y > workArea.y + workArea.height / 2;

  let x = Math.round(anchor.x - PANEL_WIDTH / 2);
  let y = preferAbove
    ? Math.round(trayBounds.y - panelHeight - 12)
    : Math.round(trayBounds.y + trayBounds.height + 12);

  if (maxX >= minX) {
    x = clamp(x, minX, maxX);
  } else {
    x = workArea.x;
  }

  if (maxY >= minY) {
    y = clamp(y, minY, maxY);
  } else {
    y = workArea.y;
  }

  return { x, y };
}

function calculateOpacityWindowPosition(fallbackBounds) {
  const trayBounds = getTrayBounds(fallbackBounds);
  const anchor = {
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2)
  };
  const display = screen.getDisplayNearestPoint(anchor);
  const { workArea } = display;
  const minX = workArea.x + 12;
  const maxX = workArea.x + workArea.width - OPACITY_WIDTH - 12;
  const minY = workArea.y + 12;
  const maxY = workArea.y + workArea.height - OPACITY_HEIGHT - 12;
  const preferAbove = anchor.y > workArea.y + workArea.height / 2;

  let x = Math.round(anchor.x - OPACITY_WIDTH / 2);
  let y = preferAbove
    ? Math.round(trayBounds.y - OPACITY_HEIGHT - 12)
    : Math.round(trayBounds.y + trayBounds.height + 12);

  if (maxX >= minX) {
    x = clamp(x, minX, maxX);
  } else {
    x = workArea.x;
  }

  if (maxY >= minY) {
    y = clamp(y, minY, maxY);
  } else {
    y = workArea.y;
  }

  return { x, y };
}

function createPanelWindow() {
  if (panelWin && !panelWin.isDestroyed()) return panelWin;

  panelReadyToShow = false;
  pendingPanelShowBounds = null;
  panelWin = new BrowserWindow({
    width: PANEL_WIDTH,
    height: panelHeight,
    show: false,
    frame: false,
    transparent: !IS_WINDOWS,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: !IS_MAC,
    backgroundColor: IS_WINDOWS ? WINDOWS_PANEL_BACKGROUND : '#00000000',
    title: 'AiCodeMirror 账户面板',
    focusable: true,
    acceptFirstMouse: true,
    roundedCorners: !IS_WINDOWS,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: PANEL_PRELOAD_PATH,
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  applyPanelOpacity();
  panelWin.setAlwaysOnTop(true);
  panelWin.setSkipTaskbar(true);
  panelWin.setAutoHideMenuBar(true);
  panelWin.setMenuBarVisibility(false);
  applyWindowsBackdrop(panelWin, 'acrylic');
  panelWin.loadFile(PANEL_HTML_PATH, { query: buildPanelQuery() });

  panelWin.on('closed', () => {
    panelWin = null;
    panelReadyToShow = false;
    pendingPanelShowBounds = null;
  });

  panelWin.on('show', () => {
    panelWin?.setSkipTaskbar(true);
  });

  panelWin.on('blur', () => {
    if (shouldIgnorePanelBlur()) {
      return;
    }
    if (!IS_WINDOWS && panelWin && !panelWin.isDestroyed()) {
      panelWin.hide();
    }
  });

  panelWin.webContents.on('did-finish-load', () => {
    sendPanelState();
  });

  panelWin.once('ready-to-show', () => {
    panelReadyToShow = true;
    sendPanelState();
    if (pendingPanelShowBounds) {
      const bounds = pendingPanelShowBounds;
      pendingPanelShowBounds = null;
      showPanel(bounds);
    }
  });

  return panelWin;
}

function createOpacityWindow() {
  if (opacityWin && !opacityWin.isDestroyed()) return opacityWin;

  opacityWin = new BrowserWindow({
    width: OPACITY_WIDTH,
    height: OPACITY_HEIGHT,
    show: false,
    frame: false,
    transparent: !IS_WINDOWS,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: !IS_MAC,
    backgroundColor: IS_WINDOWS ? WINDOWS_OPACITY_BACKGROUND : '#00000000',
    title: '面板主题',
    focusable: true,
    acceptFirstMouse: true,
    roundedCorners: !IS_WINDOWS,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  });

  opacityWin.setSkipTaskbar(true);
  opacityWin.setAutoHideMenuBar(true);
  opacityWin.setMenuBarVisibility(false);
  applyPanelOpacity();
  applyWindowsBackdrop(opacityWin, 'mica');
  opacityWin.loadFile(OPACITY_HTML_PATH);

  opacityWin.on('closed', () => {
    opacityWin = null;
  });

  opacityWin.on('blur', () => {
    if (shouldIgnoreOpacityBlur()) {
      return;
    }
    if (!IS_WINDOWS && opacityWin && !opacityWin.isDestroyed()) {
      opacityWin.hide();
    }
  });

  opacityWin.webContents.on('did-finish-load', () => {
    sendOpacityState();
  });

  return opacityWin;
}

function showPanel(fallbackBounds) {
  const win = createPanelWindow();
  if (IS_WINDOWS && !panelReadyToShow) {
    pendingPanelShowBounds = fallbackBounds || tray?.getBounds?.() || null;
    return;
  }
  const { x, y } = calculatePanelPosition(fallbackBounds);
  armPanelBlurGuard();
  if (IS_MAC && typeof app.focus === 'function') {
    app.focus({ steal: true });
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      sendPanelState();
    });
  } else {
    sendPanelState();
  }
  win.setBounds({ x, y, width: PANEL_WIDTH, height: panelHeight });
  win.setFocusable(true);
  win.setSkipTaskbar(true);
  win.show();
  if (!IS_WINDOWS || win.isFocusable()) {
    win.focus();
  }
}

function hidePanel() {
  if (!panelWin || panelWin.isDestroyed()) return;
  panelBlurGuardUntil = 0;
  pendingPanelShowBounds = null;
  panelWin.hide();
}

function showOpacityWindow(fallbackBounds) {
  showPanel(fallbackBounds);
  const win = createOpacityWindow();
  const { x, y } = calculateOpacityWindowPosition(fallbackBounds);
  armOpacityBlurGuard();
  if (IS_MAC && typeof app.focus === 'function') {
    app.focus({ steal: true });
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', () => {
      sendOpacityState();
    });
  } else {
    sendOpacityState();
  }
  win.setBounds({ x, y, width: OPACITY_WIDTH, height: OPACITY_HEIGHT });
  win.setSkipTaskbar(true);
  win.show();
  if (!IS_WINDOWS || win.isFocusable()) {
    win.focus();
  }
}

function hideOpacityWindow() {
  if (!opacityWin || opacityWin.isDestroyed()) return;
  opacityBlurGuardUntil = 0;
  opacityWin.hide();
}

function setPanelOpacityPercent(value) {
  const nextPercent = normalizePanelOpacityPercent(value);
  if (panelOpacityPercent !== nextPercent) {
    panelOpacityPercent = nextPercent;
    applyPanelOpacity();
    schedulePersistSettings();
    sendPanelState();
    sendOpacityState();
    scheduleTrayMenuRefresh();
  } else {
    sendPanelState();
    sendOpacityState();
  }
  return nextPercent;
}

function setPanelHeight(value, fallbackBounds) {
  const nextHeight = normalizePanelHeight(value);
  if (panelHeight !== nextHeight) {
    panelHeight = nextHeight;
    schedulePersistSettings();
    sendOpacityState();
    if (panelWin && !panelWin.isDestroyed()) {
      const { x, y } = calculatePanelPosition(fallbackBounds);
      panelWin.setBounds({ x, y, width: PANEL_WIDTH, height: panelHeight });
    }
  } else {
    sendOpacityState();
  }
  return nextHeight;
}

function setThemeColorHex(value) {
  const nextColor = normalizeThemeColorHex(value) || DEFAULT_THEME_COLOR;
  if (themeColorHex !== nextColor) {
    themeColorHex = nextColor;
    schedulePersistSettings();
    sendPanelState();
    sendOpacityState();
    scheduleTrayMenuRefresh();
  } else {
    sendPanelState();
    sendOpacityState();
  }
  return nextColor;
}

function togglePanel(fallbackBounds) {
  if (panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) {
    panelWin.hide();
    return;
  }
  showPanel(fallbackBounds);
  void fetchWalletBalance();
}

function showContextMenu() {
  hidePanel();
  hideOpacityWindow();
  if (tray && currentContextMenu) {
    tray.popUpContextMenu(currentContextMenu);
  }
}

async function hasAuthCookie() {
  const ses = getSession();
  const cookies = await ses.cookies.get({ url: BASE_URL });
  return cookies.some((cookie) => {
    const name = (cookie.name || '').toLowerCase();
    return name.includes('session') || name.includes('authjs') || name.includes('token');
  });
}

async function hasValidSession() {
  const ses = getSession();
  try {
    const res = await ses.fetch(API_SESSION, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.user?.id;
  } catch {
    return false;
  }
}

async function fetchOptionalJson(url, headers) {
  const ses = getSession();
  try {
    const res = await ses.fetch(url, {
      method: 'GET',
      headers
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchPageText(url, headers) {
  const ses = getSession();
  try {
    const res = await ses.fetch(url, {
      method: 'GET',
      headers
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchSubscriptionWindow(commonHeaders) {
  for (const url of API_DASHBOARD_RSC_CANDIDATES) {
    try {
      const text = await fetchPageText(url, {
        ...commonHeaders,
        Accept: 'text/x-component, text/html, */*',
        rsc: '1'
      });
      if (!text) continue;

      const subStartMatch =
        text.match(/"subscriptionStartedAt":"\$D([^"]+)"/) ||
        text.match(/"subscriptionStartedAt":"([^"]+)"/);
      const subExpireMatch =
        text.match(/"subscriptionExpiresAt":"\$D([^"]+)"/) ||
        text.match(/"subscriptionExpiresAt":"([^"]+)"/);

      if (subExpireMatch) {
        const start = subStartMatch ? new Date(subStartMatch[1]) : null;
        const expire = new Date(subExpireMatch[1]);
        if (!Number.isNaN(expire.getTime())) {
          return { start, expire };
        }
      }
    } catch {
      // Try next candidate.
    }
  }
  return { start: null, expire: null };
}

async function fetchLatestAnnouncement(commonHeaders) {
  for (const url of DASHBOARD_ANNOUNCEMENTS_RSC_CANDIDATES) {
    const text = await fetchPageText(url, {
      ...commonHeaders,
      Accept: 'text/x-component, text/html, */*',
      rsc: '1'
    });
    if (!text) continue;

    const title = extractLatestAnnouncementTitle(text);
    if (title) {
      return {
        title,
        url: DASHBOARD_ANNOUNCEMENTS_URL
      };
    }
  }

  return null;
}

async function fetchModelPricing(commonHeaders) {
  const next = createEmptyModelPricing();
  const rows = await Promise.all(MODEL_PRODUCTS.map(async (group) => {
    const data = await fetchOptionalJson(
      `${API_MODEL_PRICING}?product=${encodeURIComponent(group.product)}`,
      commonHeaders
    );
    const items = Array.isArray(data?.data)
      ? data.data
        .filter((item) => item?.isActive !== false)
        .sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
      : null;
    return [group.key, items];
  }));

  for (const [key, items] of rows) {
    next[key] = items;
  }

  return next;
}

async function fetchUsageStats(commonHeaders) {
  const next = createEmptyUsageStats();
  const [chartData, tokenStats] = await Promise.all([
    fetchOptionalJson(API_USAGE_CHART, commonHeaders),
    fetchOptionalJson(API_USAGE_TOKEN_STATS, commonHeaders)
  ]);

  if (Array.isArray(chartData?.chartData)) {
    for (const group of MODEL_PRODUCTS) {
      const series = chartData.chartData.map((row) => {
        const value = Number(row?.[group.key] || 0);
        return Number.isFinite(value) ? value : 0;
      });
      next[group.key].series = series;
      next[group.key].consumed = series.reduce((sum, value) => sum + value, 0);
      const trend = getUsageTrend(series);
      next[group.key].trend = trend.trend;
      next[group.key].trendDelta = trend.trendDelta;
    }
  }

  if (chartData?.recordCounts && typeof chartData.recordCounts === 'object') {
    for (const group of MODEL_PRODUCTS) {
      const count = Number(chartData.recordCounts[group.key]);
      next[group.key].recordCount = Number.isFinite(count) ? count : null;
    }
  }

  for (const group of MODEL_PRODUCTS) {
    const stats = tokenStats?.[group.key];
    if (!stats || typeof stats !== 'object') continue;
    next[group.key].inputTokens = Number(stats.inputTokens || 0);
    next[group.key].outputTokens = Number(stats.outputTokens || 0);
    next[group.key].cacheCreationTokens = Number(stats.cacheCreationTokens || 0);
    next[group.key].cacheReadTokens = Number(stats.cacheReadTokens || 0);
  }

  return next;
}

async function fetchWalletBalance() {
  if (isFetching) return;
  isFetching = true;
  sendPanelState();

  try {
    const ses = getSession();
    const hasCookie = await hasAuthCookie();
    if (!hasCookie) {
      lastBalanceText = '未登录';
      lastDetailText = '无可用会话';
      lastPlanText = '-';
      lastKeysText = 'API Keys: -';
      lastAccountText = '账号: -';
      lastInviteCodeText = '邀请码: -';
      lastInviteLink = '';
      lastModelPricing = createEmptyModelPricing();
      lastUsageStats = createEmptyUsageStats();
      lastAccountData = createEmptyAccountData();
      lastAnnouncement = createEmptyAnnouncement();
      updateTrayMenu();
      return;
    }

    const commonHeaders = {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const walletRes = await ses.fetch(API_WALLET, { method: 'GET', headers: commonHeaders });

    const [sessionData, keysData, profileData, inviteData, subWindow, modelPricing, usageStats, announcement] = await Promise.all([
      fetchOptionalJson(API_SESSION, commonHeaders),
      fetchOptionalJson(API_APIKEYS, commonHeaders),
      fetchOptionalJson(API_PROFILE, commonHeaders),
      fetchOptionalJson(API_INVITE_INFO, commonHeaders),
      fetchSubscriptionWindow(commonHeaders),
      fetchModelPricing(commonHeaders),
      fetchUsageStats(commonHeaders),
      fetchLatestAnnouncement(commonHeaders)
    ]);

    if (walletRes.status === 401 || walletRes.status === 403) {
      await clearAuth(false);
      lastBalanceText = '登录已失效';
      lastDetailText = `HTTP ${walletRes.status}`;
      updateTrayMenu();
      return;
    }

    if (!walletRes.ok) {
      lastBalanceText = '请求失败';
      lastDetailText = `HTTP ${walletRes.status}`;
      updateTrayMenu();
      return;
    }

    const walletData = await walletRes.json();
    const bal = Number(walletData?.data?.balance);
    const bonus = Number(walletData?.data?.bonusBalance);
    const totalBalance = (Number.isFinite(bal) ? bal : 0) + (Number.isFinite(bonus) ? bonus : 0);
    const balCny = Number.isFinite(bal) ? (bal / 1000).toFixed(2) : '-';
    const bonusCny = Number.isFinite(bonus) ? (bonus / 1000).toFixed(2) : '-';
    const totalCnyText = (totalBalance / 1000).toFixed(2);

    const plan = sessionData?.user?.plan || '-';
    const subStart = subWindow?.start || null;
    const subExpire = subWindow?.expire || null;
    const daysLeft = subExpire && !Number.isNaN(subExpire.getTime())
      ? Math.max(0, Math.ceil((subExpire.getTime() - Date.now()) / (24 * 3600 * 1000)))
      : null;

    const keyRows = Array.isArray(keysData?.data) ? keysData.data : [];
    const apiKeys = keyRows.map((key) => {
      const consumed = Number(key?.totalConsumed || 0);
      return {
        name: key?.name || '(未命名)',
        consumed: Number.isFinite(consumed) ? consumed : 0,
        apiKey: typeof key?.apiKey === 'string' ? key.apiKey : ''
      };
    });

    const keySummary = apiKeys
      .map((key) => `${key.name}:¥${(key.consumed / 1000).toFixed(2)}`)
      .join(' | ');

    const account =
      sessionData?.user?.phone ||
      profileData?.user?.phone ||
      profileData?.user?.email ||
      '-';

    const inviteCode =
      inviteData?.data?.inviteCode ||
      inviteData?.inviteCode ||
      '';
    const inviteLink =
      inviteData?.data?.inviteLink ||
      inviteData?.data?.inviteUrl ||
      inviteData?.inviteLink ||
      inviteData?.inviteUrl ||
      (inviteCode ? `${BASE_URL}/register?inviteCode=${encodeURIComponent(inviteCode)}` : '');

    lastBalanceText = `余额: ${totalCnyText}`;
    lastDetailText = `订阅￥${balCny} / 按量￥${bonusCny}`;
    if (subStart && subExpire && !Number.isNaN(subStart.getTime()) && !Number.isNaN(subExpire.getTime())) {
      lastPlanText = `当前订阅：${plan} ｜ 剩余${daysLeft}天`;
    } else if (daysLeft !== null) {
      lastPlanText = `当前订阅：${plan} ｜ 剩余${daysLeft}天`;
    } else {
      lastPlanText = `当前订阅：${plan}`;
    }
    lastKeysText = keySummary ? `API Keys: ${keySummary}` : 'API Keys: -';
    lastAccountText = `账号: ${account}`;
    lastInviteCodeText = inviteCode ? `邀请码: ${inviteCode}` : '邀请码: -';
    lastInviteLink = inviteLink || '';
    lastAccountData = {
      loggedIn: true,
      totalBalance,
      subscriptionBalance: Number.isFinite(bal) ? bal : null,
      usageBalance: Number.isFinite(bonus) ? bonus : null,
      plan,
      daysLeft,
      account,
      inviteCode,
      inviteLink,
      apiKeys,
      updatedAt: new Date().toISOString()
    };
    if (announcement) {
      lastAnnouncement = announcement;
    }

    for (const group of MODEL_PRODUCTS) {
      if (hasModelPricingData(modelPricing[group.key])) {
        lastModelPricing[group.key] = modelPricing[group.key];
      }
      if (hasUsageData(usageStats[group.key])) {
        lastUsageStats[group.key] = usageStats[group.key];
      }
    }

    updateTrayMenu();
  } catch (err) {
    lastBalanceText = '网络异常';
    lastDetailText = String(err?.message || err);
    updateTrayMenu();
  } finally {
    isFetching = false;
    sendPanelState();
  }
}

function openLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.focus();
    return;
  }

  loginWin = new BrowserWindow({
    width: 1100,
    height: 760,
    title: '登录 AiCodeMirror',
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  loginWin.loadURL(LOGIN_URL);

  loginWin.webContents.on('did-fail-load', (_event, code, desc, url) => {
    if (code === -3 || url === 'about:srcdoc') {
      return;
    }
    lastBalanceText = '登录页加载失败';
    lastDetailText = `${code} ${desc}`;
    updateTrayMenu();
    loginWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      `<h3>页面加载失败</h3><p>URL: ${url}</p><p>错误: ${code} ${desc}</p><p>请检查网络或证书环境</p>`
    )}`);
  });

  loginWin.webContents.on('console-message', (_event, level, message) => {
    if (level <= 2) {
      console.log('[login-web]', message);
    }
  });

  const tryHandleLoginSuccess = async () => {
    const ok = await hasValidSession();
    if (!ok) return;
    lastAccountData = {
      ...lastAccountData,
      loggedIn: true
    };
    lastBalanceText = '登录成功';
    lastDetailText = '正在拉取余额...';
    updateTrayMenu();
    await fetchWalletBalance();
    if (Notification.isSupported()) {
      new Notification({
        title: 'AiCodeMirror 余额工具',
        body: '登录成功，已刷新余额'
      }).show();
    }
    if (loginWin && !loginWin.isDestroyed()) {
      loginWin.close();
    }
  };

  loginWin.webContents.on('did-navigate', async () => {
    await tryHandleLoginSuccess();
  });
  loginWin.webContents.on('did-stop-loading', async () => {
    await tryHandleLoginSuccess();
  });

  loginWin.on('closed', () => {
    loginWin = null;
    if (loginDetectTimer) {
      clearInterval(loginDetectTimer);
      loginDetectTimer = null;
    }
  });

  loginDetectTimer = setInterval(async () => {
    if (!loginWin || loginWin.isDestroyed()) return;
    await tryHandleLoginSuccess();
  }, 2000);
}

function clearAuth(updateMenu = true) {
  const ses = getSession();
  return ses.clearStorageData({
    storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers']
  }).then(() => {
    lastBalanceText = '已退出';
    lastDetailText = '-';
    lastPlanText = '-';
    lastKeysText = 'API Keys: -';
    lastAccountText = '账号: -';
    lastInviteCodeText = '邀请码: -';
    lastInviteLink = '';
    lastModelPricing = createEmptyModelPricing();
    lastUsageStats = createEmptyUsageStats();
    lastAccountData = createEmptyAccountData();
    if (updateMenu) updateTrayMenu();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const authActionMenuItem = lastAccountData.loggedIn
    ? {
        label: '清除登录态',
        click: async () => {
          await clearAuth();
          openLoginWindow();
        }
      }
    : {
        label: '登录账号',
        click: () => {
          openLoginWindow();
        }
      };

  tray.setToolTip(`AiCodeMirror ${lastBalanceText}`);
  if (process.platform === 'darwin') {
    tray.setTitle(getTrayTitleText());
  }

  const template = [
    {
      label: '显示面板',
      click: () => showPanel(tray.getBounds())
    },
    { type: 'separator' },
    {
      label: '立即刷新数据',
      click: () => fetchWalletBalance()
    },
    {
      label: `调整主题（${themeColorHex.toUpperCase()} / ${panelOpacityPercent}%）`,
      click: () => showOpacityWindow(tray.getBounds())
    }
  ];

  if (IS_MAC) {
    template.push({
      label: `菜单栏文字（当前${getTrayTitleModeLabel()}）`,
      submenu: TRAY_TITLE_MODES.map((mode) => ({
        label: mode.label,
        type: 'radio',
        checked: trayTitleMode === mode.key,
        click: () => {
          trayTitleMode = mode.key;
          persistSettings();
          updateTrayMenu();
        }
      }))
    });
  }

  template.push(
    {
      label: `设置刷新频率（当前${refreshSeconds}秒）`,
      submenu: REFRESH_OPTIONS.map((seconds) => ({
        label: `${seconds} 秒`,
        type: 'radio',
        checked: refreshSeconds === seconds,
        click: () => {
          refreshSeconds = seconds;
          restartRefreshTimer();
          persistSettings();
          updateTrayMenu();
        }
      }))
    },
    authActionMenuItem,
    { type: 'separator' },
    {
      label: '退出应用',
      click: () => app.quit()
    }
  );

  currentContextMenu = Menu.buildFromTemplate(template);

  if (process.platform !== 'darwin') {
    tray.setContextMenu(currentContextMenu);
  }
  sendPanelState();
  sendOpacityState();
}

function registerPanelIpc() {
  ipcMain.handle('panel:get-state', () => createPanelState());

  ipcMain.handle('panel:refresh', async () => {
    await fetchWalletBalance();
    return createPanelState();
  });

  ipcMain.handle('panel:open-dashboard', () => {
    shell.openExternal(DASHBOARD_URL);
    return true;
  });

  ipcMain.handle('panel:open-api-keys', () => {
    shell.openExternal(DASHBOARD_API_KEYS_URL);
    return true;
  });

  ipcMain.handle('panel:open-announcements', () => {
    shell.openExternal(DASHBOARD_ANNOUNCEMENTS_URL);
    return true;
  });

  ipcMain.handle('panel:copy-invite', () => copyInviteLink(true));

  ipcMain.handle('panel:login', () => {
    openLoginWindow();
    return true;
  });

  ipcMain.handle('panel:logout', async () => {
    hidePanel();
    await clearAuth();
    openLoginWindow();
    return true;
  });

  ipcMain.handle('panel:hide', () => {
    hidePanel();
    return true;
  });

  ipcMain.handle('opacity:get-state', () => createOpacityState());

  ipcMain.handle('opacity:hide', () => {
    hideOpacityWindow();
    return true;
  });

  ipcMain.on('opacity:set-percent', (_event, value) => {
    setPanelOpacityPercent(value);
  });

  ipcMain.on('panel:set-height', (_event, value) => {
    setPanelHeight(value, tray ? tray.getBounds() : null);
  });

  ipcMain.on('theme:set-color', (_event, value) => {
    setThemeColorHex(value);
  });
}

async function bootstrap() {
  if (IS_MAC && app.dock) {
    app.setActivationPolicy('accessory');
    app.dock.hide();
  }

  loadSettings();

  tray = new Tray(createTrayIcon());
  tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', (_event, bounds) => {
    if (shouldIgnoreTrayClick()) {
      return;
    }
    armTrayClickGuard();
    togglePanel(bounds);
  });
  tray.on('right-click', () => {
    showContextMenu();
  });
  updateTrayMenu();
  createPanelWindow();

  const loggedIn = await hasValidSession();
  if (loggedIn) {
    lastAccountData = {
      ...lastAccountData,
      loggedIn: true
    };
    lastBalanceText = '已登录';
    lastDetailText = '初始化拉取...';
    updateTrayMenu();
    await fetchWalletBalance();
  } else {
    lastBalanceText = '未登录';
    lastDetailText = '请先登录';
    updateTrayMenu();
    openLoginWindow();
  }

  restartRefreshTimer();
}

registerPanelIpc();

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // Tray app stays alive.
});

app.on('before-quit', () => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (loginDetectTimer) clearInterval(loginDetectTimer);
  if (settingsSaveTimer) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = null;
    persistSettings();
  }
  if (trayMenuRefreshTimer) {
    clearTimeout(trayMenuRefreshTimer);
    trayMenuRefreshTimer = null;
  }
});
