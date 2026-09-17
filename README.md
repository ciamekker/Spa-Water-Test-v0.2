# Spa Water Test – PWA prototype v0.6.2

Dette er en første fungerende prototype som kan kjøres i nettleser på Android og installeres som en PWA.

## Funksjoner
- Ta bilde med mobilkamera eller velg fra galleri
- Leser tre definerte fargefelt på en vertikal 3-i-1-teststripe
- Estimerer fritt klor, pH og total alkalinitet
- Viser anbefalt område og status
- Lagrer historikk lokalt på telefonen
- Kan installeres på Android fra nettleseren
- Fungerer offline etter første innlasting

## Viktig
Fargeverdiene i `app.js` er kalibrert fra brukerens eget bilde av teststripe-boksen. Skalaen er Cl 0/0,5/1/3/5 mg/l, pH 6,8/7,2/7,6/8,0/8,4 og TA 0/80/120/180/240 mg/l. Kameraets hvitbalanse og lysforhold kan fortsatt påvirke resultatet.

## Kjør lokalt
PWA/service worker krever HTTP/HTTPS. Eksempel:
`python -m http.server 8080`
Åpne deretter `http://localhost:8080` i nettleseren.

For ekte Android-bruk bør prosjektet publiseres på HTTPS, f.eks. Netlify, Vercel eller GitHub Pages.


Standard spa-volum: 600 L. Kalibreringsreferanse oppdatert 15.09.2026.


## v0.7.0
- Forsiktig automatisk hvitbalanse/lyskompensasjon før fargematching.
- Testbildet lagres sammen med resultatet i historikken via IndexedDB.
- Trykk på en historikkmåling for å åpne/lukke originalbildet.
- Fortsatt kalibrert for 600 L og brukerens 3-i-1-skala.
