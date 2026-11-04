document.addEventListener('DOMContentLoaded', () => {
  const user = CabAPI.user();
  const target = document.querySelector('[data-nav-auth]');
  if (target) target.innerHTML = user ? `<a class="btn btn-outline-light" href="${user.role === 'admin' ? '/admin-dashboard.html' : user.role === 'driver' ? '/driver-dashboard.html' : '/emergency-contacts.html'}">My space</a><button class="btn btn-primary" data-logout>Sign out</button>` : '<a class="btn btn-outline-light" href="/login.html">Sign in</a><a class="btn btn-primary" href="/register.html">Get started <i data-lucide="arrow-up-right"></i></a>';
  const mobileLinks = document.querySelector('.nav-links');
  if (mobileLinks) mobileLinks.insertAdjacentHTML('beforeend', user ? `<a class="mobile-auth" href="${user.role === 'admin' ? '/admin-dashboard.html' : user.role === 'driver' ? '/driver-dashboard.html' : '/emergency-contacts.html'}">My space</a><button class="mobile-auth nav-logout" data-logout>Sign out</button>` : '<a class="mobile-auth" href="/login.html">Sign in</a><a class="mobile-auth" href="/register.html">Get started</a>');
  document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', CabAPI.logout));
  document.querySelectorAll('[data-menu-toggle]').forEach(button => button.addEventListener('click', () => { document.querySelector('.nav-links')?.classList.toggle('open'); document.querySelector('.sidebar')?.classList.toggle('open'); }));
  const userChip = document.querySelector('[data-user-chip]');
  if (userChip && user) userChip.innerHTML = `<div class="avatar">${escapeHTML(user.full_name[0].toUpperCase())}</div><span>${escapeHTML(user.full_name)}</span>`;
  window.lucide?.createIcons();
});
