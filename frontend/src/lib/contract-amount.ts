const rupiahAmount = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{0,2}))?$/;

export function formatContractAmountInput(value: string, previous: string, inputType?: string) {
  const digitsEdited = inputType === 'insertText' || inputType === 'deleteContentBackward' || inputType === 'deleteContentForward';
  const [previousWhole] = previous.split(',');
  // Reflow the existing separators on single-character edits. Check pasted text as entered.
  const edited = digitsEdited && rupiahAmount.test(previous) && previousWhole.includes('.') &&
    value.split(',')[0].split('.').length === previousWhole.split('.').length &&
    /^\d+(?:\.\d*)+(?:,\d{0,2})?$/.test(value);
  const candidate = edited ? value.replace(/\./g, '') : value;
  const match = rupiahAmount.exec(candidate.trim());
  if (!match) return value;
  const whole = match[1].replace(/\./g, '').replace(/^0+(?=\d)/, '');
  if (whole.length > 16) return value;
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (match[2] === undefined ? '' : `,${match[2]}`);
}

export function parseContractAmount(value: string): number | null {
  const match = rupiahAmount.exec(value.trim());
  if (!match || match[2] === '') return null;
  const whole = match[1].replace(/\./g, '').replace(/^0+(?=\d)/, '');
  const fraction = match[2]?.replace(/0+$/, '');
  const canonical = fraction ? `${whole}.${fraction}` : whole;
  const amount = Number(canonical);
  // The database column is numeric(18,2). Reject values that JS would serialize differently.
  return whole.length <= 16 && amount > 0 && String(amount) === canonical ? amount : null;
}
