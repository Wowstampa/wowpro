import Link from 'next/link';
import {Coins, Crown, FileText, Lock} from 'lucide-react';

// One "Piano e crediti" area with three views: credits, subscription and invoices.
export function PlanTabs({current, locked = false}: {current: 'crediti' | 'abbonamento' | 'fatture'; locked?: boolean}) {
  const tab = (key: typeof current, href: string, label: string, Icon: typeof Coins, lockable: boolean) => <Link aria-current={current === key ? 'page' : undefined} className={current === key ? 'is-active' : ''} href={href}><Icon size={16} /> {label}{locked && lockable ? <Lock size={12} /> : null}</Link>;
  return <nav aria-label="Piano e crediti" className="plan-tabs">
    {tab('crediti', '/dashboard/crediti', 'Crediti', Coins, true)}
    {tab('abbonamento', '/dashboard/abbonamento', 'Abbonamento', Crown, false)}
    {tab('fatture', '/dashboard/fatture', 'Fatture', FileText, true)}
  </nav>;
}
