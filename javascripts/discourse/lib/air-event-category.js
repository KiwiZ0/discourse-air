import Category from "discourse/models/category";

export const STORAGE_KEY = "discourse-air-upcoming-events-category-id";
const ALLOWED_EVENT_CATEGORY_PATHS = [
  "events/cal-pvp",
  "events/cal-pvm",
  "non-runescape",
];
const ALLOWED_EVENT_CATEGORY_PATH_SET = new Set(ALLOWED_EVENT_CATEGORY_PATHS);

let eventCategoriesPromise;
let loadedEventCategories;

function normalizeSlug(slug) {
  return String(slug || "")
    .trim()
    .toLowerCase();
}

function categorySlugPath(category) {
  return normalizeSlug(Category.slugFor(category));
}

export function isAllowedEventCategory(category) {
  return ALLOWED_EVENT_CATEGORY_PATH_SET.has(categorySlugPath(category));
}

export function getCurrentCategory(router) {
  let route = router?.currentRoute;

  while (route) {
    if (
      route.attributes?.category &&
      isAllowedEventCategory(route.attributes.category)
    ) {
      return route.attributes.category;
    }

    route = route.parent;
  }

  return null;
}

export function canCreateTopic(category) {
  return category?.canCreateTopic || category?.can_create_topic;
}

function filterCreatableEventCategories(categories) {
  return uniqueCategories(
    categories.filter(
      (category) => canCreateTopic(category) && isAllowedEventCategory(category)
    )
  );
}

function uniqueCategories(categories) {
  const seen = new Set();

  return categories.filter((category) => {
    if (!category?.id || seen.has(category.id)) {
      return false;
    }

    seen.add(category.id);
    return true;
  });
}

export function getCreatableCategories(site) {
  const categories = site?.categoriesList || site?.categories || [];
  return filterCreatableEventCategories(categories);
}

async function findAllowedCategoryByPath(path) {
  const category = await Category.asyncFindBySlugPath(path).catch(() => null);

  if (category && isAllowedEventCategory(category)) {
    return category;
  }

  return null;
}

export async function ensureEventCategories(site) {
  const loadedCategories = getCreatableCategories(site);

  if (loadedCategories.length >= ALLOWED_EVENT_CATEGORY_PATHS.length) {
    return loadedCategories;
  }

  if (!loadedEventCategories) {
    eventCategoriesPromise ||= Promise.all(
      ALLOWED_EVENT_CATEGORY_PATHS.map((path) => findAllowedCategoryByPath(path))
    )
      .then((categories) => {
        loadedEventCategories = uniqueCategories(categories.filter(Boolean));
        return loadedEventCategories;
      })
      .finally(() => {
        eventCategoriesPromise = null;
      });
  }

  const fetchedCategories =
    loadedEventCategories || (await eventCategoriesPromise);

  return filterCreatableEventCategories([
    ...loadedCategories,
    ...fetchedCategories,
  ]);
}

export function getStoredCategoryId() {
  return window.localStorage?.getItem(STORAGE_KEY);
}

export function setStoredCategoryId(categoryId) {
  if (!categoryId) {
    window.localStorage?.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage?.setItem(STORAGE_KEY, String(categoryId));
}

export function getDefaultComposerCategory(siteSettings) {
  const defaultCategoryId = parseInt(
    siteSettings?.default_composer_category,
    10
  );

  if (!defaultCategoryId || defaultCategoryId <= 0) {
    return null;
  }

  const category = Category.findById(defaultCategoryId);
  return isAllowedEventCategory(category) ? category : null;
}

export function getSelectedCategory(
  site,
  categories = getCreatableCategories(site)
) {
  const storedCategoryId = parseInt(getStoredCategoryId(), 10);

  if (!storedCategoryId) {
    return null;
  }

  const selectedCategory = categories.find(
    (category) => category.id === storedCategoryId
  );

  if (selectedCategory) {
    return selectedCategory;
  }

  setStoredCategoryId(null);
  return null;
}

export function getCreateTopicTargetCategory(
  { router, site, siteSettings },
  categories = getCreatableCategories(site)
) {
  const selectedCategory = getSelectedCategory(site, categories);
  const category = getCurrentCategory(router);

  if (selectedCategory?.id) {
    return selectedCategory;
  }

  if (canCreateTopic(category)) {
    return category;
  }

  if (
    siteSettings?.default_subcategory_on_read_only_category &&
    category?.subcategoryWithCreateTopicPermission &&
    isAllowedEventCategory(category.subcategoryWithCreateTopicPermission)
  ) {
    return category.subcategoryWithCreateTopicPermission;
  }

  return getDefaultComposerCategory(siteSettings);
}

export async function getCreateTopicTargetCategoryAsync(context) {
  const categories = await ensureEventCategories(context.site);

  return getCreateTopicTargetCategory(context, categories);
}
