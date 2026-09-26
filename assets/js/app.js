const GITHUB_REPO = {
  owner: 'afourneyron',
  name: 'Grainehot-que',
  branch: 'main',
};
const SEEDS_PATH = 'data/seeds.json';
const JOURNAL_PATH = 'data/journal.json';
const AUTH_STORAGE_KEY = 'grainehotheque-jardinier';
const LEGACY_STORAGE_KEY = 'grainehotheque-journal-v1';
const PHOTO_MAX_SIZE = 1600;
const PHOTO_QUALITY = 0.82;
const STATUSES = [
  { value: 'à semer', label: 'À semer' },
  { value: 'semé', label: 'Semé' },
  { value: 'en cours', label: 'En cours' },
  { value: 'récolté', label: 'Récolté' },
];

const state = {
  seeds: [],
  journal: [],
  filters: {
    search: '',
    category: 'all',
    status: 'all',
  },
  selectedId: null,
  auth: loadAuth(),
  localPhotos: {},
};

const element = {
  seedGrid: document.getElementById('seedGrid'),
  resultsSummary: document.getElementById('resultsSummary'),
  searchInput: document.getElementById('searchInput'),
  categoryFilter: document.getElementById('categoryFilter'),
  statusFilter: document.getElementById('statusFilter'),
  detailPanel: document.getElementById('detailPanel'),
  detailContent: document.getElementById('detailContent'),
  closeDetail: document.getElementById('closeDetail'),
  resetFilters: document.getElementById('resetFilters'),
  journalList: document.getElementById('journalList'),
  statTotal: document.getElementById('statTotal'),
  statLegumes: document.getElementById('statLegumes'),
  statFruits: document.getElementById('statFruits'),
  statAromates: document.getElementById('statAromates'),
  gardenerButton: document.getElementById('gardenerButton'),
  gardenerDialog: document.getElementById('gardenerDialog'),
  gardenerContent: document.getElementById('gardenerContent'),
  toast: document.getElementById('toast'),
};

/* ---------- Stockage local (préférences de l'appareil uniquement) ---------- */

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn(error);
  }
}

function loadAuth() {
  const auth = readStorage(AUTH_STORAGE_KEY);
  return auth && auth.token ? auth : null;
}

/* ---------- Utilitaires ---------- */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatNote(note) {
  return escapeHtml(note).replace(/\n/g, '<br>');
}

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function slugifyStatus(status) {
  return (status || 'a-semer')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'a-semer';
}

function normalizeValue(value) {
  return (value || '').toString().trim().toLowerCase();
}

function showToast(message, type = 'success') {
  element.toast.textContent = message;
  element.toast.className = `toast ${type}`;
  element.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    element.toast.hidden = true;
  }, 6000);
}

function describeError(error) {
  if (error instanceof TypeError) {
    return 'Impossible de joindre GitHub. Vérifie ta connexion internet.';
  }
  if (error.status === 401) {
    return 'Le jeton GitHub n’est plus valide. Reconnecte-toi en mode jardinier.';
  }
  if (error.status === 403 || error.status === 404) {
    return 'Le jeton n’a pas le droit d’écrire dans le dépôt (permission « Contents : Read and write »).';
  }
  return `Enregistrement impossible : ${error.message}`;
}

/* ---------- Photos ---------- */

function photoUrl(path) {
  return state.localPhotos[path] || `./${path}`;
}

function rawPhotoUrl(path) {
  return `https://raw.githubusercontent.com/${GITHUB_REPO.owner}/${GITHUB_REPO.name}/${GITHUB_REPO.branch}/${path}`;
}

function renderPhoto(path, className, alt = '') {
  return `<img class="${className}" src="${escapeHtml(photoUrl(path))}" data-path="${escapeHtml(path)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cette image ne peut pas être lue.'));
    };
    image.src = url;
  });
}

// Réduit la photo avant l'envoi pour garder un dépôt léger et un site rapide.
async function resizePhoto(file) {
  const { image, url } = await loadImage(file);
  const scale = Math.min(1, PHOTO_MAX_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('conversion de la photo impossible.'))),
      'image/jpeg',
      PHOTO_QUALITY,
    );
  });
}

async function uploadPhoto(file, folder, baseName, message) {
  const blob = await resizePhoto(file);
  const path = `assets/img/${folder}/${baseName}-${Date.now().toString(36)}.jpg`;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await writeRepoFile(path, bytesToBase64(bytes), message);
  state.localPhotos[path] = URL.createObjectURL(blob);
  return path;
}

/* ---------- GitHub ---------- */

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToText(base64) {
  const binary = atob(base64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function contentsPath(path) {
  return `/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function githubRequest(path, { method = 'GET', body, token = state.auth?.token } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.name}${path}`,
    { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' },
  );

  if (!response.ok) {
    const error = new Error(`GitHub a répondu ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function readRepoFile(path) {
  try {
    const file = await githubRequest(`${contentsPath(path)}?ref=${GITHUB_REPO.branch}`);
    return { sha: file.sha, content: file.content };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function writeRepoFile(path, base64, message, sha) {
  return githubRequest(contentsPath(path), {
    method: 'PUT',
    body: { message, content: base64, branch: GITHUB_REPO.branch, ...(sha ? { sha } : {}) },
  });
}

async function deleteRepoFile(path, message) {
  const file = await readRepoFile(path);
  if (!file) return;
  await githubRequest(contentsPath(path), {
    method: 'DELETE',
    body: { message, sha: file.sha, branch: GITHUB_REPO.branch },
  });
}

// Relit le fichier juste avant d'écrire : si quelqu'un d'autre a enregistré entre-temps,
// GitHub refuse l'écriture et on recommence à partir de la version à jour.
async function updateRepoTextFile(path, transform, message) {
  for (let attempt = 1; ; attempt += 1) {
    const file = await readRepoFile(path);
    const text = transform(file ? base64ToText(file.content) : null);
    try {
      await writeRepoFile(path, textToBase64(text), message, file?.sha);
      return text;
    } catch (error) {
      if (attempt >= 3 || ![409, 422].includes(error.status)) throw error;
    }
  }
}

/* ---------- Données ---------- */

async function fetchSiteText(path) {
  const response = await fetch(`./${path}?v=${Date.now()}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Impossible de charger ${path}`);
  return response.text();
}

// En mode jardinier on lit directement le dépôt, pour voir tout de suite ses derniers ajouts
// (le site publié par GitHub Pages met environ une minute à se mettre à jour).
async function loadDataFile(path) {
  if (state.auth) {
    try {
      const file = await readRepoFile(path);
      if (file) return base64ToText(file.content);
    } catch (error) {
      console.warn(error);
    }
  }
  return fetchSiteText(path);
}

function parseJournal(text) {
  if (!text) return [];
  const data = JSON.parse(text);
  return Array.isArray(data.entries) ? data.entries : [];
}

function serializeJournal(entries) {
  return `${JSON.stringify({ entries }, null, 2)}\n`;
}

function sortEntries(entries) {
  return entries
    .slice()
    .sort((a, b) =>
      (b.date || '').localeCompare(a.date || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || ''));
}

function getSeedEntries(seedId) {
  return sortEntries(state.journal.filter((entry) => entry.seedId === seedId));
}

function getCurrentStatus(seed) {
  const latest = getSeedEntries(seed.id).find((entry) => entry.status);
  return latest ? latest.status : seed.status;
}

// Ajoute ou remplace le champ "photo" d'une graine sans reformater le reste du fichier.
function setSeedPhotoInSource(text, seedId, photoPath) {
  const seeds = JSON.parse(text);
  const seed = seeds.find((item) => item.id === seedId);
  if (!seed) throw new Error('graine introuvable dans seeds.json.');

  const newLine = `"photo": ${JSON.stringify(photoPath)}`;
  let updated = null;

  if (seed.photo) {
    const currentLine = `"photo": ${JSON.stringify(seed.photo)}`;
    if (text.split(currentLine).length === 2) {
      updated = text.replace(currentLine, () => newLine);
    }
  } else {
    const idLine = new RegExp(`\\n([ \\t]*)"id": ${escapeRegExp(JSON.stringify(seedId))},`);
    updated = text.replace(idLine, (match, indent) => `${match}\n${indent}${newLine},`);
  }

  try {
    if (updated && JSON.parse(updated).find((item) => item.id === seedId)?.photo === photoPath) {
      return updated;
    }
  } catch (error) {
    console.warn(error);
  }

  seed.photo = photoPath;
  return `${JSON.stringify(seeds, null, 2)}\n`;
}

async function loadData() {
  const [seedsText, journalText] = await Promise.all([
    loadDataFile(SEEDS_PATH),
    loadDataFile(JOURNAL_PATH).catch((error) => {
      console.warn(error);
      return null;
    }),
  ]);

  if (!seedsText) {
    throw new Error('Impossible de charger les graines.');
  }

  state.seeds = JSON.parse(seedsText);
  try {
    state.journal = parseJournal(journalText);
  } catch (error) {
    console.warn('Journal illisible', error);
    state.journal = [];
  }
}

/* ---------- Affichage ---------- */

function renderList(items, title) {
  if (!Array.isArray(items) || !items.length) {
    return '';
  }

  const listItems = items
    .map((item) => `<li>${item}</li>`)
    .join('');

  return `
    <div class="detail-section">
      <h3>${title}</h3>
      <ul class="info-list">${listItems}</ul>
    </div>
  `;
}

function renderStats() {
  const total = state.seeds.length;
  const legumes = state.seeds.filter((seed) => seed.category === 'legume').length;
  const fruits = state.seeds.filter((seed) => seed.category === 'fruit').length;
  const aromates = state.seeds.filter((seed) => seed.category === 'aromate').length;

  element.statTotal.textContent = total;
  element.statLegumes.textContent = legumes;
  element.statFruits.textContent = fruits;
  element.statAromates.textContent = aromates;
}

function getFilteredSeeds() {
  const searchTerm = normalizeValue(state.filters.search);

  return state.seeds.filter((seed) => {
    const matchesSearch =
      !searchTerm ||
      normalizeValue(seed.name).includes(searchTerm) ||
      normalizeValue(seed.origin).includes(searchTerm) ||
      normalizeValue(seed.source).includes(searchTerm) ||
      normalizeValue(seed.description).includes(searchTerm);

    const matchesCategory =
      state.filters.category === 'all' || seed.category === state.filters.category;

    const matchesStatus =
      state.filters.status === 'all' || getCurrentStatus(seed) === state.filters.status;

    return matchesSearch && matchesCategory && matchesStatus;
  });
}

function renderSeedCard(seed) {
  const currentStatus = getCurrentStatus(seed);
  const statusClass = slugifyStatus(currentStatus);

  const card = document.createElement('article');
  card.className = `seed-card${seed.photo ? ' has-photo' : ''}`;
  card.dataset.id = seed.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Voir la fiche de ${seed.name}`);

  card.innerHTML = `
    ${seed.photo ? renderPhoto(seed.photo, 'seed-card-photo') : ''}
    <div class="seed-meta">
      <span class="chip">${seed.category}</span>
      <span class="chip">${seed.year}</span>
    </div>
    <h3>${seed.name}</h3>
    <p>${seed.origin}</p>
    <div class="seed-meta">
      <span class="chip">${seed.source}</span>
    </div>
    <div class="seed-card-footer">
      <span>${seed.sowingPeriod}</span>
      <span class="status-pill ${statusClass}">${currentStatus}</span>
    </div>
  `;

  card.addEventListener('click', () => {
    openDetail(seed.id);
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail(seed.id);
    }
  });

  return card;
}

function renderCatalog() {
  const filteredSeeds = getFilteredSeeds();

  if (filteredSeeds.length) {
    element.resultsSummary.textContent = `${filteredSeeds.length} graine${filteredSeeds.length > 1 ? 's' : ''} affichée${filteredSeeds.length > 1 ? 's' : ''}`;
  } else {
    element.resultsSummary.textContent = 'Aucune graine ne correspond aux filtres.';
  }

  if (!filteredSeeds.length) {
    element.seedGrid.innerHTML = `
      <div class="empty-state">
        Aucune graine ne correspond à ta recherche pour le moment.
      </div>
    `;
    return;
  }

  element.seedGrid.innerHTML = '';
  filteredSeeds
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((seed) => {
      element.seedGrid.appendChild(renderSeedCard(seed));
    });
}

function renderStatusOptions(selectedStatus) {
  return STATUSES
    .map(({ value, label }) => `<option value="${value}" ${value === selectedStatus ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function renderTimeline(seed) {
  const entries = getSeedEntries(seed.id);

  if (!entries.length) {
    return '<p class="timeline-empty">Pas encore d’observation pour cette graine.</p>';
  }

  const items = entries
    .map((entry) => `
      <li class="timeline-item">
        <div class="timeline-topline">
          <strong>${formatDate(entry.date)}</strong>
          <span class="status-pill ${slugifyStatus(entry.status)}">${escapeHtml(entry.status)}</span>
        </div>
        ${entry.author ? `<p class="timeline-author">par ${escapeHtml(entry.author)}</p>` : ''}
        ${entry.note ? `<p>${formatNote(entry.note)}</p>` : ''}
        ${entry.photo ? `
          <a href="${escapeHtml(photoUrl(entry.photo))}" target="_blank" rel="noopener">
            ${renderPhoto(entry.photo, 'timeline-photo', `Photo du ${formatDate(entry.date)}`)}
          </a>
        ` : ''}
        ${state.auth ? `
          <button type="button" class="link-button danger" data-delete-entry="${escapeHtml(entry.id)}">Supprimer</button>
        ` : ''}
      </li>
    `)
    .join('');

  return `<ol class="timeline">${items}</ol>`;
}

function renderJournalForm(currentStatus) {
  if (!state.auth) {
    return `
      <div class="gardener-hint">
        <p>Les observations et les photos s’ajoutent en mode jardinier.</p>
        <button type="button" class="button secondary small" data-open-gardener>🔑 Mode jardinier</button>
      </div>
    `;
  }

  const today = todayIso();
  return `
    <form class="journal-form" id="seedJournalForm">
      <h4>Nouvelle observation</h4>
      <div class="form-row">
        <label>
          Date
          <input type="date" name="date" value="${today}" max="${today}" required />
        </label>
        <label>
          Statut
          <select name="status">${renderStatusOptions(currentStatus)}</select>
        </label>
      </div>
      <label>
        Observation
        <textarea name="note" placeholder="Ex. : semé en godet, première levée, 3 fleurs…"></textarea>
      </label>
      <label>
        Photo (facultatif)
        <input type="file" name="photo" accept="image/*" />
      </label>
      <button type="submit" class="button primary">Ajouter au suivi</button>
    </form>
  `;
}

function openDetail(seedId, { keepScroll = false } = {}) {
  const seed = state.seeds.find((item) => item.id === seedId);
  if (!seed) return;

  const scrollTop = element.detailPanel.scrollTop;
  const currentStatus = getCurrentStatus(seed);
  const statusClass = slugifyStatus(currentStatus);
  state.selectedId = seed.id;

  element.detailPanel.classList.remove('hidden');
  element.detailContent.innerHTML = `
    <div class="detail-header">
      ${seed.photo ? `
        <a href="${escapeHtml(photoUrl(seed.photo))}" target="_blank" rel="noopener">
          ${renderPhoto(seed.photo, 'detail-photo', `Photo : ${seed.name}`)}
        </a>
      ` : ''}
      <div class="seed-meta">
        <span class="chip">${seed.category}</span>
        <span class="chip">${seed.year}</span>
      </div>
      <h2>${seed.name}</h2>
      <p>${seed.origin}</p>
      ${state.auth ? `
        <button type="button" class="button secondary small" id="seedPhotoButton">
          📷 ${seed.photo ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
        <input type="file" id="seedPhotoInput" accept="image/*" hidden />
      ` : ''}
    </div>

    <div class="detail-grid">
      <div class="detail-card">
        <span>Source</span>
        <strong>${seed.source}</strong>
      </div>
      <div class="detail-card">
        <span>Semis</span>
        <strong>${seed.sowingPeriod}</strong>
      </div>
      <div class="detail-card">
        <span>Ensoleillement</span>
        <strong>${seed.sunExposure}</strong>
      </div>
      <div class="detail-card">
        <span>Type de sol</span>
        <strong>${seed.soilType}</strong>
      </div>
      <div class="detail-card">
        <span>Difficulté</span>
        <strong>${seed.difficulty}</strong>
      </div>
      <div class="detail-card">
        <span>Statut</span>
        <strong class="status-tag ${statusClass}">${currentStatus}</strong>
      </div>
    </div>

    <div class="detail-section">
      <h3>Description</h3>
      <p>${seed.description}</p>
    </div>

    <div class="detail-section">
      <h3>Notes</h3>
      <p>${seed.notes}</p>
    </div>

    ${renderList(seed.beginnerTips, 'Conseils de débutant')}
    ${renderList(seed.permacultureTips, 'Astuces permaculture')}
    ${renderList(seed.careTips, 'À surveiller')}
    ${renderList(seed.companionPlants, 'Compagnons utiles')}
    ${renderList(seed.avoidNear, 'À éviter à proximité')}

    ${seed.sowingTips ? `
      <div class="detail-section">
        <h3>Semis et méthode</h3>
        <p>${seed.sowingTips}</p>
      </div>
    ` : ''}

    <div class="detail-section">
      <h3>Suivi</h3>
      ${renderTimeline(seed)}
      ${renderJournalForm(currentStatus)}
    </div>
  `;

  element.detailPanel.scrollTop = keepScroll ? scrollTop : 0;
  attachDetailEvents(seed);
}

function closeDetail() {
  element.detailPanel.classList.add('hidden');
  state.selectedId = null;
}

function renderJournal() {
  const entries = sortEntries(state.journal).slice(0, 8);

  if (!entries.length) {
    element.journalList.innerHTML = `
      <div class="empty-state">
        Aucun suivi enregistré pour le moment. Ouvre une fiche pour ajouter une observation.
      </div>
    `;
    return;
  }

  element.journalList.innerHTML = entries
    .map((entry) => {
      const seed = state.seeds.find((item) => item.id === entry.seedId);
      return `
        <article class="journal-item" tabindex="0" role="button" data-seed-id="${escapeHtml(entry.seedId)}">
          ${entry.photo ? renderPhoto(entry.photo, 'journal-photo') : ''}
          <div class="journal-topline">
            <h3>${seed ? seed.name : 'Graine inconnue'}</h3>
            <span class="status-pill ${slugifyStatus(entry.status)}">${escapeHtml(entry.status)}</span>
          </div>
          <p><strong>Lieu :</strong> ${seed ? seed.origin : '—'}</p>
          <p><strong>Le :</strong> ${formatDate(entry.date)}${entry.author ? ` · par ${escapeHtml(entry.author)}` : ''}</p>
          ${entry.note ? `<p class="journal-note">${formatNote(entry.note)}</p>` : ''}
        </article>
      `;
    })
    .join('');
}

function renderGardenerButton() {
  element.gardenerButton.textContent = state.auth
    ? `🌿 ${state.auth.author || 'Jardinier'}`
    : '🔑 Mode jardinier';
}

function renderAll() {
  renderStats();
  renderCatalog();
  renderJournal();
  renderGardenerButton();
  if (state.selectedId) {
    openDetail(state.selectedId, { keepScroll: true });
  }
}

/* ---------- Enregistrements ---------- */

async function runSave(button, busyLabel, task, successMessage) {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;

  try {
    await task();
    showToast(successMessage);
    return true;
  } catch (error) {
    console.error(error);
    showToast(describeError(error), 'error');
    return false;
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

async function addJournalEntries(newEntries, message) {
  const text = await updateRepoTextFile(
    JOURNAL_PATH,
    (current) => serializeJournal([...parseJournal(current), ...newEntries]),
    message,
  );
  state.journal = parseJournal(text);
}

async function handleJournalSubmit(seed, form) {
  const formData = new FormData(form);
  const date = String(formData.get('date') || todayIso());
  const status = String(formData.get('status'));
  const note = String(formData.get('note') || '').trim();
  const photoFile = formData.get('photo');
  const hasPhoto = photoFile instanceof File && photoFile.size > 0;

  if (!note && !hasPhoto && status === getCurrentStatus(seed)) {
    showToast('Ajoute une observation, une photo ou change le statut.', 'error');
    return;
  }

  const saved = await runSave(
    form.querySelector('button[type="submit"]'),
    'Enregistrement…',
    async () => {
      const photo = hasPhoto
        ? await uploadPhoto(photoFile, 'journal', seed.id, `Photo de suivi : ${seed.name}`)
        : null;

      await addJournalEntries([{
        id: createId(),
        seedId: seed.id,
        date,
        status,
        note,
        ...(photo ? { photo } : {}),
        ...(state.auth.author ? { author: state.auth.author } : {}),
        createdAt: new Date().toISOString(),
      }], `Suivi : ${seed.name} (${date})`);
    },
    'Observation enregistrée ! Elle sera visible par tous d’ici une minute environ.',
  );

  if (saved) renderAll();
}

async function handleDeleteEntry(entryId, button) {
  const entry = state.journal.find((item) => item.id === entryId);
  if (!entry || !window.confirm('Supprimer cette observation ?')) return;

  const saved = await runSave(
    button,
    'Suppression…',
    async () => {
      const text = await updateRepoTextFile(
        JOURNAL_PATH,
        (current) => serializeJournal(parseJournal(current).filter((item) => item.id !== entryId)),
        `Suppression d’une observation (${entry.date})`,
      );
      state.journal = parseJournal(text);

      if (entry.photo) {
        await deleteRepoFile(entry.photo, 'Suppression d’une photo de suivi').catch(console.warn);
      }
    },
    'Observation supprimée.',
  );

  if (saved) renderAll();
}

async function handleSeedPhoto(seed, file, button) {
  const previousPhoto = seed.photo;

  const saved = await runSave(
    button,
    'Envoi de la photo…',
    async () => {
      const photo = await uploadPhoto(file, 'seeds', seed.id, `Photo : ${seed.name}`);
      const text = await updateRepoTextFile(
        SEEDS_PATH,
        (current) => {
          if (!current) throw new Error('seeds.json introuvable.');
          return setSeedPhotoInSource(current, seed.id, photo);
        },
        `Photo de la fiche : ${seed.name}`,
      );
      state.seeds = JSON.parse(text);

      if (previousPhoto && previousPhoto !== photo) {
        await deleteRepoFile(previousPhoto, `Ancienne photo : ${seed.name}`).catch(console.warn);
      }
    },
    'Photo enregistrée ! Elle sera visible par tous d’ici une minute environ.',
  );

  if (saved) renderAll();
}

function attachDetailEvents(seed) {
  const form = document.getElementById('seedJournalForm');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      handleJournalSubmit(seed, form);
    });
  }

  element.detailContent.querySelectorAll('[data-delete-entry]').forEach((button) => {
    button.addEventListener('click', () => handleDeleteEntry(button.dataset.deleteEntry, button));
  });

  element.detailContent.querySelectorAll('[data-open-gardener]').forEach((button) => {
    button.addEventListener('click', openGardenerDialog);
  });

  const photoButton = document.getElementById('seedPhotoButton');
  const photoInput = document.getElementById('seedPhotoInput');
  if (photoButton && photoInput) {
    photoButton.addEventListener('click', () => photoInput.click());
    photoInput.addEventListener('change', () => {
      if (photoInput.files[0]) {
        handleSeedPhoto(seed, photoInput.files[0], photoButton);
      }
    });
  }
}

/* ---------- Mode jardinier ---------- */

function getLegacyEntries() {
  const legacy = readStorage(LEGACY_STORAGE_KEY);
  if (!legacy || typeof legacy !== 'object') return [];

  return Object.entries(legacy)
    .map(([seedId, value]) => ({ seed: state.seeds.find((item) => item.id === seedId), value }))
    .filter(({ seed, value }) =>
      seed && value && (value.note || (value.status && value.status !== seed.status)))
    .map(({ seed, value }) => ({
      id: createId(),
      seedId: seed.id,
      date: (value.updatedAt || new Date().toISOString()).slice(0, 10),
      status: value.status || seed.status,
      note: value.note || '',
      ...(state.auth?.author ? { author: state.auth.author } : {}),
      createdAt: value.updatedAt || new Date().toISOString(),
    }));
}

function renderGardenerDialog() {
  if (!state.auth) {
    const previousAuthor = readStorage(AUTH_STORAGE_KEY)?.author || '';
    element.gardenerContent.innerHTML = `
      <form class="gardener-form" id="gardenerLoginForm">
        <h2>🔑 Mode jardinier</h2>
        <p>
          Le mode jardinier permet d’ajouter des observations et des photos visibles par tout le monde.
          Elles sont enregistrées directement dans le dépôt GitHub du site.
        </p>
        <details class="gardener-help">
          <summary>Comment obtenir un jeton GitHub ?</summary>
          <ol>
            <li>Ouvre <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">la création de jeton sur GitHub</a> (compte ayant accès au dépôt).</li>
            <li><em>Repository access</em> : <strong>Only select repositories</strong> → <strong>${GITHUB_REPO.name}</strong>.</li>
            <li><em>Permissions</em> → <em>Repository permissions</em> → <strong>Contents : Read and write</strong>.</li>
            <li>Choisis une date d’expiration, génère le jeton et colle-le ci-dessous.</li>
          </ol>
        </details>
        <label>
          Ton prénom
          <input name="author" autocomplete="given-name" placeholder="Ex. : Axel" value="${escapeHtml(previousAuthor)}" />
        </label>
        <label>
          Jeton GitHub
          <input name="token" type="password" required autocomplete="off" spellcheck="false" placeholder="github_pat_…" />
        </label>
        <p class="form-hint">Le jeton est gardé uniquement dans ce navigateur, sur cet appareil.</p>
        <p class="form-error" hidden></p>
        <div class="dialog-actions">
          <button type="button" class="button secondary" data-close-dialog>Annuler</button>
          <button type="submit" class="button primary">Se connecter</button>
        </div>
      </form>
    `;
  } else {
    const legacyEntries = getLegacyEntries();
    element.gardenerContent.innerHTML = `
      <div class="gardener-form">
        <h2>🌿 Mode jardinier</h2>
        <p>
          Connecté${state.auth.author ? ` en tant que <strong>${escapeHtml(state.auth.author)}</strong>` : ''}.
          Ouvre une fiche pour ajouter une observation, une photo de suivi ou la photo de la graine.
        </p>
        ${legacyEntries.length ? `
          <div class="legacy-import">
            <p>
              Ce navigateur contient ${legacyEntries.length} ancienne${legacyEntries.length > 1 ? 's' : ''}
              note${legacyEntries.length > 1 ? 's' : ''} enregistrée${legacyEntries.length > 1 ? 's' : ''} avant le journal partagé.
            </p>
            <button type="button" class="button primary small" id="importLegacy">Les ajouter au journal partagé</button>
          </div>
        ` : ''}
        <div class="dialog-actions">
          <button type="button" class="button secondary" id="logoutButton">Se déconnecter</button>
          <button type="button" class="button primary" data-close-dialog>Fermer</button>
        </div>
      </div>
    `;
  }

  element.gardenerContent.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => element.gardenerDialog.close());
  });

  const loginForm = document.getElementById('gardenerLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      handleLogin(loginForm);
    });
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }

  const importButton = document.getElementById('importLegacy');
  if (importButton) {
    importButton.addEventListener('click', () => handleLegacyImport(importButton));
  }
}

function openGardenerDialog() {
  renderGardenerDialog();
  element.gardenerDialog.showModal();
}

async function handleLogin(form) {
  const formData = new FormData(form);
  const token = String(formData.get('token') || '').trim();
  const author = String(formData.get('author') || '').trim();
  const errorElement = form.querySelector('.form-error');
  const submitButton = form.querySelector('button[type="submit"]');

  errorElement.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Vérification…';

  try {
    const repo = await githubRequest('', { token });
    if (repo.permissions && repo.permissions.push === false) {
      const error = new Error('Accès en écriture refusé');
      error.status = 403;
      throw error;
    }

    state.auth = { token, author };
    writeStorage(AUTH_STORAGE_KEY, state.auth);
    await loadData();
    renderAll();
    renderGardenerDialog();
    showToast(`Bienvenue${author ? ` ${author}` : ''} ! Le mode jardinier est activé.`);
  } catch (error) {
    console.error(error);
    errorElement.textContent = error.status === 401
      ? 'Ce jeton n’est pas reconnu par GitHub. Vérifie qu’il est bien copié en entier.'
      : describeError(error);
    errorElement.hidden = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Se connecter';
  }
}

function handleLogout() {
  writeStorage(AUTH_STORAGE_KEY, state.auth?.author ? { author: state.auth.author } : null);
  state.auth = null;
  renderAll();
  element.gardenerDialog.close();
  showToast('Mode jardinier désactivé sur cet appareil.');
}

async function handleLegacyImport(button) {
  const entries = getLegacyEntries();
  if (!entries.length) return;

  const saved = await runSave(
    button,
    'Import…',
    () => addJournalEntries(entries, 'Import des anciennes notes du navigateur'),
    'Anciennes notes ajoutées au journal partagé.',
  );

  if (saved) {
    writeStorage(LEGACY_STORAGE_KEY, null);
    renderAll();
    renderGardenerDialog();
  }
}

/* ---------- Évènements ---------- */

function attachEvents() {
  element.searchInput.addEventListener('input', (event) => {
    state.filters.search = event.target.value;
    renderCatalog();
  });

  element.categoryFilter.addEventListener('change', (event) => {
    state.filters.category = event.target.value;
    renderCatalog();
  });

  element.statusFilter.addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderCatalog();
  });

  element.resetFilters.addEventListener('click', () => {
    state.filters.search = '';
    state.filters.category = 'all';
    state.filters.status = 'all';
    element.searchInput.value = '';
    element.categoryFilter.value = 'all';
    element.statusFilter.value = 'all';
    renderCatalog();
  });

  element.closeDetail.addEventListener('click', closeDetail);
  element.detailPanel.addEventListener('click', (event) => {
    if (event.target === element.detailPanel) {
      closeDetail();
    }
  });

  element.journalList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-seed-id]');
    if (item) openDetail(item.dataset.seedId);
  });

  element.journalList.addEventListener('keydown', (event) => {
    const item = event.target.closest('[data-seed-id]');
    if (item && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openDetail(item.dataset.seedId);
    }
  });

  element.gardenerButton.addEventListener('click', openGardenerDialog);
  element.gardenerDialog.addEventListener('click', (event) => {
    if (event.target === element.gardenerDialog) {
      element.gardenerDialog.close();
    }
  });

  // Une photo tout juste envoyée n'est pas encore publiée par GitHub Pages :
  // on la charge alors directement depuis le dépôt.
  document.addEventListener('error', (event) => {
    const image = event.target;
    if (image.tagName === 'IMG' && image.dataset.path && !image.dataset.retried) {
      image.dataset.retried = 'true';
      image.src = rawPhotoUrl(image.dataset.path);
    }
  }, true);
}

async function init() {
  attachEvents();
  renderGardenerButton();

  try {
    await loadData();
    renderAll();
  } catch (error) {
    element.seedGrid.innerHTML = `
      <div class="empty-state">
        Impossible de charger la collection de graines. Vérifie le fichier de données.
      </div>
    `;
    console.error(error);
  }
}

init();
