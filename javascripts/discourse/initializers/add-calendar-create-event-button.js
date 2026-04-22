import { ajax } from "discourse/lib/ajax";
import { apiInitializer } from "discourse/lib/api";
import DiscourseURL from "discourse/lib/url";
import PostEventBuilder from "discourse/plugins/discourse-calendar/discourse/components/modal/post-event-builder";
import { buildParams } from "discourse/plugins/discourse-calendar/discourse/lib/raw-event-helper";
import DiscoursePostEventEvent from "discourse/plugins/discourse-calendar/discourse/models/discourse-post-event-event";
import { getCreateTopicTargetCategoryAsync } from "../lib/air-event-category";

const UPCOMING_EVENTS_SELECTOR = ".discourse-post-event-upcoming-events";
const ACTIONS_SELECTOR = ".air-calendar-actions";
const TOOLBAR_SELECTOR =
  ".discourse-post-event-upcoming-events .fc-header-toolbar";
const TOOLBAR_CHUNK_SELECTOR = ".fc-toolbar-chunk:last-child";
const EVENT_BUILDER_MODAL_SELECTOR = ".post-event-builder-modal";
const EVENT_BUILDER_BODY_SELECTOR = ".post-event-builder-modal .d-modal__body";
const EVENT_BUILDER_PRIMARY_BUTTON_SELECTOR =
  ".post-event-builder-modal .d-modal__footer .btn-primary";
const EVENT_BUILDER_ERROR_SELECTOR = ".air-event-builder-error";
const CATEGORY_REQUIRED_MESSAGE =
  "Choose a category in the event wizard before creating the event.";
const TITLE_REQUIRED_MESSAGE =
  "Add an event name in the event wizard before creating the event.";
const CREATE_EVENT_FAILURE_MESSAGE =
  "Could not create the event right now. Please try again.";

function getEventCategoryContext(api) {
  return {
    router: api.container.lookup("service:router"),
    site: api.container.lookup("service:site"),
    siteSettings: api.container.lookup("service:site-settings"),
  };
}

function waitForElement(selector, { root = document, timeout = 5000 } = {}) {
  const initialMatch = root.querySelector(selector);

  if (initialMatch) {
    return Promise.resolve(initialMatch);
  }

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const match = root.querySelector(selector);

      if (match) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(match);
      }
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);

    observer.observe(root === document ? document.body : root, {
      childList: true,
      subtree: true,
    });
  });
}

function isUpcomingEventsRoute(api) {
  const router = api.container.lookup("service:router");
  return router?.currentRouteName?.startsWith(
    "discourse-post-event-upcoming-events"
  );
}

function buildCreatedTopicUrl(result) {
  if (result?.route_to) {
    return result.route_to;
  }

  if (result?.url) {
    return result.url;
  }

  if (result?.topic_slug && result?.topic_id) {
    return `/t/${result.topic_slug}/${result.topic_id}`;
  }

  if (result?.topic_id) {
    return `/t/${result.topic_id}`;
  }

  return null;
}

async function createTopicFromEvent(api, { body, title, category }) {
  const targetCategory =
    category ||
    (await getCreateTopicTargetCategoryAsync(getEventCategoryContext(api)));
  const payload = {
    raw: body,
    title,
  };

  if (targetCategory?.id) {
    payload.category = targetCategory.id;
  }

  const result = await ajax("/posts", {
    type: "POST",
    data: payload,
  });

  const topicUrl = buildCreatedTopicUrl(result);

  if (topicUrl) {
    DiscourseURL.routeTo(topicUrl);
  }

  return true;
}

function extractErrorMessage(error) {
  return error?.jqXHR?.responseJSON?.errors?.[0] || null;
}

function buildEventMarkup(event, siteSettings) {
  const eventParams = buildParams(
    event.startsAt,
    event.endsAt,
    event,
    siteSettings
  );
  const description = eventParams.description
    ? `${eventParams.description}\n`
    : "";

  delete eventParams.description;

  const markdownParams = Object.keys(eventParams).map(
    (key) => `${key}="${eventParams[key]}"`
  );

  return `[event ${markdownParams.join(" ")}]\n${description}[/event]\n`;
}

function clearEventBuilderError(modal) {
  modal?.querySelector(EVENT_BUILDER_ERROR_SELECTOR)?.remove();
}

function showEventBuilderError(modal, message) {
  if (!modal) {
    return;
  }

  clearEventBuilderError(modal);

  const body = modal.querySelector(EVENT_BUILDER_BODY_SELECTOR);

  if (!body) {
    return;
  }

  const error = document.createElement("div");
  error.className = "air-event-builder-error";
  error.textContent = message;
  body.prepend(error);
}

function setEventBuilderSubmitting(modal, isSubmitting) {
  const primaryButton = modal?.querySelector(
    EVENT_BUILDER_PRIMARY_BUTTON_SELECTOR
  );

  if (!primaryButton) {
    return;
  }

  if (!primaryButton.dataset.airDefaultLabel) {
    primaryButton.dataset.airDefaultLabel = primaryButton.textContent.trim();
  }

  primaryButton.disabled = isSubmitting;
  primaryButton.classList.toggle("is-loading", isSubmitting);
  primaryButton.textContent = isSubmitting
    ? "Creating..."
    : primaryButton.dataset.airDefaultLabel;
}

function attachEventBuilderSubmitHandler(api, event) {
  waitForElement(EVENT_BUILDER_MODAL_SELECTOR, { timeout: 3000 })
    .then((modal) => {
      const primaryButton = modal.querySelector(
        EVENT_BUILDER_PRIMARY_BUTTON_SELECTOR
      );

      if (!primaryButton || primaryButton.dataset.airBound === "true") {
        return;
      }

      primaryButton.dataset.airBound = "true";
      clearEventBuilderError(modal);

      primaryButton.addEventListener(
        "click",
        async (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopPropagation();
          clickEvent.stopImmediatePropagation();

          const categoryContext = getEventCategoryContext(api);
          const { siteSettings } = categoryContext;
          const title = event.name?.trim() || "";

          clearEventBuilderError(modal);

          if (!title) {
            showEventBuilderError(modal, TITLE_REQUIRED_MESSAGE);
            return;
          }

          setEventBuilderSubmitting(modal, true);

          const category =
            await getCreateTopicTargetCategoryAsync(categoryContext);

          if (!category?.id && !siteSettings?.allow_uncategorized_topics) {
            showEventBuilderError(modal, CATEGORY_REQUIRED_MESSAGE);
            setEventBuilderSubmitting(modal, false);
            return;
          }

          let body;

          try {
            body = buildEventMarkup(event, siteSettings);
          } catch {
            showEventBuilderError(modal, CREATE_EVENT_FAILURE_MESSAGE);
            setEventBuilderSubmitting(modal, false);
            return;
          }

          createTopicFromEvent(api, { body, title, category }).catch((error) => {
            showEventBuilderError(
              modal,
              extractErrorMessage(error) || CREATE_EVENT_FAILURE_MESSAGE
            );
            setEventBuilderSubmitting(modal, false);
          });
        },
        { capture: true }
      );
    })
    .catch(() => {});
}

function showEventBuilder(api, event) {
  const modal = api.container.lookup("service:modal");

  if (!modal) {
    return;
  }

  const toolbarEvent = {
    addText: () => {},
  };

  modal.show(PostEventBuilder, {
    model: { event, toolbarEvent },
  });

  attachEventBuilderSubmitHandler(api, event);
}

function launchEventBuilder(api) {
  const currentUser = api.getCurrentUser();

  if (!currentUser || document.querySelector(EVENT_BUILDER_MODAL_SELECTOR)) {
    return false;
  }

  const timezone =
    currentUser.user_option?.timezone || window.moment?.tz?.guess?.() || "UTC";
  const now = window.moment?.tz
    ? window.moment.tz(window.moment(), timezone)
    : new Date();

  const event = DiscoursePostEventEvent.create({
    status: "public",
    starts_at: now,
    timezone,
  });

  showEventBuilder(api, event);
  return true;
}

function buildCalendarActions() {
  const wrapper = document.createElement("div");
  wrapper.className = "air-calendar-actions";

  const intro = document.createElement("div");
  intro.className = "air-calendar-actions__intro";

  const title = document.createElement("p");
  title.className = "air-calendar-actions__title";
  title.textContent = "Have something to add?";

  const helper = document.createElement("p");
  helper.className = "air-calendar-actions__helper";
  helper.textContent = "Create a new upcoming event in one click.";

  intro.append(title, helper);

  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "btn btn-primary fc-button fc-button-primary air-calendar-create-event-btn";
  button.innerHTML = `
    <span class="air-calendar-create-event-btn__icon" aria-hidden="true">+</span>
    <span>Create Event</span>
  `;

  wrapper.append(intro, button);

  return { wrapper, button };
}

async function handleCreateEventClick(api, button) {
  const defaultLabel = button.innerHTML;

  button.disabled = true;
  button.classList.add("is-loading");
  button.innerHTML = `
    <span class="air-calendar-create-event-btn__icon" aria-hidden="true">+</span>
    <span>Opening...</span>
  `;

  try {
    const builderOpened = launchEventBuilder(api);

    if (!builderOpened) {
      return;
    }
  } catch (error) {
    // Keep failures quiet in the UI but leave a trail for troubleshooting.
    // eslint-disable-next-line no-console
    console.warn("discourse-air: unable to open the create event flow", error);
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.innerHTML = defaultLabel;
  }
}

function injectButton(api) {
  const currentUser = api.getCurrentUser();

  if (!currentUser || !isUpcomingEventsRoute(api)) {
    return;
  }

  const upcomingEvents = document.querySelector(UPCOMING_EVENTS_SELECTOR);
  const toolbar = document.querySelector(TOOLBAR_SELECTOR);

  if (
    !upcomingEvents ||
    upcomingEvents.querySelector(ACTIONS_SELECTOR) ||
    toolbar?.querySelector(".air-calendar-create-event-btn")
  ) {
    return;
  }

  const { wrapper, button } = buildCalendarActions();

  if (toolbar) {
    const toolbarChunk =
      toolbar.querySelector(TOOLBAR_CHUNK_SELECTOR) || toolbar;
    wrapper.classList.add("air-calendar-actions--toolbar");
    toolbarChunk.append(wrapper);
  } else {
    upcomingEvents.prepend(wrapper);
  }

  button.addEventListener("click", () => handleCreateEventClick(api, button));
}

export default apiInitializer((api) => {
  api.onPageChange(() => {
    waitForElement(UPCOMING_EVENTS_SELECTOR, { timeout: 7000 })
      .then(() => injectButton(api))
      .catch(() => {});

    waitForElement(TOOLBAR_SELECTOR, { timeout: 7000 })
      .then(() => injectButton(api))
      .catch(() => {});

    for (let attempt = 0; attempt < 12; attempt++) {
      setTimeout(() => injectButton(api), attempt * 300);
    }
  });
});
