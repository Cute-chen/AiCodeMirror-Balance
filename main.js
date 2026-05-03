// Author: Cute-chen
// Project: AiCodeMirror Balance Tray (Electron)
const { app, BrowserWindow, Tray, Menu, session, nativeImage, shell, Notification, clipboard } = require('electron');
const path = require('path');

// Some environments (VM/remote desktop/sandbox) cannot launch Electron GPU process.
// Force software rendering to avoid startup crash.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

const BASE_URL = 'https://www.aicodemirror.com';
const API_WALLET = `${BASE_URL}/api/wallet`;
const API_SESSION = `${BASE_URL}/api/auth/session`;
const API_APIKEYS = `${BASE_URL}/api/apikeys?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc`;
const API_PROFILE = `${BASE_URL}/api/user/profile`;
const API_INVITE_INFO = `${BASE_URL}/api/user/invite/info`;
const API_DASHBOARD_RSC_CANDIDATES = [
  `${BASE_URL}/dashboard?_rsc=1vufg`,
  `${BASE_URL}/dashboard?_rsc=8aq9o`,
  `${BASE_URL}/dashboard`
];
const LOGIN_URL = `${BASE_URL}/login`;
const DASHBOARD_URL = `${BASE_URL}/dashboard/wallet`;
const PARTITION = 'persist:aicm';
const ICON_PATH = path.join(__dirname, 'tray.ico');
const ICON_TEMPLATE_PATH = path.join(__dirname, 'trayTemplate.png');

let tray = null;
let loginWin = null;
let refreshTimer = null;
let lastBalanceText = '未登录';
let lastDetailText = '-';
let lastPlanText = '-';
let lastKeysText = 'API Keys: -';
let lastAccountText = '账号: -';
let lastInviteCodeText = '邀请码: -';
let lastInviteLink = '';
let isFetching = false;
let loginDetectTimer = null;
let exitConfirmUntil = 0;
let refreshSeconds = 60;
const REFRESH_OPTIONS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

function createEmptyIcon() {
  // 透明 16x16，避免依赖外部图标文件
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAE0lEQVR42mP8z8AARMAgGg0AAHkUAf6W2CYAAAAASUVORK5CYII=';
  return nativeImage.createFromDataURL(`data:image/png;base64,${pngBase64}`);
}

function createTrayIcon() {
  let icon;
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromPath(ICON_TEMPLATE_PATH);
    if (!icon.isEmpty()) {
      icon.setTemplateImage(true);
      // 18x18 is typical menubar icon size on macOS.
      icon = icon.resize({ width: 18, height: 18, quality: 'best' });
    }
  } else {
    icon = nativeImage.createFromPath(ICON_PATH);
    if (!icon.isEmpty()) {
      // Force small tray-friendly size to avoid Windows scaling issues.
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

function getSession() {
  return session.fromPartition(PARTITION);
}

async function hasAuthCookie() {
  const ses = getSession();
  const cookies = await ses.cookies.get({ url: BASE_URL });
  return cookies.some((c) => {
    const n = (c.name || '').toLowerCase();
    return n.includes('session') || n.includes('authjs') || n.includes('token');
  });
}

async function hasValidSession() {
  const ses = getSession();
  try {
    const res = await ses.fetch(API_SESSION, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
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

async function fetchSubscriptionWindow(commonHeaders) {
  const ses = getSession();
  for (const url of API_DASHBOARD_RSC_CANDIDATES) {
    try {
      const res = await ses.fetch(url, {
        method: 'GET',
        headers: {
          ...commonHeaders,
          'Accept': 'text/x-component, text/html, */*',
          'rsc': '1'
        }
      });
      if (!res.ok) continue;
      const text = await res.text();

      // RSC often uses "$D2026-05-17T05:20:59.947Z"
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
    } catch (_) {
      // try next candidate
    }
  }
  return { start: null, expire: null };
}

async function fetchWalletBalance() {
  if (isFetching) return;
  isFetching = true;

  try {
    const ses = getSession();
    const hasCookie = await hasAuthCookie();
    if (!hasCookie) {
      lastBalanceText = '未登录';
      lastDetailText = '无可用会话';
      updateTrayMenu();
      return;
    }

    const commonHeaders = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const [walletRes, sessionRes, keysRes, profileRes, inviteRes, subWindow] = await Promise.all([
      ses.fetch(API_WALLET, { method: 'GET', headers: commonHeaders }),
      ses.fetch(API_SESSION, { method: 'GET', headers: commonHeaders }),
      ses.fetch(API_APIKEYS, { method: 'GET', headers: commonHeaders }),
      ses.fetch(API_PROFILE, { method: 'GET', headers: commonHeaders }),
      ses.fetch(API_INVITE_INFO, { method: 'GET', headers: commonHeaders }),
      fetchSubscriptionWindow(commonHeaders)
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
    const sessionData = sessionRes.ok ? await sessionRes.json() : null;
    const keysData = keysRes.ok ? await keysRes.json() : null;
    const profileData = profileRes.ok ? await profileRes.json() : null;
    const inviteData = inviteRes.ok ? await inviteRes.json() : null;
    const balRaw = walletData?.data?.balance;
    const bonusRaw = walletData?.data?.bonusBalance;

    const bal = Number(balRaw);
    const bonus = Number(bonusRaw);

    const balCny = Number.isFinite(bal) ? (bal / 1000).toFixed(2) : '-';
    const bonusCny = Number.isFinite(bonus) ? (bonus / 1000).toFixed(2) : '-';
    const totalCny = (Number.isFinite(bal) ? bal : 0) + (Number.isFinite(bonus) ? bonus : 0);
    const totalCnyText = (totalCny / 1000).toFixed(2);

    const plan = sessionData?.user?.plan || '-';
    // Prefer exact subscription window from dashboard payload.
    const subStart = subWindow?.start || null;
    const subExpire = subWindow?.expire || null;
    const daysLeft = subExpire && !Number.isNaN(subExpire.getTime())
      ? Math.max(0, Math.ceil((subExpire.getTime() - Date.now()) / (24 * 3600 * 1000)))
      : null;

    const keyRows = Array.isArray(keysData?.data) ? keysData.data : [];
    const keySummary = keyRows
      .map((k) => {
        const name = k?.name || '(未命名)';
        const total = Number(k?.totalConsumed || 0);
        const cny = Number.isFinite(total) ? (total / 1000).toFixed(2) : '0.00';
        return `${name}:¥${cny}`;
      })
      .join(' | ');

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
    const account = sessionData?.user?.phone || profileData?.user?.phone || profileData?.user?.email || '-';
    lastAccountText = `账号: ${account}`;

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
    lastInviteCodeText = inviteCode ? `邀请码: ${inviteCode}` : '邀请码: -';
    lastInviteLink = inviteLink || '';
    updateTrayMenu();
  } catch (err) {
    lastBalanceText = '网络异常';
    lastDetailText = String(err?.message || err);
    updateTrayMenu();
  } finally {
    isFetching = false;
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
    // Cloudflare / SPA jumps often trigger ERR_ABORTED(-3) on about:srcdoc.
    // This is usually an intermediate navigation, not a real failure.
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

  loginWin.webContents.on('console-message', (_e, level, message) => {
    if (level <= 2) {
      console.log('[login-web]', message);
    }
  });

  const tryHandleLoginSuccess = async () => {
    const ok = await hasValidSession();
    if (!ok) return;
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

  // 兜底轮询，避免某些页面跳转事件不触发
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
    if (updateMenu) updateTrayMenu();
  });
}

function updateTrayMenu() {
  if (!tray) return;

  tray.setToolTip(`AiCodeMirror ${lastBalanceText}`);

  const menu = Menu.buildFromTemplate([
    { label: `状态: ${lastBalanceText}`, click: () => {} },
    { label: `详情: ${lastDetailText}`, click: () => {} },
    { label: `${lastPlanText}`, click: () => {} },
    { label: `${lastAccountText}`, click: () => {} },
    { label: `${lastInviteCodeText}`, click: () => {} },
    { label: `${lastKeysText}`, click: () => {} },
    { type: 'separator' },
    {
      label: '复制邀请链接',
      enabled: !!lastInviteLink,
      click: () => {
        if (!lastInviteLink) return;
        clipboard.writeText(lastInviteLink);
        if (Notification.isSupported()) {
          new Notification({
            title: 'AiCodeMirror 余额工具',
            body: '邀请链接已复制'
          }).show();
        }
      }
    },
    {
      label: '打开钱包页',
      click: () => shell.openExternal(DASHBOARD_URL)
    },
    {
      label: '立即刷新余额',
      click: () => fetchWalletBalance()
    },
    {
      label: `设置刷新频率（当前${refreshSeconds}秒）`,
      submenu: REFRESH_OPTIONS.map((sec) => ({
        label: `${sec} 秒`,
        type: 'radio',
        checked: refreshSeconds === sec,
        click: () => {
          refreshSeconds = sec;
          restartRefreshTimer();
          updateTrayMenu();
        }
      }))
    },
    {
      label: '清除登录态',
      click: async () => {
        await clearAuth();
        openLoginWindow();
      }
    },
    { type: 'separator' },
    {
      label: Date.now() < exitConfirmUntil ? '确认退出（再次点击）' : '退出（需二次确认）',
      click: () => {
        const now = Date.now();
        if (now < exitConfirmUntil) {
          app.quit();
          return;
        }
        exitConfirmUntil = now + 10_000;
        if (Notification.isSupported()) {
          new Notification({
            title: 'AiCodeMirror 余额工具',
            body: '请在10秒内再次点击“退出”以确认'
          }).show();
        }
        updateTrayMenu();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

async function bootstrap() {
  tray = new Tray(createTrayIcon());
  updateTrayMenu();

  const loggedIn = await hasValidSession();
  if (loggedIn) {
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

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  // 托盘应用不自动退出
});

app.on('before-quit', () => {
  if (refreshTimer) clearInterval(refreshTimer);
});
