# Grainehotèque

Petit site statique pour consulter et suivre une collection personnelle de graines.

## Structure

- `index.html` : page principale du site
- `assets/css/style.css` : styles du site
- `assets/js/app.js` : logique JavaScript de filtrage, affichage, journal partagé et photos
- `data/seeds.json` : données des graines
- `data/journal.json` : journal de suivi partagé (observations datées)
- `assets/img/seeds/` : photos des graines
- `assets/img/journal/` : photos jointes aux observations

## Utilisation

Lance un petit serveur local :

```bash
python -m http.server 8000
```

Puis ouvre : http://localhost:8000

## Objectif

- voir les graines disponibles
- filtrer par catégorie et statut
- lire rapidement les infos importantes pour le semis
- tenir un journal de suivi partagé, avec plusieurs observations datées par graine

## Mode jardinier (journal partagé et photos)

Le site est statique (GitHub Pages) : il n’a pas de base de données. Les observations et les photos
sont donc enregistrées **directement dans ce dépôt GitHub**, ce qui les rend visibles par tous les
visiteurs du site (environ une minute après l’enregistrement, le temps que GitHub Pages se mette à jour).

Pour écrire, il faut passer en **mode jardinier** (bouton en haut de page) avec un jeton GitHub :

1. Ouvrir https://github.com/settings/personal-access-tokens/new (avec un compte qui a accès au dépôt).
2. *Repository access* : **Only select repositories** → `Grainehot-que`.
3. *Permissions* → *Repository permissions* → **Contents : Read and write**.
4. Choisir une date d’expiration, générer le jeton et le coller dans le site.

Le jeton est gardé uniquement dans le navigateur de l’appareil utilisé. Pour une autre personne,
le plus propre est de l’ajouter comme collaboratrice ou collaborateur du dépôt pour qu’elle crée son propre jeton.

En mode jardinier, chaque fiche permet :

- d’ajouter une observation (date, statut, texte, photo facultative) ;
- de supprimer une observation ;
- d’ajouter ou de changer la photo de la graine.

Le statut affiché d’une graine est celui de son observation la plus récente
(à défaut, le champ `status` de `seeds.json`).

## Ajouter une photo à la main

Déposer l’image dans `assets/img/seeds/`, puis ajouter le champ `photo` à la graine dans `data/seeds.json` :

```json
"photo": "assets/img/seeds/figue-2026-cheylard.jpg",
```

Sans photo, la carte garde son affichage habituel.

## Notes

Le projet reste un site statique, sans backend : GitHub sert à la fois d’hébergement et de stockage.
