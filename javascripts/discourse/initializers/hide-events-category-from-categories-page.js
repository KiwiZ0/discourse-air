import { apiInitializer } from "discourse/lib/api";

const EVENTS_CATEGORY_PATH = "/c/events";
const CATEGORY_CONTAINER_SELECTORS = [
  '[data-category-id]',
  ".category-list-item",
  ".category-box",
  "tr",
  "section",
  "article",
  "li",
];

function isCategoriesPage(url = window.location.pathname) {
  return /^\/categories(?:[/?#]|$)/.test(url || "");
}

function isEventsCategoryLink(link) {
  try {
    const pathname = new URL(link.href, window.location.origin).pathname
      .trim()
      .toLowerCase();

    return (
      pathname === EVENTS_CATEGORY_PATH ||
      pathname.startsWith(`${EVENTS_CATEGORY_PATH}/`)
    );
  } catch {
    return false;
  }
}

function findCategoryContainer(link) {
  return CATEGORY_CONTAINER_SELECTORS.map((selector) => link.closest(selector)).find(
    Boolean
  );
}

function hideEventsCategoryFromCategoriesPage() {
  if (!isCategoriesPage()) {
    return;
  }

  document.querySelectorAll('a[href*="/c/events"]').forEach((link) => {
    if (!isEventsCategoryLink(link)) {
      return;
    }

    const container = findCategoryContainer(link);

    if (container) {
      container.style.display = "none";
    }
  });
}

export default apiInitializer((api) => {
  const observer = new MutationObserver(() => {
    hideEventsCategoryFromCategoriesPage();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  api.onPageChange((url) => {
    if (!isCategoriesPage(url)) {
      return;
    }

    hideEventsCategoryFromCategoriesPage();
  });
});
