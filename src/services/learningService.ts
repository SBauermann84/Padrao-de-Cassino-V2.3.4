export const learningService = {
  async recordPattern(gameType: string, sequence: string[], outcome: string, _isWin?: boolean) {
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
          wins: 1, // Every actual transition represents a valid instance of this pattern
          count: 1,
          lastUpdated: Date.now()
        };
      } else {
        localData[patternId].wins += 1;
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
      let totalSequenceCount = 0;

      // First pass: Find all transitions matching this sequence and calculate total occurrences
      for (const key of Object.keys(localData)) {
        const pattern = localData[key];
        if (pattern.gameType === gameType && pattern.sequence === sequenceKey) {
          totalSequenceCount += pattern.count;
          findings.push({
            entry: pattern.nextOutcome,
            count: pattern.count
          });
        }
      }

      // Second pass: Calculate actual winRate as (transition count / total sequence occurrences)
      const findingsWithRate = findings.map(f => ({
        entry: f.entry,
        winRate: totalSequenceCount > 0 ? (f.count / totalSequenceCount) * 100 : 0,
        count: f.count
      }));

      // Filter and sort
      // Requires at least 2 occurrences of this sequence to be scientifically valid (matches backtest total >= 2)
      const validFindings = findingsWithRate.filter(f => f.count >= 2);
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
