import React, { useState } from 'react';
import { Globe, Save } from 'lucide-react';

export const NetworkSettings: React.FC = () => {
  const [proxy, setProxy] = useState('');
  const [useSocks, setUseSocks] = useState(false);

  return (
    <div className="bg-card border border-white/[0.04] rounded-3xl p-6 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Globe size={16} className="text-[#FF3366]" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">
          Network & Proxy
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Configure HTTP or SOCKS5 proxies for corporate networks.
      </p>

      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">Proxy URL</label>
          <input
            type="text"
            placeholder="e.g. http://proxy.corp.internal:8080"
            className="bg-background border border-white/[0.05] rounded-xl px-4 py-2 text-xs text-foreground focus:outline-none focus:border-[#FF3366]/50"
            value={proxy}
            onChange={(e) => setProxy(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={useSocks}
            onChange={(e) => setUseSocks(e.target.checked)}
            className="w-4 h-4 rounded accent-[#FF3366] bg-white/5 border-white/10"
          />
          <span className="text-xs text-foreground">Use SOCKS5 instead of HTTP</span>
        </label>

        <button className="flex items-center gap-2 px-4 py-2 bg-[#FF3366] text-black rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#FF3366]/90 transition-all">
          <Save size={14} />
          Save Proxy
        </button>
      </div>
    </div>
  );
};
