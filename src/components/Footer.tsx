import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t py-2 md:py-4">
      <div className="container flex items-center justify-between gap-2 px-3 md:px-8">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground md:text-xs md:gap-2">
          <Sparkles className="h-3 w-3 md:h-4 md:w-4" />
          <span className="hidden sm:inline">{t('common.appName')}</span>
          <span className="hidden sm:inline">·</span>
          <span>{t('footer.mitLicense')}</span>
        </div>
        <nav className="flex items-center gap-2 text-[10px] text-muted-foreground md:text-xs md:gap-3">
          <Link to="/about" className="hover:text-foreground transition-colors">
            {t('about.title')}
          </Link>
          <a
            href="https://github.com/agran/photorestore-web"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors"
          >
            {t('footer.github')}
          </a>
        </nav>
      </div>
    </footer>
  );
}
