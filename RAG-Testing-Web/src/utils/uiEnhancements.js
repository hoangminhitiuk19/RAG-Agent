export function addTranslationNoticeStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .translation-notice {
            font-size: 0.8em;
            color: #666;
            text-align: center;
            margin: 5px 0;
            padding: 5px;
            background-color: rgba(255, 255, 200, 0.3);
            border-radius: 5px;
        }
        
        .translation-notice i {
            margin-right: 5px;
        }
    `;
    document.head.appendChild(style);
}
