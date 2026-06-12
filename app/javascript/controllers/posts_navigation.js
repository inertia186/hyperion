export function postIdFromRow(row) {
  return row?.dataset?.postsIdValue || row?.getAttribute?.('data-posts-id-value') || null;
}

export function postActionLink(row, action, documentRef = document) {
  const postId = postIdFromRow(row);
  if (!postId) return null;

  return documentRef.getElementById(`#${action}-${postId}`);
}

export function adjacentPostActionLink(row, direction, action, documentRef = document) {
  const targetRow = direction < 0 ? row?.previousElementSibling : row?.nextElementSibling;
  return postActionLink(targetRow, action, documentRef);
}

export function focusLink(link) {
  if (link) link.focus();
}

export function focusAndClickLink(link) {
  if (!link) return;

  link.focus();
  link.click();
}
