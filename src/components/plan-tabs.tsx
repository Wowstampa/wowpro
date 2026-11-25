import Link from 'next/link';
import {Coins, Crown, Lock} from 'lucide-react';

// One "Piano e crediti" area with two views: credits and subscription.
export function PlanTabs({current, locked = false}: {current: 'crediti' | 'abbonamento'; locked?: boolean}) {
  return <nav aria-label="Piano e crediti" className="plan-tabs">
    <Link aria-current={current === 'crediti' ? 'page' : undefined} className={current === 'crediti' ? 'is-active' : ''} href="/dashboard/crediti"><Coins size={16} /> Crediti{locked ? <Lock size={12} /> : null}</Link>
    <Link aria-current={current === 'abbonamento' ? 'page' : undefined} className={current === 'abbonamento' ? 'is-active' : ''} href="/dashboard/abbonamento"><Crown size={16} /> Abbonamento</Link>
  </nav>;
}
