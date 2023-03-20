const axios = require('axios');
const cheerio = require('cheerio');
const { URL } = require('url');
const async = require('async');
const TurndownService = require('turndown');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');
const tar = require('tar');

const base = 'https://shopify.dev';
const MAX_CONCURRENCY = 100; // maximum number of concurrent requests
const MAX_RETRIES = 3; // maximum number of retries for failed requests
const RETRY_DELAY = 1000; // delay between retries in milliseconds
const SCRAPE_TIMEOUT = 30000; // maximum time for scraping a URL in milliseconds
let ctr = 0;
const filepath = path.resolve('./data');

let metaData = [];

if (fs.existsSync(filepath)) fs.rmdirSync(filepath, { recursive: true });

const turndownService = new TurndownService();
const visited = new Set(); // set to keep track of visited URLs
const all = new Set(); // set to keep track of visited URLs

all.add(base);

const queue = async.queue(async ({ url, retries }) => {
    await scrapeUrl(url, retries);
}, MAX_CONCURRENCY); // queue to manage the processing of URLs

async function scrapeUrl(url, retries = 0) {
    if (visited.has(url)) return; // skip if already visited
    visited.add(url); // mark as visited
    try {
        const response = await axios.get(url, { timeout: SCRAPE_TIMEOUT });
        if (response.status !== 200) throw new Error(`Failed to fetch ${url}: ${response.status}`);
        const html = response.data;
        const $ = cheerio.load(html);
        const urls = $('a[href]').map((i, el) => $(el).attr('href')).get();
        for (const u of urls) {
            try {
                const absUrl = new URL(u, url).href;
                if (!all.has(absUrl)) {
                    if (absUrl.startsWith('https://shopify.dev') && !visited.has(absUrl) && !absUrl.includes('#')) {
                        queue.push({ url: absUrl, retries: 0 }); // enqueue for processing
                        all.add(absUrl);
                    }
                }
            } catch (e) {
                console.error(`Invalid URL "${u}" on page ${url}: ${e.message}`);
            }

            const fileName = new URL(url).pathname.replace('/', '').replaceAll('/', '-').replace('https-', '').replace('www-', '').replace(':', '').replace('.', '-')
            const relFilePath = path.join(filepath, fileName);

            if (fs.existsSync(relFilePath)) {
                continue;
            }

            const article = $('.article--docs');

            if (article.length === 0) {
                // console.log(`No content found for ${url}`);
                continue;
            }

            let articleHTML = article.html().trim();

            if (articleHTML.length === 0) {
                continue;
            }

            article.find('a[href], img[src]').each((i, el) => {
                const attr = el.tagName === 'a' ? 'href' : 'src';
                const value = $(el).attr(attr);
                if (value && !value.startsWith('http')) {
                    const absUrl = new URL(value, base).href;
                    $(el).attr(attr, absUrl);
                }
            });

            articleHTML = article.html();

            const date = DateTime.now().toLocaleString(DateTime.DATETIME_FULL);
            const markdown = `<!-- Page URL: ${url}\nDate scraped: ${date} -->\n\n${turndownService.turndown(articleHTML)}`;
            const html = `<!-- Page URL: ${url}\nDate scraped: ${date} --> \n\n${articleHTML}`;
            const text = `<!-- Page URL: ${url}\nDate scraped: ${date} --> \n\n${article.text()}`;

            fs.mkdirSync(relFilePath, { recursive: true });
            fs.writeFileSync(path.join(relFilePath, 'index.md'), markdown);
            fs.writeFileSync(path.join(relFilePath, 'index.html'), html);
            fs.writeFileSync(path.join(relFilePath, 'index.txt'), text);

            metaData.push({
                url,
                path: fileName,
                title: $('title').text()
            })
            ctr++;
        }
        console.log(`[${queue.length()}] [${ctr}] ${url}`); // print scraped URL
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

queue.push({ url: base, retries: 0 }); // start with the root URL

queue.drain(() => {
    console.log('All items have been processed! writing meta data and building tarball. Please wait!');
    // write meta data to file
    fs.writeFileSync(path.join(filepath, 'metadata.json'), JSON.stringify(metaData, null, 2));

    // logic to create tar ball

    tar.c(
        {
            gzip: true,
            file: 'tar-ball.tar.gz',
            cwd: filepath
        },
        fs.readdirSync(directoryPath)
    )
        .then(() => {
            console.log(`Tarball created}`);
        })
        .catch((err) => {
            console.error(`Error creating tarball: ${err}`);
        });

});
