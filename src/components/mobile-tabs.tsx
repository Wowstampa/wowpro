'use client';

import {useEffect, useState, useSyncExternalStore} from 'react';

const MOBILE_QUERY = '(max-width: 760px)';

// True on phone-sized screens. Always false during server rendering, so desktop markup never changes.
export function useIsMobile() {
  return useSyncExternalStore(
    (onChange) => { const query = window.matchMedia(MOBILE_QUERY); query.addEventListener('change', onChange); return () => query.removeEventListener('change', onChange); },
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

export type MobileTab = {id: string; label: string; count?: number; content: React.ReactNode};

// Splits a long page into segmented tabs on mobile. On desktop the bar is hidden and every panel
// uses `display: contents`, so the page renders exactly as if the wrappers were not there.
export function MobileTabs({tabs, initial}: {tabs: MobileTab[]; initial?: string}) {
  const [active, setActive] = useState(initial || tabs[0]?.id);

  // Lets links like ?tab=chat open a specific tab.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (requested && tabs.some((tab) => tab.id === requested)) setActive(requested);
  }, [tabs]);

  return <div className="mtabs">
    <div aria-label="Sezioni" className="mtabs__bar" role="tablist">
      {tabs.map((tab) => <button aria-selected={active === tab.id} className={active === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => { setActive(tab.id); window.scrollTo({top: 0}); }} role="tab" type="button">{tab.label}{tab.count ? <b>{tab.count > 9 ? '9+' : tab.count}</b> : null}</button>)}
    </div>
    {tabs.map((tab) => <div className={active === tab.id ? 'mtab-panel is-active' : 'mtab-panel'} key={tab.id} role="tabpanel">{tab.content}</div>)}
  </div>;
}

// Renders its children only on mobile (for example an inline chat that would otherwise poll on desktop).
export function MobileOnly({children}: {children: React.ReactNode}) {
  return useIsMobile() ? <>{children}</> : null;
}
