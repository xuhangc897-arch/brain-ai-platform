(function (global) {
  "use strict";

  const TYPING_SUPPORT_RULES = Object.freeze({
    minObservationMs: 30000,
    longStayCharacterThreshold: 10,
    longPauseMs: 20000,
    lowCharacterThreshold: 20,
    deleteOperationThreshold: 3,
    largeDeleteThreshold: 1,
    refocusThreshold: 2,
    refocusCharacterThreshold: 10,
    recentActivityWindowMs: 45000,
    steadyInputMaxGapMs: 15000,
    steadyInputMinGrowth: 5,
    steadyInputMinEvents: 3,
    cooldownMs: 180000
  });

  function hasSteadyRecentInput(metrics, now, rules) {
    const recent = (metrics.positiveGrowthEvents || [])
      .filter((event) => now - Number(event.at) <= rules.recentActivityWindowMs)
      .sort((left, right) => left.at - right.at);
    if (recent.length < rules.steadyInputMinEvents) return false;
    if (now - recent[recent.length - 1].at > rules.steadyInputMaxGapMs) return false;
    const growth = recent.reduce((total, event) => total + Math.max(0, Number(event.growth) || 0), 0);
    if (growth < rules.steadyInputMinGrowth) return false;
    for (let index = 1; index < recent.length; index += 1) {
      if (recent[index].at - recent[index - 1].at > rules.steadyInputMaxGapMs) return false;
    }
    return true;
  }

  function evaluate(metrics, now = Date.now(), rules = TYPING_SUPPORT_RULES) {
    if (!metrics || metrics.taskStatus === "submitted" || !metrics.isFocused) {
      return { shouldSuggest: false, protectedBySteadyInput: false, triggerReasons: [] };
    }
    if (metrics.observedDurationMs < rules.minObservationMs ||
        metrics.effectiveCharacterCount >= rules.lowCharacterThreshold) {
      return { shouldSuggest: false, protectedBySteadyInput: false, triggerReasons: [] };
    }

    const protectedBySteadyInput = hasSteadyRecentInput(metrics, now, rules);
    if (protectedBySteadyInput) {
      return { shouldSuggest: false, protectedBySteadyInput: true, triggerReasons: [] };
    }

    const reasons = [];
    if (metrics.observedDurationMs >= rules.minObservationMs &&
        metrics.effectiveCharacterCount < rules.longStayCharacterThreshold) {
      reasons.push("no_effective_text");
    }
    if (Math.max(Number(metrics.longestPauseMs) || 0, Number(metrics.currentPauseMs) || 0) >= rules.longPauseMs) {
      reasons.push("repeated_long_pauses");
    }
    if (metrics.deleteCount >= rules.deleteOperationThreshold) {
      reasons.push("deletion_pressure");
    }
    if (metrics.largeDeleteCount >= rules.largeDeleteThreshold) {
      reasons.push("multiple_large_deletions");
    }
    if (metrics.focusCount >= rules.refocusThreshold &&
        metrics.effectiveCharacterCount < rules.refocusCharacterThreshold) {
      reasons.push("repeated_focus_without_progress");
    }

    return {
      shouldSuggest: reasons.length > 0,
      protectedBySteadyInput: false,
      triggerReasons: reasons
    };
  }

  global.TypingSupportRules = Object.freeze({
    values: TYPING_SUPPORT_RULES,
    evaluate,
    hasSteadyRecentInput
  });
})(window);
