import { PRESETS, GROUP_ORDER } from './presets.js';

const gallery = document.getElementById('orbitGallery');

for (const group of GROUP_ORDER) {
  const section = document.createElement('div');
  section.className = 'orbit-section';
  section.textContent = group;
  gallery.appendChild(section);

  for (const p of PRESETS) {
    if (p.group !== group) continue;
    const item = document.createElement('div');
    item.className = 'orbit-item';
    item.dataset.key = p.key;

    const name = document.createElement('div');
    name.className = 'orbit-name';
    name.textContent = p.name;

    const desc = document.createElement('div');
    desc.className = 'orbit-desc';
    desc.textContent = p.desc || '';

    const cite = document.createElement('div');
    cite.className = 'orbit-cite';
    cite.textContent = p.cite || '';

    item.append(name, desc, cite);
    item.addEventListener('click', () => {
      location.href = 'index.html?preset=' + encodeURIComponent(p.key);
    });
    gallery.appendChild(item);
  }
}
