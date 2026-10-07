import { getIntlLocale, translate } from '@/i18n';

/** numeric(18,2), passed as text to preserve every cent above JS safe integers. */
export function normalizeEstimatedValue(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}
export function formatEstimatedValue(value: string | null | undefined): string {
  if (value == null) return translate('common.notAvailable');
  const valid = normalizeEstimatedValue(value);
  if (!valid) return translate('common.notAvailable');
  const [whole, fraction] = valid.split('.');
  return new Intl.NumberFormat(getIntlLocale(), { style: 'currency', currency: 'IDR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .formatToParts(BigInt(whole)).map(part => part.type === 'fraction' ? fraction : part.value).join('');
}
export function canEditEstimatedValue(project: { sales_id?: string; status: string; is_postponed?: boolean }, role?: string, userId?: string) {
  return !!userId && role === 'SALES' && project.sales_id === userId
    && ['DRAFT', 'ACTIVE'].includes(project.status) && project.is_postponed !== true;
}
export function estimatedValueErrorKey(code?: string) {
  if (code === 'ESTIMATE_STALE') return 'estimatedValue.stale' as const;
  if (code === 'ESTIMATE_NOT_EDITABLE' || code === 'ESTIMATE_FORBIDDEN') return 'estimatedValue.unavailable' as const;
  if (code === 'ESTIMATE_INVALID') return 'estimatedValue.invalid' as const;
  return 'estimatedValue.failed' as const;
}
