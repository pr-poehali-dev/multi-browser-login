const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Хранилище активных браузеров
const browsers = new Map(); // id → { browser, page, status, url, proxy, account, scenarioName, currentStep, totalSteps, cpu, mem }
let nextId = 1;
const logs = [];
let logIdCounter = 1;

// Коллбек для отправки событий в Electron main process
let emitStatus = null;
let emitLog = null;

function init(onStatus, onLog) {
  emitStatus = onStatus;
  emitLog = onLog;
}

// Резолвим путь к Chrome — .app бандл → бинарник внутри
function resolveChromePath(inputPath) {
  if (!inputPath) return null;
  let p = inputPath;
  if (p.startsWith('~')) {
    p = path.join(os.homedir(), p.slice(1));
  }
  if (os.platform() === 'darwin' && p.endsWith('.app')) {
    const binary = path.join(p, 'Contents', 'MacOS');
    if (fs.existsSync(binary)) {
      const files = fs.readdirSync(binary);
      if (files.length > 0) {
        const resolved = path.join(binary, files[0]);
        if (fs.existsSync(resolved)) return resolved;
      }
    }
  }
  if (fs.existsSync(p)) return p;
  return null;
}

// Путь к Chromium по умолчанию
function getDefaultChromiumPath() {
  const platform = os.platform();
  if (platform === 'darwin') {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  if (platform === 'linux') {
    const paths = [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  if (platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function addLog(browserId, level, message) {
  const entry = {
    id: logIdCounter++,
    time: new Date().toLocaleTimeString('ru-RU'),
    level,
    browser: `#${browserId}`,
    message,
  };
  logs.push(entry);
  if (logs.length > 1000) logs.splice(0, logs.length - 1000);
  if (emitLog) emitLog(entry);
}

function updateStatus(id, patch) {
  const session = browsers.get(id);
  if (!session) return;
  Object.assign(session, patch);
  if (emitStatus) {
    emitStatus({
      id,
      status: session.status,
      currentStep: session.currentStep,
      totalSteps: session.totalSteps,
    });
  }
}

// Выполнить один шаг сценария
async function executeStep(id, page, step, vars = {}) {
  const p = step.params || {};
  const resolve = (val) => {
    if (!val) return val;
    return val.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || '');
  };

  addLog(id, 'info', `Шаг: ${step.label}`);

  switch (step.type) {
    case 'navigate': {
      const url = resolve(p.url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      addLog(id, 'info', `Открыт: ${url}`);
      break;
    }

    case 'click': {
      const selector = resolve(p.selector);
      const timeout = parseInt(p.timeout) || 5000;
      await page.waitForSelector(selector, { timeout });
      await page.click(selector);
      addLog(id, 'info', `Клик: ${selector}`);
      break;
    }

    case 'type': {
      const selector = resolve(p.selector);
      const value = resolve(p.value);
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.click(selector, { clickCount: 3 });
      await page.type(selector, value, { delay: 50 });
      addLog(id, 'info', `Ввод в ${selector}: ${value}`);
      break;
    }

    case 'wait': {
      const ms = parseInt(p.ms) || 1000;
      await new Promise((r) => setTimeout(r, ms));
      addLog(id, 'info', `Пауза: ${ms}мс`);
      break;
    }

    case 'condition': {
      const selector = resolve(p.selector);
      const action = p.action || 'stop';
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        addLog(id, 'warn', `Условие сработало (${selector}), действие: ${action}`);
        if (action === 'stop') return 'stop';
        if (action === 'retry') return 'retry';
        if (action === 'skip') return 'skip';
      } catch {
        addLog(id, 'info', `Условие не сработало (${selector})`);
      }
      break;
    }

    case 'extract': {
      const selector = resolve(p.selector);
      const attr = p.attr || 'text';
      const varName = p.varName || 'result';
      await page.waitForSelector(selector, { timeout: 5000 });
      const value = await page.evaluate(
        (sel, attribute) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return attribute === 'text' ? el.textContent?.trim() : el.getAttribute(attribute);
        },
        selector,
        attr
      );
      vars[varName] = value || '';
      addLog(id, 'info', `Извлечено ${varName} = ${value}`);
      break;
    }

    case 'scroll': {
      const direction = p.direction || 'down';
      if (direction === 'to-element' && p.selector) {
        const selector = resolve(p.selector);
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.evaluate((sel) => {
          document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' });
        }, selector);
      } else {
        await page.evaluate((dir) => {
          window.scrollBy(0, dir === 'up' ? -window.innerHeight : window.innerHeight);
        }, direction);
      }
      addLog(id, 'info', `Прокрутка: ${direction}`);
      break;
    }

    case 'screenshot': {
      const name = resolve(p.name) || `screenshot_${Date.now()}.png`;
      const dir = path.join(os.homedir(), 'MBABrowser', 'screenshots');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, name);
      await page.screenshot({ path: filePath, fullPage: false });
      addLog(id, 'info', `Скриншот: ${filePath}`);
      break;
    }

    default:
      addLog(id, 'warn', `Неизвестный шаг: ${step.type}`);
  }

  return 'ok';
}

// Запустить браузер
async function launchBrowser(opts = {}) {
  const { url, proxy, account, scenarioName, steps = [], settings = {} } = opts;

  const executablePath = resolveChromePath(settings.chromiumPath) || getDefaultChromiumPath();
  if (!executablePath) {
    throw new Error('Chrome/Chromium не найден. Укажи путь в Настройках → Путь к Chromium');
  }

  const id = nextId++;
  let rawProfilesDir = settings.profilesDir || path.join(os.homedir(), 'MBABrowser', 'profiles');
  if (rawProfilesDir.startsWith('~')) {
    rawProfilesDir = path.join(os.homedir(), rawProfilesDir.slice(1));
  }
  const userDataDir = path.join(rawProfilesDir, `session_${id}`);
  fs.mkdirSync(userDataDir, { recursive: true });

  const launchArgs = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${userDataDir}`,
  ];

  if (proxy) launchArgs.push(`--proxy-server=${proxy}`);
  if (settings.disableImages) {
    launchArgs.push('--blink-settings=imagesEnabled=false');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: settings.headless ? 'new' : false,
    args: launchArgs,
    defaultViewport: null,
  });

  const page = (await browser.pages())[0] || (await browser.newPage());

  const session = {
    id,
    browser,
    page,
    status: 'running',
    url: url || 'about:blank',
    proxy: proxy || null,
    account: account || null,
    scenarioName: scenarioName || null,
    currentStep: 0,
    totalSteps: steps.length,
    cpu: 0,
    mem: 0,
    paused: false,
  };
  browsers.set(id, session);

  addLog(id, 'info', `Браузер #${id} запущен → ${url}`);
  updateStatus(id, { status: 'running' });

  // Выполнить шаги асинхронно если есть
  if (steps.length > 0 && url) {
    runSteps(id, page, steps, settings).catch((err) => {
      addLog(id, 'error', `Ошибка выполнения: ${err.message}`);
      updateStatus(id, { status: 'error' });
    });
  } else if (url) {
    page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((err) => {
      addLog(id, 'error', `Навигация не удалась: ${err.message}`);
    });
  }

  return { id, url, proxy: session.proxy, account: session.account };
}

async function runSteps(id, page, steps, settings = {}) {
  const vars = {};
  updateStatus(id, { currentStep: 0, totalSteps: steps.length });

  for (let i = 0; i < steps.length; i++) {
    const session = browsers.get(id);
    if (!session || session.status === 'stopped') {
      addLog(id, 'info', 'Выполнение остановлено');
      return;
    }

    // Ждём пока не будет снята пауза
    while (session.paused) {
      await new Promise((r) => setTimeout(r, 300));
    }

    updateStatus(id, { currentStep: i + 1 });

    const result = await executeStep(id, page, steps[i], vars);
    if (result === 'stop') {
      updateStatus(id, { status: 'stopped' });
      addLog(id, 'warn', 'Сценарий остановлен условием');
      return;
    }
    if (result === 'skip') {
      addLog(id, 'info', `Шаг ${i + 1} пропущен (условие skip)`);
      continue;
    }
    if (result === 'retry') {
      addLog(id, 'warn', `Повтор с шага 1 (условие retry)`);
      i = -1;
      continue;
    }
  }

  updateStatus(id, { status: 'done', currentStep: steps.length });
  addLog(id, 'info', `Сценарий завершён (${steps.length} шагов)`);
}

async function closeBrowser(id) {
  const session = browsers.get(id);
  if (!session) throw new Error(`Браузер #${id} не найден`);
  session.status = 'stopped';
  await session.browser.close();
  browsers.delete(id);
  addLog(id, 'info', `Браузер #${id} закрыт`);
}

function pauseBrowser(id) {
  const session = browsers.get(id);
  if (!session) throw new Error(`Браузер #${id} не найден`);
  session.paused = true;
  session.status = 'paused';
  updateStatus(id, { status: 'paused' });
  addLog(id, 'info', `Браузер #${id} на паузе`);
}

function resumeBrowser(id) {
  const session = browsers.get(id);
  if (!session) throw new Error(`Браузер #${id} не найден`);
  session.paused = false;
  session.status = 'running';
  updateStatus(id, { status: 'running' });
  addLog(id, 'info', `Браузер #${id} возобновлён`);
}

function listBrowsers() {
  return Array.from(browsers.values()).map((s) => ({
    id: s.id,
    url: s.url,
    proxy: s.proxy || '',
    account: s.account || '',
    scenarioName: s.scenarioName || '',
    status: s.status,
    currentStep: s.currentStep,
    totalSteps: s.totalSteps,
    cpu: s.cpu,
    mem: s.mem,
  }));
}

async function runScenario({ scenario, accounts, settings }) {
  const results = [];
  for (const account of accounts) {
    try {
      const data = await launchBrowser({
        url: account.site,
        proxy: account.proxy,
        account: account.login,
        scenarioName: scenario.name,
        steps: scenario.steps,
        settings,
      });
      results.push({ ok: true, accountLogin: account.login, data });
    } catch (err) {
      results.push({ ok: false, accountLogin: account.login, error: err.message });
    }
  }
  return results;
}

function getLogs(filter) {
  if (!filter) return logs;
  const f = filter.toLowerCase();
  return logs.filter(
    (l) =>
      l.browser.toLowerCase().includes(f) ||
      l.message.toLowerCase().includes(f) ||
      l.level.toLowerCase().includes(f)
  );
}

function clearLogs() {
  logs.length = 0;
  logIdCounter = 1;
}

module.exports = {
  init,
  launchBrowser,
  closeBrowser,
  pauseBrowser,
  resumeBrowser,
  listBrowsers,
  runScenario,
  getLogs,
  clearLogs,
};