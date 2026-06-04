export class SettingsSyncService {
  static exportSettings() {
    const settings = {
      theme: localStorage.getItem('theme'),
      profiles: localStorage.getItem('nyx_settings_profiles'),
      quant: localStorage.getItem('nyx_quant'),
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nyx-settings-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async importSettings(file: File): Promise<boolean> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const settings = JSON.parse(e.target?.result as string);
          if (settings.theme) localStorage.setItem('theme', settings.theme);
          if (settings.profiles) localStorage.setItem('nyx_settings_profiles', settings.profiles);
          if (settings.quant) localStorage.setItem('nyx_quant', settings.quant);
          resolve(true);
        } catch (err) {
          console.error('Failed to import settings', err);
          resolve(false);
        }
      };
      reader.readAsText(file);
    });
  }

  static async importFromVSCode(): Promise<boolean> {
    // Simulated VS Code import logic parsing settings.json from local disk via IPC/API
    console.log('Importing settings from VS Code...');
    return new Promise((resolve) => setTimeout(() => resolve(true), 1500));
  }
}
