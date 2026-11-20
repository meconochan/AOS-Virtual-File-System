
/* ============================================================
   ui.js — Shared UI Rendering Helpers

   Responsibilities:
   - Toast notifications
   - HTML escaping
   - Date formatting
   - File icons
   - Modal dialogs
   - Confirmation dialogs
   - Allocation badges
   ============================================================ */

const UI = (() => {

  /* ==========================================================
     TOAST NOTIFICATION
     ========================================================== */

  function toast(msg, kind = "") {
    const el = document.getElementById("toast");

    if (!el) {
      console.warn("Toast element was not found.");
      return;
    }

    el.textContent = String(msg ?? "");
    el.className = "toast show " + kind;

    clearTimeout(el._t);

    el._t = setTimeout(() => {
      el.className = "toast " + kind;
    }, 3200);
  }


  /* ==========================================================
     HTML ESCAPING
     Prevents user-entered text from being interpreted as HTML.
     ========================================================== */

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }


  /* ==========================================================
     DATE FORMATTING
     ========================================================== */

  function fmtDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "—";
    }

    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }


  /* ==========================================================
     FILE ICON
     ========================================================== */

  function glyph(file) {
    const extension = (file?.extension || "").toLowerCase();

    const icons = {
      txt: "📄",
      md: "📄",
      log: "📄",

      png: "🖼",
      jpg: "🖼",
      jpeg: "🖼",
      gif: "🖼",

      mp3: "🎵",
      wav: "🎵",

      mp4: "🎬",
      mov: "🎬",

      pdf: "📕",

      zip: "🗜",
      rar: "🗜",

      js: "⌨",
      py: "⌨",
      html: "⌨",
      css: "⌨",
      java: "⌨",
      cs: "⌨"
    };

    return icons[extension] || "📃";
  }


  /* ==========================================================
     MODAL DIALOG
     ========================================================== */

  function modal({
    title = "",
    body = "",
    footer = "",
    wide = false,
    closeOnBackdrop = true
  } = {}) {

    const root = document.getElementById("modalRoot");

    if (!root) {
      console.error("Modal root element was not found.");
      return null;
    }

    root.innerHTML = `
      <div
        class="modal ${wide ? "wide" : ""}"
        role="dialog"
        aria-modal="true"
        aria-label="${esc(title)}"
      >
        <div class="modal-head">
          <h3>${esc(title)}</h3>

          <button
            class="x-btn"
            type="button"
            data-close
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>

        <div class="modal-body">
          ${body}
        </div>

        ${
          footer
            ? `<div class="modal-foot">${footer}</div>`
            : ""
        }
      </div>
    `;

    root.classList.remove("hidden");

    // Close button handlers.
    root.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", closeModal);
    });

    // Close when clicking outside the modal.
    root.onclick = event => {
      if (closeOnBackdrop && event.target === root) {
        closeModal();
      }
    };

    // Focus the first usable input or button.
    const firstInput = root.querySelector(
      "input:not([type='hidden']), textarea, select, button"
    );

    if (firstInput) {
      firstInput.focus();
    }

    return root;
  }


  /* ==========================================================
     CLOSE MODAL
     ========================================================== */

  function closeModal() {
    const root = document.getElementById("modalRoot");

    if (!root) return;

    root.classList.add("hidden");
    root.innerHTML = "";
    root.onclick = null;
  }


  /* ==========================================================
     CONFIRMATION DIALOG
     ========================================================== */

  function confirmDialog(
    title,
    message,
    onYes,
    yesLabel = "Delete"
  ) {

    const root = modal({
      title,

      body: `
        <p style="font-size:13.5px;color:var(--ink-soft)">
          ${esc(message)}
        </p>
      `,

      footer: `
        <button
          class="btn"
          type="button"
          data-close
        >
          Cancel
        </button>

        <button
          class="btn btn-danger"
          type="button"
          id="confirmYes"
        >
          ${esc(yesLabel)}
        </button>
      `
    });

    if (!root) return;

    const confirmButton = root.querySelector("#confirmYes");

    if (confirmButton) {
      confirmButton.addEventListener("click", () => {
        closeModal();

        if (typeof onYes === "function") {
          onYes();
        }
      });
    }
  }


  /* ==========================================================
     ALLOCATION TYPE BADGE
     ========================================================== */

  function allocBadge(type) {
    const colors = {
      Contiguous: "blue",
      Linked: "green",
      Indexed: "amber"
    };

    const color = colors[type] || "grey";

    return `
      <span class="badge ${color}">
        ${esc(type || "—")}
      </span>
    `;
  }


  /* ==========================================================
     PUBLIC METHODS
     ========================================================== */

  return {
    toast,
    esc,
    fmtDate,
    glyph,
    modal,
    closeModal,
    confirmDialog,
    allocBadge
  };

})();


/* ============================================================
   KEYBOARD SUPPORT
   Press Escape to close an open modal.
   ============================================================ */

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    const root = document.getElementById("modalRoot");

    if (root && !root.classList.contains("hidden")) {
      UI.closeModal();
    }
  }
});


/* ============================================================
   ES MODULE EXPORT
   ============================================================ */

export default UI;
