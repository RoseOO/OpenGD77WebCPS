// Register OpenGD77 CPS (standalone) Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(registration => {
        console.log('OpenGD77 CPS (standalone) SW registered:', registration.scope);

        // Check for a new build now and whenever the tab becomes visible again
        // (browsers otherwise only poll the SW script about once a day).
        const checkForUpdate = () => registration.update().catch(() => {});
        checkForUpdate();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') checkForUpdate();
        });

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              if (confirm('A new version of OpenGD77 CPS (standalone) is available. Reload to update?')) {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
              }
            }
          });
        });
      })
      .catch(error => {
        console.error('OpenGD77 CPS (standalone) SW registration failed:', error);
      });
  });
}
