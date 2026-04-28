import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="border-t py-6 md:py-8">
      <div className="container flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>{t('common.appName')}</span>
          <span>·</span>
          <span>{t('footer.mitLicense')}</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
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
