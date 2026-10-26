(() => {
  const q = document.querySelector('#work-search');
  const form = document.querySelector('#format-filter');
  let entries = [...document.querySelectorAll('.directory-entry')];
  const buttons = [...document.querySelectorAll('[data-category]')];
  const status = document.querySelector('#result-status');
  const heading = document.querySelector('#results-heading');
  const reset = document.querySelector('#reset-filters');
  const empty = document.querySelector('#no-results');
  let category = '';
  function render(save = true) {
    const term = q.value.trim().toLocaleLowerCase();
    let n = 0;
    for (const entry of entries) {
      const matches = (!category || entry.dataset.categoryId === category || entry.dataset.categoryId.startsWith(category + '/')) && (!form.value || entry.dataset.format === form.value) && (!term || entry.dataset.search.includes(term));
      entry.hidden = !matches;
      if (matches) n++;
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.category === category));
    const current = buttons.find(b => b.dataset.category === category);
    heading.textContent = category && current ? current.dataset.label : term || form.value ? '筛选结果' : '最近更新';
    status.textContent = `${n} 份作品`;
    empty.hidden = n > 0;
    empty.querySelector('p').textContent = term || form.value ? '试着缩短关键词，或清除筛选，看看其他作品。' : '这个分类还在等待第一份作品。也可以先看看目录里已有的作品。';
    reset.hidden = !category && !term && !form.value;
    if (save) {
      const url = new URL(location.href);
      url.search = '';
      if (category) url.searchParams.set('category', category);
      if (q.value) url.searchParams.set('q', q.value);
      if (form.value) url.searchParams.set('format', form.value);
      history.replaceState(null, '', url);
    }
  }
  function restore() {
    const params = new URLSearchParams(location.search);
    const requested = params.get('category') || '';
    category = buttons.some(b => b.dataset.category === requested) ? requested : '';
    q.value = params.get('q') || '';
    form.value = params.get('format') || '';
    render(false);
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.category;
    render();
    document.querySelector('#results').scrollIntoView({block: 'start', behavior: 'instant'});
  }));
  q.addEventListener('input', () => render());
  form.addEventListener('change', () => render());
  reset.addEventListener('click', () => {category = ''; q.value = ''; form.value = ''; render(); q.focus();});
  window.addEventListener('popstate', restore);
  restore();
  /* CLOUD_DIRECTORY */
})();
