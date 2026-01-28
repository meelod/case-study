const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');
const {
    SCRAPE_CONFIG,
    PRODUCT_SELECTORS,
    NAME_SELECTORS,
    SKIP_PATTERNS,
    BRANDS,
    SCRAPE_URLS
} = require('../constants/scraper');

/**
 * Scrapes PartSelect website for refrigerator and dishwasher parts
 * 
 * URLs to scrape:
 * - https://www.partselect.com/Refrigerator-Parts.htm
 * - https://www.partselect.com/Dishwasher-Parts.htm
 */


/**
 * Scrapes a single PartSelect category page
 */
async function scrapeCategoryPage(url, category) {
    console.log(`Scraping ${category} from: ${url}`);

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: SCRAPE_CONFIG.headless,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Set user agent to avoid blocking
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`Loading page: ${url}`);
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: SCRAPE_CONFIG.timeout
        });

        // Wait for products to load
        await new Promise(resolve => setTimeout(resolve, 3000)); // Give page time to render

        // Get page content
        const content = await page.content();
        const $ = cheerio.load(content);

        // Count links to see how many products we have
        const initialLinkCount = $('a[href*="/PS"]').length;
        console.log(`   Found ${initialLinkCount} product links`);

        const products = [];

        // Try multiple selectors (PartSelect might use different structures)
        let productElements = [];
        for (const selector of PRODUCT_SELECTORS) {
            productElements = $(selector);
            if (productElements.length > 0) {
                console.log(`Found ${productElements.length} products using selector: ${selector}`);
                break;
            }
        }

        // Try to find products using the nf__part container class (PartSelect's actual structure)
        const nfPartContainers = $('.nf__part, [class*="nf__part"]');
        if (nfPartContainers.length > 0) {
            console.log(`Found ${nfPartContainers.length} product containers using .nf__part selector`);

            const seenPartNumbers = new Set();
            let processedCount = 0;
            let skippedNoLinks = 0;
            let skippedDuplicate = 0;
            let skippedNoPartNumber = 0;
            let skippedInvalidName = 0;

            nfPartContainers.each((i, container) => {
                if (products.length >= SCRAPE_CONFIG.maxProductsPerCategory) return false;

                const $container = $(container);
                processedCount++;

                // Find all PS links in this container
                const psLinks = $container.find('a[href*="/PS"]');
                if (psLinks.length === 0) {
                    skippedNoLinks++;
                    if (processedCount <= 10) {
                        console.log(`   Container ${processedCount}: No PS links found`);
                    }
                    return; // Skip if no PS links
                }

                // Extract part number from the first valid PS link
                let partNumber = null;
                let productUrl = null;
                const foundLinks = [];

                psLinks.each((j, link) => {
                    const $link = $(link);
                    const href = $link.attr('href');
                    if (!href) return;

                    foundLinks.push(href.substring(0, 80));

                    // Skip anchor links (#CustomerReview, #Instructions, etc.)
                    if (href.includes('#')) {
                        // Extract part number from anchor link (PS followed by 5+ digits - flexible)
                        const match = href.match(/PS\d{5,}/);
                        if (match && !partNumber) {
                            partNumber = match[0];
                            // Get the base URL without anchor
                            productUrl = href.split('#')[0];
                        }
                        return;
                    }

                    // Regular product page link (PS followed by 5+ digits - flexible)
                    const match = href.match(/PS\d{5,}/);
                    if (match) {
                        partNumber = match[0];
                        productUrl = href.startsWith('http') ? href : `https://www.partselect.com${href}`;
                        return false; // Break loop
                    }
                });

                if (!partNumber) {
                    skippedNoPartNumber++;
                    if (processedCount <= 10) {
                        console.log(`   Container ${processedCount}: Found ${psLinks.length} PS links but no part number. Links: ${foundLinks.slice(0, 2).join(', ')}`);
                    }
                    return;
                }

                if (seenPartNumbers.has(partNumber)) {
                    skippedDuplicate++;
                    return;
                }
                seenPartNumbers.add(partNumber);

                // Extract product name
                let productName = '';

                // Try to find product name in various places
                for (const selector of NAME_SELECTORS) {
                    const $nameEl = $container.find(selector).first();
                    if ($nameEl.length > 0) {
                        const nameText = $nameEl.text().trim();
                        if (nameText && nameText.length > 5 && nameText.length < 150) {
                            // Skip if it's a review link or other non-name text
                            if (!nameText.includes('★') &&
                                !nameText.match(/^(videos?|read more|see more|\.\.\.)$/i) &&
                                !nameText.match(/^\d+\s+reviews?$/i)) {
                                productName = nameText;
                                break;
                            }
                        }
                    }
                }

                // If no name found, try to extract from URL
                if (!productName && productUrl) {
                    const urlMatch = productUrl.match(/PS\d{5,}-[^-]+-(.+?)\.htm/);
                    if (urlMatch && urlMatch[1]) {
                        productName = urlMatch[1]
                            .split('-')
                            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                            .join(' ')
                            .replace(/\b(And|Or|With|For|The|Of)\b/gi, word => word.toLowerCase());
                    }
                }

                // Extract description
                const description = $container.find('.nf__part__detail p, .description').first().text().trim() ||
                    `${productName} for ${category}`;

                // Only add if we have a valid product name
                if (productName && productName.length > 5 && productName.length < 150 && !productName.includes('★')) {
                    products.push({
                        partNumber: partNumber,
                        name: productName,
                        category: category,
                        description: description,
                        url: productUrl || `https://www.partselect.com/PS${partNumber}.htm`,
                        scraped: true
                    });

                    if (products.length <= 10) {
                        console.log(`   Extracted: ${partNumber} - ${productName.substring(0, 50)}`);
                    }
                } else {
                    skippedInvalidName++;
                    if (processedCount <= 10) {
                        console.log(`   WARNING: Container ${processedCount}: Invalid name "${productName?.substring(0, 30)}" for ${partNumber}`);
                    }
                }
            });

            console.log(`Extracted ${products.length} unique products from .nf__part containers`);
            console.log(`   Processed: ${processedCount}, No links: ${skippedNoLinks}, No part#: ${skippedNoPartNumber}, Duplicates: ${skippedDuplicate}, Invalid names: ${skippedInvalidName}`);
        }

        // If no products found with nf__part containers, try to extract from page structure
        if (productElements.length === 0 && products.length === 0) {
            console.log('WARNING: No products found with common selectors, trying alternative approach...');

            // Track seen part numbers to avoid duplicates
            const seenPartNumbers = new Set();

            // Try to find links that look like product pages
            $('a[href*="/PS"]').each((i, elem) => {
                if (products.length >= SCRAPE_CONFIG.maxProductsPerCategory) return false; // Stop when we hit the limit

                const $elem = $(elem);
                const href = $elem.attr('href');
                const text = $elem.text().trim();

                // Skip navigation/UI elements
                if (SKIP_PATTERNS.some(pattern => pattern.test(text))) {
                    return; // Skip this link
                }

                // Extract part number from href (PS followed by 5+ digits - flexible)
                const partNumberMatch = href?.match(/PS\d{5,}/);
                if (partNumberMatch) {
                    const partNumber = partNumberMatch[0];

                    // Skip if we've already seen this part number
                    if (seenPartNumbers.has(partNumber)) {
                        return;
                    }

                    // Extract product name from URL if link text is not good
                    let productName = text;
                    if (skipPatterns.some(pattern => pattern.test(text)) || text.length < 5) {
                        // Try to extract from URL: PS12345678-Brand-Model-Product-Name.htm (5+ digits - flexible)
                        const urlMatch = href.match(/PS\d{5,}-[^-]+-(.+?)\.htm/);
                        if (urlMatch && urlMatch[1]) {
                            // Convert URL format to readable name
                            productName = urlMatch[1]
                                .split('-')
                                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                                .join(' ')
                                .replace(/\b(And|Or|With|For|The|Of)\b/gi, word => word.toLowerCase());
                        } else {
                            // Skip if we can't get a good name
                            return;
                        }
                    }

                    // Only add if we have a valid product name
                    if (productName && productName.length > 5 && productName.length < 150 && !productName.includes('★')) {
                        seenPartNumbers.add(partNumber);

                        // Try to find a better name from nearby elements
                        const $parent = $elem.parent();
                        const $heading = $parent.find('h2, h3, h4, .product-name, .part-name, .title').first();
                        if ($heading.length > 0) {
                            const headingText = $heading.text().trim();
                            if (headingText && headingText.length > 5 && headingText.length < 150 &&
                                !skipPatterns.some(p => p.test(headingText)) &&
                                !headingText.includes('★')) {
                                productName = headingText;
                            }
                        }

                        products.push({
                            partNumber: partNumber,
                            name: productName,
                            category: category,
                            description: $elem.closest('.product, .part-item, article').find('.description, p').first().text().trim() || `${productName} for ${category}`,
                            url: href?.startsWith('http') ? href : `https://www.partselect.com${href}`,
                            scraped: true
                        });
                    }
                }
            });

            console.log(`Extracted ${products.length} unique products from links`);
        } else {
            // Extract product data from found elements
            productElements.each((i, elem) => {
                if (i >= SCRAPE_CONFIG.maxProductsPerCategory) return false;

                const $elem = $(elem);

                // Try to extract part number
                let partNumber = $elem.attr('data-part-number') ||
                    $elem.find('[data-part-number]').attr('data-part-number') ||
                    $elem.find('.part-number').text().trim() ||
                    $elem.find('.sku').text().trim();

                // Extract from text if not found (5+ digits - flexible)
                if (!partNumber) {
                    const text = $elem.text();
                    const match = text.match(/PS\d{5,}/);
                    if (match) partNumber = match[0];
                }

                // Extract name
                const name = $elem.find('.product-name, .part-name, h2, h3, .title').first().text().trim() ||
                    $elem.find('a').first().text().trim() ||
                    'Unknown Part';

                // Extract description
                const description = $elem.find('.description, .product-description, p').first().text().trim() ||
                    $elem.find('.summary').text().trim() ||
                    '';

                // Extract price
                const price = $elem.find('.price, .product-price, [data-price]').first().text().trim() ||
                    $elem.find('.cost').text().trim() ||
                    '';

                // Extract URL
                const url = $elem.find('a').first().attr('href') ||
                    $elem.attr('href') ||
                    '';
                const fullUrl = url && url.startsWith('http') ? url :
                    url ? `https://www.partselect.com${url}` : '';

                if (partNumber) {
                    products.push({
                        partNumber: partNumber,
                        name: name,
                        category: category,
                        description: description || `${name} for ${category}`,
                        price: price || 'Price not available',
                        url: fullUrl,
                        scraped: true
                    });
                }
            });
        }

        console.log(`Scraped ${products.length} products from ${category}`);
        return products;

    } catch (error) {
        console.error(`ERROR: Error scraping ${category}:`, error.message);
        // Return empty array on error, don't crash
        return [];
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Scrapes product detail page for more information
 */
async function scrapeProductDetail(url) {
    try {
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);

        // Extract additional details
        const installation = $('.installation, .install-instructions, #installation').text().trim();
        const troubleshooting = $('.troubleshooting, .troubleshoot, #troubleshooting').text().trim();
        const compatibleModels = [];

        // Try to find compatible models
        $('.compatible-models li, .model-list li, [data-model]').each((i, elem) => {
            const model = $(elem).text().trim();
            if (model) compatibleModels.push(model);
        });

        return {
            installation: installation || '',
            troubleshooting: troubleshooting || '',
            compatibleModels: compatibleModels.length > 0 ? compatibleModels : []
        };
    } catch (error) {
        console.warn(`WARNING: Could not scrape product detail for ${url}:`, error.message);
        return {
            installation: '',
            troubleshooting: '',
            compatibleModels: []
        };
    }
}


/**
 * Main scraper function - scrapes both categories and subcategories
 */
async function scrapePartSelect() {
    console.log('Starting PartSelect scraper...');

    // Main category pages (from constants)
    const urls = SCRAPE_URLS;

    const allProducts = [];
    const seenPartNumbers = new Set(); // Global deduplication

    for (const { url, category } of urls) {
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

            // Add a delay between requests to be respectful
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`ERROR: Error scraping ${url}:`, error.message);
        }
    }

    console.log(`Total products scraped: ${allProducts.length}`);

    // Enhance products with detail page data (optional, can be slow)
    // Uncomment if you want more detailed information
    /*
    console.log('Enhancing products with detail page data...');
    for (let i = 0; i < Math.min(allProducts.length, 20); i++) { // Limit to first 20
        if (allProducts[i].url) {
            const details = await scrapeProductDetail(allProducts[i].url);
            allProducts[i] = { ...allProducts[i], ...details };
            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
        }
    }
    */

    return allProducts;
}

/**
 * Formats scraped products for ChromaDB
 * Deduplicates by part number and filters out low-quality entries
 */
function formatProductsForChromaDB(scrapedProducts) {
    console.log(`Formatting ${scrapedProducts.length} scraped products...`);

    // Deduplicate by part number, keeping the best entry for each
    const productMap = new Map();

    for (const product of scrapedProducts) {
        const partNumber = product.partNumber;

        // Skip invalid entries
        if (!partNumber || !partNumber.match(/^PS\d{5,}$/)) {
            continue;
        }

        // Skip low-quality entries
        let productName = (product.name || '').trim();

        // If name is bad (like "Videos!"), extract from URL
        if (SKIP_PATTERNS.some(pattern => pattern.test(productName)) || !productName || productName.length < 5) {
            if (product.url) {
                // Extract from URL: PS12345678-Brand-Model-Product-Name.htm
                const urlMatch = product.url.match(/PS\d{5,}-[^-]+-(.+?)\.htm/);
                if (urlMatch && urlMatch[1]) {
                    // Convert URL format to readable name
                    // URL format: PS12345678-Brand-ModelNumber-Product-Name.htm
                    // Keep model numbers - they're useful for compatibility!
                    productName = urlMatch[1]
                        .split('-')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                        .join(' ')
                        .replace(/\b(And|Or|With|For|The|Of)\b/gi, word => word.toLowerCase());
                    product.name = productName; // Update the product object
                } else {
                    continue; // Skip if we can't get a good name
                }
            } else {
                continue; // Skip if no URL
            }
        }

        // Final validation
        if (!productName || productName.length < 5 || productName.length > 150) {
            continue;
        }

        // If we haven't seen this part number, or this entry is better, use it
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

            // Prefer entries with better names (longer, more descriptive, not "Unknown" or "Videos")
            const isBetter =
                productName.length > existingName.length &&
                !productName.toLowerCase().includes('unknown') &&
                !productName.toLowerCase().match(/^videos?/i) && // Don't prefer "Videos"
                !productName.match(/^\d+/) && // Don't prefer numeric-only
                productName.length >= 10 && // Prefer more descriptive names
                !productName.includes('★'); // Don't prefer entries with stars

            if (isBetter) {
                productMap.set(partNumber, product);
            }
        }
    }

    console.log(`Deduplicated to ${productMap.size} unique products`);

    // Convert map to array and format
    return Array.from(productMap.values()).map((product) => ({
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
        scraped: true
    }));
}

/**
 * Extract brand from product name if possible
 */
function extractBrandFromName(name) {
    for (const brand of BRANDS) {
        if (name && name.includes(brand)) {
            return brand;
        }
    }
    return null;
}

module.exports = {
    scrapePartSelect,
    scrapeCategoryPage,
    formatProductsForChromaDB,
    extractBrandFromName
};
