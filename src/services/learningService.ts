export const learningService = {
  async recordPattern(gameType: string, sequence: string[], outcome: string, isWin: boolean) {
    if (sequence.length < 5) return;
    
    const sequenceKey = sequence.join(',');
    // ID includes gameType, sequence and outcome to track specific transition performance
    const patternId = `${gameType}_${sequenceKey}_${outcome}`.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 120);

    // Save to localStorage FIRST for offline support
    try {
      const localDataStr = localStorage.getItem('casino_patterns') || '{}';
      const localData = JSON.parse(localDataStr);
      if (!localData[patternId]) {
        localData[patternId] = {
          gameType,
          sequence: sequenceKey,
          nextOutcome: outcome,
          wins: isWin ? 1 : 0,
          count: 1,
          lastUpdated: Date.now()
        };
      } else {
        localData[patternId].wins += isWin ? 1 : 0;
        localData[patternId].count += 1;
        localData[patternId].lastUpdated = Date.now();
      }
      localStorage.setItem('casino_patterns', JSON.stringify(localData));
    } catch (e) {
      console.error("Local storage error in recordPattern:", e);
    }
  },

  async getRecommendedEntry(gameType: string, currentSequence: string[]) {
    if (currentSequence.length < 5) return null;
    
    const sequenceKey = currentSequence.join(',');

    // Offline / Local fallback analysis
    try {
      const localDataStr = localStorage.getItem('casino_patterns') || '{}';
      const localData = JSON.parse(localDataStr);
      
      const findings: any[] = [];
      for (const key of Object.keys(localData)) {
        const pattern = localData[key];
        if (pattern.gameType === gameType && pattern.sequence === sequenceKey) {
          const winRate = pattern.count > 0 ? (pattern.wins / pattern.count) * 100 : 0;
          findings.push({
            entry: pattern.nextOutcome,
            winRate,
            count: pattern.count
          });
        }
      }

      const validFindings = findings.filter(f => f.count >= 2);
      validFindings.sort((a, b) => b.winRate - a.winRate || b.count - a.count);

      if (validFindings.length > 0 && validFindings[0].winRate >= 70) {
        return validFindings[0];
      }
    } catch (e) {
      console.error("Local patterns lookup error:", e);
    }
    
    return null;
  }
};
