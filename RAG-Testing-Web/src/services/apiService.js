const API_URL = 'https://regenx-api-232745515787.asia-southeast1.run.app';

export async function testQdrant() {
    try {
        const response = await fetch(`${API_URL}/health`, { method: 'GET' });
        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch (e) {
            data = { error: 'Failed to parse response', text: text.substring(0, 200) };
        }

        console.log('System status response:', data);
        return { success: response.ok, status: response.status, data, timestamp: new Date().toISOString() };
    } catch (error) {
        console.error('Error testing system status:', error);
        return { success: false, error: error.message };
    }
}

export async function testConversationHistory(id, currentConversationId) {
    try {
        const response = await fetch(`${API_URL}/api/chat/debug-conversation/${id || currentConversationId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            data = { error: 'Failed to parse response', text: text.substring(0, 200) };
        }

        console.log('Conversation debug data:', data);
        return data;
    } catch (error) {
        console.error('Error testing conversation history:', error);
        return { error: error.message };
    }
}
