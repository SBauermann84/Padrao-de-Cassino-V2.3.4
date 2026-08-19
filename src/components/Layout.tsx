import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  History, 
  Settings, 
  TrendingUp, 
  ShieldCheck, 
  BookOpen, 
  PlayCircle,
  Menu,
  X,
  Calculator,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Sparkles
} from 'lucide-react';
import { useTranslation } from '../locales/translations';
import { GameType } from '../types';
import { useAppStore } from '../store/useAppStore';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  balance: number;
  actions?: React.ReactNode;
  gameType: GameType;
  setGameType: (type: GameType) => void;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  activeTab, 
  setActiveTab, 
  balance, 
  actions,
  gameType,
  setGameType
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [isCollapsed, setIsCollapsed] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    }
    return false;
  });

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };
  const { t, lang } = useTranslation();
  
  const { settings } = useAppStore();
  const isExtremeNightMode = settings?.extremeNightMode === true;

  React.useEffect(() => {
    if (isExtremeNightMode) {
      document.documentElement.classList.add('extreme-night-mode');
    } else {
      document.documentElement.classList.remove('extreme-night-mode');
    }
  }, [isExtremeNightMode]);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [storageAlert, setStorageAlert] = React.useState<{ isHigh: boolean; usageMb: number; percent: number } | null>(null);

  React.useEffect(() => {
    const checkStorage = () => {
      try {
        let totalBytes = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const val = localStorage.getItem(key) || '';
            totalBytes += key.length + val.length;
          }
        }
        const usageMb = totalBytes / (1024 * 1024);
        const maxQuotaMb = 10.0; // 10MB quota threshold
        const percent = (usageMb / maxQuotaMb) * 100;
        if (percent >= 80) {
          setStorageAlert({
            isHigh: true,
            usageMb: Number(usageMb.toFixed(2)),
            percent: Number(percent.toFixed(0))
          });
        } else {
          setStorageAlert(null);
        }
      } catch (e) {
        // ignore
      }
    };

    checkStorage();
    const interval = setInterval(checkStorage, 8000);
    return () => clearInterval(interval);
  }, []);

  const mainNavGroup = [
    { 
      id: gameType === GameType.ROULETTE ? 'roulette' : 'baccarat', 
      label: gameType === GameType.ROULETTE ? (lang === 'pt-BR' ? 'Mesa Roleta AI' : 'Roulette AI Table') : 'Mesa Baccarat AI', 
      icon: PlayCircle 
    },
    { id: 'bankroll', label: t('menu.management'), icon: ShieldCheck },
    { id: 'strategies', label: t('menu.strategies'), icon: TrendingUp },
    { id: 'dailyStats', label: lang === 'pt-BR' ? 'Estatísticas' : 'Daily Stats', icon: LayoutDashboard },
    { id: 'backtest', label: lang === 'pt-BR' ? 'Backtest Otimizador' : 'Backtest Optimizer', icon: Sparkles },
  ];

  const toolsNavGroup = [
    { id: 'compound', label: 'Juros Compostos', icon: Calculator },
    { id: 'manual', label: t('menu.manual'), icon: BookOpen },
    { id: 'settings', label: t('menu.settings'), icon: Settings },
  ];

  const menuItems = [...mainNavGroup, ...toolsNavGroup];

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#c6a34f] selection:text-black">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 lg:hidden flex items-center justify-between p-3.5 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[#c6a34f]/20 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-[#c6a34f] to-[#a68233] rounded-lg flex items-center justify-center font-bold text-black italic">CA</div>
          <div className="flex flex-col">
            <span className="font-bold text-[#c6a34f] tracking-tighter uppercase leading-none">Casino Pattern AI</span>
            {!isOnline && (
              <span className="text-[7px] font-black tracking-widest text-amber-500 uppercase mt-1">
                ● {t('header.offline')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions && <div className="scale-90 origin-right">{actions}</div>}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-1.5 rounded-lg bg-white/5 text-[#c6a34f]">
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed inset-y-0 left-0 z-50 bg-[#0a0a0a] border-r border-[#c6a34f]/10 transition-all duration-300 ease-in-out lg:translate-x-0 lg:static h-screen lg:h-auto shrink-0 relative
          ${isCollapsed ? 'w-20' : 'w-64'}
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className={`p-6 hidden lg:flex items-center justify-between gap-2 mb-8 ${isCollapsed ? 'flex-col items-center p-4 mb-4' : ''}`}>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-[#c6a34f] to-[#a68233] rounded-xl flex items-center justify-center font-black text-black italic text-xl shadow-[0_0_20px_rgba(198,163,79,0.3)] shrink-0">CA</div>
              {!isCollapsed && (
                <div className="flex flex-col">
                  <span className="font-bold text-[#c6a34f] tracking-tighter uppercase leading-none">{t('header.title')}</span>
                  <span className="text-[10px] text-[#c6a34f]/60 uppercase tracking-[0.2em] font-medium">{t('header.subtitle')}</span>
                </div>
              )}
            </div>
            
            <button 
              onClick={toggleCollapsed}
              className={`p-1.5 rounded-lg border border-[#c6a34f]/15 bg-[#111111] hover:bg-[#c6a34f]/10 text-[#c6a34f] transition-all cursor-pointer ${isCollapsed ? 'mt-3' : ''}`}
              title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>

          {/* Game Application Switcher */}
          <div className={`px-4 mb-6 ${isCollapsed ? 'px-2' : ''}`}>
            {isCollapsed ? (
              <div className="flex flex-col gap-1 bg-[#111111] p-1 rounded-xl border border-[#c6a34f]/15">
                <button
                  onClick={() => {
                    setGameType(GameType.ROULETTE);
                    setActiveTab('roulette');
                  }}
                  title={lang === 'pt-BR' ? 'Roleta AI' : 'Roulette AI'}
                  className={`flex items-center justify-center py-2 rounded-lg transition-all duration-300 cursor-pointer ${
                    gameType === GameType.ROULETTE
                      ? 'bg-[#c6a34f] text-black font-extrabold shadow-[0_0_10px_rgba(198,163,79,0.2)]'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  <span className="text-[11px] font-black font-mono">R</span>
                </button>
                <button
                  onClick={() => {
                    setGameType(GameType.BACCARAT);
                    setActiveTab('baccarat');
                  }}
                  title="Baccarat AI"
                  className={`flex items-center justify-center py-2 rounded-lg transition-all duration-300 cursor-pointer ${
                    gameType === GameType.BACCARAT
                      ? 'bg-[#c6a34f] text-black font-extrabold shadow-[0_0_10px_rgba(198,163,79,0.2)]'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  <span className="text-[11px] font-black font-mono">B</span>
                </button>
              </div>
            ) : (
              <div className="bg-[#111111] p-1 rounded-2xl border border-[#c6a34f]/15 flex gap-1 relative">
                <button
                  onClick={() => {
                    setGameType(GameType.ROULETTE);
                    setActiveTab('roulette');
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                    gameType === GameType.ROULETTE
                      ? 'bg-[#c6a34f] text-black font-extrabold shadow-[0_0_15px_rgba(198,163,79,0.25)]'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${gameType === GameType.ROULETTE ? 'bg-black animate-none' : 'bg-red-500 animate-pulse'}`} />
                  <span className="text-[10px] uppercase tracking-wider font-extrabold">
                    {lang === 'pt-BR' ? 'Roleta AI' : 'Roulette AI'}
                  </span>
                </button>
                <button
                  onClick={() => {
                    setGameType(GameType.BACCARAT);
                    setActiveTab('baccarat');
                  }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl transition-all duration-300 cursor-pointer ${
                    gameType === GameType.BACCARAT
                      ? 'bg-[#c6a34f] text-black font-extrabold shadow-[0_0_15px_rgba(198,163,79,0.25)]'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${gameType === GameType.BACCARAT ? 'bg-black animate-none' : 'bg-blue-500 animate-pulse'}`} />
                  <span className="text-[10px] uppercase tracking-wider font-extrabold">
                    Baccarat AI
                  </span>
                </button>
              </div>
            )}
          </div>

          <nav className={`px-4 space-y-4 ${isCollapsed ? 'px-2 space-y-3' : ''}`}>
            {/* Group 1: Gestão & Estratégia */}
            <div>
              {!isCollapsed && (
                <div className="px-3 pb-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-[#c6a34f]/70 font-mono">
                  {lang === 'pt-BR' ? 'Operação & AI' : 'Operation & AI'}
                </div>
              )}
              <div className="space-y-1">
                {mainNavGroup.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    title={item.label}
                    className={`
                      w-full flex items-center rounded-xl transition-all duration-300 group cursor-pointer
                      ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2.5'}
                      ${activeTab === item.id 
                        ? 'bg-[#c6a34f] text-black font-semibold shadow-md' 
                        : 'text-[#c6a34f] hover:bg-[#c6a34f]/10'}
                    `}
                  >
                    <item.icon size={18} className={activeTab === item.id ? 'text-black' : 'group-hover:scale-110 transition-transform'} />
                    {!isCollapsed && <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Group 2: Ferramentas & Configurações */}
            <div>
              {!isCollapsed && (
                <div className="px-3 pb-1.5 pt-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/40 font-mono border-t border-white/5">
                  {lang === 'pt-BR' ? 'Ferramentas & Ajustes' : 'Tools & Settings'}
                </div>
              )}
              <div className="space-y-1">
                {toolsNavGroup.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                    }}
                    title={item.label}
                    className={`
                      w-full flex items-center rounded-xl transition-all duration-300 group cursor-pointer
                      ${isCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3.5 py-2.5'}
                      ${activeTab === item.id 
                        ? 'bg-[#c6a34f] text-black font-bold shadow-md' 
                        : 'text-white/70 hover:text-white hover:bg-white/5'}
                    `}
                  >
                    <item.icon size={18} className={activeTab === item.id ? 'text-black' : 'group-hover:scale-110 transition-transform'} />
                    {!isCollapsed && <span className="text-xs font-bold tracking-wider uppercase">{item.label}</span>}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          {/* User Profile / Status with Dynamic Connection States */}
          {isCollapsed ? (
            <div className="absolute bottom-6 left-2 right-2 p-2 rounded-xl bg-[#111111] border border-[#c6a34f]/5 flex justify-center">
              <div 
                className="w-10 h-10 rounded-full bg-gradient-to-t from-[#c6a34f]/10 to-[#c6a34f]/20 border border-[#c6a34f]/20 flex items-center justify-center text-[#c6a34f] font-bold relative group cursor-pointer"
                title={isOnline ? "Usuário Pro - Conectado" : "Usuário Pro - Offline Seguro"}
              >
                U
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border border-[#0a0a0a] ${isOnline ? 'bg-green-500' : 'bg-amber-500'}`} />
              </div>
            </div>
          ) : (
            <div className="absolute bottom-6 left-4 right-4 p-4 rounded-2xl bg-[#111111] border border-[#c6a34f]/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-t from-[#c6a34f]/10 to-[#c6a34f]/20 border border-[#c6a34f]/20 flex items-center justify-center text-[#c6a34f] font-bold">U</div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-[#c6a34f]">Usuário Pro</span>
                  {isOnline ? (
                    <span className="text-[10px] text-green-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                      Conectado
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-500 flex items-center gap-1" title="Seus dados de histórico e estratégias estão salvos 100% no seu navegador de forma segura.">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      Offline Seguro
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          </aside>

        {/* Content - Fully fluid & auto-adapts to screen width */}
        <main className="flex-1 transition-all duration-300 w-full min-w-0">
          <header className="sticky top-0 z-40 bg-[#050505]/95 backdrop-blur-md hidden lg:block border-b border-[#c6a34f]/10 px-4 xl:px-8 py-4 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl lg:text-2xl font-light tracking-tight text-white/90">
                    {menuItems.find(i => i.id === activeTab)?.label}
                  </h1>
                  {!isOnline && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-black uppercase tracking-widest animate-pulse">
                      Modo Offline Ativo
                    </span>
                  )}
                </div>
                <p className="text-[#c6a34f]/60 text-xs uppercase tracking-widest mt-0.5">
                  {isOnline ? 'Sessão em tempo real' : 'Sessão local (Dados seguros offline)'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {storageAlert?.isHigh && (
                  <button
                    onClick={() => setActiveTab('settings')}
                    className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 px-3 py-1.5 rounded-xl text-red-400 text-[10px] font-bold cursor-pointer hover:bg-red-500/25 transition-all animate-pulse"
                    title="Atenção: Uso de armazenamento local acima de 80% (Limite 10MB). Clique para abrir configurações de storage."
                  >
                    <HardDrive size={13} />
                    <span>Storage: {storageAlert.usageMb} MB ({storageAlert.percent}%)</span>
                  </button>
                )}

                {actions && <div className="flex items-center">{actions}</div>}
                
                {/* Enhanced High-Contrast Balance Badge */}
                <div className="flex items-center gap-3 bg-gradient-to-r from-black/80 to-neutral-900 border border-[#c6a34f]/30 px-4 lg:px-5 py-2 rounded-2xl shadow-[0_4px_15px_rgba(198,163,79,0.06)] hover:border-[#c6a34f]/60 transition-all shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] uppercase tracking-[0.2em] font-black text-[#c6a34f] leading-none mb-1">Saldo Atual</span>
                    <span className="text-base lg:text-lg font-black font-mono text-white tracking-tight">
                      R$ {(balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="p-3 sm:p-5 lg:p-8 w-full max-w-full">
            <div>
              {children}
            </div>
          </div>
        </main>
      </div>

      {/* Bottom Navigation for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-[#c6a34f]/10 z-50 lg:hidden px-2 py-3 safe-area-pb">
        <div className="flex items-center justify-between gap-1">
          {menuItems.filter(i => ['bankroll', gameType === GameType.ROULETTE ? 'roulette' : 'baccarat', 'dailyStats', 'strategies'].includes(i.id)).map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex-1 flex flex-col items-center gap-1.5 transition-all ${activeTab === item.id ? 'text-[#c6a34f]' : 'text-white/40'}`}
            >
              <div className={`p-2 rounded-xl transition-all ${activeTab === item.id ? 'bg-[#c6a34f]/10' : ''}`}>
                <item.icon size={22} />
              </div>
              <span className="text-[9px] font-black uppercase tracking-widest">{item.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Content wrapper padding for bottom nav */}
      <div className="h-20 lg:hidden" />

      {/* Overlay for mobile menu */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
