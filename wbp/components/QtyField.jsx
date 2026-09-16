'use client';
import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/primitives';

// ============================================================================
// Sélecteur de quantité — « − [ 12 ] + », avec un champ où l'on TAPE le nombre.
// ----------------------------------------------------------------------------
// Utilisé à deux endroits, avec la même mécanique : la fiche produit
// (classe « pp-qty ») et le panier (classe « qty »).
//
// Pourquoi un champ de saisie et pas seulement + / − : un client qui commande
// 250 cartons ne va pas appuyer 250 fois. Les boutons restent, pour ajuster de
// un ; le champ sert aux vraies quantités d'un grossiste.
//
// Choix de mise en œuvre, dans l'ordre d'importance :
//
//  • type="text" + inputMode="numeric" plutôt que type="number". Sur iPhone,
//    type="number" affiche un clavier avec des lettres minuscules et laisse
//    passer « e », « + » et « - » (c'est un nombre au sens HTML, pas un
//    entier) ; il réagit aussi à la molette de la souris, ce qui change la
//    quantité par accident en faisant défiler la page. inputMode="numeric"
//    donne le pavé de chiffres sans aucun de ces défauts.
//
//  • On laisse le champ VIDE pendant la frappe. Remettre « 1 » de force dès que
//    la personne efface l'empêche de taper « 12 » : elle efface le 1, le 1
//    revient, elle obtient « 112 ». Le champ n'est remis en ordre qu'à la
//    sortie (blur) ou sur Entrée.
//
//  • Tout est sélectionné à la mise au point : sur un téléphone, on tape dans
//    le champ et on écrit le nombre voulu — sans avoir à effacer d'abord.
//
//  • Un maximum (9 999 par défaut) : au-delà c'est une faute de frappe, et le
//    nombre déborderait de la pastille.
// ============================================================================

const MAX = 9999;

// « 12ab » → 12 · « » → null · « 007 » → 7
function parseQty(raw) {
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  return Math.min(Number(digits), MAX);
}

export default function QtyField({
  value,
  onChange,
  min = 1,
  max = MAX,
  className = 'qty',
  size = 14,
  label = 'Quantité',
}) {
  // Texte affiché pendant la frappe — volontairement distinct de `value`, qui
  // reste la quantité réelle (un panier ne doit jamais valoir « vide »).
  const [draft, setDraft] = useState(String(value));

  // Le parent peut changer la quantité sans passer par le champ (boutons + / −,
  // ou une autre partie de l'app) : on resynchronise, sauf pendant la frappe.
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = (raw) => {
    const n = parseQty(raw);
    // Champ laissé vide : on revient à la quantité d'avant, sans rien changer.
    if (n === null) { setDraft(String(value)); return; }
    const clamped = Math.min(Math.max(n, min), max);
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        aria-label="Diminuer la quantité"
      >
        <Icon name="minus" size={size} />
      </button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        aria-label={label}
        value={draft}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d]/g, '').slice(0, 5);
          setDraft(cleaned);
          // Mise à jour immédiate dès que la valeur est utilisable, pour que le
          // panier suive la frappe. Deux exceptions, qui attendent la sortie du
          // champ : le vide, et le zéro — dans le panier, zéro veut dire
          // « retirer la ligne », et l'appliquer à la première touche
          // supprimerait le produit de quelqu'un en train de taper « 05 ».
          const n = parseQty(cleaned);
          if (n !== null && n >= 1 && n <= max && n !== value) onChange(n);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(e.currentTarget.value); e.currentTarget.blur(); }
        }}
      />

      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Augmenter la quantité"
      >
        <Icon name="plus" size={size} />
      </button>
    </div>
  );
}
