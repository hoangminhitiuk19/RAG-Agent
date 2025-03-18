import { SUPABASE_URL } from '../config.js';
import { setCurrentImageUrl, getCurrentImageUrl, getUserId } from '../utils/state.js';

// Cache for image URLs
const imageCache = new Map();

export async function handleImageUpload(event, supabase) {
    console.log('Image upload triggered');
    const file = event.target.files[0];

    if (!file) {
        console.log('No file selected');
        return;
    }

    console.log('File selected:', file.name, file.type, file.size);
    await uploadImage(file, supabase);

    // Reset the file input so the same file can be selected again
    event.target.value = '';
}

export async function uploadImage(file, supabase) {
    const imagePreview = document.getElementById('image-preview');
    const userId = getUserId();
    
    // Show loading state
    imagePreview.innerHTML = '<div class="loading">Uploading...</div>';

    try {
        console.log('Starting image upload to Supabase...');
        
        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 10);
        const fileExtension = file.name.split('.').pop();
        const fileName = `${userId}/${timestamp}-${randomString}.${fileExtension}`;

        console.log('Generated filename:', fileName);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('crop-images')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            throw new Error(`Supabase upload error: ${error.message}`);
        }

        console.log('File uploaded successfully:', data);

        // Get public URL
        const { publicUrl } = supabase.storage
            .from('crop-images')
            .getPublicUrl(fileName).data;

        console.log('Public URL:', publicUrl);
        
        // Store URL in state and update UI
        setCurrentImageUrl(publicUrl);
        
        imagePreview.innerHTML = `
            <img src="${publicUrl}" class="preview-image" />
            <button class="remove-image" title="Remove image"><i class="fas fa-times"></i></button>
        `;

        document.querySelector('.remove-image').addEventListener('click', clearImagePreview);
        document.getElementById('send-button').disabled = false;

        console.log('Image upload complete and preview shown');

    } catch (error) {
        console.error('Error uploading image:', error);
        imagePreview.innerHTML = 'Upload failed. Please try again.';
        
        // Auto-hide error message
        setTimeout(() => {
            if (imagePreview.textContent === 'Upload failed. Please try again.') {
                imagePreview.innerHTML = '';
            }
        }, 3000);
    }
}

// Clear image preview
export function clearImagePreview() {
    document.getElementById('image-preview').innerHTML = '';
    setCurrentImageUrl(null);

    if (!document.getElementById('message-input').value.trim()) {
        document.getElementById('send-button').disabled = true;
    }
}

export async function retrieveSupabaseImage(imageUrl, supabase) {
    if (!imageUrl) return null;

    try {
        console.log('Attempting to retrieve image:', imageUrl);

        if (imageUrl.includes(SUPABASE_URL)) {
            const urlParts = imageUrl.split('/');
            const bucketName = 'crop-images';
            const bucketIndex = urlParts.findIndex(part => part === bucketName);

            if (bucketIndex !== -1 && bucketIndex < urlParts.length - 1) {
                const objectPath = urlParts.slice(bucketIndex + 1).join('/').split('?')[0];
                console.log('Extracted object path:', objectPath);

                const { data, error } = await supabase.storage
                    .from(bucketName)
                    .createSignedUrl(objectPath, 60);

                if (error) {
                    console.error('Error creating signed URL:', error);
                    return imageUrl;
                }

                return data.signedUrl || imageUrl;
            }
        }

        return imageUrl;
    } catch (error) {
        console.error('Error retrieving Supabase image:', error);
        return imageUrl;
    }
}

export async function getCachedImage(imageUrl, supabase) {
    if (!imageUrl) return null;

    if (imageCache.has(imageUrl)) {
        const cachedItem = imageCache.get(imageUrl);
        if (Date.now() - cachedItem.timestamp < 5 * 60 * 1000) {
            console.log('Image retrieved from cache:', imageUrl);
            return cachedItem.url;
        }
    }

    const freshUrl = await retrieveSupabaseImage(imageUrl, supabase);
    if (freshUrl) {
        imageCache.set(imageUrl, { url: freshUrl, timestamp: Date.now() });
    }

    return freshUrl;
}

export async function recoverImages(supabase) {
    console.log('Attempting to recover failed images...');
    const failedImages = document.querySelectorAll('.message-image.failed-image');
    let recoveredCount = 0;

    for (let i = 0; i < failedImages.length; i++) {
        const img = failedImages[i];
        const originalUrl = img.getAttribute('data-original-url');

        if (!originalUrl) continue;

        console.log(`Recovering image ${i + 1}/${failedImages.length}: ${originalUrl}`);

        try {
            const freshUrl = await retrieveSupabaseImage(originalUrl, supabase);

            if (freshUrl) {
                img.classList.remove('failed-image');
                img.onload = () => recoveredCount++;
                img.onerror = function () {
                    this.onerror = null;
                    this.src = 'data:image/svg+xml;base64,...'; // Placeholder SVG
                    this.classList.add('failed-image');
                };

                img.src = freshUrl.includes('?') ? `${freshUrl}&t=${Date.now()}` : `${freshUrl}?t=${Date.now()}`;
            }
        } catch (err) {
            console.error(`Error recovering image ${i + 1}:`, err);
        }
    }

    return `Recovery attempt complete. ${recoveredCount}/${failedImages.length} images recovered.`;
}