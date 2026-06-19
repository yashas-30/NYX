import { useState, useEffect } from 'react';

export function useLiveTimer(isActive: boolean): number {
  const [liveElapsed, setLiveElapsed] = useState(0);

  useEffect(() => {
    if (isActive) {
      const start = Date.now();
      setLiveElapsed(0);
      const interval = setInterval(() => {
        setLiveElapsed(Date.now() - start);
      }, 50);
      return () => clearInterval(interval);
    } else {
      setLiveElapsed(0);
    }
  }, [isActive]);

  return liveElapsed;
}
