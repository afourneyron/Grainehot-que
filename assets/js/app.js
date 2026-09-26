const STORAGE_KEY = 'grainehotheque-journal-v1';

const state = {
  seeds: [],
  filters: {
    search: '',
    category: 'all',
    status: 'all',
  },
  selectedId: null,
};

const element = {
  seedGrid: document.getElementById('seedGrid'),
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
};

function loadJournal() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveJournal(journal) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(journal));
}

function getSeedStatus(seedId) {
  const journal = loadJournal();
  return journal[seedId]?.status || seedId ? null : null;
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

function normalizeValue(value) {
  return (value || '').toString().trim().toLowerCase();
}

function getFilteredSeeds() {
  return state.seeds.filter((seed) => {
    const searchTerm = normalizeValue(state.filters.search);
    const matchesSearch =
      !searchTerm ||
      normalizeValue(seed.name).includes(searchTerm) ||
      normalizeValue(seed.origin).includes(searchTerm) ||
      normalizeValue(seed.source).includes(searchTerm) ||
      normalizeValue(seed.description).includes(searchTerm);

    const matchesCategory =
      state.filters.category === 'all' || seed.category === state.filters.category;

    const journal = loadJournal();
    const savedStatus = journal[seed.id]?.status || seed.status;
    const matchesStatus =
      state.filters.status === 'all' || savedStatus === state.filters.status;

    return matchesSearch && matchesCategory && matchesStatus;
  });
}

function renderSeedCard(seed) {
  const journal = loadJournal();
  const savedStatus = journal[seed.id]?.status || seed.status;

  const card = document.createElement('article');
  card.className = 'seed-card';
  card.dataset.id = seed.id;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Voir la fiche de ${seed.name}`);

  card.innerHTML = `
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
      <span class="status-pill ${savedStatus}">${savedStatus}</span>
    </div>
  `;

  card.addEventListener('click', () => {
    state.selectedId = seed.id;
    openDetail(seed.id);
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      state.selectedId = seed.id;
      openDetail(seed.id);
    }
  });

  return card;
}

function renderCatalog() {
  const filteredSeeds = getFilteredSeeds();

  if (!filteredSeeds.length) {
    element.seedGrid.innerHTML = `
      <div class="empty-state">
        Aucune graine ne correspond à ta recherche pour le moment.
      </div>
    `;
    return;
  }

  element.seedGrid.innerHTML = '';
  filteredSeeds.forEach((seed) => {
    element.seedGrid.appendChild(renderSeedCard(seed));
  });
}

function openDetail(seedId) {
  const seed = state.seeds.find((item) => item.id === seedId);
  if (!seed) return;

  const journal = loadJournal();
  const savedStatus = journal[seed.id]?.status || seed.status;
  const savedNote = journal[seed.id]?.note || '';

  element.detailPanel.classList.remove('hidden');
  element.detailContent.innerHTML = `
    <div class="detail-header">
      <div class="seed-meta">
        <span class="chip">${seed.category}</span>
        <span class="chip">${seed.year}</span>
      </div>
      <h2>${seed.name}</h2>
      <p>${seed.origin}</p>
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
        <strong>${savedStatus}</strong>
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

    <div class="detail-section">
      <h3>Mon suivi</h3>
      <form class="journal-form" id="seedJournalForm">
        <label>
          Statut
          <select name="status">
            <option value="à semer" ${savedStatus === 'à semer' ? 'selected' : ''}>À semer</option>
            <option value="semé" ${savedStatus === 'semé' ? 'selected' : ''}>Semé</option>
            <option value="en cours" ${savedStatus === 'en cours' ? 'selected' : ''}>En cours</option>
            <option value="récolté" ${savedStatus === 'récolté' ? 'selected' : ''}>Récolté</option>
          </select>
        </label>
        <label>
          Observation
          <textarea name="note" placeholder="Ex. : semé le 10 avril, en pleine croissance, très bonne levée...">${savedNote}</textarea>
        </label>
        <button type="submit" class="button primary">Enregistrer</button>
      </form>
    </div>
  `;

  const form = document.getElementById('seedJournalForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const status = formData.get('status');
    const note = String(formData.get('note') || '').trim();

    const journal = loadJournal();
    journal[seed.id] = {
      status,
      note,
      updatedAt: new Date().toISOString(),
    };
    saveJournal(journal);

    renderCatalog();
    renderJournal();
    openDetail(seed.id);
  });
}

function closeDetail() {
  element.detailPanel.classList.add('hidden');
  state.selectedId = null;
}

function renderJournal() {
  const journal = loadJournal();
  const entries = Object.entries(journal)
    .filter(([, value]) => value && (value.status || value.note))
    .map(([seedId, value]) => {
      const seed = state.seeds.find((item) => item.id === seedId);
      return {
        ...value,
        seedId,
        seedName: seed ? seed.name : 'Graine inconnue',
        origin: seed ? seed.origin : '',
      };
    })
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

  if (!entries.length) {
    element.journalList.innerHTML = `
      <div class="empty-state">
        Aucun suivi enregistré pour le moment. Ouvre une fiche et ajoute une observation.
      </div>
    `;
    return;
  }

  element.journalList.innerHTML = entries
    .slice(0, 8)
    .map(
      (entry) => `
        <article class="journal-item">
          <h3>${entry.seedName}</h3>
          <p><strong>Lieu :</strong> ${entry.origin || '—'}</p>
          <p><strong>Statut :</strong> ${entry.status || '—'}</p>
          <p>${entry.note || 'Aucune observation enregistrée.'}</p>
        </article>
      `
    )
    .join('');
}

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
}

async function init() {
  try {
    const response = await fetch('./data/seeds.json');
    if (!response.ok) {
      throw new Error('Impossible de charger les graines.');
    }

    state.seeds = await response.json();
    renderStats();
    renderCatalog();
    renderJournal();
    attachEvents();
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
