document.addEventListener('DOMContentLoaded', function() {
    const questionInput = document.getElementById('questionInput');
    const askButton = document.getElementById('askButton');
    const loading = document.getElementById('loading');
    const answerContainer = document.getElementById('answerContainer');
    const answerTitle = document.getElementById('answerTitle');
    const answerText = document.getElementById('answerText');

    // Handle ask button click
    askButton.addEventListener('click', async function() {
        const question = questionInput.value.trim();
        
        if (!question) {
            alert('Please enter a question');
            return;
        }

        // Show loading state
        askButton.disabled = true;
        askButton.textContent = 'Analyzing...';
        loading.style.display = 'block';
        answerContainer.style.display = 'none';

        try {
            // Send message to service worker
            chrome.runtime.sendMessage({
                action: 'processQuestion',
                question: question
            });
        } catch (error) {
            showError('Failed to send message to service worker: ' + error.message);
        }
    });

    // Listen for responses from service worker
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'displayAnswer') {
            hideLoading();
            
            if (request.error) {
                showError(request.error);
            } else {
                showAnswer(request.answer);
            }
        }
    });

    function hideLoading() {
        loading.style.display = 'none';
        askButton.disabled = false;
        askButton.textContent = 'Get Answer';
    }

    function showAnswer(answer) {
        answerContainer.className = 'answer-container';
        answerTitle.textContent = 'Answer';
        answerText.textContent = answer;
        answerContainer.style.display = 'block';
    }

    function showError(errorMessage) {
        answerContainer.className = 'answer-container error';
        answerTitle.textContent = 'Error';
        answerText.textContent = errorMessage;
        answerContainer.style.display = 'block';
    }

    // Allow Enter key to submit (Ctrl+Enter for new line)
    questionInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.ctrlKey) {
            e.preventDefault();
            askButton.click();
        }
    });
});

