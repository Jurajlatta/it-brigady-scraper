const fs = require('fs');
const cheerio = require('cheerio');
const axios = require('axios');

const path = require('path');

// Webhook URL sa číta z prostredia (WEBHOOK_URL) alebo z lokálneho súboru webhook.local.txt.
// Súbor webhook.local.txt je v .gitignore, takže sa nikdy nedostane na GitHub.
function loadWebhook() {
    if (process.env.WEBHOOK_URL) return process.env.WEBHOOK_URL.trim();
    const file = path.join(__dirname, 'webhook.local.txt');
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
    return 'YOUR_DISCORD_WEBHOOK_URL_HERE';
}
const WEBHOOK_URL = loadWebhook();
const SEEN_FILE = path.join(__dirname, 'videl_som.json');

// Voliteľné: ak je nastavený SCRAPERAPI_KEY, požiadavky idú cez ScraperAPI (potrebné pri blokovaní IP na GitHub Actions).
// Bez kľúča sa stránky sťahujú priamo (zadarmo, funguje z domácej IP).
const SCRAPER_API_KEY = process.env.SCRAPERAPI_KEY;
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'sk-SK,sk;q=0.9,en;q=0.8'
};
const DRY_RUN = process.argv.includes('--dry-run');
// --seed: aktuálne ponuky sa len uložia ako videné (bez Discord notifikácií), aby prvé spustenie nezaplavilo kanál.
const SEED = process.argv.includes('--seed');

function fetchPage(targetUrl) {
    if (SCRAPER_API_KEY) {
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&country_code=sk`;
        return axios.get(proxyUrl, { timeout: 60000 });
    }
    return axios.get(targetUrl, { headers: BROWSER_HEADERS, timeout: 30000 });
}

// Filtre
const positiveKeywords = ['it', 'cisco', 'ccna', 'sieť', 'siete', 'lan', 'php', 'javascript', 'js', 'html', 'c', 'c++', 'hardware', 'hardvér', 'support', 'helpdesk', 'tester', 'it podpora', 'junior', 'technik', 'technical', 'admin', 'správca'];
const negativeKeywords = ['tpp', 'full-time', 'full time', 'plný úväzok', 'senior', 'medior', '18+', 'director', 'riaditeľ', 'vedúci', 'leader', 'sales', 'obchodn'];

// Funkcia pre formátovanie motivačného listu
const getCoverLetter = (title, url) => `
**Nová IT brigáda:** ${title}
**Link:** ${url}

**Návrh motivačného listu:**
Dobrý deň,

reagujem na Vašu ponuku práce "${title}". Som študentom 3. ročníka na SPŠE Karola Adlera v Bratislave. 
Mám zručnosti v oblastiach: LAN, Cisco CCNA, PHP, JS, C. 
Rovnako mám skúsenosti s prácou v rýchlom tempe z prostredia rýchleho občerstvenia, čo ma naučilo zvládať stresové situácie a efektívne pracovať v tíme.

Budem rád za príležitosť zúčastniť sa osobného pohovoru.

S pozdravom,
Juraj Latta
`;

// Funkcia na odoslanie na Discord
async function notifyDiscord(title, url) {
    if (DRY_RUN) {
        console.log(`[dry-run] Odoslala by sa notifikácia: ${title}`);
        return;
    }
    if (SEED) return;
    if (WEBHOOK_URL === 'YOUR_DISCORD_WEBHOOK_URL_HERE') {
        console.log('Webhook URL nie je nastavená, preskakujem notifikáciu.');
        return;
    }
    const message = getCoverLetter(title, url);
    try {
        await axios.post(WEBHOOK_URL, { content: message });
        console.log(`Notifikácia odoslaná pre: ${title}`);
    } catch (error) {
        console.error(`Chyba pri odosielaní na Discord: ${error.message}`);
    }
}

// Funkcia na filtrovanie inzerátov podľa podmienok
function filterJob(title) {
    const lowerTitle = title.toLowerCase();
    
    // Pozitívny filter (musí obsahovať aspoň 1 slovo)
    const hasPositive = positiveKeywords.some(kw => {
        // Pre krátke slová obmedzenie na celé slovo (aby "c" nenamatchovalo "práca")
        if (['it', 'c', 'js', 'lan', 'php'].includes(kw)) {
            return new RegExp("(^|[^a-zA-Z0-9_])" + kw + "([^a-zA-Z0-9_]|$)", 'i').test(lowerTitle);
        }
        if (kw === 'c++') {
            return lowerTitle.includes('c++');
        }
        return lowerTitle.includes(kw);
    });

    // Negatívny filter (nesmie obsahovať žiadne zo slov)
    const hasNegative = negativeKeywords.some(kw => {
        // Pre "tpp" používame word boundaries aby nenašlo napr. iné slovo s "tpp"
        if (['tpp'].includes(kw)) {
            return new RegExp("(^|[^a-zA-Z0-9_])" + kw + "([^a-zA-Z0-9_]|$)", 'i').test(lowerTitle);
        }
        return lowerTitle.includes(kw);
    });

    return hasPositive && !hasNegative;
}

// Hlavná funkcia skriptu
async function scrape() {
    let seen = [];
    if (fs.existsSync(SEEN_FILE)) {
        seen = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8'));
    }

    let newJobsFound = false;

    try {
        // --- 1. Zdroj: Profesia.sk (strany 1-4) ---
        console.log('Scraping Profesia.sk (strany 1-4)...');
        for (let pageNum = 1; pageNum <= 4; pageNum++) {
            try {
                const profesiaUrl = `https://www.profesia.sk/praca/bratislavsky-kraj/brigada,skrateny-uvazok/?search_anywhere=IT&page_num=${pageNum}`;
                const response = await fetchPage(profesiaUrl);
                let $ = cheerio.load(response.data);
                
                const profesiaJobs = [];
                $('.list-row').each((i, el) => {
                    // Štruktúra Profesie: <h2><a id="offerXXXX" href="..."><span class="title">Názov</span></a></h2>
                    const titleEl = $(el).find('h2 a').first();
                    const title = titleEl.text().trim();
                    const href = (titleEl.attr('href') || '').split('?')[0];

                    if (title && href) {
                        const id = titleEl.attr('id') || href;
                        const url = href.startsWith('http') ? href : `https://www.profesia.sk${href}`;
                        profesiaJobs.push({ id, title, url });
                    }
                });

                console.log(`Profesia (strana ${pageNum}): Nájdených inzerátov na stránke: ${profesiaJobs.length}`);

                for (const job of profesiaJobs) {
                    if (!seen.includes(job.id) && filterJob(job.title)) {
                        console.log(`Nájdená zhoda (Profesia): ${job.title}`);
                        await notifyDiscord(job.title, job.url);
                        seen.push(job.id);
                        newJobsFound = true;
                    }
                }

                // Ak na danej strane už nie sú inzeráty, zastavíme
                if (profesiaJobs.length === 0) {
                    break;
                }
            } catch (err) {
                console.error(`Chyba pri načítaní Profesia strany ${pageNum}: ${err.message}`);
            }
        }

        // --- 2. Zdroj: Brigada.sk (strany 1-4) ---
        console.log('Scraping Brigada.sk (strany 1-4)...');
        for (let pageNum = 1; pageNum <= 4; pageNum++) {
            try {
                const brigadaUrl = pageNum === 1
                    ? 'https://www.brigada.sk/brigady-v-bratislavskom-kraji'
                    : `https://www.brigada.sk/brigady-v-bratislavskom-kraji?page=${pageNum}`;
                const response = await fetchPage(brigadaUrl);
                let $ = cheerio.load(response.data);

                const brigadaJobs = [];
                $('a[href*="/brigady-na-slovensku/"]').each((i, el) => {
                    const title = $(el).text().trim();
                    const href = $(el).attr('href');
                    
                    if (title && href && title.length > 3) {
                        const url = href.startsWith('http') ? href : `https://www.brigada.sk${href}`;
                        const id = url;
                        if (!brigadaJobs.some(j => j.id === id)) {
                            brigadaJobs.push({ id, title, url });
                        }
                    }
                });

                console.log(`Brigada.sk (strana ${pageNum}): Nájdených inzerátov na stránke: ${brigadaJobs.length}`);

                for (const job of brigadaJobs) {
                    if (!seen.includes(job.id) && filterJob(job.title)) {
                        console.log(`Nájdená zhoda (Brigada.sk): ${job.title}`);
                        await notifyDiscord(job.title, job.url);
                        seen.push(job.id);
                        newJobsFound = true;
                    }
                }

                // Ak na stránke nie sú žiadne inzeráty (skončil zoznam ponúk), ukončíme cyklus
                if (brigadaJobs.length === 0) {
                    break;
                }
            } catch (err) {
                console.error(`Chyba pri načítaní Brigada.sk strany ${pageNum}: ${err.message}`);
            }
        }

    } catch (error) {
        console.error('Celková chyba počas scrapovania:', error);
    }

    // Uloženie len vtedy, ak sa našli nové brigády
    if (newJobsFound && !DRY_RUN) {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log('Súbor videl_som.json bol aktualizovaný.');
    } else {
        console.log('Žiadne nové brigády nespĺňajúce kritériá.');
    }
}

scrape();
