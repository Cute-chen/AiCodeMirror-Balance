let selectedUsageGroupKey = 'claude';
let selectedModelGroupKey = 'claude';
let currentState = null;
let toastTimer = null;

const detailText = document.getElementById('detail-text');
const totalBalance = document.getElementById('total-balance');
const announcementButton = document.getElementById('announcement-button');
const announcementTitle = document.getElementById('announcement-title');
const planName = document.getElementById('plan-name');
const daysLeft = document.getElementById('days-left');
const accountName = document.getElementById('account-name');
const updatedAt = document.getElementById('updated-at');
const inviteCode = document.getElementById('invite-code');
const subscriptionBalance = document.getElementById('subscription-balance');
const usageBalance = document.getElementById('usage-balance');
const usageGroupTabs = document.getElementById('usage-group-tabs');
const modelGroupTabs = document.getElementById('model-group-tabs');
const usageTitle = document.getElementById('usage-title');
const usageOverview = document.getElementById('usage-overview');
const usageGrid = document.getElementById('usage-grid');
const keyList = document.getElementById('key-list');
const modelList = document.getElementById('model-list');
const manageKeysButton = document.getElementById('manage-keys-button');
const dashboardButton = document.getElementById('dashboard-button');
const inviteButton = document.getElementById('invite-button');
const closeButton = document.getElementById('close-button');
const feedbackToast = document.getElementById('feedback-toast');

const previewState = {
  statusText: '预览模式',
  detailText: '',
  refreshSeconds: 60,
  isFetching: false,
  usageWindowHours: 48,
  themeColorHex: '#252b31',
  announcement: {
    title: '【发票变更取消通知 && 最新 7 折券活动上线】',
    url: 'https://www.aicodemirror.com/dashboard/announcements'
  },
  groups: [
    { key: 'claude', label: 'Claude' },
    { key: 'codex', label: 'Codex' },
    { key: 'gemini', label: 'Gemini' }
  ],
  accountData: {
    loggedIn: true,
    totalBalance: 483200,
    subscriptionBalance: 320000,
    usageBalance: 163200,
    plan: 'Pro Annual',
    daysLeft: 188,
    account: '188****2026',
    inviteCode: 'AICM88',
    inviteLink: 'https://www.aicodemirror.com/register?inviteCode=AICM88',
    apiKeys: [
      {
        name: '1',
        consumed: 195296,
        apiKey: 'sk-ant-api03-221T8--ufE-94SnZEvrcQJiEI4tnUVND_6t0To-2HUmQydzIGpev8EISBxq-drxgVJEfHcnbzp88vXF0-jllQw'
      },
      {
        name: 'ai排班',
        consumed: 9631,
        apiKey: 'sk-ant-api03-aCwzTFxRNcyvzpYkXj2g15ysTdzvFcpszLofyM-M2FzCLmLv3xQGZ8I1G1SfS_csMO1qLVsSvYB3HSj7Ps6nlA'
      },
      {
        name: 'prod-gateway',
        consumed: 56700,
        apiKey: 'sk-ant-api03-zXAMPLE-ProdGateway-Key-For-Preview-Only'
      }
    ],
    updatedAt: new Date().toISOString()
  },
  modelPricing: {
    claude: [
      { modelName: 'claude-opus-4-8' },
      { modelName: 'claude-sonnet-4-6' },
      { modelName: 'claude-3-7-sonnet' }
    ],
    codex: [
      { modelName: 'gpt-5.5' },
      { modelName: 'gpt-5.4' },
      { modelName: 'o4-mini' }
    ],
    gemini: [
      { modelName: 'gemini-3.5-flash' },
      { modelName: 'gemini-3.1-pro-preview' },
      { modelName: 'gemini-2.5-pro' }
    ]
  },
  usageStats: {
    claude: {
      consumed: 68200,
      recordCount: 11,
      inputTokens: 328222,
      outputTokens: 18220,
      cacheCreationTokens: 8520,
      cacheReadTokens: 268000,
      series: [3200, 4200, 5100, 4600, 6200, 5900, 7100, 8600, 7500, 9400, 10300, 12000]
    },
    codex: {
      consumed: 148500,
      recordCount: 58,
      inputTokens: 1039640,
      outputTokens: 54786,
      cacheCreationTokens: 0,
      cacheReadTokens: 1921024,
      series: [18800, 17200, 15600, 14900, 14100, 12600, 11800, 10900, 10400, 9800, 9100, 8300]
    },
    gemini: {
      consumed: 36400,
      recordCount: 9,
      inputTokens: 264330,
      outputTokens: 10980,
      cacheCreationTokens: 0,
      cacheReadTokens: 98640,
      series: [2500, 2700, 2900, 3000, 3100, 3050, 3200, 3150, 3300, 3250, 3400, 3350]
    }
  }
};

function decodeStateFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('state');
    if (!encoded) return null;
    const normalized = encoded
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = window.atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder('utf-8').decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const initialQueryState = decodeStateFromQuery();

function createFallbackPanelApi() {
  return {
    getState: async () => ({
      ...(initialQueryState || previewState)
    }),
    openDashboard: async () => {},
    openApiKeys: async () => {},
    openAnnouncements: async () => {},
    copyInvite: async () => {},
    hide: async () => {},
    onState: () => () => {}
  };
}

function createRendererPanelApi() {
  try {
    const electron = typeof require === 'function' ? require('electron') : null;
    const ipcRenderer = electron?.ipcRenderer;
    if (!ipcRenderer) return null;
    return {
      getState: () => ipcRenderer.invoke('panel:get-state'),
      openDashboard: () => ipcRenderer.invoke('panel:open-dashboard'),
      openApiKeys: () => ipcRenderer.invoke('panel:open-api-keys'),
      openAnnouncements: () => ipcRenderer.invoke('panel:open-announcements'),
      copyInvite: () => ipcRenderer.invoke('panel:copy-invite'),
      hide: () => ipcRenderer.invoke('panel:hide'),
      onState: (callback) => {
        const handler = (_event, state) => callback(state);
        ipcRenderer.on('panel:state', handler);
        return () => {
          ipcRenderer.removeListener('panel:state', handler);
        };
      }
    };
  } catch {
    return null;
  }
}

const panelApi = window.panelApi || createRendererPanelApi() || createFallbackPanelApi();

function formatCredits(value) {
  return Number.isFinite(value) ? `¥${(value / 1000).toFixed(2)}` : '-';
}

function formatInteger(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat('zh-CN').format(value) : '-';
}

function formatTime(isoString) {
  if (!isoString) return '尚未同步';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '尚未同步';
  return `更新于 ${date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })}`;
}

function formatDaysLeft(value) {
  return Number.isFinite(value) ? `${value}天` : '-';
}

function getUsageWindowHours(state) {
  const hours = Number(state?.usageWindowHours);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours) : 48;
}

function getPanelOpacityPercent(state) {
  const percent = Number(state?.panelOpacityPercent);
  return Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : 90;
}

function normalizeThemeColorHex(value) {
  if (typeof value !== 'string') return '#252b31';
  const matched = value.trim().match(/^#?([0-9a-fA-F]{6})$/);
  return matched ? `#${matched[1].toLowerCase()}` : '#252b31';
}

function hexToRgb(hex) {
  const normalized = normalizeThemeColorHex(hex).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function mixRgb(base, target, amount) {
  const ratio = Math.min(1, Math.max(0, amount));
  return {
    r: Math.round(base.r + (target.r - base.r) * ratio),
    g: Math.round(base.g + (target.g - base.g) * ratio),
    b: Math.round(base.b + (target.b - base.b) * ratio)
  };
}

function rgbToTriplet(rgb) {
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function applyThemeColor(state) {
  const root = document.documentElement;
  const accent = hexToRgb(state?.themeColorHex);
  const accentStrong = mixRgb(accent, { r: 18, g: 28, b: 38 }, 0.26);
  const accentLight = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.28);
  const text = mixRgb(accent, { r: 17, g: 32, b: 50 }, 0.76);
  const textSoft = mixRgb(text, { r: 255, g: 255, b: 255 }, 0.28);
  const textFaint = mixRgb(text, { r: 255, g: 255, b: 255 }, 0.46);
  const panel = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.86);
  const panelStrong = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.92);
  const panelTop = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.82);
  const panelBottom = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.88);
  const panelGlow = mixRgb(accent, { r: 255, g: 255, b: 255 }, 0.62);

  root.style.setProperty('--accent-rgb', rgbToTriplet(accent));
  root.style.setProperty('--accent-strong-rgb', rgbToTriplet(accentStrong));
  root.style.setProperty('--accent-light-rgb', rgbToTriplet(accentLight));
  root.style.setProperty('--panel-rgb', rgbToTriplet(panel));
  root.style.setProperty('--panel-strong-rgb', rgbToTriplet(panelStrong));
  root.style.setProperty('--panel-top-rgb', rgbToTriplet(panelTop));
  root.style.setProperty('--panel-bottom-rgb', rgbToTriplet(panelBottom));
  root.style.setProperty('--panel-glow-rgb', rgbToTriplet(panelGlow));
  root.style.setProperty('--text-rgb', rgbToTriplet(text));
  root.style.setProperty('--text-soft-rgb', rgbToTriplet(textSoft));
  root.style.setProperty('--text-faint-rgb', rgbToTriplet(textFaint));
}

function applyPanelOpacity(state) {
  const percent = getPanelOpacityPercent(state);
  document.documentElement.style.setProperty('--panel-opacity', String(percent / 100));
}

function createEmptyMessage(text) {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.textContent = text;
  return div;
}

function getAnnouncement(state) {
  const title = String(state?.announcement?.title || '').trim();
  const url = String(state?.announcement?.url || '').trim();
  return {
    title,
    url
  };
}

function showToast(message, duration = 1600) {
  if (!feedbackToast || !message) return;
  feedbackToast.textContent = message;
  feedbackToast.hidden = false;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    feedbackToast.hidden = true;
  }, duration);
}

function getBusyState(button) {
  return button?.dataset?.busy === '1';
}

function setBusyState(button, busy) {
  if (!button) return;
  button.dataset.busy = busy ? '1' : '0';
}

async function writeClipboardText(text) {
  if (!text) return false;

  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to Electron clipboard.
  }

  try {
    const electron = typeof require === 'function' ? require('electron') : null;
    const clipboard = electron?.clipboard;
    if (!clipboard) return false;
    clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function getGroupLabel(state, key) {
  const stateGroups = Array.isArray(state?.groups) ? state.groups : [];
  const matched = stateGroups.find((group) => group.key === key);
  return matched?.label || '模型';
}

function ensureSelectedGroups(state) {
  const stateGroups = Array.isArray(state?.groups) ? state.groups : [];
  if (!stateGroups.length) {
    selectedUsageGroupKey = 'claude';
    selectedModelGroupKey = 'claude';
    return;
  }

  const firstKey = stateGroups[0].key;
  if (!stateGroups.some((group) => group.key === selectedUsageGroupKey)) {
    selectedUsageGroupKey = firstKey;
  }
  if (!stateGroups.some((group) => group.key === selectedModelGroupKey)) {
    selectedModelGroupKey = firstKey;
  }
}

function renderGroupTabs(root, state, activeKey, onSelect) {
  root.innerHTML = '';
  const stateGroups = Array.isArray(state?.groups) ? state.groups : [];
  for (const group of stateGroups) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tab-button${group.key === activeKey ? ' active' : ''}`;
    button.textContent = group.label;
    button.addEventListener('click', () => onSelect(group.key));
    root.appendChild(button);
  }
}

function createSvgNode(name) {
  return document.createElementNS('http://www.w3.org/2000/svg', name);
}

function createLineChart(series) {
  const values = Array.isArray(series) && series.length ? series.slice(-12) : [0, 0];
  const chartWidth = 320;
  const chartHeight = 92;
  const paddingX = 10;
  const paddingY = 10;
  const maxValue = Math.max(...values, 0);
  const minValue = Math.min(...values, 0);
  const range = Math.max(maxValue - minValue, 1);
  const innerWidth = chartWidth - paddingX * 2;
  const innerHeight = chartHeight - paddingY * 2;

  const svg = createSvgNode('svg');
  svg.setAttribute('class', 'usage-chart-svg');
  svg.setAttribute('viewBox', `0 0 ${chartWidth} ${chartHeight}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const defs = createSvgNode('defs');
  const gradient = createSvgNode('linearGradient');
  gradient.setAttribute('id', 'usage-fill');
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('y1', '0');
  gradient.setAttribute('x2', '0');
  gradient.setAttribute('y2', '1');

  const styles = getComputedStyle(document.documentElement);
  const accentRgb = (styles.getPropertyValue('--accent-rgb') || '82, 159, 218').trim();

  const stopTop = createSvgNode('stop');
  stopTop.setAttribute('offset', '0%');
  stopTop.setAttribute('stop-color', `rgba(${accentRgb}, 0.30)`);

  const stopBottom = createSvgNode('stop');
  stopBottom.setAttribute('offset', '100%');
  stopBottom.setAttribute('stop-color', `rgba(${accentRgb}, 0.02)`);

  gradient.append(stopTop, stopBottom);
  defs.appendChild(gradient);
  svg.appendChild(defs);

  for (let index = 0; index < 3; index += 1) {
    const line = createSvgNode('line');
    const y = paddingY + (innerHeight / 2) * index;
    line.setAttribute('x1', String(paddingX));
    line.setAttribute('x2', String(chartWidth - paddingX));
    line.setAttribute('y1', String(y));
    line.setAttribute('y2', String(y));
    line.setAttribute('class', 'usage-chart-grid');
    svg.appendChild(line);
  }

  const points = values.map((value, index) => {
    const x = paddingX + (values.length === 1 ? innerWidth / 2 : (innerWidth / (values.length - 1)) * index);
    const y = paddingY + innerHeight - (((value - minValue) / range) * innerHeight);
    return { x, y };
  });

  const pointString = points.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPath = [
    `M ${points[0].x} ${chartHeight - paddingY}`,
    ...points.map((point) => `L ${point.x} ${point.y}`),
    `L ${points[points.length - 1].x} ${chartHeight - paddingY}`,
    'Z'
  ].join(' ');

  const area = createSvgNode('path');
  area.setAttribute('d', areaPath);
  area.setAttribute('class', 'usage-chart-area');

  const polyline = createSvgNode('polyline');
  polyline.setAttribute('points', pointString);
  polyline.setAttribute('class', 'usage-chart-line');

  const lastPoint = points[points.length - 1];
  const marker = createSvgNode('circle');
  marker.setAttribute('cx', String(lastPoint.x));
  marker.setAttribute('cy', String(lastPoint.y));
  marker.setAttribute('r', '3.5');
  marker.setAttribute('class', 'usage-chart-dot');

  svg.append(area, polyline, marker);
  return svg;
}

async function handleModelCopy(modelId) {
  const ok = await writeClipboardText(modelId);
  showToast(ok ? `已复制模型名称: ${modelId}` : '复制失败');
}

async function handleApiKeyCopy(apiKey, name) {
  if (!apiKey) {
    showToast('没有可复制的 API Key');
    return;
  }
  const ok = await writeClipboardText(apiKey);
  showToast(ok ? `已复制 API Key: ${name}` : '复制失败');
}

function renderUsageOverview(state) {
  usageOverview.innerHTML = '';
  const usage = state?.usageStats?.[selectedUsageGroupKey] || {};

  const summary = document.createElement('div');
  summary.className = 'usage-summary';

  const top = document.createElement('div');
  top.className = 'usage-summary-top';

  const main = document.createElement('div');

  const kicker = document.createElement('span');
  kicker.className = 'usage-kicker';
  kicker.textContent = `${getGroupLabel(state, selectedUsageGroupKey)} 总用量`;

  const amount = document.createElement('strong');
  amount.className = 'usage-amount';
  amount.textContent = formatCredits(usage?.consumed);

  main.append(kicker, amount);

  const records = document.createElement('span');
  records.className = 'record-pill';
  records.textContent = `${formatInteger(usage?.recordCount)} 条记录`;

  top.append(main, records);
  summary.append(top, createLineChart(usage?.series));
  usageOverview.appendChild(summary);
}

function renderUsage(state) {
  usageGrid.innerHTML = '';
  const usage = state?.usageStats?.[selectedUsageGroupKey] || {};
  const entries = [
    ['输入 Token', formatInteger(usage?.inputTokens)],
    ['输出 Token', formatInteger(usage?.outputTokens)],
    ['Cache 写入', formatInteger(usage?.cacheCreationTokens)],
    ['Cache 读取', formatInteger(usage?.cacheReadTokens)]
  ];

  for (const [label, value] of entries) {
    const card = document.createElement('div');
    card.className = 'usage-item';

    const title = document.createElement('span');
    title.className = 'usage-label';
    title.textContent = label;

    const body = document.createElement('strong');
    body.className = 'usage-value';
    body.textContent = value;

    card.append(title, body);
    usageGrid.appendChild(card);
  }
}

function renderKeys(accountData) {
  keyList.innerHTML = '';

  const rows = Array.isArray(accountData?.apiKeys) ? accountData.apiKeys : [];
  if (!rows.length) {
    keyList.appendChild(createEmptyMessage('暂无 API Key 数据'));
    return;
  }

  const normalizedRows = rows
    .map((row) => ({
      name: row?.name || '(未命名)',
      consumed: Number.isFinite(Number(row?.consumed)) ? Number(row.consumed) : 0,
      apiKey: typeof row?.apiKey === 'string' ? row.apiKey : ''
    }))
    .sort((left, right) => right.consumed - left.consumed);

  const totalConsumed = normalizedRows.reduce((sum, row) => sum + row.consumed, 0);
  const maxConsumed = Math.max(...normalizedRows.map((row) => row.consumed), 0);

  for (const row of normalizedRows) {
    const item = document.createElement('div');
    item.className = 'key-item';

    const top = document.createElement('div');
    top.className = 'key-row';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'mini-button';
    copy.textContent = '复制Key';
    copy.disabled = !row.apiKey;
    copy.addEventListener('click', () => {
      void handleApiKeyCopy(row.apiKey, row.name);
    });

    const name = document.createElement('span');
    name.className = 'key-name';
    name.textContent = row.name;

    top.append(name, copy);

    const track = document.createElement('div');
    track.className = 'key-track';

    const bar = document.createElement('div');
    bar.className = 'key-bar';
    bar.style.width = `${maxConsumed > 0 ? Math.max(8, Math.round((row.consumed / maxConsumed) * 100)) : 8}%`;
    track.appendChild(bar);

    const share = document.createElement('span');
    share.className = 'key-share';
    share.textContent = totalConsumed > 0
      ? `占全部 Key 用量 ${((row.consumed / totalConsumed) * 100).toFixed(1)}%`
      : '暂无消耗';

    const footer = document.createElement('div');
    footer.className = 'key-footer';

    const value = document.createElement('strong');
    value.className = 'key-value';
    value.textContent = formatCredits(row.consumed);

    footer.append(share, value);
    item.append(top, track, footer);
    keyList.appendChild(item);
  }
}

function renderModels(state) {
  modelList.innerHTML = '';

  const rows = state?.modelPricing?.[selectedModelGroupKey];
  if (!Array.isArray(rows) || !rows.length) {
    modelList.appendChild(createEmptyMessage('暂无模型数据'));
    return;
  }

  for (const model of rows) {
    const modelId = model?.modelName || '';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'model-row';
    row.title = modelId ? `点击复制 ${modelId}` : '点击复制模型名称';

    const title = document.createElement('span');
    title.className = 'model-title';
    title.textContent = modelId || '(未命名模型)';

    const copyMark = document.createElement('span');
    copyMark.className = 'model-copy';
    copyMark.setAttribute('aria-hidden', 'true');

    row.addEventListener('click', () => {
      void handleModelCopy(modelId);
    });

    row.append(title, copyMark);
    modelList.appendChild(row);
  }
}

function render(state) {
  if (!state || typeof state !== 'object') return;

  currentState = state;
  ensureSelectedGroups(state);
  applyThemeColor(state);
  applyPanelOpacity(state);

  renderGroupTabs(usageGroupTabs, state, selectedUsageGroupKey, (key) => {
    selectedUsageGroupKey = key;
    render(currentState);
  });

  renderGroupTabs(modelGroupTabs, state, selectedModelGroupKey, (key) => {
    selectedModelGroupKey = key;
    render(currentState);
  });

  const accountData = state?.accountData || {};
  const display = state?.display || {};
  const announcement = getAnnouncement(state);
  const subtitle = '';
  const usageHours = getUsageWindowHours(state);

  document.body.classList.toggle('is-loading', !!state?.isFetching);

  detailText.textContent = subtitle;
  detailText.hidden = !subtitle;
  totalBalance.textContent = display.totalBalance || formatCredits(accountData.totalBalance);
  announcementTitle.textContent = announcement.title || '-';
  announcementButton.hidden = !announcement.title;
  announcementButton.disabled = !announcement.url || getBusyState(announcementButton);
  planName.textContent = accountData.plan || '-';
  daysLeft.textContent = formatDaysLeft(accountData.daysLeft);
  accountName.textContent = accountData.account || '-';
  updatedAt.textContent = formatTime(accountData.updatedAt);
  inviteCode.textContent = accountData.inviteCode || '-';
  subscriptionBalance.textContent = display.subscriptionBalance || formatCredits(accountData.subscriptionBalance);
  usageBalance.textContent = display.usageBalance || formatCredits(accountData.usageBalance);
  usageTitle.textContent = `近${usageHours}h用量`;

  dashboardButton.disabled = getBusyState(dashboardButton);
  manageKeysButton.disabled = getBusyState(manageKeysButton);
  inviteButton.disabled = !accountData.inviteLink || getBusyState(inviteButton);

  renderUsageOverview(state);
  renderUsage(state);
  renderKeys(accountData);
  renderModels(state);
}

announcementButton.addEventListener('click', async () => {
  setBusyState(announcementButton, true);
  showToast('正在打开公告页...');
  try {
    await panelApi.openAnnouncements();
    showToast('已打开公告页');
  } catch {
    showToast('打开公告页失败');
  } finally {
    setBusyState(announcementButton, false);
    render(currentState || initialQueryState || previewState);
  }
});

dashboardButton.addEventListener('click', async () => {
  setBusyState(dashboardButton, true);
  showToast('正在打开钱包页...');
  try {
    await panelApi.openDashboard();
    showToast('已打开钱包页');
  } catch {
    showToast('打开钱包页失败');
  } finally {
    setBusyState(dashboardButton, false);
    render(currentState || initialQueryState || previewState);
  }
});

manageKeysButton.addEventListener('click', async () => {
  setBusyState(manageKeysButton, true);
  showToast('正在打开 Key 管理页...');
  try {
    await panelApi.openApiKeys();
    showToast('已打开 Key 管理页');
  } catch {
    showToast('打开 Key 管理页失败');
  } finally {
    setBusyState(manageKeysButton, false);
    render(currentState || initialQueryState || previewState);
  }
});

inviteButton.addEventListener('click', async () => {
  setBusyState(inviteButton, true);
  showToast('正在复制邀请链接...');
  try {
    const ok = await panelApi.copyInvite();
    showToast(ok ? '邀请链接已复制' : '暂无邀请链接');
  } catch {
    showToast('复制邀请链接失败');
  } finally {
    setBusyState(inviteButton, false);
    render(currentState || initialQueryState || previewState);
  }
});

closeButton.addEventListener('click', async () => {
  await panelApi.hide();
});

if (initialQueryState) {
  render(initialQueryState);
}

panelApi.onState((state) => {
  render(state);
});

panelApi.getState()
  .then((state) => {
    render(state);
  })
  .catch(() => {
    if (!currentState) {
      render(initialQueryState || previewState);
    }
  });
