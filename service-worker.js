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
    // Get API key from storage
    const result = await chrome.storage.local.get(['geminiApiKey']);
    let API_KEY = result.geminiApiKey;
    
    // Fallback: If no API key in storage, use the hardcoded one below
    if (!API_KEY) {
        API_KEY = "AIzaSyDX_Xgcwb9mU6QqPRUvwBH2BBCHsA-u6CE"; // Your Gemini API key
    }
    
    console.log("Using API key:", API_KEY.substring(0, 10) + "...");

    // Try different available models for vision support
    const models = [
        'gemini-1.5-pro-latest',
        'gemini-1.5-flash-latest',
        'gemini-pro-latest',
        'gemini-1.0-pro-vision-latest'
    ];

    
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
                console.error(`Model ${model} failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
                console.error("Full error response:", errorData);
                continue;
            }
        } catch (error) {
            console.warn(`Model ${model} error:`, error);
            continue;
        }
    }
    
    // If all vision models failed, try text-only analysis
    console.log('Vision models failed, trying text-only analysis');
    return await callTextOnlyAPI(systemRole, userPrompt, API_KEY);
}

async function handleResponse(response) {
    const data = await response.json();
    
    if (!data.candidates?.[0]?.content) {
        throw new Error('Invalid response format from API');
    }
    
    return data.candidates[0].content.parts[0].text;
}

// Fallback function for text-only analysis
async function callTextOnlyAPI(systemRole, userPrompt, API_KEY) {
    const textModels = ['gemini-1.5-pro-latest', 'gemini-1.5-flash-latest', 'gemini-pro-latest'];
    
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
            console.warn(`Text model ${model} error:`, error);
            continue;
        }
    }
    
    throw new Error('All API models failed. Please check your API key and internet connection.');
}

// This listener waits for the user's question from popup.js
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === "processQuestion") {
        try {
            const userQuestion = request.question;
            
            if (!userQuestion || userQuestion.trim().length === 0) {
                throw new Error("No question provided");
            }

            // 1. Get the Full Page Text (B) by running the content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) {
                throw new Error("No active tab found");
            }

            // Check if we can access the tab
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('moz-extension://')) {
                throw new Error("Cannot analyze Chrome internal pages or extension pages");
            }
            
            // Inject content script and get page text
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
            } catch (injectError) {
                console.warn("Could not inject content script:", injectError);
                // Continue without content script - we'll use screenshot only
            }
            
            let pageText = "";
            try {
                // Send message to content script to get page text
                const pageTextResponse = await chrome.tabs.sendMessage(tab.id, { action: "scrapeText" });
                pageText = pageTextResponse?.pageText || "";
            } catch (textError) {
                console.warn("Could not get page text:", textError);
                pageText = "Unable to extract text content from this page.";
            }
            
            // 2. Capture the Screenshot (C)
            let screenshotDataUrl = "";
            try {
                screenshotDataUrl = await captureScreenshot();
            } catch (screenshotError) {
                console.warn("Could not capture screenshot:", screenshotError);
                throw new Error("Unable to capture screenshot. Please ensure the page is fully loaded and try again.");
            }
            
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
- Prioritize accuracy over speculation
- If the page appears to be loading or has limited content, mention this`;
            
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
            const aiResponse = await callGeminiAPI(systemRole, userPrompt, screenshotDataUrl); 
            
            // 5. Send the answer back to the popup.js
            chrome.runtime.sendMessage({ action: "displayAnswer", answer: aiResponse });

        } catch (error) {
            console.error("Error processing question:", error);
            chrome.runtime.sendMessage({ 
                action: "displayAnswer", 
                error: `Error: ${error.message}` 
            });
        }
    }
});