document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const backBtn = document.getElementById('backBtn');
    const apiKeyInput = document.getElementById('apiKey');
    const saveBtn = document.getElementById('saveBtn');
    const testBtn = document.getElementById('testBtn');
    const statusMessage = document.getElementById('statusMessage');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    
    // Preferences
    const autoResizeCheckbox = document.getElementById('autoResize');
    const showHistoryCheckbox = document.getElementById('showHistory');
    const enableNotificationsCheckbox = document.getElementById('enableNotifications');
    
    // Data management
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const exportDataBtn = document.getElementById('exportDataBtn');
    const importDataBtn = document.getElementById('importDataBtn');
    
    // State
    let isTesting = false;
    
    // Initialize
    loadSettings();
    
    // Event listeners
    backBtn.addEventListener('click', goBack);
    saveBtn.addEventListener('click', saveSettings);
    testBtn.addEventListener('click', testApiKey);
    clearHistoryBtn.addEventListener('click', clearHistory);
    exportDataBtn.addEventListener('click', exportData);
    importDataBtn.addEventListener('click', importData);
    
    // Auto-save on input change
    apiKeyInput.addEventListener('input', debounce(validateApiKey, 500));
    
    async function loadSettings() {
        try {
            const result = await chrome.storage.local.get([
                'geminiApiKey',
                'autoResize',
                'showHistory',
                'enableNotifications'
            ]);
            
            apiKeyInput.value = result.geminiApiKey || '';
            autoResizeCheckbox.checked = result.autoResize !== false;
            showHistoryCheckbox.checked = result.showHistory !== false;
            enableNotificationsCheckbox.checked = result.enableNotifications !== false;
            
            if (result.geminiApiKey) {
                validateApiKey();
            }
        } catch (error) {
            showStatus('Error loading settings: ' + error.message, 'error');
        }
    }
    
    async function saveSettings() {
        try {
            const settings = {
                geminiApiKey: apiKeyInput.value.trim(),
                autoResize: autoResizeCheckbox.checked,
                showHistory: showHistoryCheckbox.checked,
                enableNotifications: enableNotificationsCheckbox.checked
            };
            
            await chrome.storage.local.set(settings);
            showStatus('Settings saved successfully!', 'success');
            
            // Update API key status
            if (settings.geminiApiKey) {
                validateApiKey();
            }
        } catch (error) {
            showStatus('Error saving settings: ' + error.message, 'error');
        }
    }
    
    async function testApiKey() {
        if (isTesting) return;
        
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            showStatus('Please enter an API key first', 'error');
            return;
        }
        
        isTesting = true;
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        
        try {
            // Test with a simple API call
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: "Hello, this is a test message." }]
                    }],
                    generationConfig: {
                        maxOutputTokens: 10,
                    }
                })
            });
            
            if (response.ok) {
                showStatus('API key is valid!', 'success');
                updateApiKeyStatus('valid', 'API key is working');
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Invalid API key'}`);
            }
        } catch (error) {
            showStatus('API key test failed: ' + error.message, 'error');
            updateApiKeyStatus('invalid', 'API key is invalid');
        } finally {
            isTesting = false;
            testBtn.disabled = false;
            testBtn.textContent = 'Test API Key';
        }
    }
    
    async function validateApiKey() {
        const apiKey = apiKeyInput.value.trim();
        
        if (!apiKey) {
            apiKeyStatus.style.display = 'none';
            return;
        }
        
        // Basic validation
        if (apiKey.length < 20) {
            updateApiKeyStatus('invalid', 'API key too short');
            return;
        }
        
        if (!apiKey.startsWith('AIza')) {
            updateApiKeyStatus('unknown', 'API key format unknown');
            return;
        }
        
        updateApiKeyStatus('unknown', 'Not tested yet');
    }
    
    function updateApiKeyStatus(status, text) {
        apiKeyStatus.style.display = 'flex';
        statusText.textContent = text;
        
        statusIndicator.className = 'status-indicator';
        switch (status) {
            case 'valid':
                statusIndicator.classList.add('status-valid');
                break;
            case 'invalid':
                statusIndicator.classList.add('status-invalid');
                break;
            default:
                statusIndicator.classList.add('status-unknown');
        }
    }
    
    async function clearHistory() {
        if (confirm('Are you sure you want to clear all question history? This action cannot be undone.')) {
            try {
                await chrome.storage.local.remove(['questionHistory']);
                showStatus('Question history cleared successfully!', 'success');
            } catch (error) {
                showStatus('Error clearing history: ' + error.message, 'error');
            }
        }
    }
    
    async function exportData() {
        try {
            const data = await chrome.storage.local.get(null);
            const dataStr = JSON.stringify(data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            
            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ai-screen-reader-data.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showStatus('Data exported successfully!', 'success');
        } catch (error) {
            showStatus('Error exporting data: ' + error.message, 'error');
        }
    }
    
    function importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                if (confirm('This will overwrite your current settings and data. Continue?')) {
                    await chrome.storage.local.clear();
                    await chrome.storage.local.set(data);
                    showStatus('Data imported successfully!', 'success');
                    setTimeout(() => {
                        location.reload();
                    }, 1000);
                }
            } catch (error) {
                showStatus('Error importing data: ' + error.message, 'error');
            }
        };
        input.click();
    }
    
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
        statusMessage.style.display = 'block';
        
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 5000);
    }
    
    function goBack() {
        window.close();
    }
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
});
