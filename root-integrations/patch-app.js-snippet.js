// Optional: Single handler for nav tiles (if you prefer SPA-like routing)
document.addEventListener('click', (e)=>{
  const tile = e.target.closest('[data-route="encounters"]');
  if(!tile) return;
  // Navigate to the /encounters/ module
  window.location.href = 'encounters/';
});
