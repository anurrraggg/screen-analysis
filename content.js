// This function will be executed in the context of the current webpage
function getPageText() {
    // Scrape all visible text from the entire document body
    return document.body.innerText;
}

// Listen for a message from the service worker to execute the scrape
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "scrapeText") {
        sendResponse({ pageText: getPageText() });
    }
    // Return true to indicate an asynchronous response
    return true; 
});