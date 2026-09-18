# Peugeot e-2008 CAN Logger Web v3.1

Mobilførst PWA for Peugeot e-2008 / PSA e-CMP med diagnose, rå CAN-monitor og Auto Decode.

## Nytt i v3
- Nytt responsivt mobil-GUI
- App-lignende toppfelt og fast bunnnavigasjon
- Live-kort for SOC, HV-spenning og celle-delta
- Egen installasjonsside for Android og Apple
- Android PWA-installasjon via `beforeinstallprompt` når Chrome tilbyr det
- Apple touch icon og iOS web-app metadata
- 192 / 512 / maskable appikoner
- Oppgradert Web App Manifest
- Offline-cache / service worker v3
- Plattformdeteksjon og kompatibilitetsstatus
- iPhone/iPad installasjonsveiledning
- Tydelig varsel når Web Serial mangler

## Android
Anbefalt:
1. Legg webappen på GitHub Pages eller annen HTTPS-host.
2. Åpne URL-en i Chrome/Chromium på Android.
3. Par Bluetooth Classic ELM327 med telefonen.
4. Trykk `Installer app`.
5. Start e-2008 CAN fra hjemskjerm/appskuff.
6. Trykk `Koble til adapter`.

Web Serial krever en nettleser som eksponerer API-et og kompatibel Bluetooth/serial transport.

## iPhone / iPad
Installer fra Safari:
1. Åpne nettstedet i Safari.
2. Trykk Del.
3. Velg Legg til på Hjem-skjermen.
4. Slå på Åpne som webapp.
5. Trykk Legg til.

Viktig: Safari/iOS har ikke Web Serial. PWA-en kan installeres, men Bluetooth Classic ELM327-tilkoblingen i webversjonen er derfor ikke tilgjengelig på iPhone/iPad.

For full CAN-tilkobling på iOS må transportlaget endres, typisk til en iOS-kompatibel BLE/Wi-Fi-adapter og en transportmetode iOS faktisk støtter, eller en native iOS-app.

## Eksisterende funksjoner
- UDS-database for e-CMP
- SOC / SOH / HV-spenning / HV-strøm
- cellespenninger og temperaturer
- rå CAN-monitor
- baseline diff
- event tagging
- Auto Decode kandidat-rangering
- JSON / CSV eksport

## Sikkerhet
Appen er laget som read-only logger. Auto Decode-resultater må verifiseres før signalnavn og skalering regnes som bekreftet.


## v3.1 – direkte åpning på Android
`index.html` inneholder nå CSS, JavaScript, database og hovedikon direkte i filen.
Dermed vises GUI-et riktig også når Android åpner filen som `content://...`.

Dette er lokal forhåndsvisning:
- Web Serial / Bluetooth Classic CAN krever sikker kontekst (HTTPS)
- PWA-installasjon/service worker krever hosting over HTTPS
- GitHub Pages anbefales for full funksjon
