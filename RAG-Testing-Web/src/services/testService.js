export async function testSupabaseUpload(supabase, uploadImage, currentImageUrl) {
    console.log('Testing Supabase upload...');

    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const byteString = atob(base64Data);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const uint8Array = new Uint8Array(arrayBuffer);
    
    for (let i = 0; i < byteString.length; i++) {
        uint8Array[i] = byteString.charCodeAt(i);
    }

    const blob = new Blob([uint8Array], { type: 'image/png' });
    const file = new File([blob], 'test-image.png', { type: 'image/png' });

    console.log('Test file created:', file);

    try {
        const testFileName = `test/test-${Date.now()}.png`;
        console.log(`Uploading test file to ${testFileName}...`);

        const { data, error } = await supabase.storage
            .from('crop-images')
            .upload(testFileName, file);

        if (error) throw new Error(`Upload test failed: ${error.message}`);

        console.log('Upload succeeded:', data);

        const urlResult = supabase.storage
            .from('crop-images')
            .getPublicUrl(testFileName);

        if (!urlResult?.data?.publicUrl) throw new Error('Could not generate public URL');

        console.log('Testing full upload function...');
        await uploadImage(file);

        return { success: true, directUrl: urlResult.data.publicUrl, functionalUrl: currentImageUrl };
    } catch (err) {
        console.error('Test failed:', err);
        return { success: false, error: err.message };
    }
}
