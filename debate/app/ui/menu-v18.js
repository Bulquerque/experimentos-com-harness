/* Contraponto 18 — Navegação progressiva da interface.
 * Nada aqui chama o Harness, a NVIDIA ou interfere no avanço do roteiro.
 */
(() => {
  const sideDrawers = [...document.querySelectorAll('.setup > details.config-drawer')];
  const speedMenu = document.querySelector('.offline-preferences');

  // Um painel de configuração aberto por vez evita um menu excessivamente longo.
  for (const drawer of sideDrawers) {
    drawer.addEventListener('toggle', () => {
      if (!drawer.open) return;
      for (const other of sideDrawers) if (other !== drawer) other.open = false;
    });
  }

  // O menu flutuante de velocidade fecha ao clicar fora ou pressionar Escape.
  document.addEventListener('pointerdown', event => {
    if (speedMenu?.open && !speedMenu.contains(event.target)) speedMenu.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (speedMenu?.open) { speedMenu.open = false; speedMenu.querySelector('summary')?.focus(); }
  });
})();
