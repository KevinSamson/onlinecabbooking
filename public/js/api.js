window.CabAPI = {
  token: () => localStorage.getItem("cab_token"),
  user: () => {
    try {
      return JSON.parse(localStorage.getItem("cab_user"));
    } catch {
      return null;
    }
  },
  save: ({ token, user }) => {
    localStorage.setItem("cab_token", token);
    localStorage.setItem("cab_user", JSON.stringify(user));
  },
  logout: () => {
    localStorage.removeItem("cab_token");
    localStorage.removeItem("cab_user");
    location.href = "/login.html";
  },
  async request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (CabAPI.token()) headers.Authorization = `Bearer ${CabAPI.token()}`;
    if (options.body && !(options.body instanceof FormData))
      headers["Content-Type"] = "application/json";
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      body:
        options.body instanceof FormData
          ? options.body
          : options.body
            ? JSON.stringify(options.body)
            : undefined,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error("Server returned an unreadable response.");
    }
    if (!response.ok || !result.success)
      throw new Error(result.message || "Request failed.");
    return result.data;
  },
};
window.escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
window.toast = (message, type = "success") => {
  const stack =
    document.querySelector(".toast-stack") ||
    Object.assign(document.body.appendChild(document.createElement("div")), {
      className: "toast-stack",
    });
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.append(el);
  setTimeout(() => el.remove(), 4000);
};
window.setBusy = (button, busy, label = "Working…") => {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = /* HTML */ `
      <i data-lucide="loader-circle"></i>
      ${label}
    `;
  } else {
    button.disabled = false;
    button.innerHTML = button.dataset.oldText || button.innerHTML;
  }
  window.lucide?.createIcons();
};
window.confirmAction = (title, message, actionLabel = "Confirm") =>
  new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = /* HTML */ `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${escapeHTML(title)}</h3>
        <p class="muted">${escapeHTML(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-result="cancel">Cancel</button>
          <button class="btn btn-danger" data-result="confirm">
            ${escapeHTML(actionLabel)}
          </button>
        </div>
      </div>
    `;
    const finish = (answer) => {
      overlay.remove();
      resolve(answer);
    };
    overlay.addEventListener("click", (event) => {
      if (
        event.target === overlay ||
        event.target.closest('[data-result="cancel"]')
      )
        finish(false);
      else if (event.target.closest('[data-result="confirm"]')) finish(true);
    });
    document.body.append(overlay);
    overlay.querySelector('[data-result="cancel"]').focus();
  });
window.promptAction = (title, message, actionLabel = "Save") =>
  new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-backdrop";
    overlay.innerHTML = /* HTML */ `
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${escapeHTML(title)}</h3>
        <p class="muted">${escapeHTML(message)}</p>
        <label class="form-group">
          <span>Reason</span>
          <textarea
            class="input"
            rows="3"
            maxlength="500"
            placeholder="Enter a clear reason"
            required
          ></textarea>
        </label>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-result="cancel">
            Cancel
          </button>
          <button class="btn btn-primary" type="button" data-result="confirm">
            ${escapeHTML(actionLabel)}
          </button>
        </div>
      </div>
    `;
    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.addEventListener("click", (event) => {
      if (
        event.target === overlay ||
        event.target.closest('[data-result="cancel"]')
      )
        finish(null);
      else if (event.target.closest('[data-result="confirm"]')) {
        const value = overlay.querySelector("textarea").value.trim();
        if (value) finish(value);
        else overlay.querySelector("textarea").focus();
      }
    });
    document.body.append(overlay);
    overlay.querySelector("textarea").focus();
  });
