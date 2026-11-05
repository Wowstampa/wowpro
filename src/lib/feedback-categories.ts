export const FEEDBACK_CATEGORIES = ['Nuovo prodotto', 'Sito web', 'WOWPRO', 'Funzionalità'] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
