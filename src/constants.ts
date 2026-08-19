export const ROULETTE_RACE_SEQUENCE = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13,
  36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20,
  14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

export const ROULETTE_ZONES = {
  VOISINS: [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25],
  TIERS: [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33],
  ORPHELINS: [1, 20, 14, 31, 9, 17, 34, 6],
  ZERO_SPIEL: [12, 35, 3, 26, 0, 32, 15]
};

export const COLOR_MAP = {
  ROULETTE: {
    RED: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],
    BLACK: [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35],
    ZERO: [0]
  },
  BACCARAT: {
    BANKER: '#e11d48', // Red
    PLAYER: '#2563eb', // Blue
    TIE: '#10b981'    // Green
  }
};

export const SCORE_WEIGHTS = {
  REPETITION: 10,
  ATRASO: 10,
  ZONA: 15,
  VIZINHOS: 15,
  TERMINAL: 10,
  VOLATILIDADE: 10,
  BACKTEST: 20,
  DRAWDOWN: 10
};
