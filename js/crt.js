/* Экран старого телевизора поверх сайта: зерно, полоса трекинга и редкий сбой картинки.
   Строки развёртки и тёмные края заданы в CSS (.crt::before и .crt::after). */
(() => {
  'use strict';

  const root = document.documentElement;
  const grain = document.getElementById('grain');
  const band = document.querySelector('.crt__band');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // зерно: несколько заранее нарисованных плиток шума, которые быстро сменяют друг друга
  if (grain) {
    const tiles = Array.from({ length: 4 }, () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const img = g.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return `url(${c.toDataURL()})`;
    });
    let n = 0;
    setInterval(() => {
      if (document.hidden || root.classList.contains('crt-off')) return;
      n = (n + 1) % tiles.length;
      grain.style.backgroundImage = tiles[n];
      grain.style.backgroundPosition = `${(Math.random() * 256) | 0}px ${(Math.random() * 256) | 0}px`;
    }, 80);
  }

  // полоса трекинга проходит сверху вниз раз в 6–14 секунд
  const later = (fn, a, b) => setTimeout(fn, a + Math.random() * (b - a));
  function passBand() {
    if (band && !document.hidden && !root.classList.contains('crt-off')) {
      band.style.setProperty('--band-time', `${(1.8 + Math.random() * 1.6).toFixed(2)}s`);
      band.classList.remove('is-run');
      void band.offsetWidth;                           // перезапуск анимации
      band.classList.add('is-run');
    }
    later(passBand, 6000, 14000);
  }
  later(passBand, 1500, 4000);

  // сбой: экран дёргается, цветная кайма у букв разъезжается
  function glitch() {
    if (!document.hidden && !root.classList.contains('crt-off')) {
      root.classList.add('crt-glitch');
      setTimeout(() => root.classList.remove('crt-glitch'), 300);
    }
    later(glitch, 9000, 22000);
  }
  later(glitch, 5000, 9000);
})();
