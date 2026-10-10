const descriptions = {
  edition: 'An open form with warm paper tones and simple rules.',
  orbit: 'A floating card beside a quiet orbital illustration.',
  workbench: 'A compact form with a single column of wallet buttons.',
  commonroom: 'A rounded, centered card with warm colors and a soft shadow.',
  signal: 'A split panel with a bright accent and square edges.'
};
const parameters = new URLSearchParams(location.search);
const initialLayout = Object.hasOwn(descriptions, parameters.get('layout')) ? parameters.get('layout') : 'edition';
const initialTheme = ['light', 'dark'].includes(parameters.get('theme')) ? parameters.get('theme') : 'system';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');

function updateTheme() {
  const preference = document.querySelector('#theme')?.value || initialTheme;
  const effective = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = effective;
  document.documentElement.style.colorScheme = effective;
  const status = document.querySelector('#system-status');
  if (status) status.textContent = preference === 'system' ? `System: ${effective}` : `${effective === 'dark' ? 'Dark' : 'Light'} preview`;
}
updateTheme();

document.addEventListener('DOMContentLoaded', () => {
  const theme = document.querySelector('#theme');
  theme.value = initialTheme;
  const choices = [...document.querySelectorAll('[data-layout]')];
  function updateUrl() {
    const url = new URL(location.href);
    url.searchParams.set('layout', document.querySelector('[data-layout][aria-pressed="true"]').dataset.layout);
    if (theme.value === 'system') url.searchParams.delete('theme');
    else url.searchParams.set('theme', theme.value);
    history.replaceState(null, '', url);
  }
  function showLayout(layout) {
    document.querySelectorAll('.concept').forEach(section => { section.hidden = section.id !== layout; });
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.layout === layout)));
    document.querySelector('#design-description').textContent = descriptions[layout];
    document.title = `Hyperion · ${layout[0].toUpperCase() + layout.slice(1)} login`;
    updateUrl();
  }
  choices.forEach(button => button.addEventListener('click', () => showLayout(button.dataset.layout)));
  theme.addEventListener('change', () => { updateTheme(); updateUrl(); });
  systemTheme.addEventListener('change', updateTheme);

  const template = document.querySelector('#login-form-template');
  document.querySelectorAll('.form-mount').forEach(mount => {
    mount.append(template.content.cloneNode(true));
    const input = mount.querySelector('input');
    input.id = `account-${mount.dataset.form}`;
    mount.querySelector('label').htmlFor = input.id;
    mount.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const feedback = mount.querySelector('.preview-feedback');
      feedback.textContent = 'This is a layout preview. Your wallet has not been opened.';
      feedback.hidden = false;
    });
  });
  showLayout(initialLayout);
  updateTheme();
});
