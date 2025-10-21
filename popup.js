document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const questionInput = document.getElementById('questionInput');
    const askButton = document.getElementById('askButton');
    const clearButton = document.getElementById('clearButton');
    const settingsBtn = document.getElementById('settingsBtn');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loadingText');
    const answerContainer = document.getElementById('answerContainer');
    const answerTitleText = document.getElementById('answerTitleText');
    const answerText = document.getElementById('answerText');
    const statusIndicator = document.getElementById('statusIndicator');
    const actionButtons = document.getElementById('actionButtons');
    const copyBtn = document.getElementById('copyBtn');
    const newQuestionBtn = document.getElementById('newQuestionBtn');
    const buttonText = document.getElementById('buttonText');
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');

    // State
    let currentQuestion = '';
    let currentAnswer = '';
    let isProcessing = false;

    // Initialize
    loadHistory();
    checkApiKey();

    // Event listeners
    askButton.addEventListener('click', handleAskQuestion);
    clearButton.addEventListener('click', clearAll);
    settingsBtn.addEventListener('click', openSettings);
    copyBtn.addEventListener('click', copyToClipboard);
    newQuestionBtn.addEventListener('click', startNewQuestion);

    // Keyboard shortcuts
    questionInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.ctrlKey) {
            e.preventDefault();
            handleAskQuestion();
        } else if (e.key === 'Escape') {
            clearAll();
        } else if (e.key === 's' && e.ctrlKey) {
            e.preventDefault();
            openSettings();
        } else if (e.key === 'c' && e.ctrlKey && currentAnswer) {
            e.preventDefault();
            copyToClipboard();
        }
    });
    
    // Global keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F1') {
            e.preventDefault();
            openSettings();
        }
    });

    // Auto-resize textarea (if enabled)
    questionInput.addEventListener('input', async function() {
        const result = await chrome.storage.local.get(['autoResize']);
        if (result.autoResize !== false) {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        }
    });

    async function handleAskQuestion() {
        const question = questionInput.value.trim();
        
        if (!question) {
            showNotification('Please enter a question', 'error');
            questionInput.focus();
            return;
        }

        if (isProcessing) {
            return;
        }

        currentQuestion = question;
        isProcessing = true;

        // Show loading state
        setButtonState(true, 'Analyzing...');
        showLoading('Analyzing page content...');
        hideAnswer();

        try {
            // Save to history
            saveToHistory(question, 'Processing...');

            // Send message to service worker
            chrome.runtime.sendMessage({
                action: 'processQuestion',
                question: question
            });
        } catch (error) {
            console.error('Failed to send message to service worker:', error);
            showError('Failed to send message to service worker: ' + error.message);
            isProcessing = false;
        }
    }

    function setButtonState(disabled, text) {
        askButton.disabled = disabled;
        buttonText.textContent = text;
    }

    function showLoading(text) {
        loadingText.textContent = text;
        loading.style.display = 'block';
    }

    function hideLoading() {
        loading.style.display = 'none';
    }

    function showAnswer(answer) {
        currentAnswer = answer;
        answerContainer.className = 'answer-container success';
        answerTitleText.textContent = 'Answer';
        statusIndicator.className = 'status-indicator status-success';
        answerText.textContent = answer;
        answerContainer.style.display = 'block';
        actionButtons.style.display = 'flex';
        
        // Update history with actual answer
        updateHistoryAnswer(currentQuestion, answer);
    }

    function showError(errorMessage) {
        answerContainer.className = 'answer-container error';
        answerTitleText.textContent = 'Error';
        statusIndicator.className = 'status-indicator status-error';
        answerText.textContent = errorMessage;
        answerContainer.style.display = 'block';
        actionButtons.style.display = 'flex';
        
        // Update history with error
        updateHistoryAnswer(currentQuestion, 'Error: ' + errorMessage);
    }

    function hideAnswer() {
        answerContainer.style.display = 'none';
        actionButtons.style.display = 'none';
    }

    function clearAll() {
        questionInput.value = '';
        questionInput.style.height = 'auto';
        hideAnswer();
        hideLoading();
        setButtonState(false, 'Get Answer');
        isProcessing = false;
        questionInput.focus();
    }

    function startNewQuestion() {
        questionInput.focus();
        questionInput.select();
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(currentAnswer);
            showNotification('Answer copied to clipboard!', 'success');
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = currentAnswer;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                const success = document.execCommand('copy');
                if (success) {
                    showNotification('Answer copied to clipboard!', 'success');
                } else {
                    throw new Error('Copy command failed');
                }
            } catch (execError) {
                console.error('Copy to clipboard failed:', execError);
                showNotification('Failed to copy to clipboard', 'error');
            }
            textArea.remove();
        }
    }

    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        let backgroundColor;
        if (type === 'success') {
            backgroundColor = '#10b981';
        } else if (type === 'error') {
            backgroundColor = '#dc2626';
        } else {
            backgroundColor = '#667eea';
        }
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${backgroundColor};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 1000;
            animation: slideInRight 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    async function openSettings() {
        // Open settings page
        chrome.tabs.create({
            url: chrome.runtime.getURL('settings.html')
        });
    }

    async function checkApiKey() {
        const result = await chrome.storage.local.get(['geminiApiKey']);
        const apiKey = result.geminiApiKey;
        if (!apiKey) {
            showNotification('Please set your API key in settings', 'error');
        }
    }

    // History management
    function loadHistory() {
        const history = JSON.parse(localStorage.getItem('questionHistory') || '[]');
        if (history.length > 0) {
            displayHistory(history);
        }
    }

    function displayHistory(history) {
        historyList.innerHTML = '';
        for (const item of history.slice(0, 5)) {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-question">${item.question}</div>
                <div class="history-answer">${item.answer}</div>
            `;
            historyItem.addEventListener('click', () => {
                questionInput.value = item.question;
                questionInput.focus();
            });
            historyList.appendChild(historyItem);
        }
        
        if (history.length > 0) {
            historyContainer.style.display = 'block';
        }
    }

    function saveToHistory(question, answer) {
        const history = JSON.parse(localStorage.getItem('questionHistory') || '[]');
        history.unshift({ question, answer, timestamp: Date.now() });
        
        // Keep only last 20 items
        if (history.length > 20) {
            history.splice(20);
        }
        
        localStorage.setItem('questionHistory', JSON.stringify(history));
        displayHistory(history);
    }

    function updateHistoryAnswer(question, answer) {
        const history = JSON.parse(localStorage.getItem('questionHistory') || '[]');
        const item = history.find(h => h.question === question && h.answer === 'Processing...');
        if (item) {
            item.answer = answer;
            localStorage.setItem('questionHistory', JSON.stringify(history));
            displayHistory(history);
        }
    }

    // Listen for responses from service worker
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'displayAnswer') {
            hideLoading();
            setButtonState(false, 'Get Answer');
            isProcessing = false;
            
            if (request.error) {
                showError(request.error);
            } else {
                showAnswer(request.answer);
            }
        }
    });

    // Add CSS for notifications
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
});

