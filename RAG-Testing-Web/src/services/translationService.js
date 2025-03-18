export async function translateToEnglish(text, sourceLang = "auto") {
    if (!text.trim()) return { translatedText: text, originalText: text, wasTranslated: false };

    try {
        console.log(`Translating query from ${sourceLang} to English...`);
        const encodedText = encodeURIComponent(text);
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=en&dt=t&q=${encodedText}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Translation API error: ${response.status}`);

        const data = await response.json();
        if (data && data[0] && data[0][0]) {
            const translatedText = data[0][0][0];
            const isTranslationDifferent = translatedText.toLowerCase().trim() !== text.toLowerCase().trim();

            console.log(`Original: "${text}", Translated: "${translatedText}"`);
            return { translatedText, originalText: text, wasTranslated: isTranslationDifferent };
        }
        
        throw new Error("Unexpected translation API response format");
    } catch (error) {
        console.error('Translation error:', error);
        return { translatedText: text, originalText: text, wasTranslated: false };
    }
}
