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

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

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
