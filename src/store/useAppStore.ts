import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GameType, GameResult, Bankroll, Session, Strategy, ManagementMode, ManagementConfig, RiskProfile } from '../types';
import { dailyStatsService, DailyStatsRecord } from '../services/dailyStatsService';
import { calculateCumulativeGaleLoss } from '../engines/progressionEngine';
import { 
  getInitialMinedBaccaratStrategies, 
  mineBaccaratPatterns, 
  convertMinedPatternsToStrategies 
} from '../engines/baccaratPatternMiningEngine';
import {
  getInitialMinedRouletteStrategies,
  mineRoulettePatterns,
  convertMinedRoulettePatternsToStrategies
} from '../engines/roulettePatternMiningEngine';

// Helper function to merge results, prevent duplicates and ensure chronological order (newest first)
function mergeAndValidateResults(
  currentResults: GameResult[] | undefined | null,
  newResults: GameResult[] | undefined | null,
  limit: number
): GameResult[] {
  const safeCurrent = Array.isArray(currentResults) ? currentResults : [];
  const safeNew = Array.isArray(newResults) ? newResults : [];
  // Combine new results at the beginning, followed by existing ones
  const combined = [...safeNew, ...safeCurrent];

  // Prevent duplication of IDs (keeping first occurrence)
  const seenIds = new Set<string>();
  const uniqueResults: GameResult[] = [];

  for (const item of combined) {
    let itemId = item.id;
    if (!itemId) {
      itemId = `gen-${Math.random().toString(36).substr(2, 9)}`;
    }
    if (!seenIds.has(itemId)) {
      seenIds.add(itemId);
      // Ensure the object has a valid ID
      uniqueResults.push({
        ...item,
        id: itemId
      });
    }
  }

  // Ensure chronological order (newest first, i.e., highest timestamp at the top)
  uniqueResults.sort((a, b) => b.timestamp - a.timestamp);

  // Return limited array
  return uniqueResults.slice(0, limit);
}


interface AppState {
  currentSession: Session | null;
  history: GameResult[];
  historyRoulette: GameResult[];
  historyBaccarat: GameResult[];
  backtestHistoryRoulette: GameResult[];
  backtestHistoryBaccarat: GameResult[];
  bankroll: Bankroll & { 
    management: ManagementConfig;
  };
  bankrollRoulette: Bankroll & { 
    management: ManagementConfig;
  };
  bankrollBaccarat: Bankroll & { 
    management: ManagementConfig;
  };
  strategies: Strategy[];
  strategiesRoulette: Strategy[];
  strategiesBaccarat: Strategy[];
  deletedSystemStrategyIds?: string[];
  gameType: GameType;
  isLoading: boolean;
  editingStrategyId: string | null;
  settings: {
    currency: string;
    language: string;
    notifications: boolean;
    compactMode: boolean;
    autoReset: boolean;
    backtestLimit: number;
    backtestLimitRoulette: number;
    backtestLimitBaccarat: number;
    heatmapSoundAlerts?: boolean;
    autoPauseEnabled?: boolean;
    defaultBacktestInstant?: boolean;
    globalBacktestGaleLimit?: number;
    extremeNightMode?: boolean;
    allNotificationsEnabled?: boolean;
    fontSizeScale?: 'small' | 'normal' | 'large' | 'xlarge';
  };
  
  isSimulationMode: boolean;
  simulationBankrollRoulette: Bankroll & { 
    management: ManagementConfig;
  };
  simulationBankrollBaccarat: Bankroll & { 
    management: ManagementConfig;
  };
  simulationHistoryRoulette: GameResult[];
  simulationHistoryBaccarat: GameResult[];
  toggleSimulationMode: (enabled?: boolean) => void;
  resetSimulationBankroll: (gameType?: GameType) => void;
  resetSimulationHistory: (gameType?: GameType) => void;

  // Actions
  setGameType: (type: GameType) => void;
  setEditingStrategyId: (id: string | null) => void;
  addResult: (result: GameResult) => void;
  removeLastResult: (explicitGameType?: GameType) => void;
  resetHistory: (type: GameType) => void;
  resetBacktestHistory: (type: GameType | 'all') => void;
  resetSession: () => void;
  updateBankroll: (update: Partial<AppState['bankroll']>, explicitGameType?: GameType) => void;
  updateSettings: (update: Partial<AppState['settings']>) => void;
  setBacktestLimit: (gameType: GameType, limit: number) => void;
  startSession: (balance: number) => void;
  endSession: () => void;
  addStrategy: (strategy: Strategy) => void;
  updateStrategy: (id: string, update: Partial<Strategy>) => void;
  deleteStrategy: (id: string) => void;
  deleteAllCustomStrategies: (gameType?: GameType) => void;
  restoreDefaultStrategies: () => void;
  toggleStrategy: (id: string) => void;
  seedHistory: (type: GameType, count: number) => void;
  seedBulkHistory: (rouletteResults: GameResult[], baccaratResults: GameResult[]) => void;
  seedGameHistory: (gameType: GameType, results: GameResult[]) => void;
  compactHistory: () => void;
  
  // Daily stats history integration
  activeOperationalDateRoulette: string;
  activeOperationalDateBaccarat: string;
  dailyHistory: DailyStatsRecord[];
  loadDailyStats: () => Promise<void>;
  closeOperationalDay: (gameType: GameType, notes?: string) => Promise<void>;
  checkAndTriggerAutoDayTransition: (gameType: GameType) => Promise<void>;
  saveDailyStatsRecord: (record: DailyStatsRecord) => Promise<void>;
  deleteDailyStatsRecord: (recordId: string) => Promise<void>;
  clearDailyHistory: () => Promise<void>;
  masterReset: () => Promise<void>;
}

const defaultBankrollRoulette = {
  balance: 1000,
  initialBalance: 1000,
  currency: 'BRL',
  profit: 0,
  drawdown: 0,
  drawdownLimit: 20,
  stopWin: 20,
  stopLoss: 50,
  maxDailyRounds: 0,
  management: {
    mode: ManagementMode.MARTINGALE,
    profile: RiskProfile.MODERATE,
    initialBet: 0.10,
    levels: 10,
    multiplier: 2,
    targetProfit: 20,
    stopLoss: 50,
    gameTarget: GameType.ROULETTE,
    coverZero: false,
    coverTie: false,
    minBet: 0.10,
    maxBet: 5000,
    minChip: 0.10,
    chipS84: 0.10,
    chipTpa84: 0.10,
    chipRegions: 0.10,
    chipSectors: 0.10,
    chipRacetrack: 0.10,
    useCategoryChips: false,
    unitsZero: 1.0
  }
};

const defaultBankrollBaccarat = {
  balance: 1000,
  initialBalance: 1000,
  currency: 'BRL',
  profit: 0,
  drawdown: 0,
  drawdownLimit: 20,
  stopWin: 50,
  stopLoss: 100,
  maxDailyRounds: 0,
  management: {
    mode: ManagementMode.MARTINGALE,
    profile: RiskProfile.MODERATE,
    initialBet: 1,
    levels: 10,
    multiplier: 2,
    targetProfit: 50,
    stopLoss: 100,
    gameTarget: GameType.BACCARAT,
    coverZero: false,
    coverTie: false,
    minBet: 0.20,
    maxBet: 5000,
    minChip: 0.20,
    unitsTier: 1.0
  }
};

const defaultStrategiesRoulette: Strategy[] = [
  {
    id: 'system-roulette-racetrack',
    name: 'TERMINAL S84',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-tpa84',
    name: 'TPA84 (Penúltimo + Antepenúltimo)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-angel84',
    name: 'Angel84',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-trends',
    name: 'Análise de Tendência Quente/Fria (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-probability',
    name: 'Análise de Probabilidades (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-historical-base',
    name: 'Base Histórica de Reconhecimento (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-roulette-delay',
    name: 'Análise de Frequência e Assertividade (Roleta)',
    gameType: GameType.ROULETTE,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  }
];

const defaultStrategiesBaccarat: Strategy[] = [
  {
    id: 'system-baccarat-trends',
    name: 'Análise de Tendência Quente/Fria (Baccarat)',
    gameType: GameType.BACCARAT,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-baccarat-probability',
    name: 'Análise de Probabilidades (Baccarat)',
    gameType: GameType.BACCARAT,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-baccarat-historical-base',
    name: 'Base Histórica de Reconhecimento (Baccarat)',
    gameType: GameType.BACCARAT,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  },
  {
    id: 'system-baccarat-delay',
    name: 'Análise de Frequência e Assertividade (Baccarat)',
    gameType: GameType.BACCARAT,
    isActive: true,
    rules: { bets: [] },
    isSystem: true,
    performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
  }
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeOperationalDateRoulette: new Date().toLocaleDateString('sv-SE'),
      activeOperationalDateBaccarat: new Date().toLocaleDateString('sv-SE'),
      dailyHistory: [],
      currentSession: null,
      history: [],
      historyRoulette: [],
      historyBaccarat: [],
      backtestHistoryRoulette: [],
      backtestHistoryBaccarat: [],
      bankrollRoulette: defaultBankrollRoulette,
      bankrollBaccarat: defaultBankrollBaccarat,
      bankroll: defaultBankrollRoulette,
      
      // Simulation / Training Mode State
      isSimulationMode: false,
      simulationBankrollRoulette: { ...defaultBankrollRoulette },
      simulationBankrollBaccarat: { ...defaultBankrollBaccarat },
      simulationHistoryRoulette: [],
      simulationHistoryBaccarat: [],

      strategiesRoulette: defaultStrategiesRoulette,
      strategiesBaccarat: defaultStrategiesBaccarat,
      strategies: defaultStrategiesRoulette,
      deletedSystemStrategyIds: [],
      gameType: GameType.ROULETTE,
      isLoading: false,
      editingStrategyId: null,
      settings: {
        currency: 'BRL',
        language: 'pt-BR',
        notifications: true,
        compactMode: false,
        autoReset: false,
        backtestLimit: 10000,
        backtestLimitRoulette: 10000,
        backtestLimitBaccarat: 10000,
        heatmapSoundAlerts: true,
        autoPauseEnabled: true,
        defaultBacktestInstant: false,
        globalBacktestGaleLimit: 2,
        extremeNightMode: false,
        allNotificationsEnabled: true,
        fontSizeScale: 'large',
      },

      toggleSimulationMode: (enabled) => set((state) => {
        const isRoulette = state.gameType === GameType.ROULETTE;
        const bankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';

        return {
          isSimulationMode: false,
          bankroll: state[bankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat),
          history: state[historyKey] || []
        };
      }),

      resetSimulationBankroll: (gameType) => set((state) => {
        const type = gameType || state.gameType;
        const isRoulette = type === GameType.ROULETTE;
        const simBankrollKey = isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat';
        const defaultSim = isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat;
        const currentSim = state[simBankrollKey] || defaultSim;

        const autoStopLoss = currentSim.management
          ? calculateCumulativeGaleLoss(currentSim.management, currentSim.initialBalance)
          : (currentSim.stopLoss || (isRoulette ? 50 : 100));

        const stopLossToUse = currentSim.stopLoss && currentSim.stopLoss !== 50 && currentSim.stopLoss !== 100
          ? currentSim.stopLoss
          : autoStopLoss;

        const resetBankroll = {
          ...currentSim,
          balance: currentSim.initialBalance,
          profit: 0,
          drawdown: 0,
          stopLoss: stopLossToUse,
          management: {
            ...currentSim.management,
            stopLoss: stopLossToUse
          }
        };

        const isCurrentActive = state.gameType === type && state.isSimulationMode;
        return {
          [simBankrollKey]: resetBankroll,
          ...(isCurrentActive ? { bankroll: resetBankroll } : {})
        };
      }),

      resetSimulationHistory: (gameType) => set((state) => {
        const type = gameType || state.gameType;
        const isRoulette = type === GameType.ROULETTE;
        const simHistKey = isRoulette ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat';
        const simBankrollKey = isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat';
        const defaultSim = isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat;
        const currentSim = state[simBankrollKey] || defaultSim;

        const autoStopLoss = currentSim.management
          ? calculateCumulativeGaleLoss(currentSim.management, currentSim.initialBalance)
          : (currentSim.stopLoss || (isRoulette ? 50 : 100));

        const stopLossToUse = currentSim.stopLoss && currentSim.stopLoss !== 50 && currentSim.stopLoss !== 100
          ? currentSim.stopLoss
          : autoStopLoss;

        const resetBankroll = {
          ...currentSim,
          balance: currentSim.initialBalance,
          profit: 0,
          drawdown: 0,
          stopLoss: stopLossToUse,
          management: {
            ...currentSim.management,
            stopLoss: stopLossToUse
          }
        };

        const isCurrentActive = state.gameType === type && state.isSimulationMode;
        return {
          [simHistKey]: [],
          [simBankrollKey]: resetBankroll,
          ...(isCurrentActive ? { history: [], bankroll: resetBankroll } : {})
        };
      }),

      setGameType: (gameType) => set((state) => {
        const isRoulette = gameType === GameType.ROULETTE;
        const isSim = state.isSimulationMode;

        const bankrollKey = isSim
          ? (isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat')
          : (isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat');
        const historyKey = isSim
          ? (isRoulette ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat')
          : (isRoulette ? 'historyRoulette' : 'historyBaccarat');

        const bankrollRoulette = state.bankrollRoulette || defaultBankrollRoulette;
        const bankrollBaccarat = state.bankrollBaccarat || defaultBankrollBaccarat;
        const targetBankroll = state[bankrollKey] || (isRoulette ? bankrollRoulette : bankrollBaccarat);

        const historyRoulette = state.historyRoulette || [];
        const historyBaccarat = state.historyBaccarat || [];
        const targetHistory = state[historyKey] || [];

        const strategiesRoulette = state.strategiesRoulette || [];
        const strategiesBaccarat = state.strategiesBaccarat || [];
        const targetStrategies = isRoulette ? strategiesRoulette : strategiesBaccarat;

        return { 
          gameType,
          bankrollRoulette,
          bankrollBaccarat,
          bankroll: targetBankroll,
          historyRoulette,
          historyBaccarat,
          history: targetHistory,
          strategiesRoulette,
          strategiesBaccarat,
          strategies: targetStrategies
        };
      }),
      
      setEditingStrategyId: (id) => set({ editingStrategyId: id }),

      addResult: (result) => {
        set((state) => {
          const isRoulette = result.gameType === GameType.ROULETTE;
          const isSim = state.isSimulationMode || result.isSimulation;

          if (isSim) {
            const simHistKey = isRoulette ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat';
            const simBankrollKey = isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat';
            const currentSimBankroll = state[simBankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat);

            const taggedResult = { ...result, isSimulation: true };
            const newSimHistory = mergeAndValidateResults(state[simHistKey] || [], [taggedResult], 10000);
            const newBalance = currentSimBankroll.balance + (result.profit || 0);
            const newProfit = (currentSimBankroll.profit || 0) + (result.profit || 0);

            const newSimBankroll = {
              ...currentSimBankroll,
              balance: newBalance,
              profit: newProfit
            };

            const isCurrentActive = state.gameType === result.gameType && state.isSimulationMode;

            return {
              [simHistKey]: newSimHistory,
              [simBankrollKey]: newSimBankroll,
              ...(isCurrentActive ? { 
                history: newSimHistory, 
                bankroll: newSimBankroll
              } : {})
            };
          }

          const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';
          const backtestKey = isRoulette ? 'backtestHistoryRoulette' : 'backtestHistoryBaccarat';
          const limit = isRoulette 
            ? (state.settings.backtestLimitRoulette ?? 10000)
            : (state.settings.backtestLimitBaccarat ?? 10000);

          const newGameHistory = mergeAndValidateResults(state[historyKey], [result], 10000);
          const newBacktestHistory = mergeAndValidateResults(state[backtestKey] || [], [result], limit);
          
          const isCurrentActive = state.gameType === result.gameType && !state.isSimulationMode;

          return { 
            [historyKey]: newGameHistory,
            [backtestKey]: newBacktestHistory,
            history: isCurrentActive ? newGameHistory : state.history
          };
        });

        // Defer heavy pattern mining asynchronously so button click renders instantly
        if (result.gameType === GameType.ROULETTE) {
          setTimeout(() => {
            const state = get();
            const isSim = state.isSimulationMode || result.isSimulation;
            const historyKey = isSim ? 'simulationHistoryRoulette' : 'historyRoulette';
            const hist = state[historyKey] || [];
            const minedPatterns = mineRoulettePatterns(hist);
            const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
            const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
            const updatedRouletteStrategies = [...nonMined, ...minedStrats];
            set({
              strategiesRoulette: updatedRouletteStrategies,
              strategies: state.gameType === result.gameType ? updatedRouletteStrategies : state.strategies
            });
          }, 10);
        } else {
          setTimeout(() => {
            const state = get();
            const isSim = state.isSimulationMode || result.isSimulation;
            const historyKey = isSim ? 'simulationHistoryBaccarat' : 'historyBaccarat';
            const hist = state[historyKey] || [];
            const minedPatterns = mineBaccaratPatterns(hist);
            const minedStrats = convertMinedPatternsToStrategies(minedPatterns);
            const nonMined = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
            const updatedBaccaratStrategies = [...nonMined, ...minedStrats];
            set({
              strategiesBaccarat: updatedBaccaratStrategies,
              strategies: state.gameType === result.gameType ? updatedBaccaratStrategies : state.strategies
            });
          }, 10);
        }
      },
      
      removeLastResult: (explicitGameType) => set((state) => {
        const targetGameType = (
          typeof explicitGameType === 'string' &&
          (explicitGameType === GameType.ROULETTE || explicitGameType === GameType.BACCARAT)
        ) ? explicitGameType as GameType : state.gameType;

        const isRoulette = targetGameType === GameType.ROULETTE;
        const isCurrentActive = state.gameType === targetGameType;

        if (state.isSimulationMode) {
          const simHistKey = isRoulette ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat';
          const simBankrollKey = isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat';
          const simList = state[simHistKey] || [];
          const lastRes = simList[0];
          const subProfit = lastRes ? (lastRes.profit || 0) : 0;
          const currentSimBankroll = state[simBankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat);

          const newSimBankroll = {
            ...currentSimBankroll,
            balance: currentSimBankroll.balance - subProfit,
            profit: (currentSimBankroll.profit || 0) - subProfit
          };
          const newSimList = simList.slice(1);

          let updatedStrategiesList = isRoulette ? state.strategiesRoulette : state.strategiesBaccarat;
          if (isRoulette) {
            const minedPatterns = mineRoulettePatterns(newSimList);
            const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
            const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
            updatedStrategiesList = [...nonMined, ...minedStrats];
          } else {
            const minedPatterns = mineBaccaratPatterns(newSimList);
            const minedStrats = convertMinedPatternsToStrategies(minedPatterns);
            const nonMined = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
            updatedStrategiesList = [...nonMined, ...minedStrats];
          }

          return {
            [simHistKey]: newSimList,
            [simBankrollKey]: newSimBankroll,
            ...(isRoulette ? { strategiesRoulette: updatedStrategiesList } : { strategiesBaccarat: updatedStrategiesList }),
            ...(isCurrentActive ? {
              history: newSimList,
              bankroll: newSimBankroll,
              strategies: updatedStrategiesList
            } : {})
          };
        }

        const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';
        const backtestKey = isRoulette ? 'backtestHistoryRoulette' : 'backtestHistoryBaccarat';
        
        const lastResult = state[historyKey][0];
        const profitToSubtract = lastResult ? (lastResult.profit || 0) : 0;
        
        const currentBankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        const currentBankroll = state[currentBankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat);

        const newBankroll = {
          ...currentBankroll,
          balance: currentBankroll.balance - profitToSubtract
        };

        const newHistoryList = state[historyKey].slice(1);

        let updatedStrategiesList = isRoulette ? state.strategiesRoulette : state.strategiesBaccarat;
        if (isRoulette) {
          const minedPatterns = mineRoulettePatterns(newHistoryList);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          updatedStrategiesList = [...nonMined, ...minedStrats];
        } else {
          const minedPatterns = mineBaccaratPatterns(newHistoryList);
          const minedStrats = convertMinedPatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
          updatedStrategiesList = [...nonMined, ...minedStrats];
        }

        return {
          [historyKey]: newHistoryList,
          [backtestKey]: (state[backtestKey] || []).slice(1),
          ...(isRoulette ? { strategiesRoulette: updatedStrategiesList } : { strategiesBaccarat: updatedStrategiesList }),
          [currentBankrollKey]: newBankroll,
          ...(isCurrentActive ? {
            history: newHistoryList,
            bankroll: newBankroll,
            strategies: updatedStrategiesList
          } : {})
        };
      }),
      
      resetHistory: (type) => set((state) => {
        const targetGameType = (
          typeof type === 'string' &&
          (type === GameType.ROULETTE || type === GameType.BACCARAT)
        ) ? type as GameType : state.gameType;

        const isRoulette = targetGameType === GameType.ROULETTE;

        if (state.isSimulationMode) {
          const simHistKey = isRoulette ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat';
          const simBankrollKey = isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat';
          const currentSim = state[simBankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat);

          const autoStopLoss = currentSim.management
            ? calculateCumulativeGaleLoss(currentSim.management, currentSim.initialBalance)
            : (currentSim.stopLoss || (isRoulette ? 50 : 100));

          const stopLossToUse = currentSim.stopLoss && currentSim.stopLoss !== 50 && currentSim.stopLoss !== 100
            ? currentSim.stopLoss
            : autoStopLoss;

          const updatedSim = {
            ...currentSim,
            balance: currentSim.initialBalance,
            profit: 0,
            drawdown: 0,
            stopLoss: stopLossToUse,
            management: {
              ...currentSim.management,
              stopLoss: stopLossToUse
            }
          };

          const isCurrentActive = state.gameType === type;

          let updatedBaccaratStrategies = state.strategiesBaccarat;
          if (!isRoulette) {
            const minedPatterns = mineBaccaratPatterns([]);
            const minedStrats = convertMinedPatternsToStrategies(minedPatterns);
            const nonMined = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
            updatedBaccaratStrategies = [...nonMined, ...minedStrats];
          }

          return {
            [simHistKey]: [],
            [simBankrollKey]: updatedSim,
            strategiesBaccarat: updatedBaccaratStrategies,
            ...(isCurrentActive ? {
              history: [],
              bankroll: updatedSim,
              strategies: !isRoulette ? updatedBaccaratStrategies : state.strategies
            } : {})
          };
        }

        const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';
        
        const currentBankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        const currentBankroll = state[currentBankrollKey] || state.bankroll;

        const autoStopLoss = currentBankroll.management
          ? calculateCumulativeGaleLoss(currentBankroll.management, currentBankroll.initialBalance)
          : (currentBankroll.stopLoss || (isRoulette ? 50 : 100));

        const stopLossToUse = currentBankroll.stopLoss && currentBankroll.stopLoss !== 50 && currentBankroll.stopLoss !== 100
          ? currentBankroll.stopLoss
          : autoStopLoss;

        const updatedBankroll = {
          ...currentBankroll,
          balance: currentBankroll.initialBalance,
          profit: 0,
          drawdown: 0,
          stopLoss: stopLossToUse,
          management: {
            ...currentBankroll.management,
            stopLoss: stopLossToUse
          }
        };

        const strategiesKey = isRoulette ? 'strategiesRoulette' : 'strategiesBaccarat';
        const updatedStrategies = state[strategiesKey].map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));

        const isCurrentActive = state.gameType === type;

        return { 
          [historyKey]: [],
          [strategiesKey]: updatedStrategies,
          [currentBankrollKey]: updatedBankroll,
          ...(isCurrentActive ? { 
            history: [], 
            bankroll: updatedBankroll,
            strategies: updatedStrategies
          } : {})
        };
      }),

      resetBacktestHistory: (type) => set((state) => {
        if (type === 'all') {
          const updatedBankrollRoulette = {
            ...state.bankrollRoulette,
            balance: state.bankrollRoulette.initialBalance,
            profit: 0,
            drawdown: 0
          };
          const updatedBankrollBaccarat = {
            ...state.bankrollBaccarat,
            balance: state.bankrollBaccarat.initialBalance,
            profit: 0,
            drawdown: 0
          };
          const activeBankroll = state.gameType === GameType.ROULETTE ? updatedBankrollRoulette : updatedBankrollBaccarat;
          
          const resetStrategiesRoulette = (state.strategiesRoulette || []).map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));
          const resetStrategiesBaccarat = (state.strategiesBaccarat || []).map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));

          return {
            backtestHistoryRoulette: [],
            backtestHistoryBaccarat: [],
            bankrollRoulette: updatedBankrollRoulette,
            bankrollBaccarat: updatedBankrollBaccarat,
            bankroll: activeBankroll,
            strategiesRoulette: resetStrategiesRoulette,
            strategiesBaccarat: resetStrategiesBaccarat,
            strategies: state.gameType === GameType.ROULETTE ? resetStrategiesRoulette : resetStrategiesBaccarat,
            currentSession: null
          };
        }

        const isRoulette = type === GameType.ROULETTE;
        const currentBankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        const currentBankroll = state[currentBankrollKey] || state.bankroll;

        const updatedBankroll = {
          ...currentBankroll,
          balance: currentBankroll.initialBalance,
          profit: 0,
          drawdown: 0
        };

        const strategiesKey = isRoulette ? 'strategiesRoulette' : 'strategiesBaccarat';
        const updatedStrategies = state[strategiesKey].map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));

        const isCurrentActive = state.gameType === type;

        if (isRoulette) {
          return {
            backtestHistoryRoulette: [],
            bankrollRoulette: updatedBankroll,
            strategiesRoulette: updatedStrategies,
            ...(isCurrentActive ? { 
              bankroll: updatedBankroll, 
              strategies: updatedStrategies 
            } : {})
          };
        } else {
          return {
            backtestHistoryBaccarat: [],
            bankrollBaccarat: updatedBankroll,
            strategiesBaccarat: updatedStrategies,
            ...(isCurrentActive ? { 
              bankroll: updatedBankroll, 
              strategies: updatedStrategies 
            } : {})
          };
        }
      }),

      resetSession: () => set((state) => {
        const updatedBankrollRoulette = {
          ...state.bankrollRoulette,
          balance: state.bankrollRoulette.initialBalance,
          profit: 0,
          drawdown: 0
        };
        const updatedBankrollBaccarat = {
          ...state.bankrollBaccarat,
          balance: state.bankrollBaccarat.initialBalance,
          profit: 0,
          drawdown: 0
        };
        const activeBankroll = state.gameType === GameType.ROULETTE ? updatedBankrollRoulette : updatedBankrollBaccarat;
        
        const resetStrategiesRoulette = (state.strategiesRoulette || []).map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));
        const resetStrategiesBaccarat = (state.strategiesBaccarat || []).map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));

        return {
          history: [],
          historyRoulette: [],
          historyBaccarat: [],
          backtestHistoryRoulette: [],
          backtestHistoryBaccarat: [],
          bankrollRoulette: updatedBankrollRoulette,
          bankrollBaccarat: updatedBankrollBaccarat,
          bankroll: activeBankroll,
          strategiesRoulette: resetStrategiesRoulette,
          strategiesBaccarat: resetStrategiesBaccarat,
          strategies: state.gameType === GameType.ROULETTE ? resetStrategiesRoulette : resetStrategiesBaccarat
        };
      }),
      
      updateBankroll: (update, explicitGameType) => set((state) => {
        const targetGameType = (
          typeof explicitGameType === 'string' &&
          (explicitGameType === GameType.ROULETTE || explicitGameType === GameType.BACCARAT)
        ) ? explicitGameType as GameType : state.gameType;
        const isRoulette = targetGameType === GameType.ROULETTE;
        const isCurrentActive = state.gameType === targetGameType;

        if (state.isSimulationMode) {
          const simBankrollKey = isRoulette ? 'simulationBankrollRoulette' : 'simulationBankrollBaccarat';
          const currentSimBankroll = state[simBankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat);

          const mergedManagement = update.management 
            ? { ...(currentSimBankroll.management || {}), ...update.management }
            : currentSimBankroll.management;

          const newSimBankroll = {
            ...currentSimBankroll,
            ...update,
            management: mergedManagement
          };

          const simHistKey = isRoulette ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat';
          if (update.initialBalance !== undefined && update.balance === undefined && (state[simHistKey] || []).length === 0) {
            newSimBankroll.balance = update.initialBalance;
          }

          if (update.management || update.initialBalance !== undefined) {
            const configToUse = newSimBankroll.management;
            if (configToUse.gameTarget === undefined) {
              configToUse.gameTarget = isRoulette ? GameType.ROULETTE : GameType.BACCARAT;
            }
            const initialBalanceToUse = update.initialBalance !== undefined ? update.initialBalance : currentSimBankroll.initialBalance;
            const autoStopLoss = calculateCumulativeGaleLoss(configToUse, initialBalanceToUse);
            newSimBankroll.stopLoss = autoStopLoss;
          }

          newSimBankroll.management = {
            ...newSimBankroll.management,
            targetProfit: newSimBankroll.stopWin,
            stopLoss: newSimBankroll.stopLoss
          };

          return {
            [simBankrollKey]: newSimBankroll,
            ...(isCurrentActive ? { bankroll: newSimBankroll } : {})
          };
        }

        const currentBankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        const currentBankroll = state[currentBankrollKey] || (isRoulette ? defaultBankrollRoulette : defaultBankrollBaccarat);
        
        // Deep/nested merge for management config to avoid overwriting all settings when partially updating management
        const mergedManagement = update.management 
          ? { ...(currentBankroll.management || {}), ...update.management }
          : currentBankroll.management;

        const newBankroll = { 
          ...currentBankroll, 
          ...update,
          management: mergedManagement
        };
        const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';
        if (update.initialBalance !== undefined && update.balance === undefined && (state[historyKey] || []).length === 0) {
          newBankroll.balance = update.initialBalance;
        }

        // Auto-calculate stopLoss if management settings or initial balance change
        if (update.management || update.initialBalance !== undefined) {
          const configToUse = newBankroll.management;
          
          if (configToUse.gameTarget === undefined) {
            configToUse.gameTarget = isRoulette ? GameType.ROULETTE : GameType.BACCARAT;
          }

          const initialBalanceToUse = update.initialBalance !== undefined ? update.initialBalance : currentBankroll.initialBalance;
          
          const autoStopLoss = calculateCumulativeGaleLoss(configToUse, initialBalanceToUse);
          newBankroll.stopLoss = autoStopLoss;
        }

        newBankroll.management = {
          ...newBankroll.management,
          targetProfit: newBankroll.stopWin,
          stopLoss: newBankroll.stopLoss
        };
        return { 
          [currentBankrollKey]: newBankroll,
          ...(isCurrentActive ? { bankroll: newBankroll } : {})
        };
      }),

      updateSettings: (update) => set((state) => ({
        settings: { ...state.settings, ...update }
      })),

      setBacktestLimit: (gameType, limit) => set((state) => {
        const isRoulette = gameType === GameType.ROULETTE;
        const limitKey = isRoulette ? 'backtestLimitRoulette' : 'backtestLimitBaccarat';
        const backtestKey = isRoulette ? 'backtestHistoryRoulette' : 'backtestHistoryBaccarat';
        
        return {
          settings: {
            ...state.settings,
            [limitKey]: limit
          },
          [backtestKey]: state[backtestKey] ? state[backtestKey].slice(0, limit) : []
        };
      }),
      
      startSession: (balance) => set((state) => ({
        currentSession: {
          id: Math.random().toString(36).substr(2, 9),
          gameType: state.gameType,
          startTime: Date.now(),
          initialBalance: balance,
          currentBalance: balance,
          profit: 0,
          history: [],
          status: 'active'
        }
      })),
      
      endSession: () => set((state) => ({
        currentSession: state.currentSession ? { ...state.currentSession, status: 'finished', endTime: Date.now() } : null
      })),
      
      addStrategy: (strategy) => set((state) => {
        const isRoulette = strategy.gameType === GameType.ROULETTE;
        const strategiesKey = isRoulette ? 'strategiesRoulette' : 'strategiesBaccarat';
        const currentList = state[strategiesKey] || [];
        const updatedList = [...currentList.filter(s => s.id !== strategy.id), strategy];
        const cleanedDeletedIds = (state.deletedSystemStrategyIds || []).filter(id => id !== strategy.id);

        return {
          deletedSystemStrategyIds: cleanedDeletedIds,
          [strategiesKey]: updatedList,
          strategies: state.gameType === strategy.gameType ? updatedList : state.strategies
        };
      }),

      updateStrategy: (id, update) => set((state) => {
        const updateInList = (list: Strategy[]) => list.map(s => s.id === id ? { ...s, ...update } : s);
        const nextRoulette = updateInList(state.strategiesRoulette || []);
        const nextBaccarat = updateInList(state.strategiesBaccarat || []);
        const nextActive = updateInList(state.strategies || []);
        return {
          strategiesRoulette: nextRoulette,
          strategiesBaccarat: nextBaccarat,
          strategies: nextActive
        };
      }),

      deleteStrategy: (id) => set((state) => {
        // Always protect core strategies from being deleted
        const protectedIds = ['system-roulette-racetrack', 'system-roulette-tpa84', 'system-roulette-angel84'];
        if (protectedIds.includes(id)) {
          return {}; // Block deletion
        }

        const nextRoulette = (state.strategiesRoulette || []).filter(s => s.id !== id);
        const nextBaccarat = (state.strategiesBaccarat || []).filter(s => s.id !== id);
        const nextActive = (state.strategies || []).filter(s => s.id !== id);
        const updatedDeletedIds = Array.from(new Set([...(state.deletedSystemStrategyIds || []), id]));

        return {
          deletedSystemStrategyIds: updatedDeletedIds,
          strategiesRoulette: nextRoulette,
          strategiesBaccarat: nextBaccarat,
          strategies: nextActive,
          editingStrategyId: state.editingStrategyId === id ? null : state.editingStrategyId
        };
      }),

      deleteAllCustomStrategies: (gameType) => set((state) => {
        const filterOutCustom = (list: Strategy[]) => (list || []).filter(s => s.isSystem || s.id.startsWith('system-'));
        
        if (gameType === GameType.ROULETTE) {
          const nextR = filterOutCustom(state.strategiesRoulette);
          return {
            strategiesRoulette: nextR,
            strategies: state.gameType === GameType.ROULETTE ? nextR : state.strategies
          };
        } else if (gameType === GameType.BACCARAT) {
          const nextB = filterOutCustom(state.strategiesBaccarat);
          return {
            strategiesBaccarat: nextB,
            strategies: state.gameType === GameType.BACCARAT ? nextB : state.strategies
          };
        } else {
          const nextR = filterOutCustom(state.strategiesRoulette);
          const nextB = filterOutCustom(state.strategiesBaccarat);
          return {
            strategiesRoulette: nextR,
            strategiesBaccarat: nextB,
            strategies: state.gameType === GameType.ROULETTE ? nextR : nextB
          };
        }
      }),

      restoreDefaultStrategies: () => set((state) => {
        const cleanSystemRoulette = defaultStrategiesRoulette.map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));
        const cleanSystemBaccarat = defaultStrategiesBaccarat.map(s => ({
          ...s,
          performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
        }));

        return {
          deletedSystemStrategyIds: [],
          strategiesRoulette: cleanSystemRoulette,
          strategiesBaccarat: cleanSystemBaccarat,
          strategies: state.gameType === GameType.ROULETTE ? cleanSystemRoulette : cleanSystemBaccarat
        };
      }),

      toggleStrategy: (id) => set((state) => {
        const toggleInList = (list: Strategy[]) => (list || []).map(s => s.id === id ? { ...s, isActive: !s.isActive } : s);
        const nextRoulette = toggleInList(state.strategiesRoulette || []);
        const nextBaccarat = toggleInList(state.strategiesBaccarat || []);
        return {
          strategiesRoulette: nextRoulette,
          strategiesBaccarat: nextBaccarat,
          strategies: state.gameType === GameType.ROULETTE ? nextRoulette : nextBaccarat
        };
      }),

      seedHistory: (type, count) => set((state) => {
        const isSim = state.isSimulationMode;
        const historyKey = isSim
          ? (type === GameType.ROULETTE ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat')
          : (type === GameType.ROULETTE ? 'historyRoulette' : 'historyBaccarat');
        const backtestKey = type === GameType.ROULETTE ? 'backtestHistoryRoulette' : 'backtestHistoryBaccarat';
        
        const seeded: GameResult[] = [];
        const baseTime = Date.now() - (count * 60 * 1000);
        
        for (let i = 0; i < count; i++) {
          let resultValue: any;
          if (type === GameType.ROULETTE) {
            resultValue = Math.floor(Math.random() * 37);
          } else {
            const rand = Math.random();
            if (rand < 0.44) resultValue = 'P';
            else if (rand < 0.88) resultValue = 'B';
            else resultValue = 'T';
          }
          
          seeded.push({
            id: `seed-${i}-${Math.random().toString(36).substr(2, 5)}`,
            gameType: type,
            result: resultValue,
            timestamp: baseTime + (i * 60 * 1000),
            sessionId: 'seed-session',
            metadata: {},
            score: Math.floor(65 + Math.random() * 30),
            isWin: Math.random() > 0.35,
            profit: 0,
            isSimulation: isSim
          });
        }
        
        const newGameHistory = mergeAndValidateResults(state[historyKey] || [], seeded, 10000);
        const newBacktestHistory = mergeAndValidateResults(state[backtestKey] || [], seeded, 10000);
        
        let updatedRouletteStrategies = state.strategiesRoulette;
        let updatedBaccaratStrategies = state.strategiesBaccarat;
        if (type === GameType.ROULETTE) {
          const minedPatterns = mineRoulettePatterns(newGameHistory);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          updatedRouletteStrategies = [...nonMined, ...minedStrats];
        } else {
          const minedPatterns = mineBaccaratPatterns(newGameHistory);
          const minedStrats = convertMinedPatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
          updatedBaccaratStrategies = [...nonMined, ...minedStrats];
        }

        const isCurrentActive = state.gameType === type;

        return {
          [historyKey]: newGameHistory,
          [backtestKey]: newBacktestHistory,
          strategiesRoulette: updatedRouletteStrategies,
          strategiesBaccarat: updatedBaccaratStrategies,
          ...(isCurrentActive ? { 
            history: newGameHistory,
            strategies: type === GameType.ROULETTE ? updatedRouletteStrategies : updatedBaccaratStrategies 
          } : {})
        };
      }),

      seedBulkHistory: (rouletteResults, baccaratResults) => set((state) => {
        const validatedRoulette = mergeAndValidateResults([], rouletteResults, 10000);
        const validatedBaccarat = mergeAndValidateResults([], baccaratResults, 10000);
        const activeHistory = state.gameType === GameType.ROULETTE ? validatedRoulette : validatedBaccarat;

        const minedRoulette = convertMinedRoulettePatternsToStrategies(mineRoulettePatterns(validatedRoulette));
        const nonMinedRoulette = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
        const updatedRouletteStrategies = [...nonMinedRoulette, ...minedRoulette];

        const minedBaccarat = convertMinedPatternsToStrategies(mineBaccaratPatterns(validatedBaccarat));
        const nonMinedBaccarat = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
        const updatedBaccaratStrategies = [...nonMinedBaccarat, ...minedBaccarat];

        return {
          historyRoulette: validatedRoulette,
          historyBaccarat: validatedBaccarat,
          backtestHistoryRoulette: validatedRoulette.slice(0, 10000),
          backtestHistoryBaccarat: validatedBaccarat.slice(0, 10000),
          strategiesRoulette: updatedRouletteStrategies,
          strategiesBaccarat: updatedBaccaratStrategies,
          strategies: state.gameType === GameType.ROULETTE ? updatedRouletteStrategies : updatedBaccaratStrategies,
          history: activeHistory
        };
      }),

      seedGameHistory: (gameType, results) => set((state) => {
        const isSim = state.isSimulationMode;
        const historyKey = isSim
          ? (gameType === GameType.ROULETTE ? 'simulationHistoryRoulette' : 'simulationHistoryBaccarat')
          : (gameType === GameType.ROULETTE ? 'historyRoulette' : 'historyBaccarat');
        const backtestKey = gameType === GameType.ROULETTE ? 'backtestHistoryRoulette' : 'backtestHistoryBaccarat';
        
        const newGameHistory = mergeAndValidateResults(state[historyKey] || [], results, 10000);
        const newBacktestHistory = mergeAndValidateResults(state[backtestKey] || [], results, 10000);
        
        let updatedRouletteStrategies = state.strategiesRoulette;
        let updatedBaccaratStrategies = state.strategiesBaccarat;
        if (gameType === GameType.ROULETTE) {
          const minedPatterns = mineRoulettePatterns(newGameHistory);
          const minedStrats = convertMinedRoulettePatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesRoulette || []).filter(s => !s.id.startsWith('mined-roulette-'));
          updatedRouletteStrategies = [...nonMined, ...minedStrats];
        } else {
          const minedPatterns = mineBaccaratPatterns(newGameHistory);
          const minedStrats = convertMinedPatternsToStrategies(minedPatterns);
          const nonMined = (state.strategiesBaccarat || []).filter(s => !s.id.startsWith('mined-baccarat-'));
          updatedBaccaratStrategies = [...nonMined, ...minedStrats];
        }

        const isCurrentActive = state.gameType === gameType;

        return {
          [historyKey]: newGameHistory,
          [backtestKey]: newBacktestHistory,
          strategiesRoulette: updatedRouletteStrategies,
          strategiesBaccarat: updatedBaccaratStrategies,
          ...(isCurrentActive ? { 
            history: newGameHistory,
            strategies: gameType === GameType.ROULETTE ? updatedRouletteStrategies : updatedBaccaratStrategies 
          } : {})
        };
      }),

      compactHistory: () => set((state) => {
        const historyRoulette = (state.historyRoulette || []).slice(0, 500);
        const historyBaccarat = (state.historyBaccarat || []).slice(0, 500);
        const backtestHistoryRoulette = (state.backtestHistoryRoulette || []).slice(0, 500);
        const backtestHistoryBaccarat = (state.backtestHistoryBaccarat || []).slice(0, 500);
        const history = state.gameType === GameType.ROULETTE ? historyRoulette : historyBaccarat;
        return {
          historyRoulette,
          historyBaccarat,
          backtestHistoryRoulette,
          backtestHistoryBaccarat,
          history
        };
      }),

      loadDailyStats: async () => {
        const records = await dailyStatsService.getAllDailyStats();
        set({ dailyHistory: records });
      },

      saveDailyStatsRecord: async (record) => {
        await dailyStatsService.saveDailyStats(record);
        const records = await dailyStatsService.getAllDailyStats();
        set({ dailyHistory: records });
      },

      closeOperationalDay: async (gameType, notes = "") => {
        if (get().isSimulationMode) return;

        const isRoulette = gameType === GameType.ROULETTE;
        const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';
        const dateKey = isRoulette ? 'activeOperationalDateRoulette' : 'activeOperationalDateBaccarat';
        const bankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        
        const state = get();
        const currentDate = state[dateKey] || new Date().toLocaleDateString('sv-SE');
        const dayOps = state[historyKey] || [];
        const currentBankroll = state[bankrollKey];

        // Fetch up-to-date records to determine the correct sequential operation number
        const existingRecords = await dailyStatsService.getAllDailyStats();
        const existingRecordsOfGameType = existingRecords.filter(r => r.gameType === gameType);
        const operationNumber = existingRecordsOfGameType.length + 1;
        
        const calculated = dailyStatsService.calculateDailyStats(
          currentDate,
          gameType,
          dayOps,
          currentBankroll.initialBalance,
          currentBankroll.balance,
          notes,
          currentBankroll.management.levels || 3,
          operationNumber
        );

        await dailyStatsService.saveDailyStats(calculated);

        // Transition: Final balance of closed day becomes the initial balance of the new day
        const autoStopLoss = calculateCumulativeGaleLoss(currentBankroll.management, currentBankroll.balance);
        const updatedBankroll = {
          ...currentBankroll,
          initialBalance: currentBankroll.balance,
          stopLoss: autoStopLoss,
          management: {
            ...currentBankroll.management,
            stopLoss: autoStopLoss
          },
          profit: 0,
          drawdown: 0
        };

        const nextDate = new Date().toLocaleDateString('sv-SE');
        const newSessionId = `sess-${Math.random().toString(36).substr(2, 9)}`;

        const nextStateUpdate: any = {
          [historyKey]: [],
          [bankrollKey]: updatedBankroll,
          [dateKey]: nextDate,
          currentSession: {
            id: newSessionId,
            gameType,
            startTime: Date.now(),
            initialBalance: updatedBankroll.balance,
            currentBalance: updatedBankroll.balance,
            profit: 0,
            history: [],
            status: 'active'
          }
        };

        if (state.gameType === gameType) {
          nextStateUpdate.history = [];
          nextStateUpdate.bankroll = updatedBankroll;
        }

        set(nextStateUpdate);

        const updatedHistory = await dailyStatsService.getAllDailyStats();
        set({ dailyHistory: updatedHistory });
      },

      checkAndTriggerAutoDayTransition: async (gameType) => {
        if (get().isSimulationMode) return;

        const isRoulette = gameType === GameType.ROULETTE;
        const dateKey = isRoulette ? 'activeOperationalDateRoulette' : 'activeOperationalDateBaccarat';
        const historyKey = isRoulette ? 'historyRoulette' : 'historyBaccarat';
        const bankrollKey = isRoulette ? 'bankrollRoulette' : 'bankrollBaccarat';
        
        const state = get();
        const activeDate = state[dateKey];
        const todayDate = new Date().toLocaleDateString('sv-SE');
        const bankroll = state[bankrollKey];
        const history = state[historyKey] || [];

        // Check 1: Date transition
        if (activeDate && activeDate !== todayDate) {
          console.log(`[Auto Transition] Transição automática de data de ${activeDate} para ${todayDate}.`);
          await state.closeOperationalDay(gameType, "Fechamento automático por transição de data.");
          return;
        }

        // Check 2: Max daily rounds transition
        if (bankroll && bankroll.maxDailyRounds && bankroll.maxDailyRounds > 0 && history.length >= bankroll.maxDailyRounds) {
          console.log(`[Auto Transition] Limite diário de rodadas atingido (${history.length}/${bankroll.maxDailyRounds}).`);
          await state.closeOperationalDay(gameType, `Fechamento automático por limite diário de ${bankroll.maxDailyRounds} rodadas atingido.`);
        }
      },

      deleteDailyStatsRecord: async (recordId: string) => {
        await dailyStatsService.deleteDailyStatsRecord(recordId);
        set((state) => ({
          dailyHistory: state.dailyHistory.filter((r) => r.id !== recordId)
        }));
      },

      clearDailyHistory: async () => {
        await dailyStatsService.clearAllDailyStats();
        set({ dailyHistory: [] });
      },

      masterReset: async () => {
        // 1. Clear all daily stats from LocalStorage and cloud Firestore database
        await dailyStatsService.clearAllDailyStats();

        // 2. Clear histories, reset bankrolls, erase custom strategies and reset performance stats
        set((state) => {
          // Reset performance metrics (win rate, wins, losses, entries, roi, drawdown) to zero for system strategies
          const cleanSystemRoulette = defaultStrategiesRoulette.map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));

          const cleanSystemBaccarat = defaultStrategiesBaccarat.map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));

          return {
            // Reset game history
            historyRoulette: [],
            historyBaccarat: [],
            history: [],

            // Reset backtest history
            backtestHistoryRoulette: [],
            backtestHistoryBaccarat: [],

            // Reset simulation history
            simulationHistoryRoulette: [],
            simulationHistoryBaccarat: [],

            // Restore initial default bankrolls
            bankrollRoulette: { ...defaultBankrollRoulette },
            bankrollBaccarat: { ...defaultBankrollBaccarat },
            bankroll: state.gameType === GameType.ROULETTE 
              ? { ...defaultBankrollRoulette } 
              : { ...defaultBankrollBaccarat },

            // Erase all custom strategies and restore only clean system default strategies
            strategiesRoulette: cleanSystemRoulette,
            strategiesBaccarat: cleanSystemBaccarat,
            strategies: state.gameType === GameType.ROULETTE ? cleanSystemRoulette : cleanSystemBaccarat,
            deletedSystemStrategyIds: [],

            // Clear operational day states and session
            dailyHistory: [],
            currentSession: null,
            isSimulationMode: false
          };
        });
      }

    }),
    {
      name: 'casino-ai-storage',
      merge: (persistedState: any, currentState: any) => {
        if (!persistedState) return currentState;

        const deletedSystemStrategyIds: string[] = (persistedState?.deletedSystemStrategyIds || []).filter(
          (id: string) => id !== 'system-roulette-racetrack' && id !== 'system-roulette-tpa84' && id !== 'system-roulette-angel84'
        );

        // Retain only valid system strategies and ensure all performance metrics are zeroed
        let mergedStrategiesRoulette: Strategy[] = defaultStrategiesRoulette
          .filter(s => !deletedSystemStrategyIds.includes(s.id))
          .map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));

        let mergedStrategiesBaccarat: Strategy[] = defaultStrategiesBaccarat
          .filter(s => !deletedSystemStrategyIds.includes(s.id))
          .map(s => ({
            ...s,
            performance: { winRate: 0, totalEntries: 0, wins: 0, losses: 0, roi: 0, maxDrawdown: 0 }
          }));

        // Ensure update standard names
        mergedStrategiesRoulette = mergedStrategiesRoulette.map((ms: any) => {
          if (ms.id === 'system-roulette-racetrack') {
            return { ...ms, name: 'TERMINAL S84' };
          }
          if (ms.id === 'system-roulette-tpa84') {
            return { ...ms, name: 'TPA84 (Penúltimo + Antepenúltimo)' };
          }
          if (ms.id === 'system-roulette-angel84') {
            return { ...ms, name: 'Angel84' };
          }
          return ms;
        });

        const historyRoulette = persistedState.historyRoulette || currentState.historyRoulette || [];
        const historyBaccarat = persistedState.historyBaccarat || currentState.historyBaccarat || [];

        // Dynamically recreate mined strategies from history if results are present
        if (historyRoulette && historyRoulette.length > 0) {
          const minedR = convertMinedRoulettePatternsToStrategies(mineRoulettePatterns(historyRoulette));
          mergedStrategiesRoulette = [...mergedStrategiesRoulette, ...minedR];
        }
        if (historyBaccarat && historyBaccarat.length > 0) {
          const minedB = convertMinedPatternsToStrategies(mineBaccaratPatterns(historyBaccarat));
          mergedStrategiesBaccarat = [...mergedStrategiesBaccarat, ...minedB];
        }

        const bankrollRoulette = persistedState.bankrollRoulette || currentState.bankrollRoulette;
        const bankrollBaccarat = persistedState.bankrollBaccarat || currentState.bankrollBaccarat;

        const activeGameType = persistedState.gameType || currentState.gameType;
        const activeBankroll = activeGameType === GameType.ROULETTE ? bankrollRoulette : bankrollBaccarat;
        const activeStrategies = activeGameType === GameType.ROULETTE ? mergedStrategiesRoulette : mergedStrategiesBaccarat;
        const activeHistory = activeGameType === GameType.ROULETTE ? historyRoulette : historyBaccarat;

        return {
          ...currentState,
          ...persistedState,
          deletedSystemStrategyIds,
          bankrollRoulette,
          bankrollBaccarat,
          bankroll: activeBankroll,
          strategiesRoulette: mergedStrategiesRoulette,
          strategiesBaccarat: mergedStrategiesBaccarat,
          strategies: activeStrategies,
          historyRoulette,
          historyBaccarat,
          history: activeHistory
        };
      }
    }
  )
);
