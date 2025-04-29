// utils/state.js
let currentImageUrl = null;

export function getCurrentImageUrl() {
    return currentImageUrl;
}

export function setCurrentImageUrl(url) {
    currentImageUrl = url;
}
