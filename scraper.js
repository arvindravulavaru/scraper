/*
Author: Arvind Ravulavaru
Slack: a14u
Date: March 19, 2023
Purpose: Scrape the Shopify developer documentation
How: This is a JavaScript program that scrapes web pages from the Shopify Developer Documentation website, 
     converts the scraped content to Markdown format, and saves it to disk. It also creates a metadata file 
     that contains information about each scraped page, including the URL, file path, and title.

    The program uses several external libraries, including Axios for making HTTP requests, Cheerio for parsing HTML,
    async for managing concurrency, TurndownService for converting HTML to Markdown, Luxon for working with dates, 
    fs for interacting with the file system, path for working with file paths, and tar for creating a tarball of 
    the scraped content.

    The program defines several constants, including the base URL for the Shopify Developer Documentation website, 
    the maximum number of concurrent requests to make, the maximum number of retries for failed requests, the delay 
    between retries, and the maximum time for scraping a URL. It also initializes a counter and a file path for storing 
    the scraped content.

    The program then creates a set to keep track of visited URLs and a queue to manage the processing of URLs. It adds 
    the base URL to the set and the queue and begins processing URLs by invoking the queue.push() method with the root URL.

    The program defines an async function scrapeUrl(url, retries) that scrapes a given URL and saves the scraped content 
    to disk. It first checks whether the URL has already been visited and returns if it has. It then makes an HTTP request
     to the URL using Axios and checks whether the response status is 200. If it is not, it throws an error.

    The program then uses Cheerio to parse the HTML and extract all the links on the page. For each link, it creates an 
    absolute URL and checks whether it has already been visited. If it has not, and if it belongs to the Shopify Developer
     Documentation website and does not include a fragment identifier, it enqueues the link for processing by pushing an 
     object with the URL and the number of retries to the queue.

    The program then extracts the article content from the HTML and converts it to Markdown using TurndownService. It also 
    generates HTML and plain text versions of the content. It then creates a directory for the URL on disk and saves the Markdown, 
    HTML, and plain text versions of the content to files within that directory.

    Finally, the program adds the URL, file path, and title to the metadata array, increments the counter, and logs the URL to the console.

    If there is an error during scraping, the program retries up to the maximum number of retries with a delay between each retry. 
    If the maximum number of retries is exceeded, the program logs an error and gives up.

    Once all URLs have been processed, the program writes the metadata array to a JSON file and creates a tarball of the 
    scraped content. It then logs a message indicating that all items have been processed.

*/

// Import required Node.js modules
const axios = require('axios'); // module for making HTTP requests
const cheerio = require('cheerio'); // module for parsing HTML and XML documents
const { URL } = require('url'); // built-in Node.js module for working with URLs
const async = require('async'); // module for running asynchronous tasks in parallel
const TurndownService = require('turndown'); // module for converting HTML to Markdown
const { DateTime } = require('luxon'); // module for working with dates and times
const fs = require('fs'); // built-in Node.js module for working with the file system
const path = require('path'); // built-in Node.js module for working with file paths
const tar = require('tar'); // module for archiving files using tar

// Define constants
const base = 'https://shopify.dev'; // the base URL for scraping
const MAX_CONCURRENCY = 100; // maximum number of concurrent requests
const MAX_RETRIES = 3; // maximum number of retries for failed requests
const RETRY_DELAY = 1000; // delay between retries in milliseconds
const SCRAPE_TIMEOUT = 30000; // maximum time for scraping a URL in milliseconds
let scrapedPagesCount = 0; // counter for keeping track of the number of scraped URLs
const filepath = path.resolve('./data'); // the path to the directory for storing scraped data

// Define an empty array to store scraped metadata
let metaData = [];

// If the data directory already exists, delete it recursively
if (fs.existsSync(filepath)) fs.rmdirSync(filepath, { recursive: true });

// Create a new instance of the TurndownService class
const turndownService = new TurndownService();

// Define two new sets to keep track of visited and all URLs
const visited = new Set(); // set to keep track of visited URLs
const all = new Set(); // set to keep track of all URLs

// Add the base URL to the set of all URLs
all.add(base);

// Define a new queue using the async module
const queue = async.queue(async ({ url, retries }) => {

    /*
    This code creates a new queue using the async module. The queue manages the processing 
    of URLs by limiting the maximum number of concurrent requests to MAX_CONCURRENCY.

    The async.queue() method takes two arguments: a task function and an optional concurrency
     value. In this case, the task function is defined as an async function that takes an 
     object with url and retries properties as its argument. The task function calls 
     the scrapeUrl() function with the url and retries arguments.

    The scrapeUrl() function is not defined in this code snippet, but it is likely 
    defined elsewhere in the codebase. It is responsible for scraping a single URL 
    and storing its metadata. The retries argument is used to keep track of the 
    number of retries for failed requests.

    By limiting the maximum number of concurrent requests to MAX_CONCURRENCY, the 
    queue ensures that the scraping process is performed efficiently and without 
    overwhelming the target website.
    */

    await scrapeUrl(url, retries);

}, MAX_CONCURRENCY);


/**
 * Scrapes web pages for content and saves it as markdown, HTML, and plain text files.
 * 
 * @param {string} url - The URL of the page to be scraped.
 * @param {number} retries - The number of times to retry scraping if an error occurs.
 */
async function scrapeUrl(url, retries = 0) {

    // If the URL has already been visited, skip it.
    if (visited.has(url)) return;

    // Mark the URL as visited.
    visited.add(url);

    try {

        // Fetch the web page using axios.
        const response = await axios.get(url, { timeout: SCRAPE_TIMEOUT });

        // If the response status is not 200, throw an error.
        if (response.status !== 200) throw new Error(`Failed to fetch ${url}: ${response.status}`);

        // Extract the HTML from the response data using cheerio.
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract all URLs from the web page and add them to the queue for processing.
        const urls = $('a[href]').map((i, el) => $(el).attr('href')).get();
        for (const u of urls) {
            try {
                const absUrl = new URL(u, url).href;

                // Add the URL to the queue if it meets certain conditions.
                if (!all.has(absUrl)) {
                    if (absUrl.startsWith('https://shopify.dev') && !visited.has(absUrl) && !absUrl.includes('#')) {
                        queue.push({ url: absUrl, retries: 0 }); // enqueue for processing
                        all.add(absUrl);
                    }
                }
            } catch (e) {
                console.error(`Invalid URL "${u}" on page ${url}: ${e.message}`);
            }

            // Create a file name based on the URL and replace any invalid characters.
            const fileName = new URL(url).pathname.replace('/', '').replaceAll('/', '-').replace('https-', '').replace('www-', '').replace(':', '').replace('.', '-');

            // Create a relative file path based on the file name and the specified file directory.
            const relFilePath = path.join(filepath, fileName);

            // If the file already exists, skip it.
            if (fs.existsSync(relFilePath)) {
                continue;
            }

            // Extract the main article content from the web page.
            const article = $('.article--docs');

            // If no article content is found, skip the URL.
            if (article.length === 0) {
                continue;
            }

            // Extract the article HTML and replace any relative URLs with absolute URLs.
            let articleHTML = article.html().trim();
            article.find('a[href], img[src]').each((i, el) => {
                const attr = el.tagName === 'a' ? 'href' : 'src';
                const value = $(el).attr(attr);
                if (value && !value.startsWith('http')) {
                    const absUrl = new URL(value, base).href;
                    $(el).attr(attr, absUrl);
                }
            });
            articleHTML = article.html();

            // Convert the article content to markdown, HTML, and plain text.
            const date = DateTime.now().toLocaleString(DateTime.DATETIME_FULL);
            const markdown = `<!-- Page URL: ${url}\nDate scraped: ${date} -->\n\n${turndownService.turndown(articleHTML)}`;
            const html = `<!-- Page URL: ${url}\nDate scraped: ${date} --> \n\n${articleHTML}`;
            const text = `<!-- Page URL: ${url}\nDate scraped: ${date} --> \n\n${article.text()}`;

            // Write files to disk
            fs.mkdirSync(relFilePath, { recursive: true });
            fs.writeFileSync(path.join(relFilePath, 'index.md'), markdown);
            fs.writeFileSync(path.join(relFilePath, 'index.html'), html);
            fs.writeFileSync(path.join(relFilePath, 'index.txt'), text);

            // Write meta data needed to build metadata.json
            metaData.push({
                url,
                path: fileName,
                title: $('title').first().text()
            })
            scrapedPagesCount++;
        }
        console.log(`[${queue.length()}] [${scrapedPagesCount}] ${url}`); // print scraped URL
    } catch (e) {
        if (retries < MAX_RETRIES) {
            console.error(`Error scraping ${url}: ${e.message}, retrying...`);
            setTimeout(() => {
                queue.push({ url, retries: retries + 1 }); // retry after delay
            }, RETRY_DELAY);
        } else {
            console.error(`Error scraping ${url}: ${e.message}, giving up.`);
        }
    }
}

// Initialize the queue with the root URL and retry count 0
queue.push({ url: base, retries: 0 });

// When the queue is empty, write the metadata to a JSON file and create a tarball of the scraped files
queue.drain(() => {

    // Write metadata to a JSON file
    fs.writeFileSync(path.join(filepath, 'metadata.json'), JSON.stringify(metaData, null, 2));

    // Create a tarball of the scraped files
    tar.c(
        {
            gzip: true,     // Compress the tarball with gzip
            file: 'tar-ball.tar.gz',     // Set the name of the tarball file
            cwd: filepath   // Set the current working directory for the tarball
        },
        fs.readdirSync(filepath)    // Read the directory to create the tarball from
    )
        .then(() => {
            console.log(`Tarball created}`);   // Log a success message when the tarball is created
        })
        .catch((err) => {
            console.error(`Error creating tarball: ${err}`);   // Log an error message if there was an error creating the tarball
        });

    console.log('All items have been processed!');  // Log a message when all items have been processed
});
