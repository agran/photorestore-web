import { Moon, Sun, Monitor } from 'lucide-react';
import { Button } from './ui/button';
import { useSettingsStore, type Theme } from '@/store/settingsStore';

const THEMES: { value: Theme; icon: React.ReactNode; label: string }[] = [
  { value: 'light', icon: <Sun className="h-4 w-4" />, label: 'Light' },
  { value: 'dark', icon: <Moon className="h-4 w-4" />, label: 'Dark' },
  { value: 'system', icon: <Monitor className="h-4 w-4" />, label: 'System' },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();

  const cycle = () => {
    const idx = THEMES.findIndex((t) => t.value === theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next.value);
  };

  const current = THEMES.find((t) => t.value === theme) ?? THEMES[0];

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Switch theme (current: ${current.label})`}
    >
      {current.icon}
    </Button>
  );
}
