const puppeteer = require('puppeteer-core')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { EventEmitter } = require('events')

// Хранилище запущенных браузеров: id -> { browser, page, url, proxy, account, status, scenarioName, currentStep, totalSteps, paused, stopRequested }
const browsers = new Map()
let nextId = 1

// Хранилище логов (в памяти, последние 500)
const logs = []
const MAX_LOGS = 500

// Event emitter для рассылки событий в главный процесс
const emitter = new EventEmitter()

function addLog(level, browser, message) {
  const now = new Date()
  const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
  const log = { id: Date.now() + Math.random(), time, level, browser, message }
  logs.unshift(log)
  if (logs.length > MAX_LOGS) logs.splice(MAX_LOGS)
  emitter.emit('log', log)
  return log
}

function updateBrowserStatus(id, updates) {
  const entry = browsers.get(id)
  if (!entry) return
  Object.assign(entry, updates)
  emitter.emit('browser-status', { id, ...updates })
}

/**
 * Seeded PRNG (mulberry32) — deterministic pseudo-random based on a 32-bit seed
 */
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Simple string hash → 32-bit integer
 */
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return hash >>> 0
}

/**
 * Generate a deterministic fingerprint for a given account name
 */
function generateFingerprint(account) {
  const seed = hashString(String(account))
  const rng = mulberry32(seed)
  const pick = (arr) => arr[Math.floor(rng() * arr.length)]

  const userAgents = [
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', platform: 'Win32' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', platform: 'Win32' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', platform: 'Win32' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', platform: 'MacIntel' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', platform: 'MacIntel' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', platform: 'MacIntel' },
    { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', platform: 'Linux x86_64' },
    { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36', platform: 'Linux x86_64' },
    { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36', platform: 'Win32' },
    { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36', platform: 'MacIntel' },
  ]

  const languages = [
    ['en-US', 'en'],
    ['en-GB', 'en'],
    ['de-DE', 'de', 'en'],
    ['fr-FR', 'fr', 'en'],
    ['ru-RU', 'ru', 'en'],
    ['es-ES', 'es', 'en'],
    ['pt-BR', 'pt', 'en'],
    ['ja-JP', 'ja', 'en'],
  ]

  const resolutions = [
    { w: 1920, h: 1080 },
    { w: 1366, h: 768 },
    { w: 1536, h: 864 },
    { w: 1440, h: 900 },
    { w: 1280, h: 720 },
    { w: 2560, h: 1440 },
    { w: 1680, h: 1050 },
    { w: 1600, h: 900 },
  ]

  const webglPairs = [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
  ]

  const timezones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Moscow',
    'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney',
  ]

  const uaEntry = pick(userAgents)
  const res = pick(resolutions)
  const glPair = pick(webglPairs)

  return {
    userAgent: uaEntry.ua,
    platform: uaEntry.platform,
    vendor: 'Google Inc.',
    languages: pick(languages),
    screenWidth: res.w,
    screenHeight: res.h,
    colorDepth: pick([24, 32]),
    hardwareConcurrency: pick([2, 4, 6, 8, 12, 16]),
    deviceMemory: pick([2, 4, 8, 16]),
    maxTouchPoints: 0,
    webglVendor: glPair.vendor,
    webglRenderer: glPair.renderer,
    canvasNoise: rng() * 0.04 - 0.02,
    audioNoise: rng() * 0.0001 - 0.00005,
    timezone: pick(timezones),
  }
}

/**
 * Build stealth injection script string for evaluateOnNewDocument
 */
function getStealthScripts(fingerprint) {
  return `
(function() {
  // --- Navigator overrides ---
  const fp = ${JSON.stringify(fingerprint)};

  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
  Object.defineProperty(navigator, 'vendor', { get: () => fp.vendor });
  Object.defineProperty(navigator, 'languages', { get: () => Object.freeze([...fp.languages]) });
  Object.defineProperty(navigator, 'language', { get: () => fp.languages[0] });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => fp.maxTouchPoints });
  Object.defineProperty(navigator, 'userAgent', { get: () => fp.userAgent });

  // --- Screen overrides ---
  const screenProps = {
    width: { get: () => fp.screenWidth },
    height: { get: () => fp.screenHeight },
    availWidth: { get: () => fp.screenWidth },
    availHeight: { get: () => fp.screenHeight - 40 },
    colorDepth: { get: () => fp.colorDepth },
    pixelDepth: { get: () => fp.colorDepth },
  };
  for (const [prop, descriptor] of Object.entries(screenProps)) {
    Object.defineProperty(screen, prop, descriptor);
  }

  // --- Canvas fingerprint noise ---
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type) {
    const ctx = this.getContext('2d');
    if (ctx && this.width > 0 && this.height > 0) {
      try {
        const imageData = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, data[i] + Math.floor(fp.canvasNoise * 255 * ((i * 13 + 7) % 17 - 8) / 8)));
        }
        ctx.putImageData(imageData, 0, 0);
      } catch(e) {}
    }
    return origToDataURL.apply(this, arguments);
  };

  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
    const ctx = this.getContext('2d');
    if (ctx && this.width > 0 && this.height > 0) {
      try {
        const imageData = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, data[i] + Math.floor(fp.canvasNoise * 255 * ((i * 11 + 3) % 13 - 6) / 6)));
        }
        ctx.putImageData(imageData, 0, 0);
      } catch(e) {}
    }
    return origToBlob.apply(this, arguments);
  };

  // --- WebGL spoofing ---
  const getParamOrig = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    const UNMASKED_VENDOR_WEBGL = 0x9245;
    const UNMASKED_RENDERER_WEBGL = 0x9246;
    if (param === UNMASKED_VENDOR_WEBGL) return fp.webglVendor;
    if (param === UNMASKED_RENDERER_WEBGL) return fp.webglRenderer;
    return getParamOrig.apply(this, arguments);
  };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      const UNMASKED_VENDOR_WEBGL = 0x9245;
      const UNMASKED_RENDERER_WEBGL = 0x9246;
      if (param === UNMASKED_VENDOR_WEBGL) return fp.webglVendor;
      if (param === UNMASKED_RENDERER_WEBGL) return fp.webglRenderer;
      return getParam2Orig.apply(this, arguments);
    };
  }

  // --- AudioContext fingerprint noise ---
  const origCreateOscillator = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function() {
    const osc = origCreateOscillator.apply(this, arguments);
    const origFreqGetter = Object.getOwnPropertyDescriptor(OscillatorNode.prototype.__proto__, 'frequency') ||
                           Object.getOwnPropertyDescriptor(osc, 'frequency');
    if (osc.frequency && typeof osc.frequency.value === 'number') {
      osc.frequency.value = osc.frequency.value + fp.audioNoise;
    }
    return osc;
  };

  const origCreateDynamicsCompressor = AudioContext.prototype.createDynamicsCompressor;
  AudioContext.prototype.createDynamicsCompressor = function() {
    const compressor = origCreateDynamicsCompressor.apply(this, arguments);
    const origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
    if (origGetFloatFrequencyData) {
      AnalyserNode.prototype.getFloatFrequencyData = function(array) {
        origGetFloatFrequencyData.apply(this, arguments);
        for (let i = 0; i < array.length; i++) {
          array[i] = array[i] + fp.audioNoise * ((i % 7) - 3);
        }
      };
    }
    return compressor;
  };

  // --- Timezone override ---
  const origResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  Intl.DateTimeFormat.prototype.resolvedOptions = function() {
    const result = origResolvedOptions.apply(this, arguments);
    result.timeZone = fp.timezone;
    return result;
  };

  // --- Remove chrome.runtime detection artifacts ---
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: function() {},
      sendMessage: function() {},
    };
  }

  // --- Fix permissions.query for notifications ---
  const origQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = function(parameters) {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: Notification.permission });
    }
    return origQuery.apply(this, arguments);
  };

  // --- Override plugins and mimeTypes ---
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const pluginData = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      const plugins = Object.create(PluginArray.prototype);
      let idx = 0;
      for (const p of pluginData) {
        const plugin = Object.create(Plugin.prototype);
        Object.defineProperty(plugin, 'name', { get: () => p.name });
        Object.defineProperty(plugin, 'filename', { get: () => p.filename });
        Object.defineProperty(plugin, 'description', { get: () => p.description });
        Object.defineProperty(plugin, 'length', { get: () => 1 });
        plugins[idx] = plugin;
        idx++;
      }
      Object.defineProperty(plugins, 'length', { get: () => pluginData.length });
      plugins.item = function(i) { return this[i] || null; };
      plugins.namedItem = function(name) {
        for (let i = 0; i < this.length; i++) { if (this[i].name === name) return this[i]; }
        return null;
      };
      plugins.refresh = function() {};
      return plugins;
    }
  });

  Object.defineProperty(navigator, 'mimeTypes', {
    get: () => {
      const mimeData = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'application/x-nacl', suffixes: '', description: 'Native Client Executable' },
      ];
      const mimeTypes = Object.create(MimeTypeArray.prototype);
      let idx = 0;
      for (const m of mimeData) {
        const mt = Object.create(MimeType.prototype);
        Object.defineProperty(mt, 'type', { get: () => m.type });
        Object.defineProperty(mt, 'suffixes', { get: () => m.suffixes });
        Object.defineProperty(mt, 'description', { get: () => m.description });
        mimeTypes[idx] = mt;
        mimeTypes[m.type] = mt;
        idx++;
      }
      Object.defineProperty(mimeTypes, 'length', { get: () => mimeData.length });
      mimeTypes.item = function(i) { return this[i] || null; };
      mimeTypes.namedItem = function(name) { return this[name] || null; };
      return mimeTypes;
    }
  });
})();
`
}

/**
 * Найти путь к установленному Chrome/Chromium
 */
function findChromePath(customPath) {
  if (customPath && customPath.trim()) {
    try { fs.accessSync(customPath.trim()); return customPath.trim() } catch {}
  }
  const candidates = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    ],
  }
  const paths = candidates[process.platform] || []
  for (const p of paths) {
    try { fs.accessSync(p); return p } catch {}
  }
  throw new Error('Chrome/Chromium не найден. Установи Google Chrome или укажи путь в настройках.')
}

/**
 * Выполнить один шаг сценария на странице
 */
async function executeStep(page, step, browserId) {
  const { type, params, label } = step
  const browserName = `Browser #${browserId}`

  addLog('info', browserName, `Шаг: ${label}`)

  switch (type) {
    case 'navigate': {
      let url = params.url || ''
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      addLog('info', browserName, `Открыт: ${url}`)
      break
    }

    case 'click': {
      const timeout = parseInt(params.timeout) || 5000
      await page.waitForSelector(params.selector, { timeout })
      await page.click(params.selector)
      addLog('info', browserName, `Клик: ${params.selector}`)
      break
    }

    case 'type': {
      await page.waitForSelector(params.selector, { timeout: 5000 })
      await page.click(params.selector, { clickCount: 3 })
      await page.type(params.selector, params.value || '', { delay: 50 })
      addLog('info', browserName, `Ввод в ${params.selector}: ${(params.value || '').substring(0, 20)}...`)
      break
    }

    case 'wait': {
      const ms = parseInt(params.ms) || 1000
      await new Promise(r => setTimeout(r, ms))
      addLog('info', browserName, `Пауза ${ms}мс`)
      break
    }

    case 'scroll': {
      const direction = params.direction || 'down'
      if (direction === 'to-element' && params.selector) {
        await page.waitForSelector(params.selector, { timeout: 5000 })
        await page.$eval(params.selector, el => el.scrollIntoView({ behavior: 'smooth' }))
      } else if (direction === 'up') {
        await page.evaluate(() => window.scrollBy(0, -window.innerHeight))
      } else {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      }
      addLog('info', browserName, `Прокрутка: ${direction}`)
      break
    }

    case 'screenshot': {
      const name = params.name || `screenshot-${Date.now()}.png`
      const screenshotDir = path.join(os.homedir(), '.browserctrl', 'screenshots')
      fs.mkdirSync(screenshotDir, { recursive: true })
      const filePath = path.join(screenshotDir, name)
      await page.screenshot({ path: filePath, fullPage: false })
      addLog('info', browserName, `Скриншот: ${filePath}`)
      break
    }

    case 'extract': {
      const result = await page.$$eval(params.selector || 'body', (els, attr) => {
        return els.map(el => attr === 'text' ? el.textContent?.trim() : el.getAttribute(attr)).filter(Boolean)
      }, params.attr || 'text')
      addLog('info', browserName, `Извлечено (${params.varName || 'data'}): ${JSON.stringify(result).substring(0, 80)}`)
      break
    }

    case 'condition': {
      const found = await page.$(params.selector)
      const action = params.action || 'skip'
      addLog(found ? 'warn' : 'info', browserName, `Условие "${params.selector}": ${found ? `найден → ${action}` : 'не найден'}`)
      if (found && action === 'stop') throw new Error(`Остановлено условием: найден ${params.selector}`)
      break
    }

    default:
      addLog('warn', browserName, `Неизвестный тип шага: ${type}`)
  }
}

/**
 * Запустить новый браузер
 */
async function launchBrowser({ url, proxy, chromePath, headless = false, account, scenarioName, steps, settings }) {
  if (!url) throw new Error('URL не указан')
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url

  const executablePath = findChromePath(chromePath || (settings && settings.chromiumPath))
  const isHeadless = headless || (settings && settings.headless) || false

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
  ]

  if (settings && settings.disableImages) {
    args.push('--blink-settings=imagesEnabled=false')
  }

  if (proxy && proxy.trim()) {
    const proxyClean = proxy.trim()
    const hasAuth = proxyClean.includes('@')
    const hostPort = hasAuth ? proxyClean.split('@')[1] : proxyClean
    args.push(`--proxy-server=http://${hostPort}`)
  }

  // Профиль браузера (если включено сохранение cookies)
  let userDataDir
  if (settings && settings.saveCookies && account) {
    const profilesBase = settings.profilesDir
      ? settings.profilesDir.replace('~', os.homedir())
      : path.join(os.homedir(), '.browserctrl', 'profiles')
    userDataDir = path.join(profilesBase, account.replace(/[^a-zA-Z0-9_-]/g, '_'))
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: isHeadless ? 'new' : false,
    defaultViewport: null,
    args,
    userDataDir,
    ignoreHTTPSErrors: true,
  })

  const page = await browser.newPage()

  if (proxy && proxy.includes('@')) {
    const [credentials] = proxy.split('@')
    const [username, password] = credentials.split(':')
    await page.authenticate({ username, password })
  }

  // Fingerprint masking
  if (settings && settings.fingerprintMasking) {
    const accountKey = account || ('default_' + Date.now())
    let fingerprint = null

    // Try to load saved fingerprint from profile dir
    if (userDataDir) {
      const fpPath = path.join(userDataDir, 'fingerprint.json')
      try {
        if (fs.existsSync(fpPath)) {
          fingerprint = JSON.parse(fs.readFileSync(fpPath, 'utf-8'))
        }
      } catch (e) {
        // ignore read errors, will regenerate
      }
    }

    // Generate deterministic fingerprint if not loaded
    if (!fingerprint) {
      fingerprint = generateFingerprint(accountKey)
      // Save fingerprint if profile dir exists
      if (userDataDir) {
        try {
          fs.writeFileSync(path.join(userDataDir, 'fingerprint.json'), JSON.stringify(fingerprint, null, 2), 'utf-8')
        } catch (e) {
          // ignore write errors
        }
      }
    }

    await page.setUserAgent(fingerprint.userAgent)
    await page.setViewport({
      width: fingerprint.screenWidth,
      height: fingerprint.screenHeight,
    })
    await page.evaluateOnNewDocument(getStealthScripts(fingerprint))

    try {
      await page.emulateTimezone(fingerprint.timezone)
    } catch (e) {
      // older puppeteer versions may not support emulateTimezone
    }
  } else {
    // Fallback: only hide webdriver flag
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    })
  }

  const id = nextId++
  const entry = {
    browser, page, url, proxy: proxy || null,
    account: account || null,
    scenarioName: scenarioName || null,
    status: 'running',
    currentStep: 0,
    totalSteps: steps ? steps.length : 0,
    paused: false,
    stopRequested: false,
    startedAt: Date.now(),
    cpu: 0,
    mem: 0,
  }
  browsers.set(id, entry)

  const browserName = `Browser #${id}`
  if (settings && settings.fingerprintMasking) {
    addLog('info', browserName, 'Fingerprint masking: включено')
  }
  addLog('info', browserName, `Запущен → ${url}${proxy ? ` (прокси: ${proxy})` : ''}`)

  browser.on('disconnected', () => {
    if (browsers.has(id)) {
      updateBrowserStatus(id, { status: 'stopped' })
      addLog('info', browserName, 'Браузер закрыт')
      browsers.delete(id)
    }
  })

  // Открываем первую страницу
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (err) {
    addLog('error', browserName, `Ошибка открытия: ${err.message}`)
  }

  // Если переданы шаги сценария — выполняем асинхронно
  if (steps && steps.length > 0) {
    runScenarioSteps(id, page, steps).catch(() => {})
  }

  return { id, url, proxy: proxy || null, status: 'running', account: account || null }
}

/**
 * Выполнить шаги сценария асинхронно
 */
async function runScenarioSteps(id, page, steps) {
  const entry = browsers.get(id)
  if (!entry) return
  const browserName = `Browser #${id}`

  updateBrowserStatus(id, { status: 'running', totalSteps: steps.length, currentStep: 0 })

  for (let i = 0; i < steps.length; i++) {
    const currentEntry = browsers.get(id)
    if (!currentEntry || currentEntry.stopRequested) {
      addLog('warn', browserName, 'Выполнение остановлено')
      updateBrowserStatus(id, { status: 'stopped' })
      return
    }

    // Пауза
    while (currentEntry.paused && !currentEntry.stopRequested) {
      await new Promise(r => setTimeout(r, 300))
    }
    if (currentEntry.stopRequested) {
      addLog('warn', browserName, 'Выполнение остановлено')
      updateBrowserStatus(id, { status: 'stopped' })
      return
    }

    updateBrowserStatus(id, { currentStep: i + 1 })

    try {
      await executeStep(page, steps[i], id)
    } catch (err) {
      addLog('error', browserName, `Ошибка шага ${i + 1}: ${err.message}`)
      updateBrowserStatus(id, { status: 'error' })
      return
    }
  }

  addLog('info', browserName, `Сценарий завершён (${steps.length} шагов)`)
  updateBrowserStatus(id, { status: 'done', currentStep: steps.length })
}

/**
 * Закрыть браузер по id
 */
async function closeBrowser(id) {
  const entry = browsers.get(id)
  if (!entry) throw new Error(`Браузер #${id} не найден`)
  entry.stopRequested = true
  await entry.browser.close()
  browsers.delete(id)
  addLog('info', `Browser #${id}`, 'Принудительно закрыт')
  return { id, status: 'closed' }
}

/**
 * Поставить на паузу
 */
function pauseBrowser(id) {
  const entry = browsers.get(id)
  if (!entry) throw new Error(`Браузер #${id} не найден`)
  entry.paused = true
  updateBrowserStatus(id, { status: 'paused' })
  addLog('info', `Browser #${id}`, 'Поставлен на паузу')
  return { id, status: 'paused' }
}

/**
 * Возобновить
 */
function resumeBrowser(id) {
  const entry = browsers.get(id)
  if (!entry) throw new Error(`Браузер #${id} не найден`)
  entry.paused = false
  updateBrowserStatus(id, { status: 'running' })
  addLog('info', `Browser #${id}`, 'Возобновлён')
  return { id, status: 'running' }
}

/**
 * Список запущенных браузеров
 */
function listBrowsers() {
  return Array.from(browsers.entries()).map(([id, e]) => ({
    id,
    url: e.url,
    proxy: e.proxy || '—',
    account: e.account || '—',
    scenarioName: e.scenarioName || '—',
    status: e.status,
    currentStep: e.currentStep,
    totalSteps: e.totalSteps,
    cpu: e.cpu,
    mem: e.mem,
  }))
}

/**
 * Получить логи
 */
function getLogs(filter) {
  if (!filter || filter === 'all') return logs.slice(0, 200)
  return logs.filter(l => l.level === filter).slice(0, 200)
}

/**
 * Очистить логи
 */
function clearLogs() {
  logs.splice(0, logs.length)
}

module.exports = {
  launchBrowser,
  closeBrowser,
  pauseBrowser,
  resumeBrowser,
  listBrowsers,
  getLogs,
  clearLogs,
  emitter,
}