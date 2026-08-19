import { GameResult, Strategy, GameType } from '../types';
import { COLOR_MAP, ROULETTE_ZONES } from '../constants';

export type RoulettePatternCategory = 'external' | 'dozen_column' | 'sector' | 'street_corner' | 'terminal';

export interface MinedRoulettePattern {
  id: string;
  name: string;
  category: RoulettePatternCategory;
  categoryLabel: string;
  description: string;
  predictedEntry: string;
  totalOccurrences: number;
  wins: number;
  losses: number;
  assertiveness: number; // Win rate percentage 0 - 100
  confidence: number;
  isActive: boolean;
  ruleCode: string;
}

interface RouletteCandidateSpec {
  id: string;
  nameTemplate: string;
  category: RoulettePatternCategory;
  categoryLabel: string;
  description: string;
  evaluator: (subHist: GameResult[]) => string | null;
}

const CANDIDATE_ROULETTE_PATTERNS: RouletteCandidateSpec[] = [
  // 1. EXTERNAL BETS (RED/BLACK, EVEN/ODD, HIGH/LOW)
  {
    id: 'roulette_red_dragon',
    nameTemplate: 'Sequência Dragão Vermelho (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas',
    description: 'Detecta 3 ou mais Vermelhos seguidos na roleta e projeta a continuidade da cor dominante.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && COLOR_MAP.ROULETTE.RED.includes(n))) {
        return 'red';
      }
      return null;
    }
  },
  {
    id: 'roulette_black_dragon',
    nameTemplate: 'Sequência Dragão Preto (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas',
    description: 'Detecta 3 ou mais Pretos seguidos na roleta e projeta a continuidade da cor dominante.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && COLOR_MAP.ROULETTE.BLACK.includes(n))) {
        return 'black';
      }
      return null;
    }
  },
  {
    id: 'roulette_color_ping_pong',
    nameTemplate: 'Alternância Perfeita de Cores (R-B-R-B)',
    category: 'external',
    categoryLabel: 'Apostas Externas',
    description: 'Identifica 4 rodadas alternando Vermelho e Preto e prevê o próximo ciclo da alternância.',
    evaluator: (subHist) => {
      if (subHist.length < 4) return null;
      const r = subHist.slice(-4).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (r.length < 4) return null;
      const isRed = (n: number) => COLOR_MAP.ROULETTE.RED.includes(n);
      if (isRed(r[0]) && !isRed(r[1]) && isRed(r[2]) && !isRed(r[3])) return 'red';
      if (!isRed(r[0]) && isRed(r[1]) && !isRed(r[2]) && isRed(r[3])) return 'black';
      return null;
    }
  },
  {
    id: 'roulette_even_dragon',
    nameTemplate: 'Sequência Par Dominante (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas',
    description: 'Identifica acúmulo de números Pares e projeta a sequência contínua.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && n % 2 === 0)) {
        return 'even';
      }
      return null;
    }
  },
  {
    id: 'roulette_odd_dragon',
    nameTemplate: 'Sequência Ímpar Dominante (3+ Seguidos)',
    category: 'external',
    categoryLabel: 'Apostas Externas',
    description: 'Identifica acúmulo de números Ímpares e projeta a sequência contínua.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result));
      if (recent.every(n => !isNaN(n) && n !== 0 && n % 2 !== 0)) {
        return 'odd';
      }
      return null;
    }
  },

  // 2. DOZENS & COLUMNS
  {
    id: 'roulette_double_dozen_repeater',
    nameTemplate: 'Repetição de Dúzia Ativa (D1/D2/D3)',
    category: 'dozen_column',
    categoryLabel: 'Dúzias & Colunas',
    description: 'Reconhece quando a mesma Dúzia é sorteada duas vezes consecutivas e projeta o terceiro acerto.',
    evaluator: (subHist) => {
      if (subHist.length < 2) return null;
      const r = subHist.slice(-2).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (r.length < 2) return null;
      const getDozen = (n: number) => n >= 1 && n <= 12 ? 'Dúzia 1' : n >= 13 && n <= 24 ? 'Dúzia 2' : 'Dúzia 3';
      if (getDozen(r[0]) === getDozen(r[1])) return getDozen(r[0]);
      return null;
    }
  },
  {
    id: 'roulette_column_rotation',
    nameTemplate: 'Rotação de Colunas (C1-C2-C3)',
    category: 'dozen_column',
    categoryLabel: 'Dúzias & Colunas',
    description: 'Detecta ciclo ordenado entre as três colunas da mesa e sugere a coluna subsequente.',
    evaluator: (subHist) => {
      if (subHist.length < 2) return null;
      const r = subHist.slice(-2).map(h => Number(h.result)).filter(n => !isNaN(n) && n !== 0);
      if (r.length < 2) return null;
      const getCol = (n: number) => n % 3 === 1 ? 'Coluna 1' : n % 3 === 2 ? 'Coluna 2' : 'Coluna 3';
      if (getCol(r[0]) === 'Coluna 1' && getCol(r[1]) === 'Coluna 2') return 'Coluna 3';
      if (getCol(r[0]) === 'Coluna 2' && getCol(r[1]) === 'Coluna 3') return 'Coluna 1';
      if (getCol(r[0]) === 'Coluna 3' && getCol(r[1]) === 'Coluna 1') return 'Coluna 2';
      return null;
    }
  },

  // 3. RACETRACK SECTORS
  {
    id: 'roulette_voisins_cluster',
    nameTemplate: 'Cluster no Setor Vizinhos do Zero',
    category: 'sector',
    categoryLabel: 'Setores do Cilindro',
    description: 'Identifica 2 de 3 lançamentos recentes no setor Voisins du Zéro e projeta nova bola na área.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result)).filter(n => !isNaN(n));
      const hits = recent.filter(n => ROULETTE_ZONES.VOISINS.includes(n)).length;
      if (hits >= 2) return 'VOISINS';
      return null;
    }
  },
  {
    id: 'roulette_tiers_cluster',
    nameTemplate: 'Cluster no Setor Terço do Cilindro',
    category: 'sector',
    categoryLabel: 'Setores do Cilindro',
    description: 'Identifica 2 de 3 lançamentos recentes no setor Tiers e projeta confirmação da área.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result)).filter(n => !isNaN(n));
      const hits = recent.filter(n => ROULETTE_ZONES.TIERS.includes(n)).length;
      if (hits >= 2) return 'TIERS';
      return null;
    }
  },
  {
    id: 'roulette_orphelins_cluster',
    nameTemplate: 'Cluster de Órfãos (Orphelins)',
    category: 'sector',
    categoryLabel: 'Setores do Cilindro',
    description: 'Identifica concentração de números no setor Órfãos nas últimas rodadas.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result)).filter(n => !isNaN(n));
      const hits = recent.filter(n => ROULETTE_ZONES.ORPHELINS.includes(n)).length;
      if (hits >= 2) return 'ORPHELINS';
      return null;
    }
  },

  // 4. TERMINALS & DIGITS
  {
    id: 'roulette_terminal_digit_repeat',
    nameTemplate: 'Repetição de Dígito Final (Terminais)',
    category: 'terminal',
    categoryLabel: 'Terminais & Plenos',
    description: 'Avisa quando 2 números com o mesmo dígito final (ex: 4 e 14) saem em curto intervalo.',
    evaluator: (subHist) => {
      if (subHist.length < 3) return null;
      const recent = subHist.slice(-3).map(h => Number(h.result)).filter(n => !isNaN(n));
      if (recent.length < 3) return null;
      const d1 = recent[recent.length - 1] % 10;
      const d2 = recent[recent.length - 2] % 10;
      if (d1 === d2) {
        return `pleno ${recent[recent.length - 1]}`;
      }
      return null;
    }
  }
];

function checkRouletteHit(prediction: string, actualNumber: number): boolean {
  if (isNaN(actualNumber)) return false;

  if (prediction === 'red') return actualNumber !== 0 && COLOR_MAP.ROULETTE.RED.includes(actualNumber);
  if (prediction === 'black') return actualNumber !== 0 && COLOR_MAP.ROULETTE.BLACK.includes(actualNumber);
  if (prediction === 'even') return actualNumber !== 0 && actualNumber % 2 === 0;
  if (prediction === 'odd') return actualNumber !== 0 && actualNumber % 2 !== 0;
  if (prediction === 'high') return actualNumber >= 19 && actualNumber <= 36;
  if (prediction === 'low') return actualNumber >= 1 && actualNumber <= 18;

  if (prediction === 'Dúzia 1') return actualNumber >= 1 && actualNumber <= 12;
  if (prediction === 'Dúzia 2') return actualNumber >= 13 && actualNumber <= 24;
  if (prediction === 'Dúzia 3') return actualNumber >= 25 && actualNumber <= 36;

  if (prediction === 'Coluna 1') return actualNumber !== 0 && actualNumber % 3 === 1;
  if (prediction === 'Coluna 2') return actualNumber !== 0 && actualNumber % 3 === 2;
  if (prediction === 'Coluna 3') return actualNumber !== 0 && actualNumber % 3 === 0;

  if (prediction === 'VOISINS') return ROULETTE_ZONES.VOISINS.includes(actualNumber);
  if (prediction === 'TIERS') return ROULETTE_ZONES.TIERS.includes(actualNumber);
  if (prediction === 'ORPHELINS') return ROULETTE_ZONES.ORPHELINS.includes(actualNumber);
  if (prediction === 'ZERO_SPIEL') return ROULETTE_ZONES.ZERO_SPIEL.includes(actualNumber);

  if (prediction.startsWith('pleno ')) {
    const num = Number(prediction.replace('pleno ', ''));
    return actualNumber === num;
  }

  return false;
}

export function mineRoulettePatterns(history: GameResult[]): MinedRoulettePattern[] {
  if (!history || history.length < 3) {
    return CANDIDATE_ROULETTE_PATTERNS.map((candidate) => ({
      id: candidate.id,
      name: `${candidate.nameTemplate} (Monitorando)`,
      category: candidate.category,
      categoryLabel: candidate.categoryLabel,
      description: candidate.description,
      predictedEntry: 'red',
      totalOccurrences: 0,
      wins: 0,
      losses: 0,
      assertiveness: 0,
      confidence: 0,
      isActive: true,
      ruleCode: candidate.id
    }));
  }

  const chrono = [...history].reverse();
  const minedResults: MinedRoulettePattern[] = [];

  for (const candidate of CANDIDATE_ROULETTE_PATTERNS) {
    let totalOccurrences = 0;
    let wins = 0;
    let losses = 0;
    let lastPrediction = 'red';

    for (let i = 2; i < chrono.length; i++) {
      const subHist = chrono.slice(0, i);
      const prediction = candidate.evaluator(subHist);

      if (prediction) {
        totalOccurrences++;
        lastPrediction = prediction;
        const actualNum = Number(chrono[i].result);

        if (checkRouletteHit(prediction, actualNum)) {
          wins++;
        } else {
          losses++;
        }
      }
    }

    const assertiveness = totalOccurrences > 0 ? Number(((wins / totalOccurrences) * 100).toFixed(1)) : 0;

    minedResults.push({
      id: candidate.id,
      name: totalOccurrences > 0 
        ? `${candidate.nameTemplate} (${assertiveness}% - ${wins}v/${losses}d)`
        : `${candidate.nameTemplate} (Monitorando)`,
      category: candidate.category,
      categoryLabel: candidate.categoryLabel,
      description: candidate.description,
      predictedEntry: lastPrediction,
      totalOccurrences,
      wins,
      losses,
      assertiveness,
      confidence: totalOccurrences > 0 ? Math.min(98, Math.max(0, Math.round(assertiveness))) : 0,
      isActive: totalOccurrences === 0 || assertiveness >= 55,
      ruleCode: candidate.id
    });
  }

  minedResults.sort((a, b) => b.assertiveness - a.assertiveness || b.totalOccurrences - a.totalOccurrences);
  return minedResults;
}

export function convertMinedRoulettePatternsToStrategies(mined: MinedRoulettePattern[]): Strategy[] {
  return mined.map(m => ({
    id: `mined-roulette-${m.id}`,
    name: m.name,
    gameType: GameType.ROULETTE,
    rules: {
      minedId: m.id,
      category: m.category,
      predictedEntry: m.predictedEntry
    },
    isActive: m.isActive,
    isCustom: true,
    createdAt: Date.now(),
    performance: {
      totalEntries: m.totalOccurrences,
      wins: m.wins,
      losses: m.losses,
      winRate: m.assertiveness,
      roi: m.totalOccurrences > 0 ? Number((((m.wins * 2 - m.totalOccurrences) / m.totalOccurrences) * 100).toFixed(1)) : 0,
      maxDrawdown: m.losses * 1.5
    }
  }));
}

export function getInitialMinedRouletteStrategies(): Strategy[] {
  return CANDIDATE_ROULETTE_PATTERNS.map((candidate, index) => {
    return {
      id: `mined-roulette-${candidate.id}`,
      name: `${candidate.nameTemplate} (Monitorando)`,
      gameType: GameType.ROULETTE,
      isActive: true,
      isSystem: true,
      isCustom: true,
      createdAt: Date.now() - index * 1000,
      rules: {
        minedId: candidate.id,
        category: candidate.category,
        predictedEntry: 'red'
      },
      performance: {
        totalEntries: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        roi: 0,
        maxDrawdown: 0
      }
    };
  });
}
