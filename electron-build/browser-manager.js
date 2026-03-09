const puppeteer = require('puppeteer-core')
const { execSync } = require('child_process')
const path = require('path')
const os = require('os')

// Хранилище запущенных браузеров: id -> { browser, page, url, proxy }
const browsers = new Map()
let nextId = 1

/**
 * Найти путь к установленному Chrome/Chromium на macOS, Linux, Windows
 */
function findChromePath() {
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

  const platform = process.platform
  const paths = candidates[platform] || []

  for (const p of paths) {
    try {
      require('fs').accessSync(p)
      return p
    } catch {}
  }

  throw new Error(
    'Chrome/Chromium не найден. Установи Google Chrome или укажи путь в настройках.'
  )
}

/**
 * Запустить новый браузер
 * @param {object} options
 * @param {string} options.url        - URL для открытия
 * @param {string} [options.proxy]    - прокси в формате "host:port" или "user:pass@host:port"
 * @param {string} [options.chromePath] - кастомный путь к Chrome
 * @param {boolean} [options.headless]  - headless режим (по умолчанию false — показывать окно)
 * @returns {{ id: number, url: string, proxy: string|null }}
 */
async function launchBrowser({ url, proxy, chromePath, headless = false }) {
  if (!url) throw new Error('URL не указан')

  // Привести URL к правильному формату
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url
  }

  const executablePath = chromePath || findChromePath()

  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
  ]

  // Прокси — подключаем если указан
  if (proxy && proxy.trim()) {
    const proxyClean = proxy.trim()
    // Поддерживаем форматы: host:port  и  user:pass@host:port
    const hasAuth = proxyClean.includes('@')
    const hostPort = hasAuth ? proxyClean.split('@')[1] : proxyClean
    args.push(`--proxy-server=http://${hostPort}`)
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: headless ? 'new' : false,
    defaultViewport: null,
    args,
    ignoreHTTPSErrors: true,
  })

  const page = await browser.newPage()

  // Если прокси с авторизацией — аутентифицируем
  if (proxy && proxy.includes('@')) {
    const [credentials] = proxy.split('@')
    const [username, password] = credentials.split(':')
    await page.authenticate({ username, password })
  }

  // Маскируем webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

  const id = nextId++
  browsers.set(id, { browser, page, url, proxy: proxy || null })

  browser.on('disconnected', () => {
    browsers.delete(id)
  })

  return { id, url, proxy: proxy || null, status: 'running' }
}

/**
 * Закрыть браузер по id
 */
async function closeBrowser(id) {
  const entry = browsers.get(id)
  if (!entry) throw new Error(`Браузер #${id} не найден`)
  await entry.browser.close()
  browsers.delete(id)
  return { id, status: 'closed' }
}

/**
 * Список запущенных браузеров
 */
function listBrowsers() {
  return Array.from(browsers.entries()).map(([id, { url, proxy }]) => ({
    id,
    url,
    proxy: proxy || '—',
    status: 'running',
  }))
}

module.exports = { launchBrowser, closeBrowser, listBrowsers }
