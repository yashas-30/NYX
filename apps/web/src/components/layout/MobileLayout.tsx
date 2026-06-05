import { useState } from 'react';
import { useMediaQuery } from '@src/hooks/useMediaQuery';
import { motion, AnimatePresence } from 'framer-motion';

// Placeholders for missing components/icons
const MenuIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// Fallback sidebar if not provided
const Sidebar = ({ onClose }: { onClose: () => void }) => (
  <div className="p-4">Sidebar <button onClick={onClose}>Close</button></div>
);

export function MobileLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isMobile) return <>{children}</>;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Mobile Header */}
      <header className="h-14 flex items-center px-4 border-b border-border bg-surface">
        <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2">
          <MenuIcon className="w-6 h-6" />
        </button>
        <span className="ml-3 font-semibold">NYX</span>
      </header>

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              className="fixed left-0 top-0 bottom-0 w-80 bg-surface z-50"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
