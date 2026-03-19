import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";

type Section = "dashboard" | "browsers" | "accounts" | "scenarios" | "logs" | "settings" | "install";

type StepType = "navigate" | "click" | "type" | "wait" | "condition" | "screenshot" | "scroll" | "extract";

interface ScenarioStep {
  id: number;
  type: StepType;
  label: string;
  params: Record<string, string>;
}

interface Account {
  id: number;
  login: string;
  password: string;
  site: string;
  proxy: string;
  status: "active" | "inactive" | "banned";
  lastLogin: string;
}

interface Scenario {
  id: number;
  name: string;
  steps: ScenarioStep[];
  status: "active" | "draft" | "disabled";
  lastRun: string;
  successRate: number;
}

interface Proxy {
  id: number;
  host: string;
  port: number;
  type: "HTTP" | "SOCKS5" | "SOCKS4";
  country: string;
  status: "active" | "inactive" | "error";
  speed: number;
}

interface Settings {
  maxBrowsers: number;
  connectionTimeout: number;
  proxyRotationInterval: number;
  chromiumPath: string;
  profilesDir: string;
  logsDir: string;
  headless: boolean;
  disableImages: boolean;
  autoRotateProxy: boolean;
  saveCookies: boolean;
  fingerprintMasking: boolean;
}

interface ElectronBrowser {
  id: number;
  url: string;
  proxy: string;
  account: string;
  scenarioName: string;
  status: "running" | "paused" | "stopped" | "error" | "done";
  currentStep: number;
  totalSteps: number;
  cpu: number;
  mem: number;
}

interface ElectronAPI {
  launchBrowser: (opts: { url: string; proxy?: string; account?: string; scenarioName?: string; steps?: ScenarioStep[]; settings?: Settings }) => Promise<{ ok: boolean; data?: { id: number; url: string; proxy: string | null; account: string | null }; error?: string }>;
  closeBrowser: (id: number) => Promise<{ ok: boolean; error?: string }>;
  pauseBrowser: (id: number) => Promise<{ ok: boolean; error?: string }>;
  resumeBrowser: (id: number) => Promise<{ ok: boolean; error?: string }>;
  listBrowsers: () => Promise<{ ok: boolean; data?: ElectronBrowser[] }>;
  runScenario: (opts: { scenario: Scenario; accounts: Account[]; settings: Settings }) => Promise<{ ok: boolean; data?: Array<{ ok: boolean; accountLogin: string; data?: { id: number }; error?: string }> }>;
  getLogs: (filter?: string) => Promise<{ ok: boolean; data?: Array<{ id: number; time: string; level: string; browser: string; message: string }> }>;
  clearLogs: () => Promise<{ ok: boolean }>;
  onBrowserStatus: (cb: (data: { id: number; status?: string; currentStep?: number; totalSteps?: number }) => void) => () => void;
  onLog: (cb: (data: { id: number; time: string; level: string; browser: string; message: string }) => void) => () => void;
  openFileDialog: () => Promise<{ ok: boolean; path?: string }>;
}

function getElectronAPI(): ElectronAPI | undefined {
  if (typeof window !== "undefined") {
    return (window as Record<string, unknown>).electronAPI as ElectronAPI | undefined;
  }
}

const defaultSettings: Settings = {
  maxBrowsers: 16,
  connectionTimeout: 30,
  proxyRotationInterval: 15,
  chromiumPath: "/usr/bin/chromium",
  profilesDir: "~/.mba-browser/profiles",
  logsDir: "~/.mba-browser/logs",
  headless: true,
  disableImages: false,
  autoRotateProxy: true,
  saveCookies: true,
  fingerprintMasking: true,
};

const STEP_TYPES: { type: StepType; icon: string; label: string; color: string; fields: { key: string; label: string; placeholder: string }[] }[] = [
  { type: "navigate", icon: "Globe", label: "Открыть страницу", color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    fields: [{ key: "url", label: "URL", placeholder: "https://example.com" }] },
  { type: "click", icon: "MousePointer2", label: "Кликнуть", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    fields: [{ key: "selector", label: "CSS-селектор", placeholder: "#submit-btn" }, { key: "timeout", label: "Таймаут (мс)", placeholder: "3000" }] },
  { type: "type", icon: "Keyboard", label: "Ввести текст", color: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    fields: [{ key: "selector", label: "CSS-селектор", placeholder: "input[name='email']" }, { key: "value", label: "Текст", placeholder: "user@example.com" }] },
  { type: "wait", icon: "Timer", label: "Пауза", color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    fields: [{ key: "ms", label: "Задержка (мс)", placeholder: "1500" }] },
  { type: "condition", icon: "GitBranch", label: "Условие", color: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    fields: [{ key: "selector", label: "CSS-селектор", placeholder: ".error-message" }, { key: "action", label: "Действие если найден", placeholder: "stop / retry / skip" }] },
  { type: "extract", icon: "Database", label: "Извлечь данные", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    fields: [{ key: "selector", label: "CSS-селектор", placeholder: "table.prices td" }, { key: "attr", label: "Атрибут (или text)", placeholder: "text" }, { key: "varName", label: "Переменная", placeholder: "price" }] },
  { type: "scroll", icon: "ArrowDownUp", label: "Прокрутить", color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
    fields: [{ key: "direction", label: "Направление", placeholder: "down / up / to-element" }, { key: "selector", label: "Элемент (опц.)", placeholder: "#footer" }] },
  { type: "screenshot", icon: "Camera", label: "Скриншот", color: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    fields: [{ key: "name", label: "Имя файла", placeholder: "result.png" }] },
];

const defaultSteps: ScenarioStep[] = [
  { id: 1, type: "navigate", label: "Открыть страницу", params: { url: "https://example.com" } },
  { id: 2, type: "click", label: "Кликнуть", params: { selector: "#login-btn", timeout: "3000" } },
  { id: 3, type: "type", label: "Ввести текст", params: { selector: "input[name='email']", value: "" } },
  { id: 4, type: "wait", label: "Пауза", params: { ms: "1500" } },
];

const mockBrowsers = [
  { id: 1, name: "Chrome #001", status: "running", proxy: "185.22.11.4:8080", account: "user@mail.ru", cpu: 12, mem: 245 },
  { id: 2, name: "Chrome #002", status: "running", proxy: "91.108.4.11:3128", account: "admin@corp.com", cpu: 8, mem: 198 },
  { id: 3, name: "Chrome #003", status: "paused", proxy: "195.144.21.7:8888", account: "test@test.ru", cpu: 0, mem: 134 },
  { id: 4, name: "Chrome #004", status: "stopped", proxy: "78.46.90.11:1080", account: "bot@service.io", cpu: 0, mem: 0 },
  { id: 5, name: "Chrome #005", status: "running", proxy: "94.130.55.22:9090", account: "worker@app.ru", cpu: 19, mem: 312 },
  { id: 6, name: "Chrome #006", status: "error", proxy: "5.180.61.24:3000", account: "sys@domain.net", cpu: 0, mem: 87 },
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

const mockProxies: Proxy[] = [
  { id: 1, host: "185.22.11.4", port: 8080, type: "HTTP", country: "RU", status: "active", speed: 45 },
  { id: 2, host: "91.108.4.11", port: 3128, type: "HTTP", country: "DE", status: "active", speed: 12 },
  { id: 3, host: "195.144.21.7", port: 8888, type: "SOCKS5", country: "NL", status: "active", speed: 28 },
  { id: 4, host: "78.46.90.11", port: 1080, type: "SOCKS5", country: "US", status: "error", speed: 0 },
  { id: 5, host: "94.130.55.22", port: 9090, type: "HTTP", country: "PL", status: "active", speed: 67 },
  { id: 6, host: "5.180.61.24", port: 3000, type: "HTTP", country: "UA", status: "inactive", speed: 0 },
];

// ── Shared UI components ───────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; cls: string }> = {
    running: { label: "Работает", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    paused: { label: "Пауза", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
    stopped: { label: "Остановлен", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    done: { label: "Завершён", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    error: { label: "Ошибка", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    active: { label: "Активен", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    inactive: { label: "Неактивен", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    banned: { label: "Заблокирован", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    draft: { label: "Черновик", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
    disabled: { label: "Отключён", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" },
    dead: { label: "Недоступен", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  const s = map[status] ?? { label: status, cls: "bg-slate-500/15 text-slate-400" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium tracking-wide ${s.cls}`}>{s.label}</span>;
};

const LogBadge = ({ level }: { level: string }) => {
  const map: Record<string, string> = {
    info: "text-violet-400",
    warn: "text-amber-400",
    error: "text-red-400",
  };
  return <span className={`font-mono text-[11px] uppercase font-semibold ${map[level] ?? "text-slate-400"}`}>{level}</span>;
};

const StatCard = ({ icon, label, value, sub, accent }: { icon: string; label: string; value: string | number; sub?: string; accent?: string }) => (
  <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-5 flex flex-col gap-3 animate-fade-in">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-widest">{label}</span>
      <div className={`w-8 h-8 rounded flex items-center justify-center ${accent ?? "bg-violet-500/10"}`}>
        <Icon name={icon} size={16} className="text-violet-400" />
      </div>
    </div>
    <div className="font-ibm text-3xl font-semibold text-slate-100 leading-none">{value}</div>
    {sub && <div className="text-[12px] text-slate-500">{sub}</div>}
  </div>
);

const Pagination = ({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) => {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-[#2f2445]">
      <div className="text-[11px] text-slate-500">
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} из {total}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="w-7 h-7 flex items-center justify-center rounded border border-[#2f2445] text-slate-400 hover:bg-[#251a38] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="ChevronLeft" size={13} />
        </button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p = i + 1;
          if (totalPages > 5) {
            if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
          }
          return (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={`w-7 h-7 flex items-center justify-center rounded text-[12px] transition-colors ${p === page ? "bg-violet-600 text-white" : "border border-[#2f2445] text-slate-400 hover:bg-[#251a38]"}`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="w-7 h-7 flex items-center justify-center rounded border border-[#2f2445] text-slate-400 hover:bg-[#251a38] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Icon name="ChevronRight" size={13} />
        </button>
      </div>
    </div>
  );
};

// ── ScenarioModal ──────────────────────────────────────────────────────────────
function ScenarioModal({
  onClose,
  scenarioName,
  initialSteps,
  onSave,
}: {
  onClose: () => void;
  scenarioName?: string;
  initialSteps?: ScenarioStep[];
  onSave: (name: string, steps: ScenarioStep[]) => void;
}) {
  const [name, setName] = useState(scenarioName ?? "Новый сценарий");
  const [steps, setSteps] = useState<ScenarioStep[]>(
    initialSteps ?? (scenarioName ? defaultSteps : [])
  );
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const addStep = (type: StepType) => {
    const def = STEP_TYPES.find(t => t.type === type)!;
    const params: Record<string, string> = {};
    def.fields.forEach(f => { params[f.key] = ""; });
    const newStep: ScenarioStep = { id: Date.now(), type, label: def.label, params };
    setSteps(prev => [...prev, newStep]);
    setSelectedStep(newStep.id);
    setShowPicker(false);
  };

  const removeStep = (id: number) => {
    setSteps(prev => prev.filter(s => s.id !== id));
    if (selectedStep === id) setSelectedStep(null);
  };

  const updateParam = (id: number, key: string, value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, params: { ...s.params, [key]: value } } : s));
  };

  const moveStep = (from: number, to: number) => {
    const arr = [...steps];
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    setSteps(arr);
  };

  const active = steps.find(s => s.id === selectedStep);
  const activeDef = active ? STEP_TYPES.find(t => t.type === active.type) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-[860px] max-h-[90vh] bg-[#0f0a1a] border border-[#2f2445] rounded-xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-[#2f2445] flex-shrink-0">
          <div className="w-8 h-8 rounded bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
            <Icon name="Workflow" size={15} className="text-violet-400" />
          </div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="flex-1 bg-transparent text-[15px] font-semibold text-slate-100 outline-none placeholder-slate-600 border-b border-transparent focus:border-violet-500/40 transition-colors pb-0.5"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSave(name, steps)}
              className="px-4 py-1.5 bg-violet-600 rounded text-[12px] text-white hover:bg-violet-500 transition-colors font-medium"
            >
              Сохранить
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#251a38] text-slate-500 hover:text-slate-300 transition-colors">
              <Icon name="X" size={15} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Steps list */}
          <div className="w-64 border-r border-[#2f2445] flex flex-col flex-shrink-0">
            <div className="px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest border-b border-[#2f2445] flex items-center justify-between">
              <span>Шаги ({steps.length})</span>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-1">
              {steps.map((step, idx) => {
                const def = STEP_TYPES.find(t => t.type === step.type)!;
                return (
                  <div
                    key={step.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={e => { e.preventDefault(); setOverIdx(idx); }}
                    onDrop={() => { if (dragIdx !== null && dragIdx !== idx) moveStep(dragIdx, idx); setDragIdx(null); setOverIdx(null); }}
                    onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                    onClick={() => setSelectedStep(step.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded cursor-pointer transition-all select-none ${
                      selectedStep === step.id
                        ? "bg-[#2a1845] border border-violet-500/30"
                        : overIdx === idx
                        ? "bg-[#251a38] border border-dashed border-[#3a2855]"
                        : "hover:bg-[#1f1535] border border-transparent"
                    }`}
                  >
                    <div className="text-[10px] font-mono text-slate-600 w-4 text-right flex-shrink-0">{idx + 1}</div>
                    <div className={`w-6 h-6 rounded flex items-center justify-center border flex-shrink-0 ${def.color}`}>
                      <Icon name={def.icon} size={11} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-slate-300 truncate">{def.label}</div>
                      {Object.values(step.params)[0] && (
                        <div className="text-[10px] text-slate-600 truncate font-mono">{Object.values(step.params)[0]}</div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-500/20 text-slate-600 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                    >
                      <Icon name="X" size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="p-2 border-t border-[#2f2445]">
              <button
                onClick={() => setShowPicker(!showPicker)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded border border-dashed border-[#2f2445] text-[12px] text-slate-500 hover:text-slate-300 hover:border-[#3a2855] transition-colors"
              >
                <Icon name="Plus" size={13} />
                Добавить шаг
              </button>
            </div>
          </div>

          {/* Step picker */}
          {showPicker && (
            <div className="w-52 border-r border-[#2f2445] flex flex-col flex-shrink-0">
              <div className="px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest border-b border-[#2f2445]">
                Тип шага
              </div>
              <div className="flex-1 overflow-auto p-2 space-y-0.5">
                {STEP_TYPES.map(def => (
                  <button
                    key={def.type}
                    onClick={() => addStep(def.type)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded hover:bg-[#1f1535] transition-colors text-left"
                  >
                    <div className={`w-6 h-6 rounded flex items-center justify-center border flex-shrink-0 ${def.color}`}>
                      <Icon name={def.icon} size={11} />
                    </div>
                    <span className="text-[12px] text-slate-300">{def.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step editor */}
          <div className="flex-1 overflow-auto p-5">
            {active && activeDef ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-8 h-8 rounded flex items-center justify-center border ${activeDef.color}`}>
                    <Icon name={activeDef.icon} size={15} />
                  </div>
                  <div>
                    <div className="text-[14px] font-semibold text-slate-100">{activeDef.label}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{active.type}</div>
                  </div>
                  <button
                    onClick={() => removeStep(active.id)}
                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                  >
                    <Icon name="Trash2" size={12} />
                    Удалить шаг
                  </button>
                </div>
                {activeDef.fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">{field.label}</label>
                    {active.type === "scroll" && field.key === "direction" ? (
                      <div className="flex gap-2">
                        {[
                          { value: "down", icon: "ArrowDown", label: "Вниз" },
                          { value: "up", icon: "ArrowUp", label: "Вверх" },
                          { value: "to-element", icon: "Crosshair", label: "К элементу" },
                        ].map(opt => {
                          const selected = (active.params.direction || "down") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => updateParam(active.id, "direction", opt.value)}
                              className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded border text-[11px] font-medium transition-all ${
                                selected
                                  ? "border-slate-500/50 bg-slate-500/15 text-slate-200"
                                  : "border-[#2f2445] bg-[#0a0612] text-slate-500 hover:border-[#3a2855] hover:bg-[#1a1028] hover:text-slate-300"
                              }`}
                            >
                              <Icon name={opt.icon} size={15} />
                              {opt.label}
                              {selected && <div className="w-1 h-1 rounded-full bg-slate-400" />}
                            </button>
                          );
                        })}
                      </div>
                    ) : active.type === "condition" && field.key === "action" ? (
                      <div className="space-y-2">
                        {[
                          { value: "skip", icon: "SkipForward", label: "Пропустить шаг", desc: "Если элемент найден — перейти к следующему шагу", color: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
                          { value: "stop", icon: "OctagonX", label: "Остановить сценарий", desc: "Если элемент найден — прекратить выполнение", color: "border-red-500/40 bg-red-500/10 text-red-300" },
                          { value: "retry", icon: "RotateCcw", label: "Повторить с начала", desc: "Если элемент найден — перезапустить сценарий с шага 1", color: "border-violet-500/40 bg-violet-500/10 text-violet-300" },
                        ].map(opt => {
                          const selected = (active.params.action || "skip") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => updateParam(active.id, "action", opt.value)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded border text-left transition-all ${
                                selected
                                  ? opt.color
                                  : "border-[#2f2445] bg-[#0a0612] text-slate-400 hover:border-[#3a2855] hover:bg-[#1a1028]"
                              }`}
                            >
                              <Icon name={opt.icon} size={15} className="flex-shrink-0" />
                              <div>
                                <div className="text-[12px] font-medium leading-none mb-1">{opt.label}</div>
                                <div className="text-[11px] opacity-70 leading-snug">{opt.desc}</div>
                              </div>
                              {selected && <Icon name="Check" size={13} className="ml-auto flex-shrink-0" />}
                            </button>
                          );
                        })}
                        <div className="mt-3 px-3 py-2 bg-[#1a1028] border border-[#2f2445] rounded text-[11px] text-slate-500 leading-relaxed">
                          <span className="text-slate-400 font-medium">Как работает:</span> браузер ищет элемент по CSS-селектору. Если <span className="text-emerald-400">найден</span> — выполняет выбранное действие. Если <span className="text-slate-400">не найден</span> — продолжает выполнение.
                        </div>
                      </div>
                    ) : (
                      <input
                        value={active.params[field.key] ?? ""}
                        onChange={e => updateParam(active.id, field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full bg-[#0a0612] border border-[#2f2445] rounded px-3 py-2 text-[13px] text-slate-200 font-mono outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-600">
                <Icon name="MousePointer2" size={32} className="mb-3 opacity-30" />
                <div className="text-[13px]">Выберите шаг для редактирования</div>
                <div className="text-[11px] mt-1">или добавьте новый шаг</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AccountModal ───────────────────────────────────────────────────────────────
function AccountModal({
  account,
  onClose,
  onSave,
}: {
  account?: Account;
  onClose: () => void;
  onSave: (data: Omit<Account, "id" | "lastLogin">) => void;
}) {
  const [login, setLogin] = useState(account?.login ?? "");
  const [password, setPassword] = useState(account?.password ?? "");
  const [site, setSite] = useState(account?.site ?? "");
  const [proxy, setProxy] = useState(account?.proxy ?? "");
  const [status, setStatus] = useState<Account["status"]>(account?.status ?? "active");

  const handleSave = () => {
    if (!login.trim()) return;
    onSave({ login, password, site, proxy, status });
  };

  const inputCls = "w-full bg-[#0a0612] border border-[#2f2445] rounded px-3 py-2 text-[13px] text-slate-200 font-mono outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f0a1a] border border-[#2f2445] rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
              <Icon name="User" size={15} className="text-violet-400" />
            </div>
            <div className="text-[14px] font-semibold text-slate-100">
              {account ? "Редактировать аккаунт" : "Новый аккаунт"}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#251a38] text-slate-500 hover:text-slate-300 transition-colors">
            <Icon name="X" size={15} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Логин *</label>
            <input value={login} onChange={e => setLogin(e.target.value)} placeholder="user@example.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Пароль</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Сайт</label>
            <input value={site} onChange={e => setSite(e.target.value)} placeholder="https://example.com" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Прокси</label>
            <input value={proxy} onChange={e => setProxy(e.target.value)} placeholder="host:port" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Статус</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as Account["status"])}
              className={inputCls}
            >
              <option value="active">Активен</option>
              <option value="inactive">Неактивен</option>
              <option value="banned">Заблокирован</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 bg-[#0a0612] border border-[#2f2445] rounded text-[13px] text-slate-400 hover:text-slate-200 hover:bg-[#1a1028] transition-colors">
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!login.trim()}
            className="flex-1 py-2 bg-violet-600 rounded text-[13px] text-white hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {account ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ProxyModal ─────────────────────────────────────────────────────────────────
function ProxyModal({
  proxy,
  onClose,
  onSave,
}: {
  proxy?: Proxy;
  onClose: () => void;
  onSave: (data: Omit<Proxy, "id" | "status" | "speed">) => void;
}) {
  const [host, setHost] = useState(proxy?.host ?? "");
  const [port, setPort] = useState(proxy?.port?.toString() ?? "");
  const [type, setType] = useState<Proxy["type"]>(proxy?.type ?? "HTTP");
  const [country, setCountry] = useState(proxy?.country ?? "");

  const handleSave = () => {
    if (!host.trim() || !port.trim()) return;
    onSave({ host, port: Number(port), type, country });
  };

  const inputCls = "w-full bg-[#0a0612] border border-[#2f2445] rounded px-3 py-2 text-[13px] text-slate-200 font-mono outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f0a1a] border border-[#2f2445] rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
              <Icon name="Server" size={15} className="text-violet-400" />
            </div>
            <div className="text-[14px] font-semibold text-slate-100">
              {proxy ? "Редактировать прокси" : "Новый прокси"}
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#251a38] text-slate-500 hover:text-slate-300 transition-colors">
            <Icon name="X" size={15} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Хост *</label>
            <input value={host} onChange={e => setHost(e.target.value)} placeholder="185.22.11.4" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Порт *</label>
            <input value={port} onChange={e => setPort(e.target.value)} type="number" placeholder="8080" className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Тип</label>
            <select value={type} onChange={e => setType(e.target.value as Proxy["type"])} className={inputCls}>
              <option value="HTTP">HTTP</option>
              <option value="SOCKS5">SOCKS5</option>
              <option value="SOCKS4">SOCKS4</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">Страна</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="RU" className={inputCls} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 bg-[#0a0612] border border-[#2f2445] rounded text-[13px] text-slate-400 hover:text-slate-200 hover:bg-[#1a1028] transition-colors">
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!host.trim() || !port.trim()}
            className="flex-1 py-2 bg-violet-600 rounded text-[13px] text-white hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {proxy ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RunModal ───────────────────────────────────────────────────────────────────
function RunModal({
  scenario,
  accounts,
  settings,
  onClose,
  setLiveBrowsers,
  setScenarios,
}: {
  scenario: Scenario;
  accounts: Account[];
  settings: Settings;
  onClose: () => void;
  setLiveBrowsers: React.Dispatch<React.SetStateAction<ElectronBrowser[]>>;
  setScenarios: React.Dispatch<React.SetStateAction<Scenario[]>>;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(accounts.map(a => a.id)));
  const clearAll = () => setSelected(new Set());

  const handleRun = async () => {
    const api = getElectronAPI();
    if (!api) {
      // fallback: log only
      console.log("[RunModal] RunScenario (no electron):", scenario.name, Array.from(selected));
      onClose();
      return;
    }
    const selectedAccounts = accounts.filter(a => selected.has(a.id));
    const result = await api.runScenario({ scenario, accounts: selectedAccounts, settings });
    if (result.ok && result.data) {
      const listRes = await api.listBrowsers();
      if (listRes.ok && listRes.data) setLiveBrowsers(listRes.data);
      const now = new Date();
      const lastRun = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      setScenarios(prev => prev.map(s => s.id === scenario.id ? { ...s, lastRun, status: "active" as const } : s));
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#1a1028] border border-[#2f2445] rounded-xl shadow-2xl w-full max-w-md p-6 space-y-5 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-emerald-600/20 border border-emerald-600/30 flex items-center justify-center">
              <Icon name="Play" size={16} className="text-emerald-400" />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-slate-100">Запустить: {scenario.name}</div>
              <div className="text-[11px] text-slate-500">Выберите аккаунты для запуска</div>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#251a38] text-slate-500 hover:text-slate-300 transition-colors">
            <Icon name="X" size={15} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 bg-[#0a0612] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:text-slate-200 hover:bg-[#251a38] transition-colors"
          >
            Выбрать все
          </button>
          <button
            onClick={clearAll}
            className="px-3 py-1.5 bg-[#0a0612] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:text-slate-200 hover:bg-[#251a38] transition-colors"
          >
            Снять выбор
          </button>
          <div className="flex-1 text-right text-[11px] text-slate-500">
            Выбрано: {selected.size}
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-6 text-[13px] text-slate-500">
            <Icon name="Users" size={24} className="mx-auto mb-2 opacity-30" />
            Нет аккаунтов. Добавьте аккаунты в разделе «Аккаунты».
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-auto pr-1">
            {accounts.map(account => (
              <label
                key={account.id}
                className={`flex items-center gap-3 px-3 py-2.5 rounded border cursor-pointer transition-colors ${
                  selected.has(account.id)
                    ? "bg-[#2a1845] border-violet-500/30"
                    : "bg-[#0a0612] border-[#2f2445] hover:bg-[#1a1028]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(account.id)}
                  onChange={() => toggle(account.id)}
                  className="w-3.5 h-3.5 accent-violet-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-slate-200 truncate font-mono">{account.login}</div>
                  <div className="text-[10px] text-slate-500 truncate">{account.site || "—"}</div>
                </div>
                <StatusBadge status={account.status} />
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-[#0a0612] border border-[#2f2445] rounded text-[13px] text-slate-400 hover:text-slate-200 hover:bg-[#1a1028] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleRun}
            disabled={selected.size === 0}
            className="flex-1 py-2 bg-emerald-600 rounded text-[13px] text-white hover:bg-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Запустить {selected.size > 0 ? `${selected.size} браузер${selected.size === 1 ? "" : selected.size < 5 ? "а" : "ов"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ConfirmDeleteModal ─────────────────────────────────────────────────────────
function ConfirmDeleteModal({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#0f0a1a] border border-[#2f2445] rounded-xl shadow-2xl w-80 p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-red-600/20 border border-red-600/30 flex items-center justify-center flex-shrink-0">
            <Icon name="Trash2" size={15} className="text-red-400" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-slate-100">Удалить "{name}"?</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Это действие нельзя отменить.</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-[#0a0612] border border-[#2f2445] rounded text-[13px] text-slate-400 hover:text-slate-200 hover:bg-[#1a1028] transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 bg-red-600 rounded text-[13px] text-white hover:bg-red-500 transition-colors"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Index() {
  const [section, setSection] = useState<Section>("dashboard");
  const [proxyTab, setProxyTab] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; type: string; id: number; name: string } | null>(null);

  // Toast notification
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // Electron detection
  const [isElectron] = useState(() => !!getElectronAPI());

  // Live browsers (Electron only)
  const [liveBrowsers, setLiveBrowsers] = useState<ElectronBrowser[]>([]);

  // Accounts state with localStorage persistence
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try { return JSON.parse(localStorage.getItem("bc_accounts") || "[]"); } catch { return []; }
  });
  const [accountModal, setAccountModal] = useState<{ open: boolean; account?: Account }>({ open: false });

  // Scenarios state with localStorage persistence
  const [scenarios, setScenarios] = useState<Scenario[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("bc_scenarios") || "[]");
      if (saved.length > 0) return saved;
      // Сценарий по умолчанию
      const defaults: Scenario[] = [
        {
          id: 1,
          name: "MBA Agency — финансы 16.03",
          steps: [
            { id: 1, type: "navigate", label: "Открыть сайт", params: { url: "https://mba-agency.ru/" } },
            { id: 2, type: "click", label: "Кликнуть «Войти»", params: { selector: "a[href*='login'], a[href*='signin'], .login-btn, [data-action='login']", timeout: "5000" } },
            { id: 3, type: "type", label: "Ввести логин", params: { selector: "input[type='email'], input[name='email'], input[name='login'], input[name='username']", value: "GenadP@mba.com" } },
            { id: 4, type: "type", label: "Ввести пароль", params: { selector: "input[type='password']", value: "GenaPonyazhin890" } },
            { id: 5, type: "click", label: "Нажать «Войти»", params: { selector: "button[type='submit'], input[type='submit'], .btn-login, .login-submit", timeout: "3000" } },
            { id: 6, type: "wait", label: "Ждать загрузки", params: { ms: "2000" } },
            { id: 7, type: "click", label: "Перейти в раздел «Модели»", params: { selector: "a[href*='model'], nav a:has-text('Модели'), .menu-item-models", timeout: "5000" } },
            { id: 8, type: "wait", label: "Ждать загрузки", params: { ms: "1500" } },
            { id: 9, type: "click", label: "Перейти в «Финансы моделей»", params: { selector: "a[href*='financ'], a[href*='finance'], a[href*='money'], a:has-text('Финанс')", timeout: "5000" } },
            { id: 10, type: "wait", label: "Ждать загрузки", params: { ms: "1500" } },
            { id: 11, type: "click", label: "Поставить галочку 16.03", params: { selector: "input[type='checkbox'][data-date='16.03'], tr:has-text('16.03') input[type='checkbox'], .date-16 input[type='checkbox']", timeout: "5000" } },
            { id: 12, type: "type", label: "Ввести 2222 в Stripchat online 16.03", params: { selector: "input[name*='stripchat'][data-date*='16'], tr:has-text('16.03') input[name*='stripchat'], .stripchat-16 input", value: "2222" } },
            { id: 13, type: "click", label: "Сохранить", params: { selector: "button[type='submit'], .btn-save, button:has-text('Сохранить')", timeout: "3000" } },
            { id: 14, type: "wait", label: "Ждать сохранения", params: { ms: "1500" } },
            { id: 15, type: "screenshot", label: "Скриншот результата", params: { name: "mba_finance_16_03.png" } },
          ],
          status: "active",
          lastRun: "—",
          successRate: 0,
        },
      ];
      localStorage.setItem("bc_scenarios", JSON.stringify(defaults));
      return defaults;
    } catch { return []; }
  });
  const [scenarioModal, setScenarioModal] = useState<{ open: boolean; scenario?: Scenario }>({ open: false });

  // Run modal
  const [runModal, setRunModal] = useState<{ open: boolean; scenario?: Scenario }>({ open: false });

  // Proxies state with localStorage persistence
  const [proxies, setProxies] = useState<Proxy[]>(() => {
    try {
      const saved = localStorage.getItem("bc_proxies");
      return saved ? JSON.parse(saved) : mockProxies;
    } catch { return mockProxies; }
  });
  const [proxyModal, setProxyModal] = useState<{ open: boolean; proxy?: Proxy }>({ open: false });

  // Settings state
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const saved = localStorage.getItem("bc_settings");
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch { return defaultSettings; }
  });
  const [chromeCheckStatus, setChromeCheckStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [chromeCheckMsg, setChromeCheckMsg] = useState("");

  // Logs state
  const [logs, setLogs] = useState(mockLogs);
  const [logFilter, setLogFilter] = useState<string>("all");

  // Browser states (mock, used when not in Electron)
  const [browserStates, setBrowserStates] = useState<Record<number, "running" | "paused" | "stopped">>(() => {
    const init: Record<number, "running" | "paused" | "stopped"> = {};
    mockBrowsers.forEach(b => {
      init[b.id] = (b.status === "running" || b.status === "paused" || b.status === "stopped")
        ? (b.status as "running" | "paused" | "stopped")
        : "stopped";
    });
    return init;
  });

  // Mock CPU/RAM simulation for non-Electron mode
  const [mockStats, setMockStats] = useState<Record<number, { cpu: number; mem: number }>>(() => {
    const init: Record<number, { cpu: number; mem: number }> = {};
    mockBrowsers.forEach(b => { init[b.id] = { cpu: b.cpu, mem: b.mem }; });
    return init;
  });

  // Launch browser modal
  const [launchModal, setLaunchModal] = useState(false);
  const [launchUrl, setLaunchUrl] = useState("");
  const [launchProxy, setLaunchProxy] = useState("");
  const [launchLoading, setLaunchLoading] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [launchResult, setLaunchResult] = useState<string | null>(null);

  // Pagination
  const [accountPage, setAccountPage] = useState(1);
  const [browserPage, setBrowserPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const PAGE_SIZE = 10;

  // ── Electron: subscribe to live data ──────────────────────────────────────
  useEffect(() => {
    const api = getElectronAPI();
    if (!api) return;

    // Initial browser list
    api.listBrowsers().then(res => {
      if (res.ok && res.data) setLiveBrowsers(res.data);
    });

    // Subscribe to browser status updates
    const unsubStatus = api.onBrowserStatus((data) => {
      setLiveBrowsers(prev => {
        const idx = prev.findIndex(b => b.id === data.id);
        if (idx === -1) {
          // Unknown browser — refresh full list
          api.listBrowsers().then(res => {
            if (res.ok && res.data) setLiveBrowsers(res.data);
          });
          return prev;
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...data };
        return updated;
      });
    });

    // Subscribe to incoming logs
    const unsubLog = api.onLog((log) => {
      setLogs(prev =>
        [{ id: log.id, time: log.time, level: log.level as "info" | "warn" | "error", browser: log.browser, message: log.message }, ...prev].slice(0, 500)
      );
    });

    // Poll every 3s for CPU/RAM updates
    const interval = setInterval(() => {
      api.listBrowsers().then(res => {
        if (res.ok && res.data) setLiveBrowsers(res.data);
      });
    }, 3000);

    return () => {
      unsubStatus();
      unsubLog();
      clearInterval(interval);
    };
  }, []);

  // ── Electron: pull logs when entering logs section ─────────────────────────
  useEffect(() => {
    const api = getElectronAPI();
    if (!api || section !== "logs") return;
    api.getLogs().then(res => {
      if (res.ok && res.data && res.data.length > 0) {
        setLogs(res.data.map(l => ({
          id: l.id,
          time: l.time,
          level: l.level as "info" | "warn" | "error",
          browser: l.browser,
          message: l.message,
        })));
      }
    });
  }, [section]);

  // ── Persist accounts ───────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("bc_accounts", JSON.stringify(accounts));
  }, [accounts]);

  // ── Persist scenarios ──────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("bc_scenarios", JSON.stringify(scenarios));
  }, [scenarios]);

  // ── Persist proxies ────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("bc_proxies", JSON.stringify(proxies));
  }, [proxies]);

  // ── Reset pagination on search ─────────────────────────────────────────────
  useEffect(() => { setAccountPage(1); }, [searchQuery]);
  useEffect(() => { setBrowserPage(1); }, [searchQuery]);
  useEffect(() => { setLogPage(1); }, [searchQuery, logFilter]);

  // ── Simulate live CPU/RAM in non-Electron mode ─────────────────────────────
  useEffect(() => {
    if (isElectron) return;
    const interval = setInterval(() => {
      setMockStats(prev => {
        const next = { ...prev };
        mockBrowsers.forEach(b => {
          const state = browserStates[b.id] ?? b.status;
          if (state === "running") {
            next[b.id] = {
              cpu: Math.max(1, Math.min(95, (prev[b.id]?.cpu ?? b.cpu) + (Math.random() * 10 - 5))),
              mem: Math.max(50, Math.min(600, (prev[b.id]?.mem ?? b.mem) + (Math.random() * 20 - 10))),
            };
          } else {
            next[b.id] = { cpu: 0, mem: prev[b.id]?.mem ?? b.mem };
          }
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [isElectron, browserStates]);

  // ── Account CRUD ───────────────────────────────────────────────────────────
  const saveAccount = (data: Omit<Account, "id" | "lastLogin">) => {
    if (accountModal.account) {
      setAccounts(prev => prev.map(a =>
        a.id === accountModal.account!.id ? { ...a, ...data } : a
      ));
    } else {
      const now = new Date();
      const lastLogin = `${now.getDate().toString().padStart(2, "0")}.${(now.getMonth() + 1).toString().padStart(2, "0")}.${now.getFullYear()} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      setAccounts(prev => [...prev, { id: Date.now(), lastLogin, ...data }]);
    }
    setAccountModal({ open: false });
  };

  const deleteAccount = (id: number) => {
    setAccounts(prev => prev.filter(a => a.id !== id));
  };

  const exportAccounts = () => {
    const header = "login,password,site,proxy,status,lastLogin";
    const rows = accounts.map(a => `${a.login},${a.password},${a.site},${a.proxy},${a.status},${a.lastLogin}`);
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `accounts-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast("Аккаунты экспортированы");
  };

  const importAccounts = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split("\n").slice(1); // skip header
      const imported: Account[] = lines.map((line, i) => {
        const [login, password, site, proxy, status] = line.split(",");
        return {
          id: Date.now() + i,
          login: login?.trim() || "",
          password: password?.trim() || "",
          site: site?.trim() || "",
          proxy: proxy?.trim() || "",
          status: (status?.trim() as "active" | "inactive" | "banned") || "inactive",
          lastLogin: "—",
        };
      }).filter(a => a.login);
      setAccounts(prev => [...prev, ...imported]);
      showToast(`Импортировано ${imported.length} аккаунтов`);
    };
    reader.readAsText(file);
  };

  // ── Scenario CRUD ──────────────────────────────────────────────────────────
  const saveScenario = (name: string, steps: ScenarioStep[]) => {
    if (scenarioModal.scenario) {
      setScenarios(prev => prev.map(s =>
        s.id === scenarioModal.scenario!.id ? { ...s, name, steps } : s
      ));
    } else {
      const newScenario: Scenario = {
        id: Date.now(),
        name,
        steps,
        status: "draft",
        lastRun: "—",
        successRate: 0,
      };
      setScenarios(prev => [...prev, newScenario]);
    }
    setScenarioModal({ open: false });
  };

  const deleteScenario = (id: number) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
  };

  // ── Proxy CRUD ─────────────────────────────────────────────────────────────
  const saveProxy = (data: Omit<Proxy, "id" | "status" | "speed">) => {
    if (proxyModal.proxy) {
      setProxies(prev => prev.map(p =>
        p.id === proxyModal.proxy!.id ? { ...p, ...data } : p
      ));
    } else {
      setProxies(prev => [...prev, { id: Date.now(), status: "inactive", speed: 0, ...data }]);
    }
    setProxyModal({ open: false });
  };

  const deleteProxy = (id: number) => {
    setProxies(prev => prev.filter(p => p.id !== id));
  };

  const exportProxies = () => {
    const header = "host,port,type,country";
    const rows = proxies.map(p => `${p.host},${p.port},${p.type},${p.country}`);
    const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `proxies-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    showToast("Прокси экспортированы");
  };

  const importProxies = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.trim().split("\n").slice(1);
      const imported: Proxy[] = lines.map((line, i) => {
        const [host, port, type, country] = line.split(",");
        return {
          id: Date.now() + i,
          host: host?.trim() || "",
          port: parseInt(port?.trim() || "0"),
          type: (type?.trim() as "HTTP" | "SOCKS5" | "SOCKS4") || "HTTP",
          country: country?.trim() || "—",
          status: "inactive" as const,
          speed: 0,
        };
      }).filter(p => p.host && p.port);
      setProxies(prev => [...prev, ...imported]);
      showToast(`Импортировано ${imported.length} прокси`);
    };
    reader.readAsText(file);
  };

  const refreshProxy = async (id: number) => {
    const proxy = proxies.find(p => p.id === id);
    if (!proxy) return;
    setProxies(prev => prev.map(p => p.id === id ? { ...p, status: "inactive", speed: 0 } : p));
    const start = Date.now();
    try {
      await fetch(`https://${proxy.host}:${proxy.port}`, {
        method: "HEAD",
        mode: "no-cors",
        signal: AbortSignal.timeout(5000),
      });
      const speed = Date.now() - start;
      setProxies(prev => prev.map(p => p.id === id ? { ...p, status: "active", speed } : p));
      showToast(`Прокси ${proxy.host}:${proxy.port} — ${speed}мс`);
    } catch {
      setProxies(prev => prev.map(p => p.id === id ? { ...p, status: "error", speed: 0 } : p));
      showToast(`Прокси ${proxy.host}:${proxy.port} недоступен`);
    }
  };

  // ── Browser controls ───────────────────────────────────────────────────────
  const setBrowserStatus = (id: number, status: "running" | "paused" | "stopped") => {
    const api = getElectronAPI();
    if (api) {
      if (status === "running") {
        api.resumeBrowser(id);
      } else if (status === "paused") {
        api.pauseBrowser(id);
      } else {
        api.closeBrowser(id).then(() => {
          setLiveBrowsers(prev => prev.filter(lb => lb.id !== id));
        });
      }
    } else {
      setBrowserStates(prev => ({ ...prev, [id]: status }));
    }
  };

  const runAllBrowsers = () => {
    const api = getElectronAPI();
    if (api) {
      liveBrowsers.forEach(b => {
        if (b.status !== "running") api.resumeBrowser(b.id);
      });
    } else {
      setBrowserStates(prev => {
        const next = { ...prev };
        mockBrowsers.forEach(b => { next[b.id] = "running"; });
        return next;
      });
    }
  };

  // ── Settings ───────────────────────────────────────────────────────────────
  const saveSettings = () => {
    localStorage.setItem("bc_settings", JSON.stringify(settings));
    showToast("Сохранено");
  };

  // ── Log export ─────────────────────────────────────────────────────────────
  const exportLogs = () => {
    const filtered = logFilter === "all" ? logs : logs.filter(l => l.level === logFilter);
    const blob = new Blob(
      [filtered.map(l => `[${l.time}] [${l.level.toUpperCase()}] ${l.browser}: ${l.message}`).join("\n")],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    const api = getElectronAPI();
    if (api) {
      api.clearLogs().then(() => setLogs([]));
    } else {
      setLogs([]);
    }
  };

  // ── Launch browser ─────────────────────────────────────────────────────────
  async function handleLaunch() {
    if (!launchUrl.trim()) { setLaunchError("Укажи URL сайта"); return; }
    setLaunchLoading(true);
    setLaunchError("");
    setLaunchResult(null);
    try {
      const api = getElectronAPI();
      if (!api?.launchBrowser) throw new Error("Запуск доступен только в desktop-приложении");
      const res = await api.launchBrowser({
        url: launchUrl.trim(),
        proxy: launchProxy.trim() || undefined,
        settings,
      });
      if (!res.ok) throw new Error(res.error);
      setLaunchResult(`Браузер #${res.data?.id} запущен → ${res.data?.url}`);
      // Refresh live list
      const listRes = await api.listBrowsers();
      if (listRes.ok && listRes.data) setLiveBrowsers(listRes.data);
      setLaunchUrl("");
      setLaunchProxy("");
    } catch (e) {
      setLaunchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunchLoading(false);
    }
  }

  // ── Nav ────────────────────────────────────────────────────────────────────
  const nav: { id: Section; icon: string; label: string }[] = [
    { id: "dashboard", icon: "LayoutDashboard", label: "Дашборд" },
    { id: "browsers", icon: "Monitor", label: "Браузеры" },
    { id: "accounts", icon: "Users", label: "Аккаунты" },
    { id: "scenarios", icon: "Workflow", label: "Сценарии" },
    { id: "logs", icon: "ScrollText", label: "Логи" },
    { id: "settings", icon: "Settings", label: "Настройки" },
    { id: "install", icon: "PackageOpen", label: "Установка" },
  ];

  // ── Derived values ─────────────────────────────────────────────────────────
  const running = isElectron
    ? liveBrowsers.filter(b => b.status === "running").length
    : Object.values(browserStates).filter(s => s === "running").length;

  // Which browser list to display
  const displayBrowsers = isElectron
    ? liveBrowsers.map(b => ({
        id: b.id,
        name: `Browser #${b.id}`,
        status: b.status,
        proxy: b.proxy ?? "—",
        account: b.account ?? "—",
        cpu: b.cpu,
        mem: b.mem,
        currentStep: b.currentStep,
        totalSteps: b.totalSteps,
      }))
    : mockBrowsers.map(b => ({
        ...b,
        cpu: mockStats[b.id]?.cpu ?? b.cpu,
        mem: mockStats[b.id]?.mem ?? b.mem,
        currentStep: 0,
        totalSteps: 0,
      }));

  // Filtered data based on search query
  const q = searchQuery.toLowerCase();
  const filteredAccounts = accounts.filter(a =>
    !q || a.login.toLowerCase().includes(q) || a.site.toLowerCase().includes(q)
  );
  const filteredScenarios = scenarios.filter(s =>
    !q || s.name.toLowerCase().includes(q)
  );
  const filteredBrowsers = displayBrowsers.filter(b =>
    !q || b.name.toLowerCase().includes(q) || b.account.toLowerCase().includes(q)
  );
  const filteredLogs = (logFilter === "all" ? logs : logs.filter(l => l.level === logFilter)).filter(l =>
    !q || l.message.toLowerCase().includes(q) || l.browser.toLowerCase().includes(q)
  );

  const inputCls = "bg-[#0a0612] border border-[#2f2445] rounded px-3 py-2 text-[13px] text-slate-200 font-mono outline-none focus:border-violet-500/50 transition-colors";

  return (
    <div className="flex h-screen bg-[#0a0612] font-ibm text-slate-300 overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-2.5 bg-emerald-600 rounded-lg shadow-xl text-[13px] text-white font-medium animate-fade-in flex items-center gap-2">
          <Icon name="CheckCircle" size={14} />
          {toast}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete?.open && (
        <ConfirmDeleteModal
          name={confirmDelete.name}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            if (confirmDelete.type === "account") deleteAccount(confirmDelete.id);
            else if (confirmDelete.type === "scenario") deleteScenario(confirmDelete.id);
            else if (confirmDelete.type === "proxy") deleteProxy(confirmDelete.id);
            setConfirmDelete(null);
          }}
        />
      )}

      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#0f0a1a] border-r border-[#2a1f3d] flex flex-col">
        <div className="px-5 py-5 border-b border-[#2a1f3d]">
          <div className="flex items-center gap-2.5">
            <img src="https://cdn.poehali.dev/projects/b92a8c65-f081-4684-87a0-bfb308c5c2e4/files/0d735473-25d1-47dd-8cce-17327ef9d26e.jpg" alt="MBA Browser" className="w-7 h-7 rounded" />
            <div>
              <div className="text-[13px] font-semibold text-slate-100 leading-none">MBA Browser</div>
              <div className="text-[10px] text-slate-500 mt-0.5">v1.0.0</div>
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
                  ? "bg-violet-600/20 text-violet-300 border border-violet-600/30"
                  : "text-slate-400 hover:bg-[#1f1535] hover:text-slate-200"
              }`}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-[#2a1f3d]">
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
        <header className="h-12 bg-[#0f0a1a] border-b border-[#2a1f3d] flex items-center px-6 gap-4 flex-shrink-0">
          <div className="text-[13px] font-medium text-slate-300">
            {nav.find(n => n.id === section)?.label}
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1 bg-[#1a1028] border border-[#2f2445] rounded px-3 py-1.5">
            <Icon name="Search" size={13} className="text-slate-500" />
            <input
              className="bg-transparent text-[12px] text-slate-300 placeholder-slate-600 outline-none w-40"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#251a38] text-slate-400 hover:text-slate-200 transition-colors">
            <Icon name="Bell" size={15} />
          </button>
          <div className="w-7 h-7 rounded-full bg-violet-600/30 border border-violet-600/40 flex items-center justify-center text-[11px] text-violet-300 font-medium">А</div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">

          {/* DASHBOARD */}
          {section === "dashboard" && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-4 gap-4">
                <StatCard
                  icon="Monitor"
                  label="Всего браузеров"
                  value={isElectron ? liveBrowsers.length : mockBrowsers.length}
                  sub={`${isElectron ? liveBrowsers.filter(b => b.status === "running").length : running} активных`}
                />
                <StatCard icon="Zap" label="Активных" value={running} sub="Прямо сейчас" accent="bg-emerald-500/10" />
                <StatCard icon="Users" label="Аккаунтов" value={accounts.length} sub={`${accounts.filter(a => a.status === "active").length} активных`} />
                <StatCard icon="Workflow" label="Сценариев" value={scenarios.length} sub={`${scenarios.filter(s => s.status === "active").length} активных`} />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 bg-[#1a1028] border border-[#2f2445] rounded-lg p-5">
                  <div className="text-[12px] font-medium text-slate-500 uppercase tracking-widest mb-4">Статус браузеров</div>
                  <div className="space-y-3">
                    {(isElectron ? liveBrowsers : mockBrowsers).slice(0, 6).map(b => (
                      <div key={b.id} className="flex items-center gap-4">
                        <div className="text-[12px] text-slate-300 w-28 font-mono">
                          {isElectron ? `Browser #${b.id}` : (b as typeof mockBrowsers[0]).name}
                        </div>
                        <StatusBadge status={isElectron ? b.status : (browserStates[b.id] ?? b.status)} />
                        <div className="flex-1 bg-[#251a38] rounded-full h-1.5">
                          <div className="bg-violet-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(b.cpu * 3, 100)}%` }} />
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 w-16 text-right">{b.cpu}% CPU</div>
                      </div>
                    ))}
                    {isElectron && liveBrowsers.length === 0 && (
                      <div className="text-[12px] text-slate-600 text-center py-4">Нет запущенных браузеров</div>
                    )}
                  </div>
                </div>

                <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-5">
                  <div className="text-[12px] font-medium text-slate-500 uppercase tracking-widest mb-4">Последние события</div>
                  <div className="space-y-3">
                    {logs.slice(0, 5).map(l => (
                      <div key={l.id} className="flex items-start gap-2.5">
                        <LogBadge level={l.level} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-slate-400 truncate">{l.message}</div>
                          <div className="text-[10px] text-slate-600 mt-0.5 font-mono">{l.time} · {l.browser}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-5">
                <div className="text-[12px] font-medium text-slate-500 uppercase tracking-widest mb-4">Быстрые действия</div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setLaunchModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 rounded text-[13px] text-white hover:bg-violet-500 transition-colors"
                  >
                    <Icon name="Plus" size={14} />
                    Запустить браузер
                  </button>
                  <button
                    onClick={() => setAccountModal({ open: true })}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1028] border border-[#2f2445] rounded text-[13px] text-slate-300 hover:bg-[#251a38] transition-colors"
                  >
                    <Icon name="UserPlus" size={14} />
                    Добавить аккаунт
                  </button>
                  <button
                    onClick={() => setScenarioModal({ open: true })}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1028] border border-[#2f2445] rounded text-[13px] text-slate-300 hover:bg-[#251a38] transition-colors"
                  >
                    <Icon name="Workflow" size={14} />
                    Создать сценарий
                  </button>
                  <button
                    onClick={() => setSection("logs")}
                    className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1028] border border-[#2f2445] rounded text-[13px] text-slate-300 hover:bg-[#251a38] transition-colors"
                  >
                    <Icon name="ScrollText" size={14} />
                    Просмотр логов
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BROWSERS */}
          {section === "browsers" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="text-[12px] text-slate-500">{filteredBrowsers.length} браузеров</div>
                <div className="flex-1" />
                <button
                  onClick={runAllBrowsers}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 rounded text-[12px] text-white hover:bg-emerald-500 transition-colors"
                >
                  <Icon name="Play" size={12} />
                  Запустить все
                </button>
                <button
                  onClick={() => setLaunchModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 rounded text-[12px] text-white hover:bg-violet-500 transition-colors"
                >
                  <Icon name="Plus" size={12} />
                  Новый браузер
                </button>
              </div>

              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#2f2445]">
                      {["Браузер", "Статус", "Прокси", "Аккаунт", "CPU", "RAM", ""].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrowsers.slice((browserPage - 1) * PAGE_SIZE, browserPage * PAGE_SIZE).map((b, i) => {
                      const currentStatus = isElectron
                        ? b.status
                        : (browserStates[b.id] ?? b.status);
                      return (
                        <tr key={b.id} className={`border-b border-[#2a1f3d] hover:bg-[#251a38]/50 transition-colors ${i === filteredBrowsers.length - 1 ? "border-b-0" : ""}`}>
                          <td className="px-4 py-3 font-mono text-[12px] text-slate-200">
                            <div>{b.name}</div>
                            {b.totalSteps > 0 && (
                              <div className="text-[10px] text-slate-600 font-mono mt-0.5">
                                {b.currentStep}/{b.totalSteps} шагов
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={currentStatus} /></td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{b.proxy}</td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{b.account}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-12 bg-[#251a38] rounded-full h-1">
                                <div className="bg-violet-500 h-1 rounded-full" style={{ width: `${Math.min(b.cpu * 2, 100)}%` }} />
                              </div>
                              <span className="text-[11px] font-mono text-slate-500">{b.cpu}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{b.mem > 0 ? `${b.mem}MB` : "—"}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button
                                onClick={() => setBrowserStatus(b.id, "running")}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${currentStatus === "running" ? "text-emerald-400 bg-emerald-500/10" : "text-slate-500 hover:text-emerald-400 hover:bg-[#2a1f3d]"}`}
                                title="Запустить"
                              >
                                <Icon name="Play" size={11} />
                              </button>
                              <button
                                onClick={() => setBrowserStatus(b.id, "paused")}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${currentStatus === "paused" ? "text-amber-400 bg-amber-500/10" : "text-slate-500 hover:text-amber-400 hover:bg-[#2a1f3d]"}`}
                                title="Пауза"
                              >
                                <Icon name="Pause" size={11} />
                              </button>
                              <button
                                onClick={() => setBrowserStatus(b.id, "stopped")}
                                className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${currentStatus === "stopped" ? "text-slate-300 bg-slate-500/10" : "text-slate-500 hover:text-slate-300 hover:bg-[#2a1f3d]"}`}
                                title="Остановить"
                              >
                                <Icon name="Square" size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <Pagination page={browserPage} total={filteredBrowsers.length} pageSize={PAGE_SIZE} onChange={setBrowserPage} />
                {filteredBrowsers.length === 0 && (
                  <div className="text-center py-10 text-[13px] text-slate-500">
                    <Icon name="Monitor" size={24} className="mx-auto mb-2 opacity-30" />
                    Браузеры не найдены
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ACCOUNTS */}
          {section === "accounts" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="text-[12px] text-slate-500">{filteredAccounts.length} аккаунтов</div>
                <div className="flex-1" />
                <label className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1028] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:bg-[#251a38] transition-colors cursor-pointer">
                  <Icon name="Upload" size={12} />
                  Импорт CSV
                  <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && importAccounts(e.target.files[0])} />
                </label>
                <button
                  onClick={exportAccounts}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1028] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:bg-[#251a38] transition-colors"
                >
                  <Icon name="Download" size={12} />
                  Экспорт CSV
                </button>
                <button
                  onClick={() => setAccountModal({ open: true })}
                  className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 rounded text-[12px] text-white hover:bg-violet-500 transition-colors"
                >
                  <Icon name="Plus" size={12} />
                  Добавить аккаунт
                </button>
              </div>

              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#2f2445]">
                      {["Логин", "Сайт", "Прокси", "Статус", "Последний вход", ""].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.slice((accountPage - 1) * PAGE_SIZE, accountPage * PAGE_SIZE).map((a, i) => (
                      <tr key={a.id} className={`border-b border-[#2a1f3d] hover:bg-[#251a38]/50 transition-colors ${i === filteredAccounts.length - 1 ? "border-b-0" : ""}`}>
                        <td className="px-4 py-3 font-mono text-[12px] text-slate-200">{a.login}</td>
                        <td className="px-4 py-3 text-[12px] text-slate-400">{a.site || "—"}</td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{a.proxy || "—"}</td>
                        <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                        <td className="px-4 py-3 font-mono text-[11px] text-slate-500">{a.lastLogin}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => setAccountModal({ open: true, account: a })}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#2a1f3d] text-slate-500 hover:text-slate-300 transition-colors"
                            >
                              <Icon name="Pencil" size={11} />
                            </button>
                            <button
                              onClick={() => setConfirmDelete({ open: true, type: "account", id: a.id, name: a.login })}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <Icon name="Trash2" size={11} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={accountPage} total={filteredAccounts.length} pageSize={PAGE_SIZE} onChange={setAccountPage} />
                {filteredAccounts.length === 0 && (
                  <div className="text-center py-10 text-[13px] text-slate-500">
                    <Icon name="Users" size={24} className="mx-auto mb-2 opacity-30" />
                    {accounts.length === 0 ? "Нет аккаунтов. Нажмите «Добавить аккаунт»." : "Аккаунты не найдены"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SCENARIOS */}
          {section === "scenarios" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="text-[12px] text-slate-500">{filteredScenarios.length} сценариев</div>
                <div className="flex-1" />
                <button
                  onClick={() => setScenarioModal({ open: true })}
                  className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 rounded text-[12px] text-white hover:bg-violet-500 transition-colors"
                >
                  <Icon name="Plus" size={12} />
                  Новый сценарий
                </button>
              </div>

              {filteredScenarios.length === 0 ? (
                <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg py-16 text-center">
                  <Icon name="Workflow" size={32} className="mx-auto mb-3 text-slate-600 opacity-50" />
                  <div className="text-[14px] text-slate-500 mb-1">
                    {scenarios.length === 0 ? "Сценариев нет" : "Сценарии не найдены"}
                  </div>
                  {scenarios.length === 0 && (
                    <div className="text-[12px] text-slate-600">Нажмите «Новый сценарий», чтобы создать первый</div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredScenarios.map(s => (
                    <div key={s.id} className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4 hover:border-[#3a2855] transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded bg-violet-600/10 border border-violet-600/20 flex items-center justify-center flex-shrink-0">
                          <Icon name="Workflow" size={16} className="text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-slate-100 truncate">{s.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{s.steps.length} шагов · Запуск: {s.lastRun}</div>
                        </div>
                        <StatusBadge status={s.status} />
                        <div className="flex gap-1">
                          <button
                            onClick={() => setRunModal({ open: true, scenario: s })}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-600/10 border border-emerald-600/20 rounded text-[11px] text-emerald-400 hover:bg-emerald-600/20 transition-colors"
                          >
                            <Icon name="Play" size={11} />
                            Запустить
                          </button>
                          <button
                            onClick={() => setScenarioModal({ open: true, scenario: s })}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#2a1f3d] text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <Icon name="Pencil" size={12} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete({ open: true, type: "scenario", id: s.id, name: s.name })}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Icon name="Trash2" size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LOGS */}
          {section === "logs" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[
                    { key: "all", label: "Все" },
                    { key: "info", label: "INFO" },
                    { key: "warn", label: "WARN" },
                    { key: "error", label: "ERROR" },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setLogFilter(f.key)}
                      className={`px-3 py-1.5 rounded text-[11px] font-medium border transition-colors capitalize ${
                        logFilter === f.key
                          ? "bg-violet-600/20 border-violet-500/40 text-violet-300"
                          : "bg-[#1a1028] border-[#2f2445] text-slate-400 hover:text-slate-200 hover:border-[#3a2855]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <button
                  onClick={exportLogs}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1028] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:bg-[#251a38] transition-colors"
                >
                  <Icon name="Download" size={12} />Экспорт
                </button>
                <button
                  onClick={clearLogs}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1028] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:bg-[#251a38] transition-colors"
                >
                  <Icon name="Trash2" size={12} />Очистить
                </button>
              </div>

              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg overflow-hidden">
                <div className="border-b border-[#2f2445] px-4 py-2.5 flex gap-6">
                  {["Время", "Уровень", "Браузер", "Сообщение"].map(h => (
                    <div key={h} className={`text-[11px] font-medium text-slate-500 uppercase tracking-widest ${h === "Сообщение" ? "flex-1" : h === "Браузер" ? "w-28" : "w-20"}`}>{h}</div>
                  ))}
                </div>
                <div className="divide-y divide-[#1a2333]">
                  {filteredLogs.slice((logPage - 1) * PAGE_SIZE, logPage * PAGE_SIZE).map(l => (
                    <div key={l.id} className="flex items-start gap-6 px-4 py-2.5 hover:bg-[#251a38]/40 transition-colors">
                      <div className="w-20 font-mono text-[11px] text-slate-600 mt-0.5">{l.time}</div>
                      <div className="w-20 mt-0.5"><LogBadge level={l.level} /></div>
                      <div className="w-28 font-mono text-[11px] text-slate-400 mt-0.5">{l.browser}</div>
                      <div className="flex-1 text-[12px] text-slate-300 leading-relaxed">{l.message}</div>
                    </div>
                  ))}
                </div>
                <Pagination page={logPage} total={filteredLogs.length} pageSize={PAGE_SIZE} onChange={setLogPage} />
                {filteredLogs.length === 0 && (
                  <div className="text-center py-10 text-[13px] text-slate-500">
                    <Icon name="ScrollText" size={24} className="mx-auto mb-2 opacity-30" />
                    {logs.length === 0 ? "Логи очищены" : "Нет записей по выбранному фильтру"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {section === "settings" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex border-b border-[#2f2445] gap-4 pb-0 mb-2">
                {["Общие", "Прокси"].map(t => (
                  <button
                    key={t}
                    onClick={() => setProxyTab(t === "Прокси")}
                    className={`pb-3 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
                      (t === "Прокси") === proxyTab
                        ? "text-violet-400 border-violet-500"
                        : "text-slate-500 border-transparent hover:text-slate-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {!proxyTab && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">Макс. параллельных браузеров</div>
                      <input
                        value={settings.maxBrowsers}
                        onChange={e => setSettings(s => ({ ...s, maxBrowsers: Number(e.target.value) }))}
                        type="number"
                        className={`w-full ${inputCls}`}
                      />
                    </div>
                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">Таймаут подключения (сек)</div>
                      <input
                        value={settings.connectionTimeout}
                        onChange={e => setSettings(s => ({ ...s, connectionTimeout: Number(e.target.value) }))}
                        type="number"
                        className={`w-full ${inputCls}`}
                      />
                    </div>
                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">Интервал ротации прокси (мин)</div>
                      <input
                        value={settings.proxyRotationInterval}
                        onChange={e => setSettings(s => ({ ...s, proxyRotationInterval: Number(e.target.value) }))}
                        type="number"
                        className={`w-full ${inputCls}`}
                      />
                    </div>
                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">Путь к Chromium</div>
                      <div className="flex gap-2">
                        <input
                          value={settings.chromiumPath}
                          onChange={e => setSettings(s => ({ ...s, chromiumPath: e.target.value }))}
                          type="text"
                          className={`flex-1 ${inputCls}`}
                        />
                        <button
                          onClick={async () => {
                            const api = getElectronAPI();
                            if (!api?.openFileDialog) return;
                            const res = await api.openFileDialog();
                            if (res.ok && res.path) {
                              setSettings(s => ({ ...s, chromiumPath: res.path }));
                              setChromeCheckStatus("idle");
                              setChromeCheckMsg("");
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a1f3d] border border-[#3a2855] rounded text-[12px] text-slate-300 hover:bg-[#352550] hover:text-white transition-colors"
                        >
                          <Icon name="FolderOpen" size={13} />
                          Выбрать
                        </button>
                        <button
                          onClick={async () => {
                            setChromeCheckStatus("checking");
                            setChromeCheckMsg("");
                            const api = getElectronAPI();
                            if (!api) {
                              setChromeCheckStatus("error");
                              setChromeCheckMsg("Доступно только в desktop-приложении");
                              return;
                            }
                            try {
                              const res = await api.launchBrowser({ url: "about:blank", settings: { ...settings, headless: true } });
                              if (res.ok && res.data) {
                                await api.closeBrowser(res.data.id);
                                setChromeCheckStatus("ok");
                                setChromeCheckMsg("Chrome найден и работает");
                              } else {
                                setChromeCheckStatus("error");
                                setChromeCheckMsg(res.error || "Не удалось запустить");
                              }
                            } catch (e: unknown) {
                              setChromeCheckStatus("error");
                              setChromeCheckMsg(e instanceof Error ? e.message : "Ошибка");
                            }
                          }}
                          disabled={chromeCheckStatus === "checking"}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2a1f3d] border border-[#3a2855] rounded text-[12px] text-slate-300 hover:bg-[#352550] hover:text-white transition-colors disabled:opacity-50"
                        >
                          <Icon name={chromeCheckStatus === "checking" ? "Loader" : "PlayCircle"} size={13} className={chromeCheckStatus === "checking" ? "animate-spin" : ""} />
                          Проверить
                        </button>
                      </div>
                      {chromeCheckMsg && (
                        <div className={`mt-2 flex items-center gap-1.5 text-[12px] ${chromeCheckStatus === "ok" ? "text-emerald-400" : "text-red-400"}`}>
                          <Icon name={chromeCheckStatus === "ok" ? "CheckCircle" : "XCircle"} size={13} />
                          {chromeCheckMsg}
                        </div>
                      )}
                    </div>
                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">Директория профилей</div>
                      <input
                        value={settings.profilesDir}
                        onChange={e => setSettings(s => ({ ...s, profilesDir: e.target.value }))}
                        type="text"
                        className={`w-full ${inputCls}`}
                      />
                    </div>
                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-2">Директория логов</div>
                      <input
                        value={settings.logsDir}
                        onChange={e => setSettings(s => ({ ...s, logsDir: e.target.value }))}
                        type="text"
                        className={`w-full ${inputCls}`}
                      />
                    </div>

                    <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-4 col-span-2">
                      <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-3">Опции запуска</div>
                      <div className="grid grid-cols-2 gap-1">
                        {([
                          { key: "headless" as const, label: "Headless режим" },
                          { key: "disableImages" as const, label: "Отключить изображения" },
                          { key: "autoRotateProxy" as const, label: "Авто-ротация прокси при ошибке" },
                          { key: "saveCookies" as const, label: "Сохранять cookies между сессиями" },
                          { key: "fingerprintMasking" as const, label: "Маскировка цифрового отпечатка" },
                        ] as { key: keyof Settings; label: string }[]).map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setSettings(s => ({ ...s, [opt.key]: !s[opt.key] }))}
                            className="flex items-center gap-3 py-1.5 text-left group"
                          >
                            <div className={`w-8 h-4 rounded-full transition-colors flex-shrink-0 ${settings[opt.key] ? "bg-violet-600" : "bg-[#2a1f3d]"}`}>
                              <div className={`w-3 h-3 rounded-full bg-white mt-0.5 transition-transform ${settings[opt.key] ? "translate-x-4 ml-0.5" : "ml-0.5"}`} />
                            </div>
                            <span className="text-[12px] text-slate-400 group-hover:text-slate-300 transition-colors">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={saveSettings}
                      className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 rounded text-[13px] text-white hover:bg-violet-500 transition-colors"
                    >
                      <Icon name="Save" size={14} />
                      Сохранить настройки
                    </button>
                  </div>
                </div>
              )}

              {proxyTab && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] text-slate-500">{proxies.length} прокси-серверов</div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1028] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:bg-[#251a38] transition-colors cursor-pointer">
                        <Icon name="Upload" size={12} />
                        Импорт CSV
                        <input type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && importProxies(e.target.files[0])} />
                      </label>
                      <button
                        onClick={exportProxies}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[#1a1028] border border-[#2f2445] rounded text-[12px] text-slate-400 hover:bg-[#251a38] transition-colors"
                      >
                        <Icon name="Download" size={12} />
                        Экспорт CSV
                      </button>
                      <button
                        onClick={() => setProxyModal({ open: true })}
                        className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 rounded text-[12px] text-white hover:bg-violet-500 transition-colors"
                      >
                        <Icon name="Plus" size={12} />Добавить прокси
                      </button>
                    </div>
                  </div>
                  <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#2f2445]">
                          {["Хост", "Порт", "Тип", "Страна", "Статус", "Скорость", ""].map(h => (
                            <th key={h} className="text-left px-4 py-3 text-[11px] font-medium text-slate-500 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {proxies.map((p, i) => (
                          <tr key={p.id} className={`border-b border-[#2a1f3d] hover:bg-[#251a38]/50 transition-colors ${i === proxies.length - 1 ? "border-b-0" : ""}`}>
                            <td className="px-4 py-3 font-mono text-[12px] text-slate-200">{p.host}</td>
                            <td className="px-4 py-3 font-mono text-[12px] text-slate-400">{p.port}</td>
                            <td className="px-4 py-3">
                              <span className="text-[11px] font-mono font-medium text-slate-400 bg-[#251a38] border border-[#3a2855] px-2 py-0.5 rounded">{p.type}</span>
                            </td>
                            <td className="px-4 py-3 text-[12px] text-slate-400">{p.country}</td>
                            <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                            <td className="px-4 py-3">
                              {p.speed > 0 ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-16 bg-[#251a38] rounded-full h-1">
                                    <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${Math.min((p.speed / 500) * 100, 100)}%` }} />
                                  </div>
                                  <span className="text-[11px] font-mono text-slate-500">{p.speed}ms</span>
                                </div>
                              ) : <span className="text-[11px] text-slate-600">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => refreshProxy(p.id)}
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#2a1f3d] text-slate-500 hover:text-emerald-400 transition-colors"
                                  title="Проверить"
                                >
                                  <Icon name="RefreshCw" size={11} />
                                </button>
                                <button
                                  onClick={() => setProxyModal({ open: true, proxy: p })}
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#2a1f3d] text-slate-500 hover:text-slate-300 transition-colors"
                                  title="Редактировать"
                                >
                                  <Icon name="Pencil" size={11} />
                                </button>
                                <button
                                  onClick={() => setConfirmDelete({ open: true, type: "proxy", id: p.id, name: `${p.host}:${p.port}` })}
                                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
                                  title="Удалить"
                                >
                                  <Icon name="Trash2" size={11} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {proxies.length === 0 && (
                      <div className="text-center py-10 text-[13px] text-slate-500">
                        <Icon name="Server" size={24} className="mx-auto mb-2 opacity-30" />
                        Нет прокси-серверов. Нажмите «Добавить прокси».
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INSTALL */}
          {section === "install" && (
            <div className="space-y-5 animate-fade-in max-w-2xl">

              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
                  <Icon name="PackageOpen" size={17} className="text-violet-400" />
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-semibold text-slate-100">Установка MBA Browser</div>
                  <div className="text-[12px] text-slate-500">Инструкция по сборке и установке приложения</div>
                </div>
                <button
                  data-action="download-code"
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-[12px] text-white font-medium transition-colors"
                >
                  <Icon name="Download" size={13} />
                  Скачать код
                </button>
              </div>

              {/* Requirements */}
              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-5">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-3">Требования</div>
                <div className="space-y-2">
                  {[
                    { icon: "Box", label: "Node.js 18+", desc: "nodejs.org", link: "https://nodejs.org" },
                    { icon: "Chrome", label: "Google Chrome", desc: "Должен быть установлен на компьютере", link: null },
                    { icon: "Download", label: "Код проекта", desc: "Скачать → Скачать код (кнопка вверху)", link: null },
                  ].map(req => (
                    <div key={req.label} className="flex items-center gap-3 px-3 py-2.5 bg-[#0a0612] border border-[#2f2445] rounded">
                      <div className="w-7 h-7 rounded bg-violet-600/10 border border-violet-600/20 flex items-center justify-center flex-shrink-0">
                        <Icon name={req.icon} size={13} className="text-violet-400" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[12px] font-medium text-slate-200">{req.label}</div>
                        <div className="text-[11px] text-slate-500">{req.desc}</div>
                      </div>
                      {req.link && (
                        <a href={req.link} target="_blank" rel="noreferrer" className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                          Скачать →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* macOS */}
              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2f2445]">
                  <div className="w-8 h-8 rounded bg-slate-500/10 border border-slate-500/20 flex items-center justify-center">
                    <Icon name="Apple" size={15} className="text-slate-300" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-100">macOS</div>
                    <div className="text-[11px] text-slate-500">Установщик .dmg — перетащи в Applications</div>
                  </div>
                  <span className="ml-auto px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium">M1 / Intel</span>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { num: "1", text: "Нажми «Скачать код» выше → распакуй архив (например в папку Загрузки)" },
                    { num: "2", text: "Открой Терминал (Finder → Программы → Утилиты → Терминал)" },
                    { num: "3", text: "Перейди в папку проекта командой cd (замени путь на свой):" },
                  ].map(step => (
                    <div key={step.num} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-violet-400">{step.num}</span>
                      </div>
                      <div className="text-[12px] text-slate-300 leading-relaxed">{step.text}</div>
                    </div>
                  ))}
                  <div className="ml-8 bg-[#0a0612] border border-[#2f2445] rounded px-4 py-3 font-mono text-[12px] text-emerald-400 flex items-center justify-between gap-3">
                    <span>cd ~/Downloads/multi-browser-login-main</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText("cd ~/Downloads/multi-browser-login-main"); showToast("Скопировано"); }}
                      className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
                      title="Скопировать"
                    >
                      <Icon name="Copy" size={13} />
                    </button>
                  </div>
                  <div className="ml-8 flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-[10px] font-bold text-violet-400">4</span>
                    </div>
                    <div className="text-[12px] text-slate-300 leading-relaxed">Запусти сборку:</div>
                  </div>
                  <div className="ml-8 bg-[#0a0612] border border-[#2f2445] rounded px-4 py-3 font-mono text-[12px] text-emerald-400 flex items-center justify-between gap-3">
                    <span>bash electron-build/build-mac.sh</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText("bash electron-build/build-mac.sh"); showToast("Скопировано"); }}
                      className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
                      title="Скопировать"
                    >
                      <Icon name="Copy" size={13} />
                    </button>
                  </div>
                  <div className="ml-8 flex items-start gap-2 text-[11px] text-slate-500">
                    <Icon name="Info" size={12} className="mt-0.5 flex-shrink-0 text-violet-500/60" />
                    Скрипт сам установит зависимости, соберёт интерфейс и создаст .dmg. Займёт 2-5 минут.
                  </div>
                  <div className="ml-8 flex gap-3">
                    <div className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-violet-400">5</span>
                      </div>
                      <div className="text-[12px] text-slate-300 leading-relaxed">Открой готовый <span className="font-mono text-slate-200">MBA Browser.dmg</span> → перетащи иконку в <span className="font-mono text-slate-200">Applications</span> → запускай из Launchpad</div>
                    </div>
                  </div>
                  <div className="ml-8 px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded flex items-start gap-2">
                    <Icon name="TriangleAlert" size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-400/80">
                      <span className="font-medium text-amber-400">Важно:</span> команду <span className="font-mono">bash electron-build/build-mac.sh</span> нужно запускать именно из папки проекта, а не из домашней папки <span className="font-mono">~</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Windows */}
              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#2f2445]">
                  <div className="w-8 h-8 rounded bg-slate-500/10 border border-slate-500/20 flex items-center justify-center">
                    <Icon name="Monitor" size={15} className="text-slate-300" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-slate-100">Windows</div>
                    <div className="text-[11px] text-slate-500">Установщик .exe — ярлык на рабочем столе</div>
                  </div>
                  <span className="ml-auto px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 rounded text-[10px] text-violet-400 font-medium">x64</span>
                </div>
                <div className="p-5 space-y-3">
                  {[
                    { num: "1", text: "Скачай код проекта через кнопку «Скачать» вверху страницы" },
                    { num: "2", text: "Открой папку проекта в Проводнике" },
                    { num: "3", text: "Дважды кликни на файл:" },
                  ].map(step => (
                    <div key={step.num} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-violet-400">{step.num}</span>
                      </div>
                      <div className="text-[12px] text-slate-300 leading-relaxed">{step.text}</div>
                    </div>
                  ))}
                  <div className="ml-8 bg-[#0a0612] border border-[#2f2445] rounded px-4 py-3 font-mono text-[12px] text-amber-400 flex items-center justify-between gap-3">
                    <span>electron-build\build-win.bat</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText("electron-build\\build-win.bat"); showToast("Скопировано"); }}
                      className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
                      title="Скопировать"
                    >
                      <Icon name="Copy" size={13} />
                    </button>
                  </div>
                  <div className="ml-8 flex items-start gap-2 text-[11px] text-slate-500">
                    <Icon name="Info" size={12} className="mt-0.5 flex-shrink-0 text-violet-500/60" />
                    Скрипт сам всё сделает и создаст <span className="font-mono">MBA Browser Setup.exe</span>. Займёт 2-5 минут.
                  </div>
                  <div className="ml-8 flex gap-3">
                    <div key="4" className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-violet-600/20 border border-violet-600/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-violet-400">4</span>
                      </div>
                      <div className="text-[12px] text-slate-300 leading-relaxed">Запусти <span className="font-mono text-slate-200">MBA Browser Setup.exe</span> → следуй мастеру установки → ярлык появится на рабочем столе и в меню Пуск</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Troubleshooting */}
              <div className="bg-[#1a1028] border border-[#2f2445] rounded-lg p-5">
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-3">Частые проблемы</div>
                <div className="space-y-2.5">
                  {[
                    { q: "«node не найден» / «npm не найден»", a: "Установи Node.js с nodejs.org и перезапусти терминал" },
                    { q: "«Chrome/Chromium не найден» при запуске", a: "Установи Google Chrome, или укажи путь вручную: Настройки → Путь к Chromium" },
                    { q: "Ошибка сборки на macOS", a: "Убедись что есть доступ в интернет — скрипт скачивает иконку при первом запуске" },
                    { q: "Ошибка на Windows: «electron-builder не найден»", a: "Запусти npm install вручную в папке electron-build/webapp/, затем повтори" },
                  ].map(item => (
                    <div key={item.q} className="px-3 py-2.5 bg-[#0a0612] border border-[#2f2445] rounded">
                      <div className="text-[12px] font-medium text-amber-400 mb-1">{item.q}</div>
                      <div className="text-[11px] text-slate-400">→ {item.a}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>
      </main>

      {/* Modals */}
      {accountModal.open && (
        <AccountModal
          account={accountModal.account}
          onClose={() => setAccountModal({ open: false })}
          onSave={saveAccount}
        />
      )}

      {scenarioModal.open && (
        <ScenarioModal
          onClose={() => setScenarioModal({ open: false })}
          scenarioName={scenarioModal.scenario?.name}
          initialSteps={scenarioModal.scenario?.steps}
          onSave={saveScenario}
        />
      )}

      {runModal.open && runModal.scenario && (
        <RunModal
          scenario={runModal.scenario}
          accounts={accounts}
          settings={settings}
          onClose={() => setRunModal({ open: false })}
          setLiveBrowsers={setLiveBrowsers}
          setScenarios={setScenarios}
        />
      )}

      {proxyModal.open && (
        <ProxyModal
          proxy={proxyModal.proxy}
          onClose={() => setProxyModal({ open: false })}
          onSave={saveProxy}
        />
      )}

      {/* Launch Browser Modal */}
      {launchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#0f0a1a] border border-[#2f2445] rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-violet-600/20 border border-violet-600/30 flex items-center justify-center">
                  <Icon name="Monitor" size={15} className="text-violet-400" />
                </div>
                <div className="text-[14px] font-semibold text-slate-100">Запустить браузер</div>
              </div>
              <button
                onClick={() => { setLaunchModal(false); setLaunchError(""); setLaunchResult(null); }}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#251a38] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Icon name="X" size={15} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">URL сайта *</label>
                <input
                  value={launchUrl}
                  onChange={e => setLaunchUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLaunch()}
                  placeholder="https://example.com"
                  className="w-full bg-[#0a0612] border border-[#2f2445] rounded px-3 py-2.5 text-[13px] text-slate-200 font-mono outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-widest mb-1.5">
                  Прокси <span className="text-slate-600 normal-case tracking-normal">(необязательно)</span>
                </label>
                <input
                  value={launchProxy}
                  onChange={e => setLaunchProxy(e.target.value)}
                  placeholder="host:port  или  user:pass@host:port"
                  className="w-full bg-[#0a0612] border border-[#2f2445] rounded px-3 py-2.5 text-[13px] text-slate-200 font-mono outline-none focus:border-violet-500/50 transition-colors placeholder-slate-600"
                />
              </div>
            </div>

            {launchError && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/20 rounded text-[12px] text-red-400">
                <Icon name="AlertCircle" size={13} className="mt-0.5 flex-shrink-0" />
                {launchError}
              </div>
            )}

            {launchResult && (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[12px] text-emerald-400">
                <Icon name="CheckCircle" size={13} className="mt-0.5 flex-shrink-0" />
                {launchResult}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setLaunchModal(false)}
                className="flex-1 py-2 bg-[#0a0612] border border-[#2f2445] rounded text-[13px] text-slate-400 hover:text-slate-200 hover:bg-[#1a1028] transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleLaunch}
                disabled={launchLoading || !launchUrl.trim()}
                className="flex-1 py-2 bg-violet-600 rounded text-[13px] text-white hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {launchLoading && <Icon name="Loader2" size={13} className="animate-spin" />}
                {launchLoading ? "Запуск..." : "Запустить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}