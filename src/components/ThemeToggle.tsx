import { Moon, Sun, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { useSettingsStore, type Theme } from '@/store/settingsStore';

const THEME_ORDER: Theme[] = ['light', 'dark', 'system'];

const ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

export default function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, setTheme } = useSettingsStore();

  const cycle = () => {
    const idx = THEME_ORDER.indexOf(theme);
    const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
    setTheme(next);
  };

  return (
    <Button variant="ghost" size="icon" onClick={cycle} aria-label={t('settings.themes.' + theme)}>
      {ICONS[theme]}
    </Button>
  );
}
