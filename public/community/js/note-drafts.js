// Draft ownership belongs to the field, not the currently selected appState ID.
// A scan can change that ID before the UI renders the next customer.
const drafts = new WeakMap();

function noteField(id) {
  const input = document.getElementById(id);
  if (!drafts.has(input)) {
    const draft = { customerId: null, revision: 0 };
    drafts.set(input, draft);
    input.addEventListener('input', () => { draft.revision += 1; });
  }
  return { input, draft: drafts.get(input) };
}

export function setNoteDraftCustomer(id, customer) {
  const { input, draft } = noteField(id);
  const customerId = customer?.id || null;
  if (draft.customerId !== customerId) {
    input.value = '';
    draft.customerId = customerId;
    draft.revision += 1;
  }
  input.disabled = !customerId;
  document.getElementById(`${id}Help`).textContent = customer
    ? `Note for ${customer.name}. Unsaved notes clear when you change customers.`
    : 'Select a customer before writing a note. Unsaved notes clear when you change customers.';
}

export function captureNoteDraft(id, customerId) {
  const { input, draft } = noteField(id);
  if (!customerId || draft.customerId !== customerId || !input.value.trim()) return null;
  return { customerId, text: input.value, revision: draft.revision };
}

export function clearSavedNoteDraft(id, saved) {
  const { input, draft } = noteField(id);
  // Even identical text can be a new draft after editing or switching away/back.
  if (draft.customerId !== saved.customerId || draft.revision !== saved.revision || input.value !== saved.text) return;
  input.value = '';
  draft.revision += 1;
}
