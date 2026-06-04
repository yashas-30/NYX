export interface SettingsProfile {
  id: string;
  name: string;
  theme: string;
  hotkeys: Record<string, string>;
}

const DEFAULT_PROFILES: SettingsProfile[] = [
  { id: 'default', name: 'Default Profile', theme: 'dark', hotkeys: { toggleSidebar: 'ctrl+b' } },
  {
    id: 'fast-coding',
    name: 'Fast Coding',
    theme: 'dark',
    hotkeys: { toggleSidebar: 'ctrl+b', runCode: 'ctrl+enter' },
  },
  {
    id: 'deep-research',
    name: 'Deep Research',
    theme: 'light',
    hotkeys: { newSearch: 'ctrl+f', toggleSidebar: 'ctrl+b' },
  },
];

export class SettingsProfileManager {
  static getProfiles(): SettingsProfile[] {
    const stored = localStorage.getItem('nyx_settings_profiles');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse profiles', e);
      }
    }
    return DEFAULT_PROFILES;
  }

  static getProfile(id: string): SettingsProfile | undefined {
    return this.getProfiles().find((p) => p.id === id);
  }

  static saveProfiles(profiles: SettingsProfile[]) {
    localStorage.setItem('nyx_settings_profiles', JSON.stringify(profiles));
  }
}
