const fs = require('fs');
const cheerio = require('cheerio');
const axios = require('axios');

// Webhook URL môže byť načítaná z prostredia (pre GitHub Actions) alebo zadaná natvrdo (pre testy)
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'YOUR_DISCORD_WEBHOOK_URL_HERE';
const SEEN_FILE = './videl_som.json';

// Filtre
const positiveKeywords = ['it', 'cisco', 'ccna', 'sieť', 'siete', 'lan', 'php', 'javascript', 'js', 'html', 'c', 'c++', 'hardware', 'hardvér', 'support', 'helpdesk', 'tester', 'it podpora', 'junior', 'technik', 'technical', 'admin', 'správca'];
const negativeKeywords = ['tpp', 'full-time', 'full time', 'plný úväzok', 'senior', 'medior', '18+'];

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

    // Axios konfigurácia s hlavičkami, ktoré predstierajú reálny prehliadač / bota
    const axiosConfig = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'sk,cs;q=0.9,en;q=0.8'
        },
        timeout: 15000
    };

    try {
        // --- 1. Zdroj: Profesia.sk ---
        console.log('Scraping Profesia.sk (strany 1-3)...');
        for (let pageNum = 1; pageNum <= 3; pageNum++) {
            try {
                const profesiaUrl = `https://www.profesia.sk/praca/bratislava/brigada,skrateny-uvazok/?search_anywhere=IT&page_num=${pageNum}`;
                const response = await axios.get(profesiaUrl, axiosConfig);
                let $ = cheerio.load(response.data);
                
                const profesiaJobs = [];
                $('.list-row').each((i, el) => {
                    const titleEl = $(el).find('.title a');
                    const title = titleEl.text().trim() || $(el).find('.title').text().trim();
                    const href = titleEl.attr('href');
                    
                    if (title && href) {
                        const id = $(el).attr('id') || href;
                        const url = href.startsWith('http') ? href : `https://www.profesia.sk${href}`;
                        profesiaJobs.push({ id, title, url });
                    }
                });

                console.log(`Profesia (strana ${pageNum}): Nájdených inzerátov na stránke: ${profesiaJobs.length}`);
                console.log(`HTML Title: ${$('title').text()}`);

                for (const job of profesiaJobs) {
                    if (!seen.includes(job.id) && filterJob(job.title)) {
                        console.log(`Nájdená zhoda (Profesia): ${job.title}`);
                        await notifyDiscord(job.title, job.url);
                        seen.push(job.id);
                        newJobsFound = true;
                    }
                }
            } catch (err) {
                console.error(`Chyba pri načítaní Profesia strany ${pageNum}: ${err.message}`);
            }
        }

        // --- 2. Zdroj: Brigada.sk ---
        console.log('Scraping Brigada.sk...');
        try {
            const response = await axios.get('https://www.brigada.sk/brigady-a-praca-pre-studentov/bratislava', axiosConfig);
            let $ = cheerio.load(response.data);

            const brigadaJobs = [];
            $('.inzerat').each((i, el) => {
                const titleEl = $(el).find('h2 a, h3 a').first();
                const title = titleEl.text().trim();
                const href = titleEl.attr('href');
                
                if (title && href) {
                    const url = href.startsWith('http') ? href : `https://www.brigada.sk${href}`;
                    const id = url;
                    brigadaJobs.push({ id, title, url });
                }
            });

            console.log(`Brigada.sk: Nájdených inzerátov na stránke: ${brigadaJobs.length}`);
            console.log(`HTML Title: ${$('title').text()}`);

            for (const job of brigadaJobs) {
                if (!seen.includes(job.id) && filterJob(job.title)) {
                    console.log(`Nájdená zhoda (Brigada.sk): ${job.title}`);
                    await notifyDiscord(job.title, job.url);
                    seen.push(job.id);
                    newJobsFound = true;
                }
            }
        } catch (err) {
            console.error(`Chyba pri načítaní Brigada.sk: ${err.message}`);
        }

    } catch (error) {
        console.error('Celková chyba počas scrapovania:', error);
    }

    // Uloženie len vtedy, ak sa našli nové brigády
    if (newJobsFound) {
        fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2));
        console.log('Súbor videl_som.json bol aktualizovaný.');
    } else {
        console.log('Žiadne nové brigády nespĺňajúce kritériá.');
    }
}

scrape();