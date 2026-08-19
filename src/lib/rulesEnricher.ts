import { GameType } from '../types';

export const getEnrichedRules = (sName: string, sRules: any, itemGameType: GameType) => {
  const hasBets = sRules && sRules.bets && sRules.bets.length > 0;
  const hasBac = sRules && sRules.baccaratPattern && sRules.baccaratPattern.length > 0;
  if (hasBets || hasBac) return sRules;

  const sNameLower = sName.toLowerCase();
  if (itemGameType === GameType.ROULETTE) {
    if (sNameLower.includes('dúzia') || sNameLower.includes('dozen')) {
      return { bets: [{ type: 'dozen', target: '1', amount: 10 }] };
    }
    if (sNameLower.includes('terminais de alta precisão') || sNameLower.includes('terminais ímpares') || sNameLower.includes('terminais gêmeos')) {
      return {
        bets: [
          { type: 'number', target: 1, amount: 10 },
          { type: 'number', target: 11, amount: 10 },
          { type: 'number', target: 21, amount: 10 },
          { type: 'number', target: 31, amount: 10 },
          { type: 'number', target: 3, amount: 10 },
          { type: 'number', target: 13, amount: 10 },
          { type: 'number', target: 23, amount: 10 },
          { type: 'number', target: 33, amount: 10 },
          { type: 'number', target: 7, amount: 10 },
          { type: 'number', target: 17, amount: 10 },
          { type: 'number', target: 27, amount: 10 },
          { type: 'number', target: 9, amount: 10 },
          { type: 'number', target: 19, amount: 10 },
          { type: 'number', target: 29, amount: 10 }
        ]
      };
    }
    if (sNameLower.includes('terminal') || sNameLower.includes('impar') || sNameLower.includes('ímpar')) {
      return { bets: [{ type: 'even_chance', target: 'odd', amount: 10 }] };
    }
    if (sNameLower.includes('ruas') || sNameLower.includes('street')) {
      return { bets: [{ type: 'multi', target: [13, 14, 15], amount: 10 }, { type: 'multi', target: [16, 17, 18], amount: 10 }] };
    }
    return { bets: [{ type: 'color', target: 'red', amount: 10 }] };
  } else {
    if (sNameLower.includes('banker')) {
      return { baccaratPattern: [{ r: 0, c: 0, type: 'B' }, { r: 1, c: 0, type: '?' }] };
    }
    if (sNameLower.includes('zig') || sNameLower.includes('zag')) {
      return { baccaratPattern: [{ r: 0, c: 0, type: 'P' }, { r: 0, c: 1, type: 'B' }, { r: 0, c: 2, type: '?' }] };
    }
    return { baccaratPattern: [{ r: 0, c: 0, type: 'P' }, { r: 1, c: 0, type: '?' }] };
  }
};
