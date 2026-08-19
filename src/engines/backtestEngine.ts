import { GameResult, Strategy, GameType, ManagementConfig, ManagementMode } from '../types';
import { checkWin, findMostProbableEntry } from './statsEngine';
import { checkBaccaratPattern, strategyEngine, getCoveredNumbersForStrategy } from './strategyEngine';
import { evaluateMinedPatternTrigger } from './baccaratPatternMiningEngine';
import { trendAnalysisEngine } from './trendAnalysisEngine';
import { calculateProportionalCoverage, getInitialProgressionState, updateProgressionState, calculateCumulativeGaleLoss, calculatePayoutRatioForEntry } from './progressionEngine';
import { getEnrichedRules } from '../lib/rulesEnricher';
import { racetrackEngine } from './racetrackEngine';
import { tpa84Engine } from './tpa84Engine';
import { angel84Engine } from './angel84Engine';

const defaultBankrollMetrics = {
  maxGaleNeeded: 0,
  safeBankrollConservative: 0,
  safeBankrollModerate: 0,
  safeBankrollAggressive: 0
};

/**
 * Runs a single backtest simulation for a specific strategy under a given gale limit.
 */
export const runSingleBacktestSimulation = (
  history: GameResult[],
  strategy: Strategy,
  originalManagementConfig?: ManagementConfig,
  stopWin?: number,
  stopLoss?: number,
  gales?: number
) => {
  let managementConfig = originalManagementConfig;
  if (gales !== undefined && originalManagementConfig) {
    managementConfig = {
      ...originalManagementConfig,
      mode: gales > 0 ? ManagementMode.MARTINGALE : ManagementMode.FIXED,
      levels: gales
    };
  }

  // Set gales to default limit from managementConfig if it is undefined (to prevent fallback to 0)
  gales = gales !== undefined ? gales : (managementConfig ? Math.max(0, managementConfig.levels) : 2);

  const isMartingale = managementConfig && managementConfig.mode === ManagementMode.MARTINGALE;

  let wins = 0;
  let losses = 0;
  let totalProfit = 0;
  let maxDrawdown = 0;

  // Dynamic realistic starting balance for the simulation
  const baseBet = managementConfig?.initialBet || 10;
  const positionCount = getStrategyPositionCount(strategy);
  const minChip = managementConfig?.minChip || (strategy.gameType === GameType.BACCARAT ? 0.20 : 0.10);
  
  // Calculate total cost of single initial entry
  let initialEntryCost = baseBet;
  if (strategy.gameType === GameType.ROULETTE && positionCount > 1) {
    // For systemic or multi-position roulette strategy
    const { actualTotalCost } = calculateProportionalCoverage(baseBet, positionCount, minChip);
    initialEntryCost = actualTotalCost;
  }
  
  // The simulated bankroll scales dynamically with the entry cost and selected management config
  let simulatedBankroll = 1000;
  if (managementConfig) {
    const galeCost = calculateCumulativeGaleLoss(managementConfig, 10000);
    // Standard starting bankroll: Gale Cost + 30 units of initial entry cost to provide a safe buffer
    simulatedBankroll = Math.max(galeCost + (initialEntryCost * 30), initialEntryCost * 50);
  } else {
    simulatedBankroll = initialEntryCost * 100;
  }
  
  simulatedBankroll = Math.round(simulatedBankroll);
  
  let currentBalance = simulatedBankroll;
  let peak = simulatedBankroll;
  let maxConsecutiveLosses = 0;
  let currentConsecutiveLosses = 0;

  let stopWinVal = stopWin ?? 200;
  let stopLossVal = stopLoss ?? 100;
  if (stopWinVal <= 0) stopWinVal = 200;
  if (stopLossVal <= 0) stopLossVal = 100;

  let winsWithPause = 0;
  let lossesWithPause = 0;
  let profitWithPause = 0;
  let withPauseHasStopped = false;
  let withPauseTriggerType: 'stop_win' | 'stop_loss' | null = null;
  let withPauseRoundsCount = 0;
  let totalRoundsCount = 0;

  const enrichedRules = getEnrichedRules(strategy.name, strategy.rules, strategy.gameType);
  const enrichedStrategy = { ...strategy, rules: enrichedRules };

  const relevantHistory = [...history].reverse().filter(h => h.gameType === strategy.gameType);
  if (relevantHistory.length < 5) {
    return {
      winRate: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, maxConsecutiveLosses: 0,
      absoluteMaxGaleNeeded: 0,
      autoPauseSim: { totalProfit: 0, wins: 0, losses: 0, isTriggered: false, triggerType: null, preservedCapital: 0, roundsPlayed: 0 }
    };
  }

  let progState = managementConfig ? getInitialProgressionState(managementConfig) : null;
  
  // For Martingale gale cycle tracking:
  const maxGalesAllowed = gales ?? 0;
  let currentGaleIndex = 0;
  let maxGaleReached = 0;

  // Uncapped / absolute gale tracking to recover the session:
  let absoluteMaxGaleNeeded = 0;
  let currentGaleStreak = 0;

  // Local helper stats for historical-base strategies
  const sequenceStats: Record<string, Record<string, number>> = {};

  const startIndex = strategy.id.includes('historical-base') || strategy.id.includes('delay') || strategy.id.includes('probability') ? 10 : 5;

  for (let i = startIndex; i < relevantHistory.length; i++) {
    const startIdx = Math.max(0, i - 30);
    const subHistory = relevantHistory.slice(startIdx, i).reverse(); // newest to oldest for most engines
    const actualResult = relevantHistory[i].result;

    let shouldBet = false;
    let win = false;
    let spinProfit = 0;
    let roundPositionCount = positionCount;
    let multiplier = 1;
    let roundPayoutRatio: number | undefined = undefined;

    let betAmount = 10;
    if (managementConfig && progState) {
      betAmount = progState.currentBetSize;
    }

    // 1. SIGNAL GENERATION BASED ON STRATEGY ID
    if (strategy.id === 'system-roulette-racetrack') {
      const racetrackSignals = racetrackEngine.getSignal(subHistory);
      if (racetrackSignals && racetrackSignals.length > 0) {
        shouldBet = true;
        const sig = racetrackSignals[0];
        roundPositionCount = sig.entryNumbers?.length || 12;
        win = sig.entryNumbers ? sig.entryNumbers.includes(Number(actualResult)) : false;
        
        const { individualBetSize, actualTotalCost } = calculateProportionalCoverage(betAmount, roundPositionCount, minChip);
        spinProfit = win ? (individualBetSize * 36) - actualTotalCost : -actualTotalCost;
      }
    } 
    else if (strategy.id === 'system-roulette-tpa84') {
      const sig = tpa84Engine.getSignal(subHistory);
      if (sig) {
        shouldBet = true;
        roundPositionCount = sig.unitsRequired || 24;
        win = sig.entryNumbers ? sig.entryNumbers.includes(Number(actualResult)) : false;

        const { individualBetSize, actualTotalCost } = calculateProportionalCoverage(betAmount, roundPositionCount, minChip);
        
        let hitCount = 0;
        if (win) {
          const inA = sig.coberturaA?.includes(Number(actualResult)) ? 1 : 0;
          const inB = sig.coberturaB?.includes(Number(actualResult)) ? 1 : 0;
          hitCount = inA + inB;
        }
        spinProfit = win ? (hitCount * individualBetSize * 36) - actualTotalCost : -actualTotalCost;
      }
    }
    else if (strategy.id === 'system-roulette-angel84') {
      const sig = angel84Engine.getSignal(subHistory, true);
      if (sig) {
        shouldBet = true;
        roundPositionCount = sig.coveredCount || 25;
        win = sig.entryNumbers ? sig.entryNumbers.includes(Number(actualResult)) : false;

        const { individualBetSize, actualTotalCost } = calculateProportionalCoverage(betAmount, roundPositionCount, minChip);
        spinProfit = win ? (individualBetSize * 36) - actualTotalCost : -actualTotalCost;
      }
    }
    else if (strategy.id === 'trend-assertive') {
      const trends = trendAnalysisEngine.getRouletteTrends(subHistory);
      const mostAssertive = trends?.mostAssertive;
      if (mostAssertive && mostAssertive.confidence >= 70) {
        shouldBet = true;
        win = mostAssertive.entry ? checkWin(actualResult, mostAssertive.entry) : false;
        const entLower = (mostAssertive.entry || '').toLowerCase();
        roundPayoutRatio = calculatePayoutRatioForEntry(mostAssertive.entry);
        
        if (entLower.includes('dúzia') || entLower.includes('coluna')) {
          multiplier = 2;
        } else if (entLower.includes('terminal')) {
          multiplier = 8;
        } else if (entLower.includes('pleno')) {
          multiplier = 35;
        } else if (entLower.includes('dividida')) {
          multiplier = 17;
        } else if (entLower.includes('rua')) {
          multiplier = 11;
        } else if (entLower.includes('canto')) {
          multiplier = 8;
        } else if (entLower.includes('linha')) {
          multiplier = 5;
        }

        roundPositionCount = entLower.includes('pleno') ? 11 : 1;
        if (entLower.includes('pleno')) {
          const { individualBetSize, actualTotalCost } = calculateProportionalCoverage(betAmount, 11, minChip);
          spinProfit = win ? (individualBetSize * 36) - actualTotalCost : -actualTotalCost;
        } else {
          spinProfit = win ? betAmount * multiplier : -betAmount;
        }
      }
    }
    else if (strategy.id === 'system-roulette-trends') {
      const trends = trendAnalysisEngine.getRouletteTrends(subHistory);
      const mostAssertive = trends?.mostAssertive;
      if (mostAssertive && mostAssertive.confidence >= 70) {
        shouldBet = true;
        win = mostAssertive.entry ? checkWin(actualResult, mostAssertive.entry) : false;
        const entLower = (mostAssertive.entry || '').toLowerCase();
        multiplier = entLower.includes('dúzia') || entLower.includes('coluna') ? 2 : 1;
        roundPositionCount = entLower.includes('dúzia') || entLower.includes('coluna') ? 12 : 18;
        spinProfit = win ? betAmount * multiplier : -betAmount;
        roundPayoutRatio = calculatePayoutRatioForEntry(mostAssertive.entry);
      }
    }
    else if (strategy.id === 'system-baccarat-trends') {
      const trends = trendAnalysisEngine.getBaccaratTrends(subHistory);
      const mostAssertive = trends?.mostAssertive;
      if (mostAssertive && mostAssertive.confidence >= 70) {
        shouldBet = true;
        roundPositionCount = 1;
        roundPayoutRatio = 1;
        const actualStr = String(actualResult).toUpperCase();
        const entryUpper = mostAssertive.entry.toUpperCase();
        const isActualTie = actualStr === 'TIE' || actualStr === 'T' || actualStr === 'EMPATE' || actualStr === 'E';
        const isEntryTie = entryUpper === 'TIE' || entryUpper === 'T' || entryUpper === 'EMPATE';
        
        win = (entryUpper === 'PLAYER' || entryUpper === 'P') && (actualStr === 'PLAYER' || actualStr === 'P') ||
              (entryUpper === 'BANKER' || entryUpper === 'B') && (actualStr === 'BANKER' || actualStr === 'B') ||
              isEntryTie && isActualTie;
        
        if (win) {
          if (isEntryTie) spinProfit = betAmount * 8;
          else if (entryUpper === 'BANKER' || entryUpper === 'B') spinProfit = betAmount * 0.95;
          else spinProfit = betAmount;
        } else if (isActualTie && !isEntryTie) {
          win = undefined as any;
          spinProfit = 0;
        } else {
          spinProfit = -betAmount;
        }
      }
    }
    else if (strategy.id === 'system-roulette-probability') {
      // For probability, subHistory should NOT be reversed (it expects oldest to newest)
      const subHistoryForward = relevantHistory.slice(startIdx, i);
      const bestProbability = findMostProbableEntry(subHistoryForward, 'roulette');
      
      if (bestProbability && bestProbability.confidence > 64) {
        shouldBet = true;
        roundPayoutRatio = calculatePayoutRatioForEntry(bestProbability.entry);
        const entryUpper = bestProbability.entry.toUpperCase();
        const actualItem = relevantHistory[i];
        
        if (actualItem.metadata) {
          const meta = actualItem.metadata;
          if (entryUpper === 'RED' || entryUpper === 'VERMELHO') win = meta.color === 'red';
          else if (entryUpper === 'BLACK' || entryUpper === 'PRETO') win = meta.color === 'black';
          else if (entryUpper === 'EVEN' || entryUpper === 'PAR') win = meta.parity === 'even';
          else if (entryUpper === 'ODD' || entryUpper === 'ÍMPAR') win = meta.parity === 'odd';
          else if (entryUpper.includes('DÚZIA 1')) win = meta.dozen === 1;
          else if (entryUpper.includes('DÚZIA 2')) win = meta.dozen === 2;
          else if (entryUpper.includes('DÚZIA 3')) win = meta.dozen === 3;
          else if (entryUpper.includes('COLUNA 1')) win = meta.column === 1;
          else if (entryUpper.includes('COLUNA 2')) win = meta.column === 2;
          else if (entryUpper.includes('COLUNA 3')) win = meta.column === 3;
          else if (entryUpper.includes('VIZINHOS DE ZERO')) win = meta.zones ? meta.zones.includes('VOISINS') : false;
          else if (entryUpper.includes('TIERS')) win = meta.zones ? meta.zones.includes('TIERS') : false;
          else if (entryUpper.includes('ORPHELINS')) win = meta.zones ? meta.zones.includes('ORPHELINS') : false;
          else if (entryUpper.includes('TERMINAL')) {
             const terminalNum = parseInt(entryUpper.replace(/[^0-9]/g, ''), 10);
             win = meta.terminal === terminalNum;
          }
        }
        
        if (entryUpper.includes('DÚZIA') || entryUpper.includes('COLUNA')) {
          multiplier = 2;
        } else if (entryUpper.includes('TERMINAL')) {
          multiplier = 35;
        } else if (entryUpper.includes('VIZINHOS') || entryUpper.includes('TIERS') || entryUpper.includes('ORPHELINS')) {
          multiplier = 2;
        }
        spinProfit = win ? betAmount * multiplier : -betAmount;
      }
    }
    else if (strategy.id === 'system-baccarat-probability') {
      const subHistoryForward = relevantHistory.slice(startIdx, i);
      const bestProbability = findMostProbableEntry(subHistoryForward, 'baccarat');
      
      if (bestProbability && bestProbability.confidence > 64) {
        shouldBet = true;
        roundPositionCount = 1;
        roundPayoutRatio = 1;
        const entryUpper = bestProbability.entry.toUpperCase();
        const actualStr = String(actualResult).toUpperCase();
        const isActualTie = actualStr === 'TIE' || actualStr === 'T' || actualStr === 'EMPATE' || actualStr === 'E';
        const isEntryTie = entryUpper === 'TIE' || entryUpper === 'T' || entryUpper === 'EMPATE';
        
        win = (entryUpper === 'PLAYER' || entryUpper === 'P') && (actualStr === 'PLAYER' || actualStr === 'P') ||
              (entryUpper === 'BANKER' || entryUpper === 'B') && (actualStr === 'BANKER' || actualStr === 'B') ||
              isEntryTie && isActualTie;
              
        if (win) {
          spinProfit = isEntryTie ? betAmount * 8 : (entryUpper === 'BANKER' || entryUpper === 'B') ? betAmount * 0.95 : betAmount;
        } else if (isActualTie && !isEntryTie) {
          win = undefined as any;
          spinProfit = 0;
        } else {
          spinProfit = -betAmount;
        }
      }
    }
    else if (strategy.id === 'system-roulette-historical-base') {
      const seq = relevantHistory.slice(i - 5, i).map(h => String(h.result)).join(',');
      const outcomes = sequenceStats[seq];
      let targetOutcome: string | null = null;
      if (outcomes) {
         let total = 0;
         let bestOut = '';
         let maxC = 0;
         for (const out of Object.keys(outcomes)) {
            total += outcomes[out];
            if (outcomes[out] > maxC) {
               maxC = outcomes[out];
               bestOut = out;
            }
         }
         if (total >= 2 && (maxC / total) >= 0.70) {
            targetOutcome = bestOut;
         }
      }

      if (targetOutcome !== null) {
         shouldBet = true;
         win = String(actualResult) === targetOutcome;
         spinProfit = win ? betAmount * 35 : -betAmount;
         roundPositionCount = 1;
         roundPayoutRatio = 35;
      }

      // Record this outcome for future sequence lookups
      const actualResultStr = String(actualResult);
      if (!sequenceStats[seq]) sequenceStats[seq] = {};
      sequenceStats[seq][actualResultStr] = (sequenceStats[seq][actualResultStr] || 0) + 1;
    }
    else if (strategy.id === 'system-baccarat-historical-base') {
      const seq = relevantHistory.slice(i - 5, i).map(h => String(h.result)).join(',');
      const outcomes = sequenceStats[seq];
      let targetOutcome: string | null = null;
      if (outcomes) {
         let total = 0;
         let bestOut = '';
         let maxC = 0;
         for (const out of Object.keys(outcomes)) {
            total += outcomes[out];
            if (outcomes[out] > maxC) {
               maxC = outcomes[out];
               bestOut = out;
            }
         }
         if (total >= 2 && (maxC / total) >= 0.70) {
            targetOutcome = bestOut;
         }
      }

      if (targetOutcome !== null) {
         shouldBet = true;
         roundPositionCount = 1;
         roundPayoutRatio = 1;
         const actualStr = String(actualResult).toUpperCase();
         const entryUpper = targetOutcome.toUpperCase();
         const isActualTie = actualStr === 'TIE' || actualStr === 'T' || actualStr === 'EMPATE' || actualStr === 'E';
         const isEntryTie = entryUpper === 'TIE' || entryUpper === 'T' || entryUpper === 'EMPATE';

         win = (entryUpper === 'PLAYER' || entryUpper === 'P') && (actualStr === 'PLAYER' || actualStr === 'P') ||
               (entryUpper === 'BANKER' || entryUpper === 'B') && (actualStr === 'BANKER' || actualStr === 'B') ||
               isEntryTie && isActualTie;
               
         if (win) {
           spinProfit = isEntryTie ? betAmount * 8 : (entryUpper === 'BANKER' || entryUpper === 'B') ? betAmount * 0.95 : betAmount;
         } else if (isActualTie && !isEntryTie) {
           win = undefined as any;
           spinProfit = 0;
         } else {
           spinProfit = -betAmount;
         }
      }

      const actualResultStr = String(actualResult);
      if (!sequenceStats[seq]) sequenceStats[seq] = {};
      sequenceStats[seq][actualResultStr] = (sequenceStats[seq][actualResultStr] || 0) + 1;
    }
    else if (strategy.id === 'system-roulette-delay') {
      const delayThreshold = 8;
      const counts: Record<string, number> = { red: 0, black: 0, even: 0, odd: 0, high: 0, low: 0 };
      for (const item of subHistory) {
         if (item.metadata) {
            const m = item.metadata;
            if (m.color !== 'red') counts.red++; else break;
         }
      }
      for (const item of subHistory) {
         if (item.metadata) {
            const m = item.metadata;
            if (m.color !== 'black') counts.black++; else break;
         }
      }
      for (const item of subHistory) {
         if (item.metadata) {
            const m = item.metadata;
            if (m.parity !== 'even') counts.even++; else break;
         }
      }
      for (const item of subHistory) {
         if (item.metadata) {
            const m = item.metadata;
            if (m.parity !== 'odd') counts.odd++; else break;
         }
      }
      for (const item of subHistory) {
         if (item.metadata) {
            const m = item.metadata;
            if (m.dozen !== 1) counts.high++; else break; // high delay
         }
      }

      let bestTrigger: string | null = null;
      let maxDelay = 0;
      for (const key of Object.keys(counts)) {
         if (counts[key] >= delayThreshold && counts[key] > maxDelay) {
            maxDelay = counts[key];
            bestTrigger = key;
         }
      }

      if (bestTrigger !== null) {
         shouldBet = true;
         roundPositionCount = 18;
         roundPayoutRatio = 1;
         const actualItem = relevantHistory[i];
         if (actualItem.metadata) {
            const m = actualItem.metadata;
            if (bestTrigger === 'red') win = m.color === 'red';
            else if (bestTrigger === 'black') win = m.color === 'black';
            else if (bestTrigger === 'even') win = m.parity === 'even';
            else if (bestTrigger === 'odd') win = m.parity === 'odd';
         }
         spinProfit = win ? betAmount : -betAmount;
      }
    }
    else if (strategy.id === 'system-baccarat-delay') {
      const delayThreshold = 6;
      let pDelay = 0;
      let bDelay = 0;
      for (const h of subHistory) {
         const res = String(h.result).toUpperCase();
         if (res !== 'PLAYER' && res !== 'P') pDelay++; else break;
      }
      for (const h of subHistory) {
         const res = String(h.result).toUpperCase();
         if (res !== 'BANKER' && res !== 'B') bDelay++; else break;
      }

      let bestTrigger: string | null = null;
      if (pDelay >= delayThreshold && pDelay >= bDelay) bestTrigger = 'PLAYER';
      else if (bDelay >= delayThreshold && bDelay > pDelay) bestTrigger = 'BANKER';

      if (bestTrigger !== null) {
         shouldBet = true;
         roundPositionCount = 1;
         roundPayoutRatio = 1;
         const actualStr = String(actualResult).toUpperCase();
         const isActualTie = actualStr === 'TIE' || actualStr === 'T' || actualStr === 'EMPATE' || actualStr === 'E';
         win = (bestTrigger === 'PLAYER' && (actualStr === 'PLAYER' || actualStr === 'P')) ||
               (bestTrigger === 'BANKER' && (actualStr === 'BANKER' || actualStr === 'B'));
         if (win) {
           spinProfit = (bestTrigger === 'BANKER' ? betAmount * 0.95 : betAmount);
         } else if (isActualTie) {
           win = undefined as any;
           spinProfit = 0;
         } else {
           spinProfit = -betAmount;
         }
      }
    }
    else {
      // -------------------------------------------------------------
      // CUSTOM / GENERIC STRATEGIES (WORKS FOR ANY USER DEFINED RULES)
      // -------------------------------------------------------------
      if (strategy.gameType === GameType.BACCARAT) {
        let signal: string | null = null;
        const minedId = enrichedRules?.minedId || (strategy.rules as any)?.minedId;
        if (minedId) {
          const trigger = evaluateMinedPatternTrigger(minedId, subHistory);
          if (trigger) {
            signal = trigger === 'BANKER' ? 'B' : trigger === 'PLAYER' ? 'P' : 'T';
          }
        } else if (enrichedRules?.predictedEntry) {
          const pEntry = String(enrichedRules.predictedEntry).toUpperCase();
          signal = pEntry === 'BANKER' || pEntry === 'B' ? 'B' : pEntry === 'PLAYER' || pEntry === 'P' ? 'P' : 'T';
        } else if (enrichedRules?.baccaratPattern) {
          signal = checkBaccaratPattern(enrichedRules.baccaratPattern, subHistory);
        }

        if (signal) {
          shouldBet = true;
          roundPositionCount = 1;
          roundPayoutRatio = 1;
          const actualStr = String(actualResult).toUpperCase();
          const isActualTie = actualStr === 'TIE' || actualStr === 'T' || actualStr === 'EMPATE' || actualStr === 'E';
          win = (signal === 'P' && (actualStr === 'PLAYER' || actualStr === 'P')) ||
                (signal === 'B' && (actualStr === 'BANKER' || actualStr === 'B')) ||
                (signal === 'T' && isActualTie);
                
          if (win) {
            spinProfit = (signal === 'T') ? betAmount * 8 : (signal === 'B') ? betAmount * 0.95 : betAmount;
          } else if (isActualTie && signal !== 'T') {
            win = undefined as any;
            spinProfit = 0;
          } else {
            spinProfit = -betAmount;
          }
        }
      } else if (enrichedRules && enrichedRules.bets && enrichedRules.bets.length > 0) {
        // Generic Roulette / Multiple bets custom strategies
        shouldBet = true;
        roundPositionCount = getStrategyPositionCount(strategy);
        roundPayoutRatio = roundPositionCount < 36 ? (36 - roundPositionCount) / roundPositionCount : 1;
        spinProfit = strategyEngine.calculateStrategySpinProfit(enrichedStrategy, actualResult, betAmount, managementConfig);
        win = spinProfit > 0;
      }
    }

    // 2. UNIFIED SIMULATION AND METRICS PROCESSING (APPLIES TO ALL STRATEGIES)
    if (shouldBet) {
      totalRoundsCount++;

      // Track the uncapped consecutive losses (gales) needed to turn a streak into a win
      if (win) {
        absoluteMaxGaleNeeded = Math.max(absoluteMaxGaleNeeded, currentGaleStreak);
        currentGaleStreak = 0;
      } else {
        currentGaleStreak++;
        absoluteMaxGaleNeeded = Math.max(absoluteMaxGaleNeeded, currentGaleStreak);
      }

      // A. Update Win/Loss stats respecting Martingale gale limit
      if (isMartingale) {
        if (win) {
          wins++;
          currentConsecutiveLosses = 0;
          currentGaleIndex = 0; // Reset Martingale cycle
          
          if (!withPauseHasStopped) {
            winsWithPause++;
          }
        } else {
          // If we lost: check if we can double up (gale) or if we hit the limit
          if (currentGaleIndex < maxGalesAllowed) {
            // Under gale limit, do NOT record a main simulation loss yet, just advance the level
            currentGaleIndex++;
            maxGaleReached = Math.max(maxGaleReached, currentGaleIndex);
          } else {
            // GALES EXCEEDED! This counts as a cycle loss!
            losses++;
            currentConsecutiveLosses++;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
            currentGaleIndex = 0; // Reset martingale to level 0
            
            if (!withPauseHasStopped) {
              lossesWithPause++;
            }
          }
        }
      } else {
        // Non-martingale: every win/loss counts immediately
        if (win) {
          wins++;
          currentConsecutiveLosses = 0;
          if (!withPauseHasStopped) {
            winsWithPause++;
          }
        } else {
          losses++;
          currentConsecutiveLosses++;
          maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
          if (!withPauseHasStopped) {
            lossesWithPause++;
          }
        }
      }

      // B. Update balances & Drawdown
      totalProfit += spinProfit;
      currentBalance += spinProfit;

      if (currentBalance > peak) peak = currentBalance;
      const drop = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;
      if (drop > maxDrawdown) maxDrawdown = drop;

      // C. Update auto-pause / stop-win / stop-loss tracking
      if (!withPauseHasStopped) {
        withPauseRoundsCount++;
        profitWithPause += spinProfit;

        if (profitWithPause >= stopWinVal) {
          withPauseHasStopped = true;
          withPauseTriggerType = 'stop_win';
        } else if (profitWithPause <= -stopLossVal) {
          withPauseHasStopped = true;
          withPauseTriggerType = 'stop_loss';
        }
      }

      // E. Update progression state engine
      if (managementConfig && progState) {
        // For martingale, we pass the levels override to avoid early force-reset from progressionEngine itself,
        // since our master loop authoritatively handles gale limits and cycles.
        const activeConfig = isMartingale ? { ...managementConfig, levels: 999 } : managementConfig;
        progState = updateProgressionState(progState, win, spinProfit, activeConfig, roundPositionCount, undefined, roundPayoutRatio);
        
        // If we reset our gale cycle, we must reset progState bet size back to initial bet size
        if (isMartingale && currentGaleIndex === 0) {
          const freshState = getInitialProgressionState(managementConfig);
          progState.currentBetSize = freshState.currentBetSize;
          progState.currentLevel = 0;
        }
      }
    }
  }

  // Handle final open martingale cycle loss at the very end of history
  if (isMartingale && currentGaleIndex > 0) {
    losses++;
    currentConsecutiveLosses++;
    maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
    if (!withPauseHasStopped) {
      lossesWithPause++;
    }
  }

  return {
    winRate: (wins / (wins + losses || 1)) * 100,
    wins,
    losses,
    totalProfit,
    maxDrawdown,
    maxConsecutiveLosses: isMartingale ? maxGaleReached : maxConsecutiveLosses,
    absoluteMaxGaleNeeded,
    autoPauseSim: {
      totalProfit: profitWithPause,
      wins: winsWithPause,
      losses: lossesWithPause,
      isTriggered: withPauseHasStopped,
      triggerType: withPauseTriggerType,
      preservedCapital: profitWithPause - totalProfit,
      roundsPlayed: withPauseHasStopped ? withPauseRoundsCount : totalRoundsCount
    }
  };
};

export const getStrategyPositionCount = (strategy: Strategy): number => {
  if (strategy.id === 'system-roulette-tpa84') return 24;
  if (strategy.id === 'system-roulette-racetrack') return 11;
  if (strategy.id === 'system-roulette-angel84') return 25;
  if (strategy.gameType === GameType.ROULETTE) {
    const coveredNumbers = getCoveredNumbersForStrategy(strategy);
    if (coveredNumbers && coveredNumbers.length > 0) {
      return coveredNumbers.length;
    }
  }
  return 1;
};

export const runBacktest = (
  history: GameResult[],
  strategy: Strategy,
  originalManagementConfig?: ManagementConfig,
  stopWin?: number,
  stopLoss?: number,
  maxGalesForBacktest?: number
) => {
  try {
    // Run the main simulation with the original management config directly (no forced mode override)
    const mainSim = runSingleBacktestSimulation(
      history,
      strategy,
      originalManagementConfig,
      stopWin,
      stopLoss,
      undefined
    );

    // 2. Compute bankroll requirements based on the actual maximum consecutive losses (maxGaleReached)
    const getSafeBankrollMetrics = (maxG: number) => {
      const positionCount = getStrategyPositionCount(strategy);
      const baseBet = originalManagementConfig?.initialBet || 10;
      const levelsCount = originalManagementConfig?.levels || 3;
      const configuredGales = Math.max(0, levelsCount);

      const getCost = (galesCount: number) => {
        if (!originalManagementConfig) {
          return baseBet * positionCount * (galesCount + 1);
        }
        
        const config = {
          ...originalManagementConfig,
          gameTarget: strategy.gameType
        };
        let state = getInitialProgressionState(config);
        let total = 0;
        
        const strategyPayoutRatio = strategy.gameType === GameType.BACCARAT
          ? 1
          : positionCount < 36
            ? (36 - positionCount) / positionCount
            : 1;
        
        for (let i = 0; i <= galesCount; i++) {
          const bet = state.currentBetSize;
          total += bet;
          
          const isWinBased = config.mode === ManagementMode.SOROS;
          const win = isWinBased ? true : false;
          let spinProfit = 0;
          if (win) {
            if (strategy.gameType === GameType.ROULETTE) {
              spinProfit = bet * (36 - positionCount) / positionCount;
            } else {
              spinProfit = bet;
            }
          } else {
            spinProfit = -bet;
          }
          
          state = updateProgressionState(state, win, spinProfit, config, positionCount, undefined, strategyPayoutRatio);
        }
        return total;
      };
      
      const safeGalesForBankroll = Math.max(configuredGales, maxG);
      const realBankrollNeeded = getCost(safeGalesForBankroll);

      return {
        maxGaleNeeded: maxG,
        realBankrollNeeded,
        safeBankrollConservative: getCost(safeGalesForBankroll + 2),
        safeBankrollModerate: getCost(safeGalesForBankroll + 1),
        safeBankrollAggressive: realBankrollNeeded
      };
    };

    const bankrollMetrics = getSafeBankrollMetrics(mainSim.absoluteMaxGaleNeeded);

    return {
      winRate: mainSim.winRate,
      wins: mainSim.wins,
      losses: mainSim.losses,
      totalProfit: mainSim.totalProfit,
      maxDrawdown: mainSim.maxDrawdown,
      roi: (mainSim.totalProfit / Math.max(1, bankrollMetrics.realBankrollNeeded)) * 100,
      ...bankrollMetrics,
      autoPauseSim: mainSim.autoPauseSim
    };
  } catch (err: any) {
    console.error(`[Backtest Engine Error] Erro ao processar estratégia "${strategy.name}" (ID: ${strategy.id}):`, err);
    return {
      winRate: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, roi: 0, ...defaultBankrollMetrics,
      error: err instanceof Error ? err.message : String(err),
      autoPauseSim: {
        totalProfit: 0,
        wins: 0,
        losses: 0,
        isTriggered: false,
        triggerType: null,
        preservedCapital: 0,
        roundsPlayed: 0
      }
    };
  }
};

/**
 * Executes a backtest asynchronously, using a Web Worker if available,
 * or falling back to synchronous execution on the main thread.
 */
export const runBacktestAsync = (
  history: GameResult[],
  strategy: Strategy,
  managementConfig?: ManagementConfig,
  stopWin?: number,
  stopLoss?: number,
  maxGalesForBacktest?: number
): Promise<any> => {
  return new Promise((resolve) => {
    // We execute in a setTimeout to avoid blocking the main thread during execution,
    // which prevents the browser UI from freezing and is 100% reliable in iframes where Workers hang.
    setTimeout(() => {
      try {
        const res = runBacktest(history, strategy, managementConfig, stopWin, stopLoss, maxGalesForBacktest);
        resolve(res);
      } catch (err: any) {
        console.error(`[Backtest Async Error] ${strategy.name}:`, err);
        resolve({
          winRate: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, roi: 0, ...defaultBankrollMetrics,
          error: err instanceof Error ? err.message : String(err),
          autoPauseSim: { totalProfit: 0, wins: 0, losses: 0, isTriggered: false, triggerType: null, preservedCapital: 0, roundsPlayed: 0 }
        });
      }
    }, 10);
  });
};
