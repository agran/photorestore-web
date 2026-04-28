import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

const LANGUAGES = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = i18n.language.split('-')[0];

  const toggle = () => {
    const next = current === 'en' ? 'ru' : 'en';
    void i18n.changeLanguage(next);
  };

  const lang = LANGUAGES.find((l) => l.code === current) ?? LANGUAGES[0];

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={`Switch language (current: ${lang.label})`}
      className="gap-1.5 px-2"
    >
      <span>{lang.flag}</span>
      <span className="text-xs font-medium">{lang.label}</span>
    </Button>
  );
}
