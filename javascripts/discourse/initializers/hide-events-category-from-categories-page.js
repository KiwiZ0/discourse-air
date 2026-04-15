import { apiInitializer } from "discourse/lib/api";

const EVENTS_CATEGORY_PATH = "/c/events";
const CATEGORY_SURFACE_SELECTORS = [
  ".custom-category-boxes-container",
  ".category-list",
  ".category-boxes",
];
const CATEGORY_CONTAINER_SELECTORS = [
  '[data-category-id]',
  ".custom-category-box",
  ".category-list-item",
  ".category-box",
];

function shouldHideEventsCategory(url = window.location.pathname) {
  return (
    url === "/" ||
    /^\/categories(?:[/?#]|$)/.test(url || "")
  );
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
  return CATEGORY_CONTAINER_SELECTORS.map((selector) => link.closest(selector)).find(Boolean);
}

function findSurfaceChild(link, surface) {
  let node = link;

  while (node?.parentElement && node.parentElement !== surface) {
    node = node.parentElement;
  }

  return node && node !== surface ? node : null;
}

function hideEventsCategory() {
  if (!shouldHideEventsCategory()) {
    return;
  }

  document.querySelectorAll(CATEGORY_SURFACE_SELECTORS.join(", ")).forEach((surface) => {
    surface.querySelectorAll('a[href*="/c/events"]').forEach((link) => {
      if (!isEventsCategoryLink(link)) {
        return;
      }

      const container = findCategoryContainer(link) || findSurfaceChild(link, surface);

      if (container) {
        container.style.display = "none";
      }
    });
  });
}

export default apiInitializer((api) => {
  const observer = new MutationObserver(() => {
    hideEventsCategory();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  api.onPageChange((url) => {
    if (!shouldHideEventsCategory(url)) {
      return;
    }

    hideEventsCategory();
  });
});
