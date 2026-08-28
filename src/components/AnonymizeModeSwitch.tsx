import { useTranslation } from 'react-i18next';
import type { AnonymizeMode } from '@/ml/utils/anonymizeEffects';

interface AnonymizeModeSwitchProps {
  mode: AnonymizeMode;
  onChange: (mode: AnonymizeMode) => void;
  disabled?: boolean;
  /** Translation key suffix for the "whole frame" option label. */
  fullLabelKey: 'anonymize.modeFullPhoto' | 'anonymize.modeFullVideo';
}

/** Segmented control: face detection vs whole-frame filter. */
export default function AnonymizeModeSwitch({
  mode,
  onChange,
  disabled,
  fullLabelKey,
}: AnonymizeModeSwitchProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-xs text-muted-foreground shrink-0">{t('anonymize.mode')}</span>
      <div className="inline-flex rounded-md border border-input overflow-hidden">
        {(['faces', 'full'] as AnonymizeMode[]).map((m) => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            title={m === 'full' ? t('anonymize.modeFullHint') : undefined}
            className={`h-7 px-3 text-xs transition-colors ${
              mode === m ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-accent'
            } disabled:opacity-50`}
          >
            {t(m === 'faces' ? 'anonymize.modeFaces' : fullLabelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
