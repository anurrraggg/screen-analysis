// The Chrome Tabs API is used to capture the screenshot
async function captureScreenshot() {
    // The "quality" parameter can be adjusted. 90-100 is good.
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
        format: "jpeg", 
        quality: 90
    });
    // This returns a Data URL (e.g., "data:image/jpeg;base64,...")
    return screenshotUrl; 
}

// Function to call Gemini API
async function callGeminiAPI(systemRole, userPrompt, screenshotDataUrl) {
    const API_KEY = "AIzaSyDX_Xgcwb9mU6QqPRUvwBH2BBCHsA-u6CE";
    
    if (API_KEY === "YOUR_GEMINI_API_KEY_HERE" || !API_KEY) {
        throw new Error("Please add your Gemini API key to the service-worker.js file");
    }

    // Try different available models for vision support
    const models = [
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-pro',
        'gemini-1.0-pro-vision'
    ];

    let lastError = null;
    
    for (const model of models) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: `${systemRole}\n\n${userPrompt}` },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: screenshotDataUrl.split(',')[1]
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    }
                })
            });

            if (response.ok) {
                return await handleResponse(response);
            } else {
                const errorData = await response.json().catch(() => ({}));
                lastError = new Error(`Model ${model}: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
                continue;
            }
        } catch (error) {
            lastError = error;
            continue;
        }
    }
    
    // If all vision models failed, try text-only analysis
    console.log('Vision models failed, trying text-only analysis');
    return await callTextOnlyAPI(systemRole, userPrompt, API_KEY);
}

async function handleResponse(response) {
    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error('Invalid response format from API');
    }
    
    return data.candidates[0].content.parts[0].text;
}

// Fallback function for text-only analysis
async function callTextOnlyAPI(systemRole, userPrompt, API_KEY) {
    const textModels = ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'];
    
    for (const model of textModels) {
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `${systemRole}\n\n${userPrompt}` }]
                    }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    }
                })
            });

            if (response.ok) {
                return await handleResponse(response);
            }
        } catch (error) {
            continue;
        }
    }
    
    throw new Error('All API models failed. Please check your API key and internet connection.');
}

// This listener waits for the user's question from popup.js
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "processQuestion") {
        
        const userQuestion = request.question;

        // 1. Get the Full Page Text (B) by running the content script
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Inject content script and get page text
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        });
        
        // Send message to content script to get page text
        const pageTextResponse = await chrome.tabs.sendMessage(tab.id, { action: "scrapeText" });
        const pageText = pageTextResponse.pageText;
        
        // 2. Capture the Screenshot (C)
        const screenshotDataUrl = await captureScreenshot();
        
        // 3. ASSEMBLE THE PROMPT (Your well-structured prompt)
        const systemRole = `You are the Contextual Web Analyst AI. Your sole function is to act as an instantaneous answer engine that provides concise, accurate, and helpful responses based on the current webpage content and visual context.

Your capabilities:
- Analyze both text content and visual elements from screenshots
- Provide direct, actionable answers to user questions
- Synthesize information from multiple sources on the page
- Give context-aware responses based on what's currently visible

Guidelines:
- Be concise but comprehensive
- Focus on the user's specific question
- Use visual context to verify and enhance text-based information
- If information is unclear or missing, say so directly
- Prioritize accuracy over speculation`;
        
        const userPrompt = `
            --- INPUT DATA ---
            **A. USER'S CORE QUESTION:**
            "${userQuestion}"

            **B. FULL PAGE TEXT EXTRACTED (Scraped DOM Content):**
            "${pageText}"

            **C. VISUAL CONTEXT:**
            [The attached image is the visible portion of the screen. Use it for context, especially for verifying prices, chart trends, or button names.]
            
            ---
            Final Task:
            Analyze the provided data based on the instructions in your System Role. Synthesize the text and visual information to generate the single, direct, and concise answer to the USER'S CORE QUESTION immediately.
        `;

        // 4. CALL THE AI API (e.g., Gemini API)
        try {
            const aiResponse = await callGeminiAPI(systemRole, userPrompt, screenshotDataUrl); 
            // 5. Send the answer back to the popup.js
            chrome.runtime.sendMessage({ action: "displayAnswer", answer: aiResponse });

        } catch (error) {
            chrome.runtime.sendMessage({ 
                action: "displayAnswer", 
                error: `Error: ${error.message}` 
            });
        }
    }
});