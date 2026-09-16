'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSetting, addClient, deleteClient } from '@/app/admin/actions';
import { Icon } from '@/components/mobile/ui';
import {
  Banner, Btn, Confirm, Group, NumberInput, SaveBar, SubTop, Switch, TextInput, useToast,
} from '@/components/mobile/form';
import { LogoPicker } from '@/components/mobile/BrandsScreen';
import '@/styles/mobile-reglages.css';

// ============================================================================
// Réglages du site public, version téléphone.
// ----------------------------------------------------------------------------
// Exactement les quatre réglages de /admin/settings, sous les mêmes clés :
// `whatsapp`, `contact`, `hero`, `popup` — plus la liste des clients de
// référence, qui vit dans sa propre table.
//
// UNE seule barre d'enregistrement pour tout l'écran, alors que la version
// ordinateur a un bouton par bloc. C'est le bon choix au pouce (le bouton d'un
// bloc replié est à deux écrans de défilement du champ qu'on vient de corriger),
// mais cela demande une précaution : `saveSetting(key, value)` n'écrit qu'UNE
// clé à la fois. Envoyer les quatre à chaque enregistrement, c'est quatre
// allers-retours sur un réseau 3G pour un numéro de téléphone corrigé. On ne
// renvoie donc que les clés dont la valeur a RÉELLEMENT changé, comparées à la
// dernière version connue du serveur (`snap`).
//
// Si une écriture échoue au milieu du lot : les clés déjà écrites sont
// considérées comme enregistrées (leur photo dans `snap` est mise à jour), les
// autres restent « à enregistrer ». La barre d'enregistrement reste donc
// visible, aucune saisie n'est perdue, et le bandeau rouge nomme les blocs qui
// n'ont pas pu partir. Réappuyer sur « Enregistrer » ne réécrit que ceux-là.
// ============================================================================

const lineList = (v) => (Array.isArray(v) ? v.join('\n') : String(v || ''));
const toLines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 4);

// Intitulés des blocs, pour pouvoir dire lequel n'a pas pu être enregistré.
const LABELS = {
  whatsapp: 'WhatsApp',
  contact: 'Contact',
  hero: 'Bandeau d’accueil',
  popup: 'Pop-up newsletter',
};

// Chaque clé de réglage lit une partie de l'état du formulaire.
const SLICE = { whatsapp: 'wa', contact: 'c', hero: 'hero', popup: 'pop' };

// ----------------------------------------------------------------------------
// Passage de l'état du formulaire à la valeur écrite en base. Ces fonctions
// servent DEUX fois : pour l'enregistrement, et pour comparer l'état courant à
// la dernière version connue du serveur. Comparer les valeurs construites (et
// non les champs du formulaire) évite les faux « modifié » : « 2,2 s » relu
// depuis 2200 ms redonne exactement 2200 ms.
// ----------------------------------------------------------------------------
const BUILD = {
  whatsapp: (s) => s.wa.trim(),
  contact: (s) => ({
    email: s.c.email.trim(),
    fax: s.c.fax.trim(),
    phones: s.c.phones.split(',').map((x) => x.trim()).filter(Boolean),
    address: { fr: s.c.addr_fr, en: s.c.addr_en, ar: s.c.addr_ar },
  }),
  hero: (s) => ({
    fr: { title: s.hero.fr_t, sub: s.hero.fr_s },
    en: { title: s.hero.en_t, sub: s.hero.en_s },
    ar: { title: s.hero.ar_t, sub: s.hero.ar_s },
  }),
  popup: (s) => ({
    enabled: !!s.pop.enabled,
    // Le formulaire parle en secondes, la base en millisecondes.
    delay: Math.max(300, Math.round(Number(s.pop.delay) * 1000) || 2200),
    days: Math.max(0, parseInt(s.pop.days, 10) || 0),
    image_url: s.pop.image_url || null,
    title: { fr: s.pop.title_fr, en: s.pop.title_en, ar: s.pop.title_ar },
    sub: { fr: s.pop.sub_fr, en: s.pop.sub_en, ar: s.pop.sub_ar },
    cta: { fr: s.pop.cta_fr, en: s.pop.cta_en, ar: s.pop.cta_ar },
    perks: { fr: toLines(s.pop.perks_fr), en: toLines(s.pop.perks_en), ar: toLines(s.pop.perks_ar) },
  }),
};

const KEYS = ['whatsapp', 'contact', 'hero', 'popup'];

export default function SettingsScreen({ settings, clients = [] }) {
  const router = useRouter();
  const toast = useToast();

  const P = settings.popup || {};
  const init = {
    wa: settings.whatsapp || '',
    c: {
      email: settings.contact?.email || '',
      fax: settings.contact?.fax || '',
      phones: (settings.contact?.phones || []).join(', '),
      addr_fr: settings.contact?.address?.fr || '',
      addr_en: settings.contact?.address?.en || '',
      addr_ar: settings.contact?.address?.ar || '',
    },
    hero: {
      fr_t: settings.hero?.fr?.title || '', fr_s: settings.hero?.fr?.sub || '',
      en_t: settings.hero?.en?.title || '', en_s: settings.hero?.en?.sub || '',
      ar_t: settings.hero?.ar?.title || '', ar_s: settings.hero?.ar?.sub || '',
    },
    pop: {
      enabled: P.enabled !== false,
      delay: Math.round((Number(P.delay) || 2200) / 100) / 10,   // en secondes
      days: Number(P.days ?? 7),
      image_url: P.image_url || '',
      title_fr: P.title?.fr || '', title_en: P.title?.en || '', title_ar: P.title?.ar || '',
      sub_fr: P.sub?.fr || '', sub_en: P.sub?.en || '', sub_ar: P.sub?.ar || '',
      cta_fr: P.cta?.fr || '', cta_en: P.cta?.en || '', cta_ar: P.cta?.ar || '',
      perks_fr: lineList(P.perks?.fr), perks_en: lineList(P.perks?.en), perks_ar: lineList(P.perks?.ar),
    },
  };

  const [wa, setWa] = useState(init.wa);
  const [c, setC] = useState(init.c);
  const [hero, setHero] = useState(init.hero);
  const [pop, setPop] = useState(init.pop);
  // Dernière version connue du serveur. Elle n'avance que pour les clés
  // réellement écrites, d'où la reprise propre après un échec partiel.
  const [snap, setSnap] = useState(init);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [moreHero, setMoreHero] = useState(false);
  const [morePop, setMorePop] = useState(false);

  const [newClient, setNewClient] = useState('');
  const [clientBusy, setClientBusy] = useState(false);
  const [delClient, setDelClient] = useState(null);

  const setC1 = (k) => (v) => setC((p) => ({ ...p, [k]: v }));
  const setH1 = (k) => (v) => setHero((p) => ({ ...p, [k]: v }));
  const setP1 = (k) => (v) => setPop((p) => ({ ...p, [k]: v }));

  const state = { wa, c, hero, pop };
  const changed = KEYS.filter((k) => JSON.stringify(BUILD[k](state)) !== JSON.stringify(BUILD[k](snap)));

  const save = async () => {
    setErr('');
    setBusy(true);
    const done = [];
    const failed = [];
    for (const k of changed) {
      try {
        const res = await saveSetting(k, BUILD[k](state));
        if (res?.ok) done.push(k);
        else failed.push(`${LABELS[k]} (${res?.error || 'refusé par le serveur'})`);
      } catch (e) {
        failed.push(`${LABELS[k]} (${e?.message || 'pas de réseau'})`);
      }
    }
    // Les clés écrites deviennent la nouvelle référence ; les autres restent
    // « à enregistrer » et la barre du bas ne disparaît pas.
    if (done.length) {
      setSnap((s) => {
        const next = { ...s };
        for (const k of done) next[SLICE[k]] = state[SLICE[k]];
        return next;
      });
    }
    setBusy(false);

    if (failed.length) {
      setErr(`${done.length ? 'Une partie seulement a été enregistrée. ' : ''}`
        + `Non enregistré : ${failed.join(' · ')}. Vos saisies sont conservées — réappuyez sur « Enregistrer ».`);
      toast('Enregistrement incomplet', 'bad');
    } else {
      toast('Réglages enregistrés');
    }
    if (done.length) router.refresh();
  };

  const cancel = () => {
    setErr('');
    setWa(snap.wa); setC(snap.c); setHero(snap.hero); setPop(snap.pop);
  };

  // Clients de référence : ajout et suppression partent tout de suite, hors de
  // la barre d'enregistrement. Ce ne sont pas des réglages mais des lignes
  // d'une table, et `addClient` / `deleteClient` écrivent chacune une ligne.
  const add = async () => {
    const nm = newClient.trim();
    if (!nm) return;
    setErr(''); setClientBusy(true);
    try {
      const res = await addClient(nm);
      if (!res?.ok) { setErr(res?.error || 'Ajout impossible.'); toast('Ajout impossible', 'bad'); return; }
      setNewClient('');
      toast('Client ajouté');
      router.refresh();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau.');
      toast('Pas de réseau', 'bad');
    } finally {
      setClientBusy(false);
    }
  };

  const removeClient = async () => {
    setClientBusy(true);
    try {
      const res = await deleteClient(delClient.id);
      if (!res?.ok) { setErr(res?.error || 'Suppression impossible.'); toast('Suppression impossible', 'bad'); return; }
      toast('Client retiré');
      router.refresh();
    } catch (e) {
      setErr(e?.message || 'Pas de réseau.');
      toast('Pas de réseau', 'bad');
    } finally {
      setClientBusy(false);
      setDelClient(null);
    }
  };

  return (
    <>
      <SubTop
        title="Réglages du site"
        subtitle="Ce que voient les visiteurs"
        back="/mobile/plus"
      />

      <div className="mb-wrap">
        {err && <Banner kind="bad" onClose={() => setErr('')}>{err}</Banner>}

        {/* ------------------------------------------- WhatsApp & contact -- */}
        <Group title="WhatsApp & contact" note="Ces informations s’affichent dans le pied de page et sur la page Contact du site.">
          <TextInput
            label="Numéro WhatsApp"
            hint="Format international, sans le +. Exemple : 213559533698."
            value={wa}
            onChange={setWa}
            inputMode="numeric"
            autoComplete="off"
          />
          <TextInput
            label="E-mail"
            value={c.email}
            onChange={setC1('email')}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
          />
          <TextInput
            label="Téléphones"
            hint="Séparés par des virgules."
            value={c.phones}
            onChange={setC1('phones')}
            autoComplete="off"
          />
          <TextInput label="Ligne fax / téléphone" value={c.fax} onChange={setC1('fax')} autoComplete="off" />
          <TextInput label="Adresse (français)" value={c.addr_fr} onChange={setC1('addr_fr')} multiline rows={2} />
          <TextInput label="Adresse (anglais)" value={c.addr_en} onChange={setC1('addr_en')} multiline rows={2} />
          <TextInput label="Adresse (arabe)" value={c.addr_ar} onChange={setC1('addr_ar')} multiline rows={2} dir="rtl" />
        </Group>

        {/* --------------------------------------------- bandeau d'accueil -- */}
        <Group title="Bandeau d’accueil" note="Le grand titre en haut de la page d’accueil. Laissez vide pour garder le texte par défaut du site.">
          <TextInput label="Titre (français)" value={hero.fr_t} onChange={setH1('fr_t')} />
          <TextInput label="Sous-titre (français)" value={hero.fr_s} onChange={setH1('fr_s')} multiline rows={2} />
          <Btn icon={moreHero ? 'chevdown' : 'chevright'} onClick={() => setMoreHero((v) => !v)}>
            {moreHero ? 'Masquer les traductions' : 'Traductions (anglais, arabe)'}
          </Btn>
          {moreHero && (
            <>
              <TextInput label="Titre (anglais)" value={hero.en_t} onChange={setH1('en_t')} />
              <TextInput label="Sous-titre (anglais)" value={hero.en_s} onChange={setH1('en_s')} multiline rows={2} />
              <TextInput label="Titre (arabe)" value={hero.ar_t} onChange={setH1('ar_t')} dir="rtl" />
              <TextInput label="Sous-titre (arabe)" value={hero.ar_s} onChange={setH1('ar_s')} multiline rows={2} dir="rtl" />
            </>
          )}
        </Group>

        {/* ------------------------------------------- pop-up newsletter -- */}
        <Group
          title="Pop-up newsletter"
          note="La carte s’affiche une seule fois par visiteur, puis se tait pendant le nombre de jours indiqué. Elle ne réapparaît jamais pour quelqu’un qui s’est inscrit."
        >
          <Switch
            checked={pop.enabled}
            onChange={setP1('enabled')}
            title="Afficher le pop-up"
            note="Désactivez-le sans perdre vos textes."
          />
          <NumberInput
            label="Délai avant affichage (secondes)"
            value={pop.delay}
            onChange={setP1('delay')}
            decimal
          />
          <NumberInput
            label="Ne pas réafficher pendant (jours)"
            value={pop.days}
            onChange={setP1('days')}
          />
          <TextInput label="Titre (français)" value={pop.title_fr} onChange={setP1('title_fr')} placeholder="Rejoignez la newsletter WBP" />
          <TextInput label="Texte (français)" value={pop.sub_fr} onChange={setP1('sub_fr')} multiline rows={3} />
          <TextInput label="Bouton (français)" value={pop.cta_fr} onChange={setP1('cta_fr')} placeholder="Je m’inscris" />
          <TextInput
            label="Avantages (français)"
            hint="Un par ligne, trois au maximum."
            value={pop.perks_fr}
            onChange={setP1('perks_fr')}
            multiline
            rows={3}
          />
          <LogoPicker
            value={pop.image_url}
            onChange={(url) => setP1('image_url')(url)}
            folder="popup"
            name="popup-newsletter"
            label="Visuel du pop-up"
            hint="Optionnel — sans image, le site affiche un dégradé avec le logo."
          />
          <Btn icon={morePop ? 'chevdown' : 'chevright'} onClick={() => setMorePop((v) => !v)}>
            {morePop ? 'Masquer les traductions' : 'Traductions (anglais, arabe)'}
          </Btn>
          {morePop && (
            <>
              <TextInput label="Titre (anglais)" value={pop.title_en} onChange={setP1('title_en')} />
              <TextInput label="Texte (anglais)" value={pop.sub_en} onChange={setP1('sub_en')} multiline rows={3} />
              <TextInput label="Bouton (anglais)" value={pop.cta_en} onChange={setP1('cta_en')} />
              <TextInput label="Avantages (anglais)" value={pop.perks_en} onChange={setP1('perks_en')} multiline rows={3} />
              <TextInput label="Titre (arabe)" value={pop.title_ar} onChange={setP1('title_ar')} dir="rtl" />
              <TextInput label="Texte (arabe)" value={pop.sub_ar} onChange={setP1('sub_ar')} multiline rows={3} dir="rtl" />
              <TextInput label="Bouton (arabe)" value={pop.cta_ar} onChange={setP1('cta_ar')} dir="rtl" />
              <TextInput label="Avantages (arabe)" value={pop.perks_ar} onChange={setP1('perks_ar')} multiline rows={3} dir="rtl" />
            </>
          )}
        </Group>

        {/* ------------------------------------------ clients de référence -- */}
        <Group
          title={`Clients / références (${clients.length})`}
          note="Les noms affichés dans le bandeau « Ils nous font confiance ». Ajout et retrait sont immédiats, sans passer par la barre d’enregistrement."
        >
          <div className="mbr-add">
            <TextInput
              label="Ajouter un client"
              value={newClient}
              onChange={setNewClient}
              placeholder="Nom du client"
              autoComplete="off"
            />
            <Btn variant="primary" icon="plus" disabled={clientBusy || !newClient.trim()} onClick={add} aria-label="Ajouter ce client">
              {clientBusy ? '…' : 'Ajouter'}
            </Btn>
          </div>

          {clients.length === 0 ? (
            <p className="mbf-hint">Aucun client de référence pour l’instant.</p>
          ) : (
            <div className="mbr-tags">
              {clients.map((cl) => (
                <span className="mbr-tag" key={cl.id}>
                  {cl.name}
                  <button
                    type="button"
                    aria-label={`Retirer ${cl.name}`}
                    disabled={clientBusy}
                    onClick={() => setDelClient(cl)}
                  >
                    <Icon name="close" size={17} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Group>

        <div className="mbf-pad" />
      </div>

      <SaveBar
        dirty={changed.length > 0}
        busy={busy}
        onSave={save}
        onCancel={cancel}
        saveLabel={changed.length > 1 ? `Enregistrer (${changed.length} blocs)` : 'Enregistrer'}
      />

      <Confirm
        open={!!delClient}
        onClose={() => setDelClient(null)}
        onConfirm={removeClient}
        busy={clientBusy}
        title="Retirer ce client ?"
        body={`« ${delClient?.name} » disparaîtra du bandeau de références du site.`}
        confirmLabel="Retirer"
        danger
      />
    </>
  );
}
