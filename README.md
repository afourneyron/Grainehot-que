# Grainehotèque

Petit site statique pour consulter et suivre une collection personnelle de graines.

## Structure

- `index.html` : page principale du site
- `assets/css/style.css` : styles du site
- `assets/js/app.js` : logique JavaScript de filtrage, affichage et journal local
- `data/seeds.json` : données des graines

## Utilisation

Ouvre simplement le fichier `index.html` dans un navigateur ou lance un petit serveur local :

```bash
python -m http.server 8000
```

Puis ouvre : http://localhost:8000

## Objectif

- voir les graines disponibles
- filtrer par catégorie et statut
- lire rapidement les infos importantes pour le semis
- garder un petit journal de suivi local dans le navigateur

## Notes

Le projet est pensé pour un usage personnel et statique, sans base de données ni backend.
