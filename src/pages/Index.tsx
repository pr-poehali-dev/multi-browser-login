import { useState } from "react";
import Icon from "@/components/ui/icon";

type Section = "dashboard" | "browsers" | "accounts" | "scenarios" | "logs" | "settings";

const mockBrowsers = [
  { id: 1, name: "Chrome #001", status: "running", proxy: "185.22.11.4:8080", account: "user@mail.ru", cpu: 12, mem: 245 },
  { id: 2, name: "Chrome #002", status: "running", proxy: "91.108.4.11:3128", account: "admin@corp.com", cpu: 8, mem: 198 },
  { id: 3, name: "Chrome #003", status: "paused", proxy: "195.144.21.7:8888", account: "test@test.ru", cpu: 0, mem: 134 },
  { id: 4, name: "Chrome #004", status: "stopped", proxy: "78.46.90.11:1080", account: "bot@service.io", cpu: 0, mem: 0 },
  { id: 5, name: "Chrome #005", status: "running", proxy: "94.130.55.22:9090", account: "worker@app.ru", cpu: 19, mem: 312 },
  { id: 6, name: "Chrome #006", status: "error", proxy: "5.180.61.24:3000", account: "sys@domain.net", cpu: 0, mem: 87 },
];

const mockAccounts = [
  { id: 1, login: "user@mail.ru", password: "••••••••", site: "mail.ru", proxy: "185.22.11.4:8080", status: "active", lastLogin: "25.02.2026 14:32" },
  { id: 2, login: "admin@corp.com", password: "••••••••", site: "corp.com", proxy: "91.108.4.11:3128", status: "active", lastLogin: "25.02.2026 11:15" },
  { id: 3, login: "test@test.ru", password: "••••••••", site: "test.ru", proxy: "195.144.21.7:8888", status: "inactive", lastLogin: "24.02.2026 09:44" },
  { id: 4, login: "bot@service.io", password: "••••••••", site: "service.io", proxy: "78.46.90.11:1080", status: "banned", lastLogin: "23.02.2026 22:01" },
  { id: 5, login: "worker@app.ru", password: "••••••••", site: "app.ru", proxy: "94.130.55.22:9090", status: "active", lastLogin: "25.02.2026 15:50" },
];

const mockScenarios = [
  { id: 1, name: "Авторизация + парсинг", steps: 7, status: "active", lastRun: "25.02.2026 15:00", successRate: 98 },
  { id: 2, name: "Регистрация аккаунтов", steps: 12, status: "active", lastRun: "25.02.2026 12:30", successRate: 87 },
  { id: 3, name: "Массовая рассылка", steps: 5, status: "draft", lastRun: "—", successRate: 0 },
  { id: 4, name: "Мониторинг цен", steps: 9, status: "active", lastRun: "25.02.2026 10:15", successRate: 100 },
  { id: 5, name: "Сбор контактов", steps: 14, status: "disabled", lastRun: "21.02.2026 08:00", successRate: 72 },
];

const mockLogs = [
  { id: 1, time: "15:52:41", level: "info", browser: "Chrome #001", message: "Сценарий 'Авторизация + парсинг' запущен успешно" },
  { id: 2, time: "15:51:33", level: "error", browser: "Chrome #006", message: "Ошибка подключения к прокси 5.180.61.24:3000 — таймаут" },
  { id: 3, time: "15:50:12", level: "warn", browser: "Chrome #003", message: "Браузер переведён в режим паузы (лимит памяти)" },
  { id: 4, time: "15:49:05", level: "info", browser: "Chrome #005", message: "Шаг 4/9 выполнен: данные успешно извлечены" },
  { id: 5, time: "15:48:22", level: "error", browser: "Chrome #004", message: "Аккаунт bot@service.io заблокирован на сайте service.io" },
  { id: 6, time: "15:47:10", level: "info", browser: "Chrome #002", message: "Прокси заменён на резервный: 91.108.4.11:3128" },
  { id: 7, time: "15:46:58", level: "info", browser: "Chrome #001", message: "Cookie сохранены: 14 записей" },
  { id: 8, time: "15:45:33", level: "warn", browser: "Chrome #005", message: "CAPTCHA обнаружена, попытка решения..." },
  { id: 9, time: "15:44:11", level: "info", browser: "Chrome #002", message: "Сценарий 'Мониторинг цен' завершён: 240 позиций" },
  { id: 10, time: "15:43:02", level: "error", browser: "Chrome #003", message: "Элемент не найден: #submit-btn (шаг 3)" },
];

const mockProxies = [
  { id: 1, host: "185.22.11.4", port: 8080, type: "HTTP", country: "RU", status: "active", speed: 45 },
  { id: 2, host: "91.108.4.11", port: 3128, type: "HTTP", country: "DE", status: "active", speed: 12 },
  { id: 3, host: "195.144.21.7", port: 8888, type: "SOCKS5", country: "NL", status: "active", speed: 28 },
  { id: 4, host: "78.46.90.11", port: 1080, type: "SOCKS5", country: "US", status: "error", speed: 0 },
  { id: 5, host: "94.130.55.22", port: 9090, type: "HTTP", country: "PL", status: "active", speed: 67 },
  { id: 6, host: "5.180.61.24", port: 3000, type: "HTTP", country: "UA", status: "dead", speed: 0 },
];

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: "Работает", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    paused: { label: "Пауза", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    stopped: { label: "Остановлен", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    error: { label: "Ошибка", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    active: { label: "Активен", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    inactive: { label: "Неактивен", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    banned: { label: "Заблокирован", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    draft: { label: "Черновик", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    disabled: { label: "Отключён", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    dead: { label: "Недоступен", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-500/15 text-slate-400" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium tracking-wide ${s.cls}`}>{s.label}</span>;
};

const LogBadge = ({ level }: { level: string }) => {
  const map: Record<string, string> = {
    info: "text-blue-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };
  return <span className={`font-mono text-[11px] uppercase font-semibold ${map[level] ?? "text-slate-400"}`}>{level}</span>;
};

const StatCard = ({ icon, label, value, sub, accent }: { icon: string; label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="bg-[#141920] border border-[#1e2837] rounded-lg p-5 flex flex-col gap-3 animate-fade-in">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded flex items-center justify-center ${accent ?? "bg-blue-500/10"}`}>
        <Icon name={icon} size={16} className={accent ? "text-blue-400" : "text-blue-400"} />
      </div>
    </div>
    <div className="font-ibm text-3xl font-semibold text-slate-100 leading-none">{value}</div>
    {sub && <div className="text-[12px] text-slate-500">{sub}</div>}
  </div>
);

export default function Index() {
  const [section, setSection] = useState<Section>("dashboard");
  const [proxyTab, setProxyTab] = useState(false);

  const nav: { id: Section; icon: string; label: string }[] = [
    { id: "dashboard", icon: "LayoutDashboard", label: "Дашборд" },
    { id: "browsers", icon: "Monitor", label: "Браузеры" },
    { id: "accounts", icon: "Users", label: "Аккаунты" },
    { id: "scenarios", icon: "Workflow", label: "Сценарии" },
    { id: "logs", icon: "ScrollText", label: "Логи" },
    { id: "settings", icon: "Settings", label: "Настройки" },
  ];

  const running = mockBrowsers.filter(b => b.status === "running").length;

  return (
    <div className="flex h-screen bg-[#0c1017] font-ibm text-slate-300 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#0e1520] border-r border-[#1a2333] flex flex-col">
        <div className="px-5 py-5 border-b border-[#1a2333]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
              <Icon name="Globe" size={14} className="text-white" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-slate-100 leading-none">BrowserCtrl</div>
              <div className="text-[10px] text-slate-500 mt-0.5">v2.4.1</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded text-[13px] transition-all duration-150 ${
                section === item.id
                  ? "bg-blue-600/20 text-blue-300 border border-blue-600/30"
                  : "text-slate-400 hover:bg-[#141d2a] hover:text-slate-200"
              }`}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-[#1a2333]">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {running} браузеров активно
          </div>
          <div className="text-[10px] text-slate-600">CPU: 39% · RAM: 1.2 GB</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-12 bg-[#0e1520] border-b border-[#1a2333] flex items-center px-6 gap-4 flex-shrink-0">
          <div className="text-[13px] font-medium text-slate-300">
            {nav.find(n => n.id === section)?.label}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1 bg-[#141920] border border-[#1e2837] rounded px-3 py-1.5">
            <Icon name="Search" size={13} className="text-slate-500" />
            <input className="bg-transparent text-[12px] text-slate-300 placeholder-slate-600 outline-none w-40" placeholder="Поиск..." />
          </div>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1a2333] text-slate-400 hover:text-slate-200 transition-colors">
            <Icon name="Bell" size={15} />
          </button>
          <div className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-600/40 flex items-center justify-center text-[11px] text-blue-300 font-medium">А</div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">

          {/* DASHBOARD */}
          {section === "dashboard" && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-4 gap-4">
                <StatCard icon="Monitor" label="Всего браузеров" value={mockBrowsers.length} sub="6 зарегистрировано" />
                <StatCard icon="Zap" label="Активных" value={running} sub="Прямо сейчас" accent="bg-emerald-500/10" />
                <StatCard icon="Users" label="Аккаунтов" value={mockAccounts.length} sub="4 активных" />
                <StatCard icon="Workflow" label="Сценариев" value={mockScenarios.length} sub="3 активных" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 bg-[#141920] border border-[#1e2837] rounded-lg p-5">
                  <div className="text-[12px] font-medium text-slate-500 uppercase tracking-widest mb-4">Статус браузеров</div>
                  <div className="space-y-3">
                    {mockBrowsers.map(b => (
                      <div key={b.id} className="flex items-center gap-4">
                        <div className="text-[12px] text-slate-300 w-28 font-mono">{b.name}</div>
                        <StatusBadge status={b.status} />
                        <div className="flex-1 bg-[#1a2333] rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${b.cpu * 3}%` }} />
                        </div>
                        <div className="text-[11px] text-slate-500 w-16 text-right font-mono">{b.cpu}% CPU</div>
                        <div className="text-[11px] text-slate-500 w-16 text-right font-mono">{b.mem > 0 ? `${b.mem}MB` : "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[#141920] border border-[#1e2837] rounded-lg p-5">
                  <div className="text-[12px] font-medium text-slate-500 uppercase tracking-widest mb-4">Последние события</div>
                  <div className="space-y-3">
                    {mockLogs.slice(0, 6).map(l => (
                      <div key={l.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <LogBadge level={l.level} />
                          <span className="text-[10px] text-slate-600 font-mono">{l.time}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 leading-tight pl-0">{l.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <StatCard icon="ShieldCheck" label="Прокси активных" value="5/6" sub="1 недоступен" accent="bg-amber-500/10" />
                <StatCard icon="AlertTriangle" label="Ошибок за 24ч" value={3} sub="Chrome #006, #004, #003" accent="bg-red-500/10" />
                <StatCard icon="CheckCircle" label="Задач выполнено" value={142} sub="За сегодня" accent="bg-emerald-500/10" />
                <StatCard icon="Clock" label="Аптайм" value="14:27:03" sub="С последнего рестарта" />
              </div>
            </div>
          )}

          {/* BROWSERS */}
          {section === "browsers" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-slate-500">{mockBrowsers.length} браузеров · {running} активных</div>
                <div className="flex gap-2">
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-[#141920] border border-[#1e2837] rounded text-[12px] text-slate-300 hover:bg-[#1a2333] transition-colors">
                    <Icon name="Play" size={12} />Запустить все
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded text-[12px] text-white hover:bg-blue-500 transition-colors">
                    <Icon name="Plus" size={12} />Добавить
                  </button>
                </div>
              </div>

              <div className="bg-[#141920] border border-[#1e2837] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e2837]">
                      {["Браузер", "Статус", "Прокси", "Аккаунт", "CPU", "RAM", ""].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockBrowsers.map((b, i) => (
                      <tr key={b.id} className={`border-b border-[#1a2333] hover:bg-[#1a2333]/50 transition-colors ${i === mockBrowsers.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-200">{b.name}</td>
                        <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-400">{b.proxy}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-400">{b.account}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-[#1a2333] rounded-full h-1">
                              <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${b.cpu * 3}%` }} />
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">{b.cpu}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-400">{b.mem > 0 ? `${b.mem}MB` : "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Play" size={12} /></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Pause" size={12} /></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-red-400 transition-colors"><Icon name="Square" size={12} /></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Settings2" size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ACCOUNTS */}
          {section === "accounts" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-slate-500">{mockAccounts.length} аккаунтов</div>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded text-[12px] text-white hover:bg-blue-500 transition-colors">
                  <Icon name="Plus" size={12} />Добавить аккаунт
                </button>
              </div>

              <div className="bg-[#141920] border border-[#1e2837] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#1e2837]">
                      {["Логин", "Пароль", "Сайт", "Прокси", "Статус", "Последний вход", ""].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mockAccounts.map((a, i) => (
                      <tr key={a.id} className={`border-b border-[#1a2333] hover:bg-[#1a2333]/50 transition-colors ${i === mockAccounts.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-4 py-3 text-[12px] text-slate-200">{a.login}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{a.password}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-400">{a.site}</td>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-400">{a.proxy}</td>
                        <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{a.lastLogin}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Eye" size={12} /></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Pencil" size={12} /></button>
                            <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-red-400 transition-colors"><Icon name="Trash2" size={12} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCENARIOS */}
          {section === "scenarios" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="text-[12px] text-slate-500">{mockScenarios.length} сценариев</div>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded text-[12px] text-white hover:bg-blue-500 transition-colors">
                  <Icon name="Plus" size={12} />Создать сценарий
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {mockScenarios.map(s => (
                  <div key={s.id} className="bg-[#141920] border border-[#1e2837] rounded-lg p-4 flex items-center gap-6 hover:border-[#2a3a50] transition-colors">
                    <div className="w-8 h-8 rounded bg-blue-600/10 border border-blue-600/20 flex items-center justify-center">
                      <Icon name="Workflow" size={14} className="text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-slate-200">{s.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{s.steps} шагов · Последний запуск: {s.lastRun}</div>
                    </div>
                    <div className="flex items-center gap-6">
                      {s.successRate > 0 && (
                        <div className="text-right">
                          <div className="text-[12px] font-medium text-emerald-400">{s.successRate}%</div>
                          <div className="text-[10px] text-slate-600">успешность</div>
                        </div>
                      )}
                      <StatusBadge status={s.status} />
                      <div className="flex gap-1">
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-emerald-400 transition-colors"><Icon name="Play" size={13} /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Pencil" size={13} /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Copy" size={13} /></button>
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-red-400 transition-colors"><Icon name="Trash2" size={13} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOGS */}
          {section === "logs" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {["all", "info", "warn", "error"].map(f => (
                    <button key={f} className="px-3 py-1.5 rounded text-[11px] font-medium bg-[#141920] border border-[#1e2837] text-slate-400 hover:text-slate-200 hover:border-[#2a3a50] transition-colors capitalize">
                      {f === "all" ? "Все" : f.toUpperCase()}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <button className="flex items-center gap-2 px-3 py-1.5 bg-[#141920] border border-[#1e2837] rounded text-[12px] text-slate-400 hover:bg-[#1a2333] transition-colors">
                  <Icon name="Download" size={12} />Экспорт
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-[#141920] border border-[#1e2837] rounded text-[12px] text-slate-400 hover:bg-[#1a2333] transition-colors">
                  <Icon name="Trash2" size={12} />Очистить
                </button>
              </div>

              <div className="bg-[#141920] border border-[#1e2837] rounded-lg overflow-hidden">
                <div className="border-b border-[#1e2837] px-4 py-2.5 flex gap-6">
                  {["Время", "Уровень", "Браузер", "Сообщение"].map(h => (
                    <div key={h} className={`text-[11px] font-medium text-slate-500 uppercase tracking-widest ${h === "Сообщение" ? "flex-1" : h === "Браузер" ? "w-28" : "w-20"}`}>{h}</div>
                  ))}
                </div>
                <div className="divide-y divide-[#1a2333]">
                  {mockLogs.map(l => (
                    <div key={l.id} className="flex items-start gap-6 px-4 py-2.5 hover:bg-[#1a2333]/40 transition-colors">
                      <div className="w-20 font-mono text-[11px] text-slate-600 mt-0.5">{l.time}</div>
                      <div className="w-20 mt-0.5"><LogBadge level={l.level} /></div>
                      <div className="w-28 font-mono text-[11px] text-slate-400 mt-0.5">{l.browser}</div>
                      <div className="flex-1 text-[12px] text-slate-300 leading-relaxed">{l.message}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {section === "settings" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex border-b border-[#1e2837] gap-4 pb-0 mb-2">
                {["Общие", "Прокси"].map(t => (
                  <button
                    key={t}
                    onClick={() => setProxyTab(t === "Прокси")}
                    className={`pb-3 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
                      (t === "Прокси") === proxyTab
                        ? "text-blue-400 border-blue-400"
                        : "text-slate-500 border-transparent hover:text-slate-300"
                    }`}
                  >{t}</button>
                ))}
              </div>

              {!proxyTab && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Макс. параллельных браузеров", value: "16", type: "number" },
                    { label: "Таймаут подключения (сек)", value: "30", type: "number" },
                    { label: "Интервал ротации прокси (мин)", value: "15", type: "number" },
                    { label: "Путь к Chromium", value: "/usr/bin/chromium", type: "text" },
                    { label: "Директория профилей", value: "~/.browserctrl/profiles", type: "text" },
                    { label: "Директория логов", value: "~/.browserctrl/logs", type: "text" },
                  ].map(f => (
                    <div key={f.label} className="bg-[#141920] border border-[#1e2837] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">{f.label}</div>
                      <input
                        defaultValue={f.value}
                        type={f.type}
                        className="w-full bg-[#0c1017] border border-[#1e2837] rounded px-3 py-2 text-[13px] text-slate-200 font-mono outline-none focus:border-blue-500/50 transition-colors"
                      />
                    </div>
                  ))}

                  <div className="bg-[#141920] border border-[#1e2837] rounded-lg p-4">
                    <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-3">Опции запуска</div>
                    {[
                      { label: "Headless режим", checked: true },
                      { label: "Отключить изображения", checked: false },
                      { label: "Авто-ротация прокси при ошибке", checked: true },
                      { label: "Сохранять cookies между сессиями", checked: true },
                    ].map(opt => (
                      <label key={opt.label} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                        <div className={`w-8 h-4 rounded-full transition-colors ${opt.checked ? "bg-blue-600" : "bg-[#1e2837]"}`}>
                          <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${opt.checked ? "translate-x-4 ml-0.5" : "ml-0.5"}`} />
                        </div>
                        <span className="text-[12px] text-slate-400 group-hover:text-slate-300 transition-colors">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {proxyTab && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] text-slate-500">{mockProxies.length} прокси-серверов</div>
                    <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 rounded text-[12px] text-white hover:bg-blue-500 transition-colors">
                      <Icon name="Plus" size={12} />Добавить прокси
                    </button>
                  </div>
                  <div className="bg-[#141920] border border-[#1e2837] rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#1e2837]">
                          {["Хост", "Порт", "Тип", "Страна", "Статус", "Скорость", ""].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mockProxies.map((p, i) => (
                          <tr key={p.id} className={`border-b border-[#1a2333] hover:bg-[#1a2333]/50 transition-colors ${i === mockProxies.length - 1 ? "border-b-0" : ""}`}>
                            <td className="px-4 py-3 font-mono text-[12px] text-slate-200">{p.host}</td>
                            <td className="px-4 py-3 font-mono text-[12px] text-slate-400">{p.port}</td>
                            <td className="px-4 py-3">
                              <span className="text-[11px] font-mono font-medium text-slate-400 bg-[#1a2333] border border-[#2a3a50] px-2 py-0.5 rounded">{p.type}</span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-slate-400">{p.country}</td>
                            <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                            <td className="px-4 py-3">
                              {p.speed > 0 ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-[#1a2333] rounded-full h-1">
                                    <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${Math.min(p.speed, 100)}%` }} />
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-500">{p.speed}ms</span>
                                </div>
                              ) : <span className="text-[11px] text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="RefreshCw" size={11} /></button>
                                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-slate-300 transition-colors"><Icon name="Pencil" size={11} /></button>
                                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1e2837] text-slate-500 hover:text-red-400 transition-colors"><Icon name="Trash2" size={11} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
