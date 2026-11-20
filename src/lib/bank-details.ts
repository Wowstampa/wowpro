// WowStampa bank details for orders paid by bank transfer (the same shown at checkout).
export const WOWSTAMPA_BANK = {
  beneficiary: 'Strategia associati in comunicazione srl',
  iban: 'IT20W0200873622000400299978',
  bank: 'UniCredit',
  bic: '',
  creditDays: '1-2 giorni lavorativi',
};

// The order number alone, as in the checkout instructions.
export const transferReason = (orderName: string | null) => (orderName || '').trim();
