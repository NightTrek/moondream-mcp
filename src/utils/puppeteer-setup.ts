import puppeteer, { Browser, Page, Viewport } from 'puppeteer';
import * as tmp from 'tmp';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Make tmp.file return a promise
const tmpFile = promisify(tmp.file);

// Configuration
const MAX_VIEWPORT_WIDTH = 2560;  // 2K resolution max width
const MAX_VIEWPORT_HEIGHT = 1440; // 2K resolution max height
const DEFAULT_VIEWPORT = {
  width: 1280,
  height: 720
};
const DEFAULT_WAIT_TIME = 15000; // ms

export interface ViewportConfig extends Viewport {
  width: number;
  height: number;
}

export class PuppeteerSetup {
  private browser: Browser | null = null;

  async ensureBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-web-security',
          '--enable-features=NetworkService'
        ]
      });
    }
    return this.browser;
  }

  private validateViewport(viewport?: Partial<ViewportConfig>): ViewportConfig {
    const width = Math.min(viewport?.width || DEFAULT_VIEWPORT.width, MAX_VIEWPORT_WIDTH);
    const height = Math.min(viewport?.height || DEFAULT_VIEWPORT.height, MAX_VIEWPORT_HEIGHT);
    return { 
      width, 
      height,
      deviceScaleFactor: 2,
      hasTouch: false,
      isLandscape: false,
      isMobile: false
    };
  }

  async captureScreenshot(
    url: string,
    waitTime: number = DEFAULT_WAIT_TIME,
    viewport?: ViewportConfig
  ): Promise<string> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();

    try {
      const validViewport = this.validateViewport(viewport);
      await page.setViewport(validViewport);
      await page.setDefaultNavigationTimeout(120000);
      await page.setJavaScriptEnabled(true);
      await page.setRequestInterception(true);
      
      let pendingRequests = 0;
      const pendingRequestUrls = new Set();
      
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        const url = request.url();
        
        if (['document', 'script', 'stylesheet', 'image', 'font', 'fetch', 'xhr', 'websocket'].includes(resourceType)) {
          pendingRequests++;
          pendingRequestUrls.add(url);
          console.error(`[Debug] Request started: ${resourceType} - ${url}`);
          request.continue();
        } else {
          console.error(`[Debug] Request aborted: ${resourceType} - ${url}`);
          request.abort();
        }
      });

      page.on('requestfailed', (request) => {
        const url = request.url();
        if (pendingRequestUrls.has(url)) {
          pendingRequests--;
          pendingRequestUrls.delete(url);
          console.error(`[Debug] Request failed: ${url} - ${request.failure()?.errorText}`);
        }
      });

      page.on('requestfinished', (request) => {
        const url = request.url();
        if (pendingRequestUrls.has(url)) {
          pendingRequests--;
          pendingRequestUrls.delete(url);
          console.error(`[Debug] Request finished: ${url}`);
        }
      });

      let retries = 3;
      while (retries > 0) {
        try {
          await page.goto(url, {
            waitUntil: ['networkidle0', 'domcontentloaded', 'load'],
            timeout: 60000
          });
          break;
        } catch (error) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Handle file URLs differently
      if (url.startsWith('file://')) {
        // Wait for navigation menu to be fully loaded
        await page.waitForFunction(() => {
          const nav = document.querySelector('nav[role="navigation"]');
          const navItems = document.querySelectorAll('nav a[role="menuitem"]');
          const styles = window.getComputedStyle(nav as Element);
          return nav && 
                 navItems.length > 0 && 
                 styles.backgroundColor !== '' && 
                 styles.color !== '';
        }, { timeout: waitTime });
      } else {
        // For web URLs, wait for dynamic content
        await page.waitForFunction(() => {
          const nav = document.querySelector('nav');
          const navItems = document.querySelectorAll('nav a');
          return nav && navItems.length > 0;
        }, { timeout: waitTime });

        await page.waitForFunction(() => {
          const nav = document.querySelector('nav');
          if (!nav) return false;
          const styles = window.getComputedStyle(nav);
          return styles.backgroundColor !== '' && styles.color !== '';
        }, { timeout: waitTime });
      }

      // Extract page information with enhanced navigation detection
      const pageInfo = await page.evaluate(() => {
        const navItems = Array.from(document.querySelectorAll('nav[role="navigation"] a[role="menuitem"]')).map(link => {
          const el = link as HTMLElement;
          const text = el.textContent?.trim() || '';
          const styles = window.getComputedStyle(el);
          
          // Highlight navigation items
          el.style.backgroundColor = 'rgba(88, 166, 255, 0.1)';
          el.style.outline = '2px solid rgba(255, 255, 255, 0.3)';
          
          return {
            text,
            visible: styles.display !== 'none' && styles.visibility !== 'hidden'
          };
        });

        // Create overlay with navigation summary
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.bottom = '10px';
        overlay.style.left = '10px';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
        overlay.style.color = 'white';
        overlay.style.padding = '15px';
        overlay.style.borderRadius = '8px';
        overlay.style.fontSize = '16px';
        overlay.style.maxWidth = '90%';
        overlay.style.zIndex = '10000';
        overlay.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

        const visibleNavItems = navItems.filter(item => item.visible);
        overlay.innerHTML = `
          <div style="margin-bottom: 10px; color: #58a6ff; font-size: 18px">Navigation Menu Items:</div>
          ${visibleNavItems.map((item, index) => `
            <div style="margin-bottom: 5px; padding: 4px 8px; background: rgba(255,255,255,0.1); border-radius: 4px;">
              ${index + 1}. ${item.text}
            </div>
          `).join('')}
        `;

        document.body.appendChild(overlay);
        return navItems;
      });

      console.error('[Debug] Navigation items found:', pageInfo);

      // Take screenshot and store in screenshots directory
      const projectRoot = '/Users/danielsteigman/code/MCP/moondream-server';
      const screenshotsDir = join(projectRoot, 'screenshots');
      await fs.mkdir(screenshotsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotPath = join(screenshotsDir, `screenshot-${timestamp}.jpg`);

      await page.screenshot({
        path: screenshotPath,
        fullPage: true,
        quality: 100,
        type: 'jpeg',
        optimizeForSpeed: false,
        captureBeyondViewport: true
      });

      const stats = await fs.stat(screenshotPath);
      if (stats.size === 0) {
        throw new Error('Screenshot file is empty');
      }
    }
      return screenshotPath;
    } finally {
      await page.close();
    }
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
