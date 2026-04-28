import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Clock, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Dropzone from '@/components/Dropzone';
import ImageCompare from '@/components/ImageCompare';
import ToolPanel from '@/components/ToolPanel';
import ProgressBar from '@/components/ProgressBar';
import AnonymizeWizard from '@/components/AnonymizeWizard';
import { useEditorStore } from '@/store/editorStore';
import { useAnonymizeStore } from '@/store/anonymizeStore';
import { downloadImageUrl } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { useImageHistory } from '@/hooks/useImageHistory';

export default function Editor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentImageUrl, originalImageUrl, setImage, pushHistory } = useEditorStore();
  const { history, restore } = useImageHistory();
  const { reset: resetAnonymize, setModelId } = useAnonymizeStore();
  const [showWizard, setShowWizard] = useState(false);

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setImage(url);
  };

  const handleOpenWizard = (modelId: string) => {
    resetAnonymize();
    setModelId(modelId);
    setShowWizard(true);
  };

  const handleWizardResult = (resultUrl: string, label: string) => {
    setImage(resultUrl);
    pushHistory({ imageUrl: resultUrl, label });
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    resetAnonymize();
  };

  if (!currentImageUrl) {
    return (
      <div className="container flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-2xl font-bold">{t('editor.empty.title')}</h2>
        <p className="mt-2 text-muted-foreground">{t('editor.empty.description')}</p>
        <div className="mt-8 w-full max-w-md">
          <Dropzone onFile={handleFile} className="min-h-[180px]" />
        </div>
        <Button className="mt-4" variant="outline" onClick={() => void navigate('/')}>
          {t('editor.empty.action')}
        </Button>
      </div>
    );
  }

  return (
    <div className="container flex h-full min-h-0 flex-col py-2">
      <div className="flex flex-1 min-h-0 gap-4 max-md:flex-col">
        {/* Tools column */}
        <aside className="hidden w-[220px] flex-shrink-0 md:block">
          <ToolPanel onAnonymize={handleOpenWizard} />
        </aside>

        {/* Canvas column */}
        <section className="flex min-h-0 flex-1 flex-col gap-4">
          {showWizard ? (
            <div className="flex-1 min-h-0">
              <AnonymizeWizard
                onResult={handleWizardResult}
                onClose={handleCloseWizard}
              />
            </div>
          ) : (
            <>
              <ImageCompare
                beforeUrl={originalImageUrl ?? currentImageUrl}
                afterUrl={currentImageUrl}
                className="h-[60vh] w-full"
              />

              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  onClick={() => downloadImageUrl(currentImageUrl, t('editor.downloadFilename'))}
                >
                  <Download className="h-4 w-4" />
                  {t('editor.download')}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* History column */}
        <aside className="hidden w-[200px] flex-shrink-0 md:block">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                {t('editor.history')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 overflow-y-auto">
              {history.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('editor.noHistory')}</p>
              )}
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="group relative w-full overflow-hidden rounded border transition-colors hover:border-primary"
                >
                  <button
                    className="w-full text-left"
                    onClick={() => restore(entry)}
                  >
                    <img
                      src={entry.imageUrl}
                      alt={entry.label}
                      className="h-16 w-full object-cover"
                    />
                    <div className="px-2 py-1">
                      <p className="truncate text-xs font-medium">{entry.label}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</p>
                    </div>
                  </button>
                  <button
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded bg-background/80 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity hover:bg-background"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImageUrl(entry.imageUrl, t('editor.downloadFilename'));
                    }}
                    title={t('editor.download')}
                  >
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ProgressBar />
    </div>
  );
}
