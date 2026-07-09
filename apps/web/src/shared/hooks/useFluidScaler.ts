import { useEffect } from 'react';

/**
 * useFluidScaler
 * 
 * Scales the root HTML font-size based on the viewport width.
 * This makes all Tailwind rem-based utilities (w-4, p-2, text-lg, etc.)
 * shrink and grow proportionally to the window size.
 * 
 * Target layout width: 1920px (where 1rem = 16px).
 */
export function useFluidScaler() {
  useEffect(() => {
    function handleResize() {
      const BASE_WIDTH = 1920;
      const BASE_FONT_SIZE = 16;
      const MIN_FONT_SIZE = 10; // Prevent the app from becoming unreadably small on tiny windows
      
      const width = window.innerWidth;
      
      // Calculate proportional font size
      let newFontSize = (width / BASE_WIDTH) * BASE_FONT_SIZE;
      
      // Clamp the font size
      if (newFontSize < MIN_FONT_SIZE) {
        newFontSize = MIN_FONT_SIZE;
      }
      if (newFontSize > BASE_FONT_SIZE) {
        newFontSize = BASE_FONT_SIZE;
      }

      document.documentElement.style.fontSize = `${newFontSize}px`;
    }

    // Run on mount
    handleResize();

    // Listen to resize events
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);
}
