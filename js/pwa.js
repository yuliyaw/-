/*
 * Второй голос — установка на телефон: сервис-воркер, кнопка «Установить»,
 * подсказки для iPhone и Android, предложение обновиться.
 * Подключается только в обычной веб-версии (в Claude этот файл не входит).
 */
(function () {
  'use strict';

  const inApp = /VtoroyGolosApp/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(navigator.userAgent);
  if (inApp) document.documentElement.classList.add('in-app');

  let deferred = null;
  let reloading = false;
  let wantReload = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------- Работа без интернета и обновления ----------
  if ('serviceWorker' in navigator && secure && !inApp) {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        const offer = (worker) => {
          if (document.getElementById('update-bar')) return;
          const bar = el('div', 'update-bar');
          bar.id = 'update-bar';
          bar.setAttribute('role', 'status');
          bar.appendChild(el('span', null, 'Есть новая версия программы.'));
          const b = el('button', 'btn btn-small btn-primary', 'Обновить');
          b.type = 'button';
          b.addEventListener('click', () => {
            wantReload = true;
            worker.postMessage('skipWaiting');
          });
          bar.appendChild(b);
          document.body.appendChild(bar);
        };
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (!w) return;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!wantReload || reloading) return;
      reloading = true;
      location.reload();
    });
  }

  // ---------- Карточка «Установить на телефон» ----------
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    render();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    const card = document.getElementById('install-card');
    if (card) card.remove();
  });

  function render() {
    if (inApp || standalone || !secure) return;
    const grid = document.querySelector('#view-home .home-grid');
    if (!grid) return;
    let card = document.getElementById('install-card');
    if (!card) {
      card = el('section', 'panel install-card');
      card.id = 'install-card';
      card.setAttribute('aria-labelledby', 'install-title');
      grid.appendChild(card);
    }
    card.textContent = '';
    const h = el('h2', null, 'Установить на телефон');
    h.id = 'install-title';
    card.appendChild(h);
    card.appendChild(el('p', null, 'Программа ставится как обычное приложение: значок на экране, полный экран, работает без интернета. Дневник занятий сохранится.'));
    if (deferred) {
      const b = el('button', 'btn btn-primary', 'Установить');
      b.type = 'button';
      b.addEventListener('click', async () => {
        const d = deferred;
        deferred = null;
        d.prompt();
        try {
          await d.userChoice;
        } catch (err) {
          /* пользователь закрыл окно */
        }
        render();
      });
      card.appendChild(b);
    }
    const list = el('ul', 'help-list');
    if (isIOS || !isAndroid) {
      list.appendChild(el('li', null, 'iPhone и iPad: откройте эту страницу в Safari, нажмите «Поделиться» (квадрат со стрелкой вверх), выберите «На экран „Домой“» и нажмите «Добавить».'));
    }
    if (isAndroid || !isIOS) {
      list.appendChild(el('li', null, 'Android: в Chrome нажмите меню ⋮ вверху справа и выберите «Установить приложение» или «Добавить на главный экран».'));
    }
    card.appendChild(list);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(render, 0));
  else setTimeout(render, 0);
})();
