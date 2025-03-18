const APP_VERSION = '1.0.0';

export function preventCaching() {
    if (localStorage.getItem('last-app-update') !== APP_VERSION) {
        console.log('New version detected. Clearing cache...');
        localStorage.setItem('last-app-update', APP_VERSION);

        if ('caches' in window) {
            caches.keys().then((names) => {
                names.forEach((name) => caches.delete(name));
            });
        }
    }
}
