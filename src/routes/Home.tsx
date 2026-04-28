import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Zap, User, Brush, Wand2, Shield } from 'lucide-react';
import Dropzone from '@/components/Dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useEditorStore } from '@/store/editorStore';

const FEATURES = [
  {
    icon: <Zap className="h-6 w-6 text-primary" />,
    titleKey: 'home.features.upscale',
    descKey: 'home.features.upscaleDesc',
  },
  {
    icon: <User className="h-6 w-6 text-primary" />,
    titleKey: 'home.features.faceRestore',
    descKey: 'home.features.faceRestoreDesc',
  },
  {
    icon: <Brush className="h-6 w-6 text-primary" />,
    titleKey: 'home.features.inpaint',
    descKey: 'home.features.inpaintDesc',
  },
  {
    icon: <Wand2 className="h-6 w-6 text-primary" />,
    titleKey: 'home.features.denoise',
    descKey: 'home.features.denoiseDesc',
  },
  {
    icon: <Shield className="h-6 w-6 text-primary" />,
    titleKey: 'home.features.privacy',
    descKey: 'home.features.privacyDesc',
  },
];

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setImage } = useEditorStore();

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setImage(url);
    void navigate('/editor');
  };

  return (
    <div className="container py-12 md:py-20">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          {t('home.heroTitle')}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground sm:text-xl">
          {t('home.heroSubtitle')}
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button size="lg" onClick={() => void navigate('/editor')}>
            {t('home.goToEditor')}
          </Button>
          <Button size="lg" variant="outline" onClick={() => void navigate('/about')}>
            {t('home.learnMore')}
          </Button>
        </div>
      </section>

      {/* Drop zone */}
      <section className="mx-auto mt-12 max-w-2xl">
        <Dropzone
          onFile={handleFile}
          className="min-h-[200px] md:min-h-[280px]"
        />
      </section>

      {/* Features */}
      <section className="mx-auto mt-16 max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.titleKey}>
              <CardContent className="flex flex-col gap-3 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  {f.icon}
                </div>
                <h3 className="font-semibold">{t(f.titleKey)}</h3>
                <p className="text-sm text-muted-foreground">{t(f.descKey)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
