/**
 * NYX Structured Debug Logger
 * Connects to the local ws://localhost:3099 debug console to pipe UI interactions, logs, and network performance.
 */

class DebugLoggerService {
  private ws: WebSocket | null = null;
  private queue: any[] = [];
  private isConnecting = false;
  private isInitialized = false;

  public init() {
    if (this.isInitialized || (import.meta as any).env?.MODE === 'production') return;
    this.isInitialized = true;

    this.connect();
    this.interceptConsole();
    this.interceptNetwork();
    this.interceptInteractions();
  }

  private connect() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket('ws://localhost:3099?client=frontend');

      this.ws.onopen = () => {
        this.isConnecting = false;
        // Flush queue
        while (this.queue.length > 0) {
          const msg = this.queue.shift();
          this.ws?.send(JSON.stringify(msg));
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;
        // Attempt reconnect after 2 seconds
        setTimeout(() => this.connect(), 2000);
      };

      this.ws.onerror = () => {
        this.isConnecting = false;
      };
    } catch (e) {
      this.isConnecting = false;
    }
  }

  private send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      this.queue.push(payload);
      // Keep queue small to avoid memory leaks if console is not running
      if (this.queue.length > 500) this.queue.shift();
    }
  }

  private interceptConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      originalLog.apply(console, args);
      this.send({ type: 'LOG', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
    };

    console.warn = (...args: any[]) => {
      originalWarn.apply(console, args);
      this.send({ type: 'WARN', message: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
    };

    console.error = (...args: any[]) => {
      originalError.apply(console, args);
      const errorStr = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') return JSON.stringify(a);
        return String(a);
      }).join(' ');
      this.send({ type: 'ERROR', message: errorStr });
    };
  }

  private interceptNetwork() {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const startTime = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const method = (args[1]?.method || 'GET').toUpperCase();
      
      try {
        const response = await originalFetch(...args);
        const endTime = performance.now();
        this.send({
          type: 'NETWORK',
          method,
          url,
          status: response.status,
          latency: Math.round(endTime - startTime)
        });
        return response;
      } catch (error: any) {
        const endTime = performance.now();
        this.send({
          type: 'NETWORK',
          method,
          url,
          error: error.message,
          latency: Math.round(endTime - startTime)
        });
        throw error;
      }
    };
  }

  private interceptInteractions() {
    // Intercept Clicks
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Bubble up to find a meaningful target (button, a, label)
      const meaningfulTarget = target.closest('button, a, [role="button"], [role="menuitem"], [role="tab"], label') as HTMLElement | null;
      const element = meaningfulTarget || target;
      
      // Skip if clicking on random empty divs unless they have specific classes
      if (!meaningfulTarget && element.tagName === 'DIV' && !element.className) return;

      const startTime = performance.now();
      
      // Extract identifying text or aria-label
      let identifier = element.getAttribute('aria-label') || element.getAttribute('title') || element.innerText?.trim();
      if (!identifier && element.tagName === 'INPUT') identifier = (element as HTMLInputElement).placeholder || (element as HTMLInputElement).name;
      if (!identifier) identifier = element.id || element.className;
      
      if (identifier) {
        // Truncate if too long
        if (identifier.length > 50) identifier = identifier.substring(0, 50) + '...';
        
        // We log the click immediately. 
        // Latency here represents the synchronous blocking time of the event handlers.
        // We defer measuring it using setTimeout 0.
        setTimeout(() => {
          const latency = Math.round(performance.now() - startTime);
          this.send({
            type: 'INTERACTION',
            action: 'Click',
            target: `<${element.tagName.toLowerCase()}> "${identifier.replace(/\n/g, ' ')}"`,
            latency
          });
        }, 0);
      }
    }, { capture: true, passive: true });

    // Track Form Submissions
    document.addEventListener('submit', (e) => {
      const target = e.target as HTMLFormElement;
      this.send({
        type: 'INTERACTION',
        action: 'Submit',
        target: `<form> ${target.id || target.className || 'unnamed'}`,
      });
    }, { capture: true });
  }
}

export const DebugLogger = new DebugLoggerService();
