import { apiInitializer } from "discourse/lib/api";

const FORM_STEP_ROUTE_PATTERN = /^\/w\/[^/]+\/steps\/[^/?#]+(?:[/?#]|$)/;
const EDITABLE_FIELD_SELECTOR = [
  "textarea",
  'input:not([type="hidden"])',
  "select",
  ".ProseMirror",
  '[contenteditable=""]',
  '[contenteditable="true"]',
  ".d-editor-input",
  ".d-editor-textarea-wrapper textarea",
].join(", ");

let intendedScrollY = 0;
let originalHTMLElementFocus;
let allowNextEditableFocus = false;
let manualEditableFocusUnlocked = false;

function isFormStepRoute(url = window.location.pathname) {
  return FORM_STEP_ROUTE_PATTERN.test(url || "");
}

function isEditableFieldOrChild(element) {
  return element?.closest?.(EDITABLE_FIELD_SELECTOR);
}

function shouldPreventComposerFocus() {
  return (
    isFormStepRoute() &&
    !manualEditableFocusUnlocked &&
    !allowNextEditableFocus
  );
}

function isBlockedAutofocusTarget(field) {
  return field?.matches?.(EDITABLE_FIELD_SELECTOR);
}

function removeAutofocusAttributes(root = document) {
  if (!isFormStepRoute()) {
    return;
  }

  if (root.matches?.("[autofocus]")) {
    root.removeAttribute("autofocus");
  }

  root.querySelectorAll?.("[autofocus]").forEach((element) => {
    element.removeAttribute("autofocus");
  });
}

function blurComposerField(field) {
  if (!isBlockedAutofocusTarget(field)) {
    return;
  }

  field.blur();

  if (Math.abs(window.scrollY - intendedScrollY) > 8) {
    window.scrollTo({ top: intendedScrollY, behavior: "auto" });
  }
}

function blurActiveComposerField() {
  if (!shouldPreventComposerFocus()) {
    return;
  }

  blurComposerField(document.activeElement);
}

function installFocusOverride() {
  if (originalHTMLElementFocus) {
    return;
  }

  originalHTMLElementFocus = HTMLElement.prototype.focus;

  HTMLElement.prototype.focus = function focusOverride(...args) {
    if (
      shouldPreventComposerFocus() &&
      isBlockedAutofocusTarget(this)
    ) {
      return;
    }

    return originalHTMLElementFocus.apply(this, args);
  };
}

export default apiInitializer((api) => {
  installFocusOverride();
  document.addEventListener(
    "pointerdown",
    (event) => {
      allowNextEditableFocus = Boolean(isEditableFieldOrChild(event.target));
    },
    true
  );

  document.addEventListener(
    "keydown",
    (event) => {
      allowNextEditableFocus = event.key === "Tab";
    },
    true
  );

  document.addEventListener(
    "focusin",
    (event) => {
      if (!isBlockedAutofocusTarget(event.target)) {
        allowNextEditableFocus = false;
        return;
      }

      if (isFormStepRoute() && allowNextEditableFocus) {
        manualEditableFocusUnlocked = true;
        allowNextEditableFocus = false;
        return;
      }

      if (
        !shouldPreventComposerFocus() ||
        manualEditableFocusUnlocked
      ) {
        return;
      }

      blurComposerField(event.target);
    },
    true
  );

  const observer = new MutationObserver(() => {
    removeAutofocusAttributes();
    blurActiveComposerField();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  api.onPageChange((url) => {
    allowNextEditableFocus = false;
    manualEditableFocusUnlocked = false;

    if (!isFormStepRoute(url)) {
      return;
    }

    intendedScrollY = window.scrollY;
    removeAutofocusAttributes();
    blurActiveComposerField();
  });

  if (isFormStepRoute()) {
    allowNextEditableFocus = false;
    manualEditableFocusUnlocked = false;
    intendedScrollY = window.scrollY;
    removeAutofocusAttributes();
    blurActiveComposerField();
  }
});
