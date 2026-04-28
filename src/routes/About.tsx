import { useTranslation } from 'react-i18next';
import { Shield, BookOpen, Github } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function About() {
  const { t } = useTranslation();

  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-3xl font-bold">{t('about.title')}</h1>
      <p className="mt-4 text-muted-foreground">{t('about.description')}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* Privacy */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-primary" />
              {t('about.privacy.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('about.privacy.description')}</p>
          </CardContent>
        </Card>

        {/* Models */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-5 w-5 text-primary" />
              {t('about.models.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t('about.models.description')}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 flex gap-4">
        <Button asChild variant="outline">
          <a
            href="https://github.com/agran/photorestore-web"
            target="_blank"
            rel="noopener noreferrer"
            className="gap-2"
          >
            <Github className="h-4 w-4" />
            {t('about.source')}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a
            href="https://opensource.org/licenses/MIT"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('about.license')}
          </a>
        </Button>
      </div>
    </div>
  );
}
