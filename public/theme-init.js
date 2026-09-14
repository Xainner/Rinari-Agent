document.documentElement.dataset.theme = 'dark';
document.documentElement.style.colorScheme = 'dark';
document.documentElement.dataset.accent = 'nebula';
try { if (localStorage.getItem('rinari.reduceMotion') === '1') document.documentElement.dataset.motion = 'reduced'; } catch (_) {}
