"use client";
import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/i18n/language-provider';

export function OutcomeEvidenceField({
  files,
  onChange,
  disabled,
  hasError,
  errorTrigger,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  hasError?: boolean;
  errorTrigger?: number;
}) {
  const { t } = useLanguage();
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (hasError && files.length === 0) {
      setShaking(true);
      const timer = setTimeout(() => setShaking(false), 450);
      return () => clearTimeout(timer);
    }
  }, [hasError, errorTrigger, files.length]);

  const isInvalid = Boolean(hasError && files.length === 0);

  return (
    <label
      className={`block space-y-2 text-sm font-medium ${
        shaking ? 'animate-shake' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span>
          {t('workflowUpdate.evidence')} <span className="text-destructive font-bold ml-0.5">*</span>
        </span>
        {isInvalid && (
          <span className="text-xs font-normal text-destructive animate-in fade-in duration-200">
            {t('workflowUpdate.evidenceRequired')}
          </span>
        )}
      </div>
      <input
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
        disabled={disabled}
        onChange={event => onChange(Array.from(event.target.files || []))}
        className={`block w-full min-w-0 rounded-lg border bg-card p-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 ${
          isInvalid
            ? 'border-destructive ring-2 ring-destructive/20'
            : 'border-input focus-visible:ring-primary/20'
        }`}
      />
      <span className="block text-xs font-normal text-muted-foreground">
        {t('workflowUpdate.evidenceHelp')}
      </span>
      {files.length > 0 && (
        <span className="block break-words text-xs font-normal text-muted-foreground">
          {files.map(f => f.name).join(', ')}
        </span>
      )}
    </label>
  );
}
