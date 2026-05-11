/**
 * Bug Collector - Centralized bug tracking for analysis functionality
 * Use this to track and debug issues in the analysis flow
 */

export interface BugReport {
  id: string;
  timestamp: number;
  component: string;
  issue: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

class BugCollectorClass {
  private bugs: BugReport[] = [];
  private listeners: Array<(bugs: BugReport[]) => void> = [];

  /**
   * Report a bug in the system
   */
  report(component: string, issue: string, details: Record<string, any> = {}, severity: BugReport['severity'] = 'medium') {
    const bug: BugReport = {
      id: `bug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      component,
      issue,
      details,
      severity,
      resolved: false
    };
    
    this.bugs.push(bug);
    
    // Keep only last 100 bugs
    if (this.bugs.length > 100) {
      this.bugs = this.bugs.slice(-100);
    }
    
    // Notify listeners
    this.notifyListeners();
    
    // Log to console for development
    console.group(`🐛 Bug Reported: ${component}`);
    console.log('Issue:', issue);
    console.log('Details:', details);
    console.log('Severity:', severity);
    console.groupEnd();
    
    return bug.id;
  }

  /**
   * Mark a bug as resolved
   */
  resolve(bugId: string) {
    const bug = this.bugs.find(b => b.id === bugId);
    if (bug) {
      bug.resolved = true;
      this.notifyListeners();
    }
  }

  /**
   * Get all bugs
   */
  getBugs(): BugReport[] {
    return [...this.bugs];
  }

  /**
   * Get unresolved bugs
   */
  getUnresolvedBugs(): BugReport[] {
    return this.bugs.filter(b => !b.resolved);
  }

  /**
   * Get bugs by component
   */
  getBugsByComponent(component: string): BugReport[] {
    return this.bugs.filter(b => b.component === component);
  }

  /**
   * Clear all bugs
   */
  clear() {
    this.bugs = [];
    this.notifyListeners();
  }

  /**
   * Subscribe to bug updates
   */
  subscribe(listener: (bugs: BugReport[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.bugs));
  }

  /**
   * Debug helper - log function entry
   */
  logEntry(component: string, functionName: string, params: Record<string, any> = {}) {
    console.log(`[${component}] ➡️ Enter: ${functionName}`, params);
  }

  /**
   * Debug helper - log function exit
   */
  logExit(component: string, functionName: string, result?: any) {
    console.log(`[${component}] ⬅️ Exit: ${functionName}`, result);
  }

  /**
   * Debug helper - log an error
   */
  logError(component: string, functionName: string, error: any) {
    this.report(component, `Error in ${functionName}`, { error: String(error), stack: error?.stack }, 'high');
    console.error(`[${component}] ❌ Error in ${functionName}:`, error);
  }
}

export const BugCollector = new BugCollectorClass();

// React hook for using bug collector in components
export const useBugCollector = () => {
  const [bugs, setBugs] = React.useState<BugReport[]>(BugCollector.getBugs());

  React.useEffect(() => {
    return BugCollector.subscribe(setBugs);
  }, []);

  return {
    bugs,
    unresolvedBugs: bugs.filter(b => !b.resolved),
    report: BugCollector.report.bind(BugCollector),
    resolve: BugCollector.resolve.bind(BugCollector),
    clear: BugCollector.clear.bind(BugCollector),
    logEntry: BugCollector.logEntry.bind(BugCollector),
    logExit: BugCollector.logExit.bind(BugCollector),
    logError: BugCollector.logError.bind(BugCollector)
  };
};

import React from 'react';