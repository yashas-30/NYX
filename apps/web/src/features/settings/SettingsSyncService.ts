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
    // VS Code settings import reads from the local filesystem via Tauri IPC.
    // This feature is not yet implemented. Throw so callers can surface an error.
    throw new Error(
      'VS Code settings import is not yet available. This feature requires filesystem access via the desktop app.'
    );
  }
}
