import Category from "discourse/models/category";

export const STORAGE_KEY = "discourse-air-upcoming-events-category-id";

export function getCurrentCategory(router) {
  let route = router?.currentRoute;

  while (route) {
    if (route.attributes?.category) {
      return route.attributes.category;
    }

    route = route.parent;
  }

  return null;
}

export function canCreateTopic(category) {
  return category?.canCreateTopic || category?.can_create_topic;
}

export function getCreatableCategories(site) {
  const categories = site?.categoriesList || site?.categories || [];
  return categories.filter((category) => canCreateTopic(category));
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
  const defaultCategoryId = parseInt(siteSettings?.default_composer_category, 10);

  if (!defaultCategoryId || defaultCategoryId <= 0) {
    return null;
  }

  return Category.findById(defaultCategoryId) || { id: defaultCategoryId };
}

export function getSelectedCategory(site) {
  const storedCategoryId = parseInt(getStoredCategoryId(), 10);

  if (!storedCategoryId) {
    return null;
  }

  const selectedCategory = getCreatableCategories(site).find(
    (category) => category.id === storedCategoryId
  );

  if (selectedCategory) {
    return selectedCategory;
  }

  setStoredCategoryId(null);
  return null;
}

export function getCreateTopicTargetCategory({ router, site, siteSettings }) {
  const selectedCategory = getSelectedCategory(site);
  const category = getCurrentCategory(router);

  if (selectedCategory?.id) {
    return selectedCategory;
  }

  if (canCreateTopic(category)) {
    return category;
  }

  if (
    siteSettings?.default_subcategory_on_read_only_category &&
    category?.subcategoryWithCreateTopicPermission
  ) {
    return category.subcategoryWithCreateTopicPermission;
  }

  return getDefaultComposerCategory(siteSettings);
}
