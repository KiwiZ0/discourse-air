import { apiInitializer } from "discourse/lib/api";
import {
  ensureEventCategories,
  getCurrentCategory,
  getDefaultComposerCategory,
  getSelectedCategory,
  setStoredCategoryId,
} from "../lib/air-event-category";

const EVENT_BUILDER_SELECTOR = ".post-event-builder-modal";
const EVENT_FIELD_SELECTOR = ".event-field";
const HIDDEN_FIELD_CLASS = "air-event-field--hidden";
const CATEGORY_FIELD_SELECTOR = ".air-event-category-field";
const NAME_INPUT_SELECTOR = ".event-field.name input";
const NAME_LABEL_SELECTOR = ".event-field.name .label";
const ENHANCEMENT_RETRY_DELAY_MS = 250;
const ENHANCEMENT_MAX_RETRIES = 20;

let pendingEnhancementRetry;
let enhancementRetryCount = 0;
let pendingCategoryFieldEnhancement;

function getEventCategoryContext(api) {
  const router = api.container.lookup("service:router");
  const site = api.container.lookup("service:site");
  const siteSettings = api.container.lookup("service:site-settings");

  return { router, site, siteSettings };
}

function getInitialSelectedCategory(
  { router, site, siteSettings },
  categories
) {
  return (
    getSelectedCategory(site, categories) ||
    getCurrentCategory(router) ||
    getDefaultComposerCategory(siteSettings)
  );
}

function populateCategorySelect(select, categories, selectedCategory) {
  const previousValue = select.value;

  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Choose category";
  select.append(placeholder);

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = category.name;
    select.append(option);
  });

  let selectedValue = previousValue;

  if (
    selectedCategory?.id &&
    categories.some((category) => category.id === selectedCategory.id)
  ) {
    selectedValue = String(selectedCategory.id);
  }

  if (!categories.some((category) => String(category.id) === selectedValue)) {
    selectedValue = "";
  }

  select.value = selectedValue;
  setStoredCategoryId(selectedValue);
}

function buildCategoryField(categories, selectedCategory) {
  const field = document.createElement("div");
  field.className = "event-field air-event-category-field";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Category";

  const select = document.createElement("select");
  select.className = "air-event-category-field__select";

  populateCategorySelect(select, categories, selectedCategory);

  const updateCategory = (event) => {
    setStoredCategoryId(event.target.value);
  };

  select.addEventListener("change", updateCategory);
  select.addEventListener("input", updateCategory);

  field.append(label, select);

  return field;
}

async function injectOrUpdateCategoryField(api) {
  const { router, site, siteSettings } = getEventCategoryContext(api);
  const categories = await ensureEventCategories(site);

  const modal = document.querySelector(EVENT_BUILDER_SELECTOR);

  if (!modal) {
    return false;
  }

  if (!categories.length) {
    return false;
  }

  const selectedCategory = getInitialSelectedCategory(
    { router, site, siteSettings },
    categories
  );
  const existingSelect = modal.querySelector(
    `${CATEGORY_FIELD_SELECTOR} select`
  );

  if (existingSelect) {
    populateCategorySelect(existingSelect, categories, selectedCategory);
    return true;
  }

  const categoryField = buildCategoryField(categories, selectedCategory);

  const allDayField = modal.querySelector(".event-field.all-day");
  const nameField = modal.querySelector(".event-field.name");
  const firstField = modal.querySelector(EVENT_FIELD_SELECTOR);

  if (allDayField) {
    allDayField.insertAdjacentElement("afterend", categoryField);
    return true;
  }

  if (nameField?.parentElement) {
    nameField.parentElement.insertBefore(categoryField, nameField);
    return true;
  }

  firstField?.parentElement?.insertBefore(categoryField, firstField);
  return Boolean(firstField);
}

function enhanceCategoryField(api) {
  pendingCategoryFieldEnhancement ||= injectOrUpdateCategoryField(api).finally(
    () => {
      pendingCategoryFieldEnhancement = null;
    }
  );

  return pendingCategoryFieldEnhancement;
}

function updateNameFieldCopy() {
  const modal = document.querySelector(EVENT_BUILDER_SELECTOR);

  if (!modal) {
    return;
  }

  const nameInput = modal.querySelector(NAME_INPUT_SELECTOR);
  const nameLabel = modal.querySelector(NAME_LABEL_SELECTOR);

  if (nameInput) {
    nameInput.placeholder = "Required";
    nameInput.setAttribute("aria-required", "true");
  }

  if (nameLabel && !nameLabel.textContent.includes("*")) {
    nameLabel.textContent = "Event Name *";
  }
}

function hideStatusFields() {
  const modal = document.querySelector(EVENT_BUILDER_SELECTOR);

  if (!modal) {
    return;
  }

  const fields = [...modal.querySelectorAll(".event-field")];
  const statusField = fields.find((field) =>
    field.querySelector('input[name="status"]')
  );

  statusField?.classList.add(HIDDEN_FIELD_CLASS);

  const privateInviteesField = fields.find(
    (field) =>
      field !== statusField &&
      field.querySelector(".group-selector, .group-chooser, .group-names-input")
  );

  privateInviteesField?.classList.add(HIDDEN_FIELD_CLASS);
}

function clearPendingEnhancementRetry() {
  if (!pendingEnhancementRetry) {
    return;
  }

  clearTimeout(pendingEnhancementRetry);
  pendingEnhancementRetry = null;
}

function scheduleEventBuilderEnhancements(api, { resetRetries = false } = {}) {
  const modal = document.querySelector(EVENT_BUILDER_SELECTOR);

  if (!modal) {
    enhancementRetryCount = 0;
    clearPendingEnhancementRetry();
    return;
  }

  if (resetRetries) {
    enhancementRetryCount = 0;
    clearPendingEnhancementRetry();
  }

  updateNameFieldCopy();
  hideStatusFields();

  enhanceCategoryField(api).then((categoryFieldReady) => {
    if (!document.querySelector(EVENT_BUILDER_SELECTOR)) {
      return;
    }

    if (categoryFieldReady) {
      enhancementRetryCount = 0;
      clearPendingEnhancementRetry();
      return;
    }

    if (
      pendingEnhancementRetry ||
      enhancementRetryCount >= ENHANCEMENT_MAX_RETRIES
    ) {
      return;
    }

    enhancementRetryCount += 1;
    pendingEnhancementRetry = setTimeout(() => {
      pendingEnhancementRetry = null;
      scheduleEventBuilderEnhancements(api);
    }, ENHANCEMENT_RETRY_DELAY_MS);
  });
}

export default apiInitializer((api) => {
  const observer = new MutationObserver((mutations) => {
    const modalWasAdded = mutations.some((mutation) =>
      [...mutation.addedNodes].some(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches?.(EVENT_BUILDER_SELECTOR) ||
            node.querySelector?.(EVENT_BUILDER_SELECTOR))
      )
    );

    if (modalWasAdded || document.querySelector(EVENT_BUILDER_SELECTOR)) {
      scheduleEventBuilderEnhancements(api, {
        resetRetries: modalWasAdded,
      });
      return;
    }

    clearPendingEnhancementRetry();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  api.onPageChange(() => {
    scheduleEventBuilderEnhancements(api, { resetRetries: true });
  });

  scheduleEventBuilderEnhancements(api, { resetRetries: true });
});
