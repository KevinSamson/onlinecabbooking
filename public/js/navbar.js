document.addEventListener("DOMContentLoaded", () => {
  const user = CabAPI.user();
  const path = location.pathname === "/" ? "/index.html" : location.pathname;
  const menu = document.querySelector(".nav-links");
  const actions = document.querySelector("[data-nav-auth]");

  const linksByRole = {
    public: [
      { label: "Home", href: "/", paths: ["/index.html"] },
      { label: "Why Aster", href: "/#features", paths: [] },
      {
        label: "Drive with us",
        href: "/register.html",
        paths: ["/register.html"],
      },
    ],
    passenger: [
      {
        label: "Dashboard",
        href: "/passenger-dashboard.html",
        paths: ["/passenger-dashboard.html", "/preferred-drivers.html"],
      },
      {
        label: "Book ride",
        href: "/book-ride.html",
        paths: ["/book-ride.html", "/compare-fares.html"],
      },
      {
        label: "Ride history",
        href: "/ride-history.html",
        paths: ["/ride-history.html"],
      },
      {
        label: "Safety",
        href: "/emergency-contacts.html",
        paths: ["/emergency-contacts.html", "/track-ride.html", "/sos.html"],
      },
      {
        label: "Fare split",
        href: "/split-fare.html",
        paths: ["/split-fare.html", "/join-split.html"],
      },
      {
        label: "Lost & Found",
        href: "/lost-found.html",
        paths: ["/lost-found.html"],
      },
    ],
    driver: [
      {
        label: "Dashboard",
        href: "/driver-dashboard.html",
        paths: ["/driver-dashboard.html"],
      },
      {
        label: "Vehicles",
        href: "/driver-vehicles.html",
        paths: ["/driver-vehicles.html", "/daily-vehicle.html"],
      },
      {
        label: "Requests",
        href: "/ride-requests.html",
        paths: ["/ride-requests.html"],
      },
      {
        label: "Active trip",
        href: "/active-trip.html",
        paths: ["/active-trip.html", "/track-ride.html"],
      },
      {
        label: "Earnings",
        href: "/driver-earnings.html",
        paths: ["/driver-earnings.html"],
      },
      {
        label: "Verification",
        href: "/driver-verification.html",
        paths: ["/driver-verification.html"],
      },
    ],
    admin: [
      {
        label: "Dashboard",
        href: "/admin-dashboard.html",
        paths: ["/admin-dashboard.html"],
      },
      {
        label: "Drivers",
        href: "/admin-drivers.html",
        paths: ["/admin-drivers.html"],
      },
      {
        label: "Passengers",
        href: "/admin-passengers.html",
        paths: ["/admin-passengers.html"],
      },
      {
        label: "Verifications",
        href: "/admin-verifications.html",
        paths: ["/admin-verifications.html"],
      },
      {
        label: "Care desk",
        href: "/admin-care-desk.html",
        paths: ["/admin-care-desk.html"],
      },
    ],
  };

  const dashboard = {
    passenger: "/passenger-dashboard.html",
    driver: "/driver-dashboard.html",
    admin: "/admin-dashboard.html",
  };
  const role = user && dashboard[user.role] ? user.role : "public";

  if (menu) {
    const links = linksByRole[role].map(({ label, href, paths }) => {
      const active = paths.includes(path);
      return /* HTML */ `
        <a
          href="${href}"
          ${active ? ' class="active" aria-current="page"' : ""}
        >
          ${label}
        </a>
      `;
    });

    if (user && dashboard[user.role]) {
      links.push(
        '<button type="button" class="mobile-auth nav-logout" data-logout>Sign out</button>',
      );
    } else {
      links.push('<a class="mobile-auth" href="/login.html">Sign in</a>');
      links.push(
        '<a class="mobile-auth" href="/register.html">Get started</a>',
      );
    }
    menu.innerHTML = links.join("");
  }

  if (actions) {
    actions.innerHTML =
      user && dashboard[user.role]
        ? /* HTML */ `
            <a class="btn btn-outline-light" href="${dashboard[user.role]}">
              My space
            </a>
            <button type="button" class="btn btn-primary" data-logout>
              Sign out
            </button>
          `
        : '<a class="btn btn-outline-light" href="/login.html">Sign in</a><a class="btn btn-primary" href="/register.html">Get started</a>';
  }

  document.querySelectorAll(".side-link[href]").forEach((link) => {
    if (new URL(link.href).pathname === path) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", CabAPI.logout);
  });

  document.querySelectorAll("[data-menu-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const open = menu?.classList.toggle("open") || false;
      document.querySelector(".sidebar")?.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
  });

  const userChip = document.querySelector("[data-user-chip]");
  if (userChip && user) {
    userChip.innerHTML = /* HTML */ `
      <div class="avatar">${escapeHTML(user.full_name[0].toUpperCase())}</div>
      <span>${escapeHTML(user.full_name)}</span>
    `;
  }

  window.lucide?.createIcons();
});
