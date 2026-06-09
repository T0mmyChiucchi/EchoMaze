const puppeteer = require('puppeteer');

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        page.on('console', msg => {
            console.log(`[PAGE LOG] ${msg.type().toUpperCase()}: ${msg.text()}`);
        });
        page.on('pageerror', err => {
            console.log(`[PAGE ERROR]: ${err.toString()}`);
        });

        console.log("Navigating to http://localhost:5202");
        await page.goto('http://localhost:5202', { waitUntil: 'networkidle0' });
        
        console.log("Waiting 2s...");
        await new Promise(r => setTimeout(r, 2000));
        
        console.log("Clicking join...");
        await page.click('#start-btn');
        
        console.log("Waiting 5s to see if animate loop crashes...");
        await new Promise(r => setTimeout(r, 5000));
        
        await browser.close();
        console.log("Done.");
    } catch (e) {
        console.error("Puppeteer Error:", e);
    }
})();
