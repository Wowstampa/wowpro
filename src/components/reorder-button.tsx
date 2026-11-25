'use client';

import {RotateCcw} from 'lucide-react';
import Link from 'next/link';

import {REORDER_URL, saveReorder, type ReorderDraft} from '@/lib/reorder';

// Opens the quote form already filled with the products of a past order or quote.
export function ReorderButton({draft, className = 'client-action', label = 'Riordina'}: {draft: ReorderDraft; className?: string; label?: string}) {
  return <Link className={className} href={REORDER_URL} onClick={() => saveReorder(draft)}><RotateCcw size={14} /> {label}</Link>;
}
