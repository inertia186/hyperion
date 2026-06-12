export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function revisionDetail(revision) {
  const parts = [];
  if (revision.published_at) parts.push(revision.published_at);
  if (revision.block_num) parts.push(`block ${revision.block_num}`);
  return parts.length > 0 ? parts.join(' · ') : 'No chain metadata';
}

export function lineDiff(before, after) {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const table = Array.from({length: beforeLines.length + 1}, () => Array(afterLines.length + 1).fill(0));

  for (let i = beforeLines.length - 1; i >= 0; i--) {
    for (let j = afterLines.length - 1; j >= 0; j--) {
      table[i][j] = beforeLines[i] === afterLines[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const diff = [];
  let i = 0;
  let j = 0;
  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      diff.push({type: 'same', prefix: ' ', text: beforeLines[i], number: j + 1});
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      diff.push({type: 'removed', prefix: '-', text: beforeLines[i], number: i + 1});
      i++;
    } else {
      diff.push({type: 'added', prefix: '+', text: afterLines[j], number: j + 1});
      j++;
    }
  }

  while (i < beforeLines.length) {
    diff.push({type: 'removed', prefix: '-', text: beforeLines[i], number: i + 1});
    i++;
  }

  while (j < afterLines.length) {
    diff.push({type: 'added', prefix: '+', text: afterLines[j], number: j + 1});
    j++;
  }

  return diff;
}

export function renderCodeRevision(revision) {
  return `
      <section class="border rounded bg-dark text-light">
        <pre class="m-0 p-3 overflow-auto" style="max-height: 65vh;"><code>${escapeHtml(revision.body || '')}</code></pre>
      </section>
    `;
}

export function renderCodeDiff(previousRevision, currentRevision) {
  const rows = lineDiff(previousRevision.body || '', currentRevision.body || '').map((line) => {
    const rowClass = line.type === 'added' ? 'bg-success text-white' : line.type === 'removed' ? 'bg-danger text-white' : 'text-light';
    return `<div class="d-flex ${rowClass}"><span class="text-right text-monospace px-2 text-muted" style="width: 4rem;">${line.number || ''}</span><code class="text-monospace flex-fill px-2" style="white-space: pre-wrap;">${escapeHtml(line.prefix + line.text)}</code></div>`;
  }).join('');

  return `
      <section class="border rounded bg-dark overflow-hidden">
        <div class="row no-gutters border-bottom border-secondary text-light small">
          <div class="col-sm-6 border-right border-secondary p-2">
            <strong>${escapeHtml(previousRevision.label || 'Before')}</strong>
            <div class="text-muted">${escapeHtml(revisionDetail(previousRevision))}</div>
          </div>
          <div class="col-sm-6 p-2">
            <strong>${escapeHtml(currentRevision.label || 'After')}</strong>
            <div class="text-muted">${escapeHtml(revisionDetail(currentRevision))}</div>
          </div>
        </div>
        <div class="overflow-auto" style="max-height: 65vh;">${rows}</div>
      </section>
    `;
}

export function diffPairOptions(revisions, pairIndex) {
  const pairCount = revisions.length - 1;
  if (pairCount <= 1) return '';

  return `<select class="custom-select custom-select-sm w-auto" data-action="posts#diffPairChanged">${Array.from({length: pairCount}, (_item, index) => {
    const selected = index === pairIndex ? ' selected' : '';
    return `<option value="${index}"${selected}>${escapeHtml(revisions[index].label)} -&gt; ${escapeHtml(revisions[index + 1].label)}</option>`;
  }).join('')}</select>`;
}

export function normalizePairIndex(revisions, selectedIndex = null) {
  const pairCount = revisions.length - 1;
  const pairIndex = selectedIndex === null || Number.isNaN(selectedIndex) ? pairCount - 1 : selectedIndex;
  return Math.min(Math.max(pairIndex, 0), pairCount - 1);
}

