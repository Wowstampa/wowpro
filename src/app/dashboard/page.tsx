import Link from 'next/link';
import Image from 'next/image';
import {ArrowRight, BadgePercent, Headphones, Palette, Printer, Truck} from 'lucide-react';

import {PageHeader} from '@/components/app-shell';
import {ProgramShowcase} from '@/components/program-showcase';
import {VideoIntro} from '@/components/video-intro';
import {requireProfile} from '@/lib/auth';
import {getWowproClient} from '@/lib/integrations/airtable';
import {createClient} from '@/lib/supabase/server';


export default async function DashboardPage() {
  const profile = await requireProfile(['client']);
  const supabase = await createClient();
  const {data: company} = await supabase.from('companies').select('name,airtable_record_id').eq('id', profile.company_id || '').maybeSingle();
  let credits = 0;
  let plan = 'WOWPRO';
  let manager = '';
  if (company?.airtable_record_id) {
    try {
      const airtable = await getWowproClient(company.airtable_record_id);
      credits = Number(airtable.fields.crediti_inclusi_residui || 0) + Number(airtable.fields.crediti_extra_residui || 0);
      plan = airtable.fields.piano ? `WOWPRO ${airtable.fields.piano}` : plan;
      manager = airtable.fields.account_manager_nome || '';
    } catch { /* The dashboard remains available when Airtable is unreachable. */ }
  }
  const firstName = (profile.full_name || company?.name || 'cliente').trim().split(/\s+/)[0];
  return <><PageHeader eyebrow={`WOWPRO · ${company?.name || 'Area cliente'}`} title="Dashboard" action={<div className="credit-chip"><i /> <strong>{number(credits)}</strong> crediti disponibili</div>} /><main className="page-content client-unified-dashboard">
    <section className="unified-hero"><div className="unified-hero__content"><div className="unified-hero__greeting"><span>👋</span><strong>Bentornata, <em>{firstName}</em></strong><small>{company?.name || 'Cliente WOWPRO'} · Piano {plan}</small></div><h2>Tutto quello che ti serve,<br /><em>in un solo posto.</em></h2><p>WOWPRO è il servizio dedicato di WowStampa: un account manager tutto tuo, prezzi riservati su tutto il catalogo, ordini in corsia preferenziale con spedizioni express e un team grafico con crediti inclusi ogni mese.</p><ul className="unified-hero__perks"><li><Palette size={14} /> Grafica inclusa</li><li><Headphones size={14} /> Account manager</li><li><BadgePercent size={14} /> Listino riservato</li><li><Printer size={14} /> Ordini prioritari</li><li><Truck size={14} /> Spedizioni express</li></ul><div className="unified-hero__actions"><Link className="button button--primary" href="/dashboard/richieste">Nuova richiesta grafica <ArrowRight size={18} /></Link><Link className="button button--ghost" href="/dashboard/preventivi">Chiedi un preventivo</Link></div>{manager ? <div className="unified-hero__manager"><span>{initials(manager)}</span><p>Il tuo account manager: <strong>{manager}</strong></p></div> : null}</div><div className="unified-hero__art" aria-hidden="true"><Image alt="" fill priority sizes="(max-width: 760px) 0px, 42vw" src="/images/wowpro-hero.png" /></div></section>
    <VideoIntro />
    <ProgramShowcase />
    <section className="unified-cta"><div><h2>Cosa possiamo fare per te oggi?</h2><p>Una grafica da preparare, un preventivo da chiedere o un ordine da seguire: il tuo team WOWPRO è qui.</p><div className="unified-cta__actions"><Link className="button button--primary" href="/dashboard/richieste">Nuova richiesta grafica <ArrowRight size={18} /></Link><Link className="button button--ghost" href="/dashboard/preventivi">Chiedi un preventivo</Link></div></div><div className="unified-cta__art" aria-hidden="true"><Image alt="" fill sizes="(max-width: 760px) 0px, 360px" src="/images/wowpro-user.webp" /><span>{initials(company?.name || 'WOWPRO')}</span></div></section>
  </main></>;
}

function initials(value: string) { return value.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(); }
function number(value: number) { return new Intl.NumberFormat('it-IT').format(value); }
