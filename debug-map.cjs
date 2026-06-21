const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1368, height: 824 });
  await page.goto('http://localhost:5173/global-ai-policy-tracker/', { waitUntil: 'networkidle0' });
  
  // Wait for map and markers to load
  await page.waitForTimeout(2000);
  
  // Extract marker info
  const markers = await page.evaluate(() => {
    const els = document.querySelectorAll('.pulse-marker');
    return Array.from(els).map(el => {
      // Find the marker's leaflet ID or position
      const transform = el.style.transform;
      return {
        className: el.className,
        transform: transform
      };
    });
  });
  
  console.log(JSON.stringify(markers, null, 2));
  
  await page.screenshot({ path: 'map-debug.png' });
  await browser.close();
})();
