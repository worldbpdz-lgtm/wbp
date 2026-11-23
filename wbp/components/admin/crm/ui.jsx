// ============================================================================
// Petites briques d'affichage des écrans commandes / devis / clients.
// Sans état ni effet : utilisables dans un composant serveur comme client.
// ============================================================================
import React from 'react';
import Link from 'next/link';
import { Icon } from '@/components/primitives';
import { telOf, waLink } from '@/lib/phone';
import { orderStatus, quoteStatus, messageStatus } from '@/lib/crm';

export function StatusBadge({ kind = 'order', value, className = '' }) {
  const st = kind === 'order' ? orderStatus(value) : kind === 'quote' ? quoteStatus(value) : messageStatus(value);
  return <span className={`st ${st.tone} ${className}`} title={st.hint || ''}>{st.label}</span>;
}

export function ContactLinks({ phone, email, waText, subject }) {
  const tel = telOf(phone);
  const wa = waLink(phone, waText);
  if (!tel && !wa && !email) return null;
  return (
    <div className="crm-contact">
      {tel && <a className="call" href={`tel:${tel}`}><Icon name="phone" size={15} /> Appeler</a>}
      {wa && <a className="wa" href={wa} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={15} /> WhatsApp</a>}
      {email && (
        <a href={`mailto:${String(email).trim()}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`}>
          <Icon name="mail" size={15} /> E-mail
        </a>
      )}
    </div>
  );
}

const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function Who({ email, team = [], empty = '—' }) {
  if (!email) return <span className="muted">{empty}</span>;
  const name = (team.find((t) => t.email === String(email).toLowerCase()) || {}).name || String(email).split('@')[0];
  return <span className="crm-who"><i>{initials(name)}</i>{name}</span>;
}

export function MigrationBanner() {
  return (
    <div className="crm-migrate" role="alert">
      <Icon name="alert" size={20} />
      <div>
        <b>Une étape à faire une seule fois.</b> La base de données n’a pas encore les tables des commandes, des
        fiches clients et des notifications. Ouvrez <b>Supabase → SQL Editor → New query</b>, collez le fichier{' '}
        <code>supabase/commandes-notifications.sql</code> du projet, puis cliquez <b>Run</b> (ou double-cliquez{' '}
        <code>apply-commandes.bat</code>). Rien n’est supprimé : vos devis et messages restent intacts.
      </div>
    </div>
  );
}

export function Chip({ href, on, hot, children }) {
  return <Link href={href} className={`crm-chip${on ? ' on' : ''}${hot ? ' hot' : ''}`}>{children}</Link>;
}
