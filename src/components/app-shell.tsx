'use client';

import Image from 'next/image';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {
  BadgeEuro,
  ChartNoAxesCombined,
  CreditCard,
  FileText,
  Crown,
  Headphones,
  Home,
  Lightbulb,
  Lock,
  Palette,
  LayoutGrid,
  LogOut,
  Menu,
  MessageSquareText,
  MessagesSquare,
  PackageCheck,
  UsersRound,
  X,
} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';

type ShellMode = 'client' | 'admin' | 'graphic';

type NavigationLink = {
  href: string;
  label: string;
  icon: typeof Home;
  count?: number;
  section?: string;
  separated?: boolean;
  children?: Array<{href: string; label: string; icon: typeof Home}>;
};

function getClientLinks(notificationCounts: AdminNotificationCounts, locked: boolean): NavigationLink[] {
  // Without a subscription the home is the welcome page and the workspace dashboard is a separate, locked entry.
  const home: NavigationLink[] = locked ? [{href: '/dashboard', label: 'Benvenuto', icon: Home}, {href: '/dashboard/workspace', label: 'Dashboard', icon: ChartNoAxesCombined}] : [{href: '/dashboard', label: 'Dashboard', icon: ChartNoAxesCombined}];
  return [
  ...home,
  {href: '/dashboard/richieste', label: 'Richieste', icon: MessageSquareText, count: notificationCounts.requests || undefined, section: 'GESTIONE'},
  {href: '/dashboard/ordini', label: 'Ordini', icon: PackageCheck},
  {href: '/dashboard/crediti', label: 'Crediti', icon: CreditCard},
  {href: '/dashboard/brand-kit', label: 'Brand kit', icon: Palette},
  {href: '/dashboard/abbonamento', label: 'Abbonamento', icon: Crown},
  {href: '/dashboard/supporto', label: 'Supporto', icon: Headphones, count: notificationCounts.support || undefined, section: 'SUPPORTO'},
  {href: '/dashboard/feedback', label: 'Feedback & idee', icon: Lightbulb, section: 'COMMUNITY'},
  ];
}

const graphicLinks: NavigationLink[] = [
  {href: '/operatore', label: 'Panoramica', icon: ChartNoAxesCombined},
  {href: '/operatore/richieste', label: 'Richieste', icon: MessageSquareText, section: 'GESTIONE', separated: true},
];

function getAdminLinks(notificationCounts: AdminNotificationCounts, isAdministrator: boolean): NavigationLink[] {
  const links: NavigationLink[] = [
  {href: '/admin', label: isAdministrator ? 'Panoramica' : 'Dashboard', icon: ChartNoAxesCombined},
  {href: '/admin/clienti', label: 'Clienti', icon: UsersRound, section: 'GESTIONE', separated: true, children: [{href: '/admin/archivio-clienti', label: 'Archivio clienti', icon: PackageCheck}]},
  {href: '/admin/richieste', label: 'Richieste', icon: MessageSquareText, count: notificationCounts.requests || undefined},
  {href: '/admin/preventivi', label: 'Preventivi', icon: FileText},
  {href: '/admin/messaggi', label: 'Messaggi', icon: MessagesSquare, count: notificationCounts.support || undefined},
  {href: '/admin/crediti', label: 'Crediti', icon: BadgeEuro},
  {href: '/admin/feedback', label: 'Feedback & idee', icon: Lightbulb, count: notificationCounts.feedback || undefined, section: 'COMMUNITY'},
  ];
  if (isAdministrator) links.push({href: '/admin/team-ruoli', label: 'Team & ruoli', icon: UsersRound, section: 'AMMINISTRAZIONE'});
  return links;
}

const TAB_LABELS: Record<string, string> = {'/dashboard': 'Home', '/dashboard/richieste': 'Richieste', '/admin': 'Home', '/operatore': 'Home'};

export type AdminNotificationCounts = {requests: number; feedback: number; support?: number};

export function AppShell({mode, children, notificationCounts = {requests: 0, feedback: 0}, operatorName, isAdministrator = false, subscription, locked = false}: {mode: ShellMode; locked?: boolean; children: React.ReactNode; notificationCounts?: AdminNotificationCounts; operatorName?: string; isAdministrator?: boolean; subscription?: {plan: string; monthlyCredits: number; renewalDate: string; status: string}}) {
  const pathname = usePathname();
  const router = useRouter();
  const links = mode === 'admin' ? getAdminLinks(notificationCounts, isAdministrator) : mode === 'graphic' ? graphicLinks.map((link) => link.href === '/operatore/richieste' ? {...link, count: notificationCounts.requests || undefined} : link) : getClientLinks(notificationCounts, mode === 'client' && locked);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Without an active subscription only the home and Abbonamento stay open for clients.
  const isLocked = (href: string) => mode === 'client' && locked && href !== '/dashboard' && href !== '/dashboard/abbonamento';
  const activeLink = links.find(({href, children}) => children?.some((child) => pathname.startsWith(child.href)) || href === pathname || (href !== '/admin' && href !== '/dashboard' && pathname.startsWith(href)));
  const totalBadges = links.reduce((total, link) => total + (link.count || 0), 0);
  // Mobile bottom bar: the most used sections, everything else stays in the "Altro" drawer.
  const tabHrefs = mode === 'admin' ? ['/admin', '/admin/richieste', '/admin/messaggi', '/admin/clienti'] : mode === 'graphic' ? ['/operatore', '/operatore/richieste'] : ['/dashboard', '/dashboard/richieste', '/dashboard/crediti', '/dashboard/supporto'];
  const tabItems = tabHrefs.map((href) => links.find((link) => link.href === href)).filter((link): link is NavigationLink => Boolean(link)).map((link) => ({...link, label: TAB_LABELS[link.href] || link.label, icon: link.href === '/dashboard' ? Home : link.icon}));
  const moreBadges = links.filter((link) => !tabHrefs.includes(link.href) && !isLocked(link.href)).reduce((total, link) => total + (link.count || 0), 0);

  // Mobile menu: lock page scroll while it is open.
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  async function signOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="app-frame">
      <header className="mobile-bar">
        <Link aria-label="WOWPRO" className="mobile-bar__brand" href={links[0]?.href || '/'} onClick={() => setMenuOpen(false)}><Image alt="WOWPRO" className="brand__logo" priority unoptimized height={40} src="/images/wowpro-logo.svg" width={114} /><small>{activeLink?.label || 'WowStampa'}</small></Link>
        <button aria-expanded={menuOpen} aria-label={menuOpen ? 'Chiudi menu' : 'Apri menu'} className="mobile-bar__toggle" onClick={() => setMenuOpen((value) => !value)} type="button">{menuOpen ? <X size={22} /> : <Menu size={22} />}{!menuOpen && totalBadges ? <b>{totalBadges > 9 ? '9+' : totalBadges}</b> : null}</button>
      </header>
      {menuOpen ? <button aria-label="Chiudi menu" className="sidebar-overlay" onClick={() => setMenuOpen(false)} type="button" /> : null}
      <aside className={menuOpen ? 'sidebar is-open' : 'sidebar'}>
        <div className="brand">
          <Image alt="WOWPRO" className="brand__logo" priority unoptimized height={56} src="/images/wowpro-logo.svg" width={160} />
          <span><small>{mode === 'admin' ? 'back-office · WowStampa' : mode === 'graphic' ? 'operatore grafico · WowStampa' : 'by WowStampa'}</small></span>
        </div>
        {mode === 'admin' ? <div className="internal-pill">PANNELLO INTERNO</div> : mode === 'graphic' ? <div className="internal-pill">ACCESSO OPERATORE GRAFICO</div> : null}
        <nav className="nav-list">
          {links.map(({href, label, icon: Icon, count, children, section, separated}) => {
            const childIsActive = children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
            const active = Boolean(childIsActive) || href === pathname || (href !== '/admin' && href !== '/dashboard' && pathname.startsWith(href));
            return (
              <div className={separated ? 'nav-group nav-group--separated' : 'nav-group'} key={href}>
                {section ? <span className="nav-label nav-label--section">{section}</span> : null}
                <Link aria-label={isLocked(href) ? `${label} (riservato agli abbonati)` : undefined} href={href} className={`nav-link${active ? ' nav-link--active' : ''}${isLocked(href) ? ' nav-link--locked' : ''}`} onClick={() => setMenuOpen(false)}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {isLocked(href) ? <Lock className="nav-lock" size={14} /> : count ? <b>{count}</b> : null}
                </Link>
                {children ? <div className="nav-sublist">{children.map(({href: childHref, label: childLabel, icon: ChildIcon}) => {
                  const childActive = pathname === childHref || pathname.startsWith(`${childHref}/`);
                  return <Link className={childActive ? 'nav-sublink nav-sublink--active' : 'nav-sublink'} href={childHref} key={childHref} onClick={() => setMenuOpen(false)}><ChildIcon size={14} /><span>{childLabel}</span></Link>;
                })}</div> : null}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          {mode === 'client' && subscription && /non attivo/i.test(subscription.status) ? <Link className="sub-card sub-card--inactive" href="/dashboard/abbonamento" onClick={() => setMenuOpen(false)}><div className="sub-card__top"><span className="sub-dot" /><span className="sub-card__status">Abbonamento non attivo</span></div><p className="sub-card__plan">Attiva WOWPRO: <b>12.000 crediti</b> al mese e tutti i vantaggi riservati.</p><span className="sub-card__cta">Scopri WOWPRO →</span></Link> : mode === 'client' && subscription ? <div className="sub-card"><div className="sub-card__top"><span className="sub-dot" /><span className="sub-card__status">Abbonamento {subscription.status.toLowerCase()}</span></div><p className="sub-card__plan">Piano <b>{subscription.plan}</b><br />{subscription.monthlyCredits ? `${number(subscription.monthlyCredits)} crediti / mese inclusi` : 'Crediti mensili da configurare'}</p><div className="sub-card__renew"><span>Rinnovo</span><b>{subscription.renewalDate ? date(subscription.renewalDate) : 'Da configurare'}</b></div></div> : null}
          <div className="sidebar-profile">
            <span className="avatar">{mode === 'admin' ? initials(isAdministrator ? 'Amministrazione' : operatorName || 'Operatore') : mode === 'graphic' ? initials(operatorName || 'Operatore Grafico') : initials(operatorName || 'Cliente')}</span>
            <span className="sidebar-profile__copy"><strong>{mode === 'admin' ? isAdministrator ? 'Amministrazione' : operatorName || 'Operatore WOWPRO' : mode === 'graphic' ? operatorName || 'Operatore Grafico' : operatorName || 'Area cliente'}</strong><small>{mode === 'admin' ? isAdministrator ? 'Accesso completo' : 'Team commerciale' : mode === 'graphic' ? 'Operatore grafico' : 'Accesso cliente'}</small></span>
            <button
              aria-label="Esci da WOWPRO"
              className="sign-out-button"
              disabled={isSigningOut}
              onClick={signOut}
              title="Esci"
              type="button"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">{children}</div>
      <nav aria-label="Navigazione principale" className="tabbar">
        {tabItems.map(({href, label, icon: Icon, count}) => {
          const active = !menuOpen && activeLink?.href === href;
          return <Link aria-current={active ? 'page' : undefined} className={`tabbar__item${active ? ' is-active' : ''}${isLocked(href) ? ' is-locked' : ''}`} href={href} key={href} onClick={() => setMenuOpen(false)}><span><Icon size={21} />{isLocked(href) ? <i className="tab-lock"><Lock size={9} strokeWidth={3} /></i> : count ? <b>{count > 9 ? '9+' : count}</b> : null}</span>{label}</Link>;
        })}
        <button aria-expanded={menuOpen} className={menuOpen || (activeLink && !tabItems.some((item) => item.href === activeLink.href)) ? 'tabbar__item is-active' : 'tabbar__item'} onClick={() => setMenuOpen((value) => !value)} type="button"><span><LayoutGrid size={21} />{moreBadges ? <b>{moreBadges > 9 ? '9+' : moreBadges}</b> : null}</span>Altro</button>
      </nav>
    </div>
  );
}

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function number(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
function date(value: string) { return new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(`${value}T12:00:00`)); }

export function PageHeader({eyebrow, title, action}: {eyebrow: string; title: string; action?: React.ReactNode}) {
  return (
    <header className="page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1></div>
      {action}
    </header>
  );
}
