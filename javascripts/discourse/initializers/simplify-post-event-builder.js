import { apiInitializer } from "discourse/lib/api";
import {
  getCreatableCategories,
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

function buildCategoryField(api) {
  const router = api.container.lookup("service:router");
  const site = api.container.lookup("service:site");
  const siteSettings = api.container.lookup("service:site-settings");
  const categories = getCreatableCategories(site);

  if (!categories.length) {
    return null;
  }

  const selectedCategory =
    getSelectedCategory(site) ||
    getCurrentCategory(router) ||
    getDefaultComposerCategory(siteSettings);

  const field = document.createElement("div");
  field.className = "event-field air-event-category-field";

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Category";

  const select = document.createElement("select");
  select.className = "air-event-category-field__select";

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

  if (selectedCategory?.id) {
    select.value = String(selectedCategory.id);
    setStoredCategoryId(selectedCategory.id);
  }

  const updateCategory = (event) => {
    setStoredCategoryId(event.target.value);
  };

  select.addEventListener("change", updateCategory);
  select.addEventListener("input", updateCategory);

  field.append(label, select);

  return field;
}

function injectCategoryField(api) {
  const modal = document.querySelector(EVENT_BUILDER_SELECTOR);

  if (!modal || modal.querySelector(CATEGORY_FIELD_SELECTOR)) {
    return;
  }

  const categoryField = buildCategoryField(api);

  if (!categoryField) {
    return;
  }

  const allDayField = modal.querySelector(".event-field.all-day");
  const nameField = modal.querySelector(".event-field.name");
  const firstField = modal.querySelector(EVENT_FIELD_SELECTOR);

  if (allDayField) {
    allDayField.insertAdjacentElement("afterend", categoryField);
    return;
  }

  if (nameField?.parentElement) {
    nameField.parentElement.insertBefore(categoryField, nameField);
    return;
  }

  firstField?.parentElement?.insertBefore(categoryField, firstField);
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

    if (modalWasAdded) {
      injectCategoryField(api);
      updateNameFieldCopy();
      hideStatusFields();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  api.onPageChange(() => {
    injectCategoryField(api);
    updateNameFieldCopy();
    hideStatusFields();
  });
});
