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
    const psLinks = $container.find('a[href*="/PS"]');
    if (psLinks.length === 0) {
        return { partNumber: null, url: null };
    }

    let partNumber = null;
    let productUrl = null;

    // Iterate through links using cheerio's eq method
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
            scraped: true
        },
        skipReason: null
    };
}

/**
 * Sets up Puppeteer browser and page
 */
async function setupBrowser() {
    const browser = await puppeteer.launch({
        headless: SCRAPE_CONFIG.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    return { browser, page };
}

/**
 * Loads page content with Puppeteer
 */
async function loadPageContent(page, url) {
    console.log(`Loading page: ${url}`);
    await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: SCRAPE_CONFIG.timeout
    });

    // Wait for products to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    return await page.content();
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

        if (products.length <= 10) {
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
 * Scrapes a single PartSelect category page
 */
async function scrapeCategoryPage(url, category) {
    console.log(`Scraping ${category} from: ${url}`);

    let browser;
    try {
        const { browser: b, page } = await setupBrowser();
        browser = b;

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
        return products;

    } catch (error) {
        console.error(`ERROR: Error scraping ${category}:`, error.message);
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Main scraper function - scrapes both categories
 */
async function scrapePartSelect() {
    console.log('Starting PartSelect scraper...');

    const allProducts = [];
    const seenPartNumbers = new Set(); // Global deduplication

    for (const { url, category } of SCRAPE_URLS) {
        try {
            console.log(`\nScraping: ${url}`);
            const products = await scrapeCategoryPage(url, category);

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

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`ERROR: Error scraping ${url}:`, error.message);
        }
    }

    console.log(`Total products scraped: ${allProducts.length}`);
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
