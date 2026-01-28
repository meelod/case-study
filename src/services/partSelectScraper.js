const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const {
    SCRAPE_CONFIG,
    NAME_SELECTORS,
    SKIP_PATTERNS,
    BRANDS,
    SCRAPE_URLS
} = require('../constants/scraper');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalizes a URL to a full absolute URL
 */
function normalizeUrl(url, baseUrl = 'https://www.partselect.com') {
    if (!url) return null;

    if (url.startsWith('//')) {
        return `https:${url}`;
    }
    if (url.startsWith('/')) {
        return `${baseUrl}${url}`;
    }
    if (url.startsWith('http')) {
        return url;
    }
    return `${baseUrl}/${url}`;
}

/**
 * Extracts part number from a URL or text
 */
function extractPartNumber(text) {
    if (!text) return null;
    const match = text.match(/PS\d{5,}/);
    return match ? match[0] : null;
}

/**
 * Extracts part number digits (without PS prefix)
 */
function extractPartNumberDigits(partNumber) {
    if (!partNumber) return '';
    return partNumber.replace(/^PS/i, '');
}

/**
 * Checks if a string matches skip patterns
 */
function shouldSkipText(text) {
    if (!text) return true;
    return SKIP_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Validates if a product name is acceptable
 */
function isValidProductName(name) {
    if (!name) return false;
    const trimmed = name.trim();
    return trimmed.length >= 5 &&
        trimmed.length < 150 &&
        !trimmed.includes('★') &&
        !shouldSkipText(trimmed);
}

/**
 * Extracts product name from URL
 * Example: PS12364199-Frigidaire-242126602-Refrigerator-Door-Shelf-Bin.htm
 *          -> "Refrigerator Door Shelf Bin"
 */
function extractNameFromUrl(url) {
    if (!url) return null;

    const match = url.match(/PS\d{5,}-[^-]+-(.+?)\.htm/);
    if (!match || !match[1]) return null;

    return match[1]
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .replace(/\b(And|Or|With|For|The|Of)\b/gi, word => word.toLowerCase());
}

/**
 * Extracts product name from container element
 */
function extractProductName($container, productUrl) {
    // Try selectors first
    for (const selector of NAME_SELECTORS) {
        const $nameEl = $container.find(selector).first();
        if ($nameEl.length > 0) {
            const nameText = $nameEl.text().trim();
            if (isValidProductName(nameText)) {
                return nameText;
            }
        }
    }

    // Fallback to URL extraction
    if (productUrl) {
        return extractNameFromUrl(productUrl);
    }

    return null;
}

/**
 * Extracts image URL from container element
 */
function extractImageUrl($container, partNumber, productUrl) {
    const partNumberDigits = extractPartNumberDigits(partNumber);

    // Strategy 1: Find image directly in container
    const $imgs = $container.find('img');
    for (let i = 0; i < $imgs.length; i++) {
        const $img = $imgs.eq(i);
        let imgSrc = $img.attr('src') ||
            $img.attr('data-src') ||
            $img.attr('data-lazy-src') ||
            $img.attr('data-original');

        if (!imgSrc) continue;

        // Skip placeholder/spacer images
        if (imgSrc.includes('placeholder') ||
            imgSrc.includes('spacer') ||
            imgSrc.includes('1x1') ||
            imgSrc.includes('data:image') ||
            imgSrc.includes('blank') ||
            imgSrc.includes('transparent') ||
            imgSrc.includes('.svg')) {
            continue;
        }

        const imageUrl = normalizeUrl(imgSrc);
        if (!imageUrl) continue;

        // Check if this is a product image
        const isCDN = imageUrl.includes('azurefd.net');
        const hasPartNumber = imageUrl.includes(partNumberDigits);
        const hasImageExt = /\.(jpg|jpeg|png|webp)$/i.test(imageUrl);

        if (isCDN || (hasPartNumber && hasImageExt) || hasImageExt) {
            return imageUrl;
        }
    }

    // Strategy 2: Construct CDN URL from product URL pattern
    // Pattern: {partNumberDigits}-1-N-{restOfURL}.jpg
    if (productUrl) {
        const urlMatch = productUrl.match(/PS\d{5,}-(.+?)\.htm/);
        if (urlMatch && urlMatch[1]) {
            return `https://partselectcom-gtcdcddbene3cpes.z01.azurefd.net/${partNumberDigits}-1-N-${urlMatch[1]}.jpg`;
        }
    }

    // Strategy 3: Fallback to old PartSelect image URL pattern
    return `https://www.partselect.com/Images/PartSelect/PS/PS${partNumberDigits}.jpg`;
}

/**
 * Extracts part number and URL from container links
 */
function extractPartNumberAndUrl($container, $) {
    let partNumber = null;
    let productUrl = null;

    // Method 1: Try to find links with PS part numbers
    const psLinks = $container.find('a[href*="/PS"]');
    if (psLinks.length > 0) {
        for (let i = 0; i < psLinks.length; i++) {
            const $link = psLinks.eq(i);
            const href = $link.attr('href');
            if (!href) continue;

            // Skip anchor links but extract part number
            if (href.includes('#')) {
                const match = href.match(/PS\d{5,}/);
                if (match && !partNumber) {
                    partNumber = match[0];
                    productUrl = href.split('#')[0];
                }
                continue;
            }

            // Regular product page link
            const match = href.match(/PS\d{5,}/);
            if (match) {
                partNumber = match[0];
                productUrl = normalizeUrl(href);
                break; // Found a good link, stop searching
            }
        }
    }

    // Method 2: If no link found, try to extract part number from container text/data attributes
    if (!partNumber) {
        // Check data attributes
        const dataPartNumber = $container.attr('data-part-number') ||
            $container.attr('data-partnumber') ||
            $container.attr('data-part');
        if (dataPartNumber) {
            const match = dataPartNumber.match(/PS?\d{5,}/i);
            if (match) {
                partNumber = match[0].toUpperCase().replace(/^P(?!S)/, 'PS');
            }
        }

        // Check container text for part numbers
        if (!partNumber) {
            const containerText = $container.text();
            const match = containerText.match(/PS\d{5,}/);
            if (match) {
                partNumber = match[0];
                // Try to find URL in any link within container
                const anyLink = $container.find('a').first();
                if (anyLink.length > 0) {
                    const href = anyLink.attr('href');
                    if (href && href.includes(partNumber)) {
                        productUrl = normalizeUrl(href);
                    } else {
                        productUrl = `https://www.partselect.com/${partNumber}.htm`;
                    }
                } else {
                    productUrl = `https://www.partselect.com/${partNumber}.htm`;
                }
            }
        }
    }

    return { partNumber, url: productUrl };
}

/**
 * Extracts product data from a container element
 * Returns { product, skipReason } where skipReason is null if product was extracted successfully
 */
function extractProductFromContainer($container, $, category, seenPartNumbers) {
    const { partNumber, url: productUrl } = extractPartNumberAndUrl($container, $);

    if (!partNumber) {
        return { product: null, skipReason: 'noPartNumber' };
    }

    if (seenPartNumbers.has(partNumber)) {
        return { product: null, skipReason: 'duplicate' };
    }

    const productName = extractProductName($container, productUrl);
    if (!isValidProductName(productName)) {
        return { product: null, skipReason: 'invalidName' };
    }

    // Mark as seen only after validation passes
    seenPartNumbers.add(partNumber);

    const description = $container.find('.nf__part__detail p, .description').first().text().trim() ||
        `${productName} for ${category}`;

    const imageUrl = extractImageUrl($container, partNumber, productUrl);

    return {
        product: {
            partNumber,
            name: productName,
            category,
            description,
            url: productUrl || `https://www.partselect.com/PS${partNumber}.htm`,
            imageUrl,
            replacementParts: [], // Will be populated when scraping detail pages
            scraped: true
        },
        skipReason: null
    };
}

/**
 * Sets up Puppeteer browser and page with stealth settings to avoid bot detection
 */
async function setupBrowser() {
    const browser = await puppeteer.launch({
        headless: SCRAPE_CONFIG.headless,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();

    // Set realistic viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });
    });

    // Add Chrome object
    await page.evaluateOnNewDocument(() => {
        window.chrome = {
            runtime: {}
        };
    });

    // Override permissions
    await page.evaluateOnNewDocument(() => {
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
    });

    return { browser, page };
}

/**
 * Loads page content with Puppeteer
 */
async function loadPageContent(page, url) {
    console.log(`Loading page: ${url}`);
    try {
        // Navigate with realistic timing
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: SCRAPE_CONFIG.timeout
        });

        // Wait a bit for JavaScript to execute (minimal delay)
        await new Promise(resolve => setTimeout(resolve, 0));

        // Scroll to trigger lazy loading
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(resolve => setTimeout(resolve, 0));

        // Check if we got blocked
        const pageTitle = await page.title();
        if (pageTitle.toLowerCase().includes('access denied') ||
            pageTitle.toLowerCase().includes('blocked') ||
            pageTitle.toLowerCase().includes('forbidden')) {
            console.log(`   WARNING: Page appears to be blocked (title: "${pageTitle}")`);
            return null; // Return null to signal blocking
        }

        // Try to wait for specific selectors if they exist
        try {
            await page.waitForSelector('.nf__part, .product-item, [data-part-number]', { timeout: 3000 });
        } catch (e) {
            // Selectors not found, continue anyway
        }

        return await page.content();
    } catch (error) {
        console.error(`   Error loading page ${url}:`, error.message);
        return await page.content(); // Return whatever we have
    }
}

/**
 * Scrapes a product detail page to extract replacement parts and additional metadata
 * @param {Page} page - Puppeteer page instance
 * @param {string} productUrl - URL of the product detail page
 * @returns {Object|null} - Object with replacementParts array and other metadata, or null if failed
 */
async function scrapeProductDetailPage(page, productUrl) {
    if (!productUrl || !productUrl.includes('partselect.com')) {
        return null;
    }

    try {
        const content = await loadPageContent(page, productUrl);
        if (!content) {
            return null; // Page was blocked
        }

        const $ = cheerio.load(content);
        const replacementParts = [];

        // Pattern 1: Look for "replaces these:" or "replaces:" text
        const pageText = $('body').text();

        // Common patterns:
        // "replaces these: AP6010443, 67004278, 67005380"
        // "replaces: AP6010443, 67004278"
        // "This part works with... replaces these: AP6010443, 67004278"
        const replacePatterns = [
            /replaces\s+these?:\s*([A-Z0-9,\s]+)/i,
            /replaces:\s*([A-Z0-9,\s]+)/i,
            /replacement\s+part\s+numbers?:\s*([A-Z0-9,\s]+)/i,
            /also\s+replaces:\s*([A-Z0-9,\s]+)/i,
        ];

        for (const pattern of replacePatterns) {
            const match = pageText.match(pattern);
            if (match && match[1]) {
                // Extract part numbers from the matched text
                const partNumbers = match[1]
                    .split(',')
                    .map(p => p.trim())
                    .filter(p => {
                        // Match part numbers: alphanumeric codes like AP6010443, 67004278, PS123456, WP67005380
                        return /^[A-Z]{0,3}\d{5,}$/i.test(p);
                    });
                replacementParts.push(...partNumbers);
            }
        }

        // Pattern 2: Look in specific HTML elements that might contain replacement info
        const replacementSelectors = [
            '.replacement-parts',
            '.replaces',
            '[class*="replacement"]',
            '[class*="replaces"]',
            '.part-compatibility',
            '.compatible-parts'
        ];

        for (const selector of replacementSelectors) {
            const $element = $(selector);
            if ($element.length > 0) {
                const text = $element.text();
                // Extract part numbers from this element
                const matches = text.matchAll(/\b([A-Z]{0,3}\d{5,})\b/gi);
                for (const match of matches) {
                    const partNum = match[1].toUpperCase();
                    if (!replacementParts.includes(partNum)) {
                        replacementParts.push(partNum);
                    }
                }
            }
        }

        // Pattern 3: Look for structured data or lists with part numbers
        $('ul, ol, dl').each((i, elem) => {
            const $list = $(elem);
            const listText = $list.text().toLowerCase();
            if (listText.includes('replace') || listText.includes('compatible')) {
                const text = $list.text();
                const matches = text.matchAll(/\b([A-Z]{0,3}\d{5,})\b/gi);
                for (const match of matches) {
                    const partNum = match[1].toUpperCase();
                    if (!replacementParts.includes(partNum)) {
                        replacementParts.push(partNum);
                    }
                }
            }
        });

        // Remove duplicates and return
        const uniqueReplacementParts = [...new Set(replacementParts)];

        if (uniqueReplacementParts.length > 0) {
            console.log(`   Found ${uniqueReplacementParts.length} replacement parts: ${uniqueReplacementParts.slice(0, 5).join(', ')}${uniqueReplacementParts.length > 5 ? '...' : ''}`);
        }

        return {
            replacementParts: uniqueReplacementParts
        };
    } catch (error) {
        console.error(`   Error scraping detail page ${productUrl}:`, error.message);
        return null;
    }
}

// ============================================================================
// Main Scraping Functions
// ============================================================================

/**
 * Scrapes products from .nf__part containers (primary method)
 */
function scrapeFromContainers($, category, seenPartNumbers) {
    const products = [];
    const containers = $('.nf__part, [class*="nf__part"]');

    if (containers.length === 0) {
        // Try alternative selectors for brand pages
        const altContainers = $('.product-item, .part-item, [data-part-number], .product, article.product');
        if (altContainers.length > 0) {
            console.log(`Found ${altContainers.length} product containers using alternative selectors`);
            // Process alternative containers
            altContainers.each((i, container) => {
                if (products.length >= SCRAPE_CONFIG.maxProductsPerCategory) {
                    return false;
                }
                const $container = $(container);
                const result = extractProductFromContainer($container, $, category, seenPartNumbers);
                if (result.product) {
                    products.push(result.product);
                }
            });
            return products;
        }
        console.log(`   No product containers found with .nf__part or alternative selectors`);
        return products;
    }

    console.log(`Found ${containers.length} product containers using .nf__part selector`);

    let processedCount = 0;
    let skippedNoPartNumber = 0;
    let skippedDuplicate = 0;
    let skippedInvalidName = 0;

    containers.each((i, container) => {
        if (products.length >= SCRAPE_CONFIG.maxProductsPerCategory) {
            return false; // Stop processing
        }

        const $container = $(container);
        processedCount++;

        const result = extractProductFromContainer($container, $, category, seenPartNumbers);

        if (!result.product) {
            // Track why it was skipped
            if (result.skipReason === 'noPartNumber') {
                skippedNoPartNumber++;
            } else if (result.skipReason === 'duplicate') {
                skippedDuplicate++;
            } else {
                skippedInvalidName++;
            }
            return;
        }

        products.push(result.product);

        // Log first 20 products instead of just 10
        if (products.length <= 20) {
            console.log(`   Extracted: ${result.product.partNumber} - ${result.product.name.substring(0, 50)}`);
        }
    });

    console.log(`Extracted ${products.length} unique products from .nf__part containers`);
    console.log(`   Processed: ${processedCount}, No part#: ${skippedNoPartNumber}, Duplicates: ${skippedDuplicate}, Invalid names: ${skippedInvalidName}`);

    return products;
}

/**
 * Scrapes products from page links (fallback method)
 */
function scrapeFromLinks($, category, seenPartNumbers) {
    const products = [];

    $('a[href*="/PS"]').each((i, elem) => {
        if (products.length >= SCRAPE_CONFIG.maxProductsPerCategory) {
            return false;
        }

        const $elem = $(elem);
        const href = $elem.attr('href');
        const text = $elem.text().trim();

        if (shouldSkipText(text)) {
            return;
        }

        const partNumber = extractPartNumber(href);
        if (!partNumber || seenPartNumbers.has(partNumber)) {
            return;
        }

        let productName = text;
        if (!isValidProductName(productName)) {
            productName = extractNameFromUrl(href);
            if (!isValidProductName(productName)) {
                return;
            }
        }

        seenPartNumbers.add(partNumber);

        const productUrl = normalizeUrl(href);
        const imageUrl = extractImageUrl($elem, partNumber, productUrl);

        products.push({
            partNumber,
            name: productName,
            category,
            description: `${productName} for ${category}`,
            url: productUrl,
            imageUrl,
            scraped: true
        });
    });

    console.log(`Extracted ${products.length} unique products from links`);
    return products;
}

/**
 * Finds brand-specific pages from a category page
 * Example: Finds links like "Admiral Refrigerator Parts", "Amana Refrigerator Parts", etc.
 */
function findBrandPages($, baseCategory) {
    const brandPages = [];
    const seenUrls = new Set();

    // Look for brand links - they typically follow patterns like:
    // - "Admiral Refrigerator Parts" -> /Admiral-Refrigerator-Parts.htm
    // - Links in brand sections or navigation
    $('a[href*="-Parts.htm"]').each((i, elem) => {
        const $link = $(elem);
        const href = $link.attr('href');
        const text = $link.text().trim();

        if (!href || seenUrls.has(href)) return;

        // Match brand-specific part pages (e.g., Admiral-Refrigerator-Parts.htm)
        // But exclude main category pages (Refrigerator-Parts.htm, Dishwasher-Parts.htm)
        const brandMatch = href.match(/\/([A-Za-z]+)-([A-Za-z]+)-Parts\.htm$/);
        if (brandMatch && brandMatch[1] !== 'Refrigerator' && brandMatch[1] !== 'Dishwasher') {
            const brand = brandMatch[1];
            const categoryType = brandMatch[2]; // "Refrigerator" or "Dishwasher"

            // Only include if it matches our base category
            if (baseCategory.includes(categoryType)) {
                const fullUrl = normalizeUrl(href);
                brandPages.push({
                    url: fullUrl,
                    brand: brand,
                    category: `${brand} ${categoryType} Parts`
                });
                seenUrls.add(href);
            }
        }
    });

    return brandPages;
}

/**
 * Scrapes a single PartSelect category page
 */
async function scrapeCategoryPage(url, category, browser = null, page = null) {
    console.log(`Scraping ${category} from: ${url}`);

    let shouldCloseBrowser = false;
    try {
        // Use provided browser/page or create new ones
        if (!browser || !page) {
            const setup = await setupBrowser();
            browser = setup.browser;
            page = setup.page;
            shouldCloseBrowser = true;
        }

        const content = await loadPageContent(page, url);
        const $ = cheerio.load(content);

        const initialLinkCount = $('a[href*="/PS"]').length;
        console.log(`   Found ${initialLinkCount} product links`);

        const seenPartNumbers = new Set();
        let products = [];

        // Primary method: scrape from .nf__part containers
        products = scrapeFromContainers($, category, seenPartNumbers);

        // Fallback: scrape from links if no products found
        if (products.length === 0) {
            console.log('WARNING: No products found with containers, trying alternative approach...');
            products = scrapeFromLinks($, category, seenPartNumbers);
        }

        console.log(`Scraped ${products.length} products from ${category}`);
        return { products, browser, page, shouldCloseBrowser };

    } catch (error) {
        console.error(`ERROR: Error scraping ${category}:`, error.message);
        if (shouldCloseBrowser && browser) {
            await browser.close();
        }
        return { products: [], browser, page, shouldCloseBrowser };
    }
}

/**
 * Main scraper function - scrapes both categories and brand pages
 */
async function scrapePartSelect() {
    console.log('Starting PartSelect scraper...');

    const allProducts = [];
    const seenPartNumbers = new Set(); // Global deduplication
    const allBrandPages = [];

    // Step 1: Scrape main category pages and discover brand pages
    let sharedBrowser = null;
    let sharedPage = null;

    try {
        // Setup shared browser for efficiency
        const setup = await setupBrowser();
        sharedBrowser = setup.browser;
        sharedPage = setup.page;

        for (const { url, category } of SCRAPE_URLS) {
            try {
                console.log(`\nScraping: ${url}`);

                // Load page content once
                const content = await loadPageContent(sharedPage, url);

                // Check if page was blocked
                if (!content) {
                    console.log(`   SKIPPED: Page blocked by anti-bot protection`);
                    continue; // Skip this category page
                }

                const $ = cheerio.load(content);

                // Scrape products from this page
                const initialLinkCount = $('a[href*="/PS"]').length;
                console.log(`   Found ${initialLinkCount} product links`);

                const seenPartNumbers = new Set();
                let products = [];

                // Primary method: scrape from .nf__part containers
                products = scrapeFromContainers($, category, seenPartNumbers);

                // Fallback: scrape from links if no products found
                if (products.length === 0) {
                    console.log('WARNING: No products found with containers, trying alternative approach...');
                    products = scrapeFromLinks($, category, seenPartNumbers);
                }

                console.log(`Scraped ${products.length} products from ${category}`);

                // Deduplicate globally
                const newProducts = products.filter(p => {
                    if (seenPartNumbers.has(p.partNumber)) {
                        return false;
                    }
                    seenPartNumbers.add(p.partNumber);
                    return true;
                });

                allProducts.push(...newProducts);
                console.log(`   Added ${newProducts.length} new products (${products.length - newProducts.length} duplicates skipped)`);

                // Find brand pages from this category page
                const brandPages = findBrandPages($, category);

                if (brandPages.length > 0) {
                    console.log(`   Found ${brandPages.length} brand-specific pages`);
                    allBrandPages.push(...brandPages);
                }

                // Clear cookies to reset session
                const cookies = await sharedPage.cookies();
                if (cookies.length > 0) {
                    await sharedPage.deleteCookie(...cookies);
                }

                // Minimal delay between pages
                await new Promise(resolve => setTimeout(resolve, 0));
            } catch (error) {
                console.error(`ERROR: Error scraping ${url}:`, error.message);
            }
        }

        // Step 2: Scrape all discovered brand pages
        console.log(`\nScraping ${allBrandPages.length} brand-specific pages...`);

        for (const brandPage of allBrandPages) {
            try {
                console.log(`\nScraping brand page: ${brandPage.url}`);

                // Load page content
                const content = await loadPageContent(sharedPage, brandPage.url);

                // Check if page was blocked
                if (!content) {
                    console.log(`   SKIPPED: Page blocked by anti-bot protection`);
                    continue; // Skip this brand page
                }

                const $ = cheerio.load(content);

                // Debug: Check if page loaded correctly
                const pageTitle = $('title').text().trim();
                console.log(`   Page title: ${pageTitle.substring(0, 60)}...`);

                // Check if still blocked after loading
                if (pageTitle.toLowerCase().includes('access denied') ||
                    pageTitle.toLowerCase().includes('blocked') ||
                    pageTitle.toLowerCase().includes('forbidden')) {
                    console.log(`   SKIPPED: Page blocked (detected from title)`);
                    continue;
                }

                const initialLinkCount = $('a[href*="/PS"]').length;
                console.log(`   Found ${initialLinkCount} product links`);

                // Debug: Check what containers exist
                const nfPartCount = $('.nf__part, [class*="nf__part"]').length;
                const productItemCount = $('.product-item, .part-item').length;
                const articleCount = $('article.product, article[class*="product"]').length;
                const allLinks = $('a').length;
                console.log(`   Debug - Containers: .nf__part=${nfPartCount}, .product-item=${productItemCount}, article=${articleCount}, total links=${allLinks}`);

                const localSeenPartNumbers = new Set();
                let products = [];

                // Primary method: scrape from .nf__part containers
                products = scrapeFromContainers($, brandPage.category, localSeenPartNumbers);

                // Fallback: scrape from links if no products found
                if (products.length === 0 && initialLinkCount > 0) {
                    console.log(`   Trying fallback: scraping from links...`);
                    products = scrapeFromLinks($, brandPage.category, localSeenPartNumbers);
                } else if (products.length === 0 && initialLinkCount === 0) {
                    console.log(`   WARNING: No product links found on brand page - page might be empty or use different structure`);
                }

                console.log(`Scraped ${products.length} products from ${brandPage.category}`);

                // Deduplicate globally
                const newProducts = products.filter(p => {
                    if (seenPartNumbers.has(p.partNumber)) {
                        return false;
                    }
                    seenPartNumbers.add(p.partNumber);
                    return true;
                });

                allProducts.push(...newProducts);
                console.log(`   Added ${newProducts.length} new products from ${brandPage.brand} (${products.length - newProducts.length} duplicates skipped)`);

                // Clear cookies between brand pages
                const cookies = await sharedPage.cookies();
                if (cookies.length > 0) {
                    await sharedPage.deleteCookie(...cookies);
                }

                // Minimal delay between brand pages
                await new Promise(resolve => setTimeout(resolve, 0));
            } catch (error) {
                console.error(`ERROR: Error scraping brand page ${brandPage.url}:`, error.message);
            }
        }

        // Step 3: Enrich products with detail page data (replacement parts)
        if (SCRAPE_CONFIG.scrapeDetailPages && allProducts.length > 0) {
            console.log(`\nEnriching products with detail page data...`);
            const maxDetailPages = Math.min(allProducts.length, SCRAPE_CONFIG.maxDetailPagesPerBatch);
            const productsToEnrich = allProducts.slice(0, maxDetailPages);
            console.log(`   Scraping detail pages for ${productsToEnrich.length} products...`);

            let enrichedCount = 0;
            for (let i = 0; i < productsToEnrich.length; i++) {
                const product = productsToEnrich[i];
                if (!product.url) {
                    continue;
                }

                try {
                    const detailData = await scrapeProductDetailPage(sharedPage, product.url);
                    if (detailData && detailData.replacementParts && detailData.replacementParts.length > 0) {
                        product.replacementParts = detailData.replacementParts;
                        enrichedCount++;
                    }

                    // Clear cookies periodically to avoid detection
                    if (i % 10 === 0 && i > 0) {
                        const cookies = await sharedPage.cookies();
                        if (cookies.length > 0) {
                            await sharedPage.deleteCookie(...cookies);
                        }
                    }

                    // Small delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`   Error enriching product ${product.partNumber}:`, error.message);
                }
            }

            console.log(`   Enriched ${enrichedCount} products with replacement part data`);
        }

    } finally {
        // Close shared browser
        if (sharedBrowser) {
            await sharedBrowser.close();
        }
    }

    console.log(`\nTotal products scraped: ${allProducts.length}`);
    console.log(`Total brand pages scraped: ${allBrandPages.length}`);
    return allProducts;
}

/**
 * Formats scraped products for ChromaDB
 * Deduplicates by part number and filters out low-quality entries
 */
function formatProductsForChromaDB(scrapedProducts) {
    console.log(`Formatting ${scrapedProducts.length} scraped products...`);

    const productMap = new Map();

    for (const product of scrapedProducts) {
        const partNumber = product.partNumber;

        // Skip invalid entries
        if (!partNumber || !partNumber.match(/^PS\d{5,}$/)) {
            continue;
        }

        let productName = (product.name || '').trim();

        // If name is bad, extract from URL
        if (shouldSkipText(productName) || !productName || productName.length < 5) {
            if (product.url) {
                productName = extractNameFromUrl(product.url);
                if (!productName) {
                    continue;
                }
                product.name = productName;
            } else {
                continue;
            }
        }

        // Final validation
        if (!isValidProductName(productName)) {
            continue;
        }

        // Deduplicate, keeping the best entry
        if (!productMap.has(partNumber)) {
            productMap.set(partNumber, product);
        } else {
            const existing = productMap.get(partNumber);
            const existingName = (existing.name || '').trim();

            // Always replace "Videos!" entries
            if (existingName.toLowerCase().match(/^videos?/i) || existingName === 'Videos!') {
                productMap.set(partNumber, product);
                continue;
            }

            // Prefer entries with better names
            const isBetter =
                productName.length > existingName.length &&
                !productName.toLowerCase().includes('unknown') &&
                !productName.toLowerCase().match(/^videos?/i) &&
                !productName.match(/^\d+/) &&
                productName.length >= 10 &&
                !productName.includes('★');

            if (isBetter) {
                productMap.set(partNumber, product);
            }
        }
    }

    console.log(`Deduplicated to ${productMap.size} unique products`);

    // Convert map to array and format
    return Array.from(productMap.values()).map((product) => {
        let imageUrl = product.imageUrl;
        if (!imageUrl && product.partNumber) {
            const cleanPartNumber = extractPartNumberDigits(product.partNumber);
            imageUrl = `https://www.partselect.com/Images/PartSelect/PS/PS${cleanPartNumber}.jpg`;
        }

        return {
            id: product.partNumber.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            partNumber: product.partNumber,
            name: (product.name || `Part ${product.partNumber}`).trim(),
            description: product.description || `${product.name || product.partNumber} for ${product.category}`,
            category: product.category,
            brand: product.brand || extractBrandFromName(product.name) || 'Various',
            compatibleModels: product.compatibleModels || [],
            replacementParts: product.replacementParts || [], // Parts this product replaces
            installation: product.installation || `Installation instructions available on PartSelect website. Visit ${product.url || 'PartSelect.com'} for detailed installation steps.`,
            troubleshooting: product.troubleshooting || `For troubleshooting assistance, visit the product page at ${product.url || 'PartSelect.com'} or contact PartSelect support.`,
            price: product.price || 'Price available on website',
            inStock: true,
            url: product.url || '',
            imageUrl: imageUrl,
            scraped: true
        };
    });
}

/**
 * Extract brand from product name if possible
 */
function extractBrandFromName(name) {
    if (!name) return null;
    for (const brand of BRANDS) {
        if (name.includes(brand)) {
            return brand;
        }
    }
    return null;
}

module.exports = {
    scrapePartSelect,
    formatProductsForChromaDB
};
