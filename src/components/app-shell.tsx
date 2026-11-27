'use client';

import Image from 'next/image';

import Link from 'next/link';
import {createContext, Fragment, useContext, useEffect, useState} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {
  BadgeEuro,
  ChartNoAxesCombined,
  FileText,
  Crown,
  Home,
  Lightbulb,
  Lock,
  Palette,
  FolderOpen,
  Gift,
  Plus,
  Settings,
  ChevronUp,
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
  // Short text badge (e.g. NUOVA) instead of a number.
  tag?: string;
  section?: string;
  separated?: boolean;
  children?: Array<{href: string; label: string; icon: typeof Home}>;
  // Extra paths that highlight this entry (one entry covering several pages).
  match?: string[];
};

function getClientLinks(notificationCounts: AdminNotificationCounts, locked: boolean, promoTag?: string): NavigationLink[] {
  // Without a subscription the home is the welcome page and the workspace dashboard is a separate, locked entry.
  const home: NavigationLink[] = locked ? [{href: '/dashboard', label: 'Benvenuto', icon: Home}, {href: '/dashboard/workspace', label: 'Dashboard', icon: ChartNoAxesCombined}] : [{href: '/dashboard', label: 'Dashboard', icon: ChartNoAxesCombined}];
  return [
  ...home,
  // Grouped by what the client is doing; the Richieste badge counts only what waits for the client.
  {href: '/dashboard/richieste', label: 'Richieste', icon: MessageSquareText, count: notificationCounts.requests || undefined, section: 'LAVORI'},
  {href: '/dashboard/ordini', label: 'Ordini', icon: PackageCheck},
  {href: '/dashboard/promo', label: 'In anteprima', icon: Gift, section: 'PROMOZIONI', tag: promoTag},
  {href: '/dashboard/brand-kit', label: 'Brand kit', icon: Palette, section: 'IL TUO BRAND'},
  {href: '/dashboard/file', label: 'File', icon: FolderOpen},
  {href: locked ? '/dashboard/abbonamento' : '/dashboard/crediti', label: 'Piano e crediti', icon: Crown, section: 'ACCOUNT', match: ['/dashboard/crediti', '/dashboard/abbonamento', '/dashboard/fatture']},
  {href: '/dashboard/supporto', label: 'Messaggi', icon: MessagesSquare, count: notificationCounts.support || undefined, section: 'AIUTO'},
  {href: '/dashboard/feedback', label: 'Feedback & idee', icon: Lightbulb},
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
  {href: '/admin/promo', label: 'Promo', icon: Gift},
  ];
  if (isAdministrator) links.push({href: '/admin/team-ruoli', label: 'Team & ruoli', icon: UsersRound, section: 'AMMINISTRAZIONE'});
  return links;
}

const TAB_LABELS: Record<string, string> = {'/dashboard': 'Home', '/dashboard/richieste': 'Richieste', '/admin': 'Home', '/operatore': 'Home'};

export type AdminNotificationCounts = {requests: number; feedback: number; support?: number};

// Client credits shown in every page header, from the shell (one source, same on every page).
const ShellContext = createContext<{credits: number | null}>({credits: null});

export function AppShell({mode, children, notificationCounts = {requests: 0, feedback: 0}, operatorName, isAdministrator = false, subscription, locked = false, freshPromos = []}: {mode: ShellMode; locked?: boolean; freshPromos?: string[]; children: React.ReactNode; notificationCounts?: AdminNotificationCounts; operatorName?: string; isAdministrator?: boolean; subscription?: {plan: string; monthlyCredits: number; renewalDate: string; status: string; included?: number; extra?: number}}) {
  const pathname = usePathname();
  const router = useRouter();
  // "NUOVA" next to Promo while an early promo has not been opened yet on this device.
  const [promoTag, setPromoTag] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!freshPromos.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(window.localStorage.getItem('wowpro:promo-seen') || '[]') as string[]; } catch { /* Storage unavailable. */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the device's seen list once
    setPromoTag(freshPromos.some((id) => !seen.includes(id)) ? 'NUOVA' : undefined);
  }, [freshPromos, pathname]);
  const links = mode === 'admin' ? getAdminLinks(notificationCounts, isAdministrator) : mode === 'graphic' ? graphicLinks.map((link) => link.href === '/operatore/richieste' ? {...link, count: notificationCounts.requests || undefined} : link) : getClientLinks(notificationCounts, mode === 'client' && locked, promoTag);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Without an active subscription only the home and Abbonamento stay open for clients.
  const isLocked = (href: string) => mode === 'client' && locked && href !== '/dashboard' && href !== '/dashboard/abbonamento';
  const matches = ({href, match}: NavigationLink) => href === pathname || (href !== '/admin' && href !== '/dashboard' && pathname.startsWith(href)) || Boolean(match?.some((path) => pathname.startsWith(path)));
  const activeLink = links.find((link) => link.children?.some((child) => pathname.startsWith(child.href)) || matches(link));
  const totalBadges = links.reduce((total, link) => total + (link.count || 0), 0);
  // Mobile bottom bar: the most used sections, everything else stays in the "Altro" drawer.
  const tabHrefs = mode === 'admin' ? ['/admin', '/admin/richieste', '/admin/messaggi', '/admin/clienti'] : mode === 'graphic' ? ['/operatore', '/operatore/richieste'] : ['/dashboard', '/dashboard/richieste', '/dashboard/ordini'];
  const showNewRequest = mode === 'client' && !locked;
  const [profileOpen, setProfileOpen] = useState(false);
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
    <ShellContext.Provider value={{credits: mode === 'client' && subscription ? (subscription.included || 0) + (subscription.extra || 0) : null}}>
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
        {showNewRequest ? <Link className="sidebar-new" href="/dashboard/richieste?new=1" onClick={() => setMenuOpen(false)}><Plus size={18} strokeWidth={2.6} /> Nuova richiesta</Link> : null}
        {mode === 'admin' ? <div className="internal-pill">PANNELLO INTERNO</div> : mode === 'graphic' ? <div className="internal-pill">ACCESSO OPERATORE GRAFICO</div> : null}
        <nav className="nav-list">
          {links.map((link) => {
            const {href, label, icon: Icon, count, tag, children, section, separated} = link;
            const childIsActive = children?.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));
            const active = Boolean(childIsActive) || matches(link);
            return (
              <div className={separated ? 'nav-group nav-group--separated' : 'nav-group'} key={href}>
                {section ? <span className="nav-label nav-label--section">{section}</span> : null}
                <Link aria-label={isLocked(href) ? `${label} (riservato agli abbonati)` : undefined} href={href} className={`nav-link${active ? ' nav-link--active' : ''}${isLocked(href) ? ' nav-link--locked' : ''}`} onClick={() => setMenuOpen(false)}>
                  <Icon size={18} />
                  <span>{label}</span>
                  {isLocked(href) ? <Lock className="nav-lock" size={14} /> : count ? <b>{count}</b> : tag ? <b className="nav-tag">{tag}</b> : null}
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
          {mode === 'client' && subscription && /non attivo/i.test(subscription.status) ? <Link className="sub-card sub-card--inactive" href="/dashboard/abbonamento" onClick={() => setMenuOpen(false)}><div className="sub-card__top"><span className="sub-dot" /><span className="sub-card__status">Abbonamento non attivo</span></div><p className="sub-card__plan">Attiva WOWPRO: <b>12.000 crediti</b> al mese e tutti i vantaggi riservati.</p><span className="sub-card__cta">Scopri WOWPRO →</span></Link>
            : mode === 'client' && subscription ? <Link className="sub-card sub-card--wallet" href="/dashboard/crediti" onClick={() => setMenuOpen(false)}>
              <div className="sub-card__top"><span className="sub-dot" /><span className="sub-card__status">{subscription.plan}</span></div>
              <div className="sub-card__credits"><b>{number((subscription.included || 0) + (subscription.extra || 0))}</b><small>crediti disponibili</small></div>
              {subscription.monthlyCredits ? <span aria-hidden="true" className="sub-card__bar"><i style={{width: `${Math.min(100, Math.round(((subscription.included || 0) / subscription.monthlyCredits) * 100))}%`}} /></span> : null}
              <small className="sub-card__meta">{subscription.monthlyCredits ? `${number(subscription.included || 0)} di ${number(subscription.monthlyCredits)} inclusi` : 'Crediti mensili da configurare'}{subscription.renewalDate ? ` · rinnovo ${shortDate(subscription.renewalDate)}` : ''}</small>
            </Link> : null}
          {mode === 'client' ? <div className="profile-menu">
            {profileOpen ? <div className="profile-menu__pop" role="menu">
              <Link href="/dashboard/impostazioni" onClick={() => { setProfileOpen(false); setMenuOpen(false); }} role="menuitem"><Settings size={16} /> Impostazioni</Link>
              <button disabled={isSigningOut} onClick={signOut} role="menuitem" type="button"><LogOut size={16} /> Esci</button>
            </div> : null}
            <button aria-expanded={profileOpen} className="sidebar-profile sidebar-profile--button" onClick={() => setProfileOpen((value) => !value)} type="button">
              <span className="avatar">{initials(operatorName || 'Cliente')}</span>
              <span className="sidebar-profile__copy"><strong>{operatorName || 'Area cliente'}</strong><small>Account e impostazioni</small></span>
              <ChevronUp className={profileOpen ? 'profile-menu__chevron is-open' : 'profile-menu__chevron'} size={16} />
            </button>
          </div> : <div className="sidebar-profile">
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
          </div>}
          {mode === 'client' ? <nav aria-label="Documenti legali" className="sidebar-legal"><Link href="/privacy" target="_blank">Privacy</Link><Link href="/cookie" target="_blank">Cookie</Link><Link href="/termini" target="_blank">Termini</Link></nav> : null}
        </div>
      </aside>
      <div className="app-main">{children}</div>
      <nav aria-label="Navigazione principale" className="tabbar">
        {tabItems.map(({href, label, icon: Icon, count}, index) => {
          const active = !menuOpen && activeLink?.href === href;
          const plus = showNewRequest && index === 2 ? <Link aria-label="Nuova richiesta" className="tabbar__plus" href="/dashboard/richieste?new=1" key="new" onClick={() => setMenuOpen(false)}><span><Plus size={24} strokeWidth={2.6} /></span></Link> : null;
          return <Fragment key={href}>{plus}<Link aria-current={active ? 'page' : undefined} className={`tabbar__item${active ? ' is-active' : ''}${isLocked(href) ? ' is-locked' : ''}`} href={href} key={href} onClick={() => setMenuOpen(false)}><span><Icon size={21} />{isLocked(href) ? <i className="tab-lock"><Lock size={9} strokeWidth={3} /></i> : count ? <b>{count > 9 ? '9+' : count}</b> : null}</span>{label}</Link></Fragment>;
        })}
        <button aria-expanded={menuOpen} className={menuOpen || (activeLink && !tabItems.some((item) => item.href === activeLink.href)) ? 'tabbar__item is-active' : 'tabbar__item'} onClick={() => setMenuOpen((value) => !value)} type="button"><span><LayoutGrid size={21} />{moreBadges ? <b>{moreBadges > 9 ? '9+' : moreBadges}</b> : null}</span>Altro</button>
      </nav>
    </div>
    </ShellContext.Provider>
  );
}

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function number(value: number) { return new Intl.NumberFormat('it-IT', {useGrouping: 'always'} as Intl.NumberFormatOptions).format(value); }
function shortDate(value: string) { return new Intl.DateTimeFormat('it-IT', {day: 'numeric', month: 'short'}).format(new Date(`${value}T12:00:00`)); }

export function PageHeader({eyebrow, title, action}: {eyebrow: string; title: string; action?: React.ReactNode}) {
  const {credits} = useContext(ShellContext);
  return (
    <header className="page-header">
      <div><span>{eyebrow}</span><h1>{title}</h1></div>
      {action ?? (credits !== null ? <Link className="credit-chip" href="/dashboard/crediti"><i /> <strong>{number(credits)}</strong> crediti disponibili</Link> : null)}
    </header>
  );
}
