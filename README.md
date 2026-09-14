# Spa Water Test v0.6 – GitHub Pages

Klar for GitHub Pages.

## Last opp
1. Pakk ut ZIP-filen.
2. Åpne GitHub-repositoriet ditt.
3. Velg **Add file → Upload files**.
4. Last opp FILENE i denne mappen slik at `index.html` ligger direkte i roten av repoet.
5. Commit changes.
6. Gå til **Settings → Pages**.
7. Velg **Deploy from a branch**, `main`, `/ (root)`, og Save.
8. Åpne GitHub Pages-adressen på Android i Chrome.

## Nytt i v0.6
- Ingen fast ramme for teststripen.
- Automatisk søk etter de tre fargefeltene i hele bildet.
- Stripen kan ligge vannrett eller loddrett og trenger ikke være i midten.
- Manuell fallback: trykk på de tre fargefeltene hvis automatisk søk bommer.
- Lokal fargeanalyse med enkel hvitbalansekorreksjon.
- Historikk lagres lokalt.
- PWA/installasjon på Android.

## Kalibrering
Skala: Cl 0 / 0,5 / 1 / 3 / 5 mg/l, pH 6,8 / 7,2 / 7,6 / 8,0 / 8,4 og TA 0 / 80 / 120 / 180 / 240 mg/l.

Kamera, lys og skjygger kan påvirke fargemålingen. Bruk jevnt, nøytralt lys.
