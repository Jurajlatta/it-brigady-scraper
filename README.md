# 🤖 IT Brigády Scraper (Bratislava)

Tento projekt je plne automatizovaný Node.js bot (scraper), ktorý beží nepretržite 24/7 prostredníctvom **GitHub Actions**. Slúži na monitorovanie pracovných portálov (Profesia.sk, Brigada.sk) a vyhľadávanie nových IT brigád a čiastočných úväzkov pre študentov v Bratislave. 

V momente, keď systém deteguje novú pracovnú ponuku spĺňajúcu presné kritériá (pozitívne a negatívne kľúčové slová), odošle notifikáciu vrátane vygenerovaného návrhu motivačného listu priamo na vopred nastavený **Discord kanál** pomocou Webhooku.

## 🛠️ Použité technológie a architektúra
- **Node.js** - Runtime prostredie pre beh skriptu.
- **Axios** - Zabezpečuje asynchrónne HTTP požiadavky na stiahnutie zdrojového kódu pracovných portálov (s využitím custom hlavičiek pre anti-bot bypass).
- **Cheerio** - Slúži na parsovanie a extrakciu štruktúrovaných dát (názov pozície, link, ID) z DOM štruktúry stránok.
- **GitHub Actions** - Zabezpečuje serverless beh skriptu (cron job každé 2 hodiny).
- **Discord Webhooks** - Rýchle doručovanie push notifikácií na Discord server.
- **FS (File System)** - Práca so stavovým súborom `videl_som.json`, ktorý zabezpečuje deduplikáciu inzerátov a slúži ako malá lokálna pamäť robota (tzv. state management).

## 🧠 Ako funguje filtrovanie inzerátov
Skript využíva pokročilé regulárne výrazy (RegExp) pre presný záchyt ponúk bez takzvaných "false-positives" (falošných zhôd).
- **Pozitívne kľúčové slová:** Skript očakáva zhodu aspoň jedného slova (napr. `cisco`, `php`, `it podpora`, `junior`, `tester`). Kratšie slová (ako `it`, `c`, `js`) sú izolované word-boundaries `(^|[^a-zA-Z0-9_])`, aby sa zamedzilo zhode s inými slovami (napr. slovo "kval**it**a" nespustí notifikáciu pre kľúčové slovo "it").
- **Negatívne kľúčové slová:** Skript automaticky vyraďuje ponuky, ktoré explicitne vyžadujú senioritu, prípadne TPP (napr. `senior`, `tpp`, `full-time`).

## 🚀 Inštalácia a spustenie (lokálne)

1. Naklonovanie repozitára:
```bash
git clone https://github.com/Jurajlatta/it-brigady-scraper.git
cd it-brigady-scraper
```

2. Inštalácia závislostí:
```bash
npm install
```

3. Nastavenie premenného prostredia pre Discord Webhook:
```powershell
$env:WEBHOOK_URL="https://discordapp.com/api/webhooks/..."
```

4. Spustenie skriptu:
```bash
node scraper.js
```

---
*Vytvorené za účelom zefektívnenia hľadania relevantnej študentskej stáže a brigády v IT sektore.*