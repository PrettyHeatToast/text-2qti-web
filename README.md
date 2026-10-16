# text-2qti-web

Webtool die quizzen in [text2qti](https://github.com/gpoore/text2qti)-formaat omzet naar een QTI 1.2-zip voor import in Canvas.

## Bestaande toets digitaliseren

1. Klik op **Copy AI prompt** en plak de prompt samen met de oude toets in een AI-tool.
2. Plak het resultaat in de editor en controleer de preview en de gele waarschuwingen.
3. Klik op **Download QTI Zip** en importeer die in Canvas (Instellingen → Import Course Content → QTI .zip).

## Afbeeldingen en bijlagen

- Klik op **Import images from Word** en kies het originele .docx: alle afbeeldingen worden in documentvolgorde toegevoegd als `figure1.png`, `figure2.png`, … (de namen uit de AI-prompt), zodat de verwijzingen in de AI-output meteen kloppen. Afbeeldingen in kop-/voetteksten worden overgeslagen; EMF/WMF/TIFF worden niet ondersteund. Een nieuwe import vervangt de eerdere `figureN`-bestanden.
- Voeg bestanden toe met **Add files**, sleep ze in de editor, of plak een afbeelding uit het klembord.
- Gebruik `![beschrijving](figuur1.png)` voor een afbeelding en `[tekst](bijlage.pdf)` voor een bijlage; dit kan in vraagtekst, antwoorden en feedback.
- Ondersteund: png, jpg, gif, svg, webp, pdf, doc(x), xls(x), ppt(x), txt, csv, zip. Maximaal 5 MB per bestand en 50 MB in totaal.
- Canvas heeft geen bijlageveld bij quizvragen: een bijlage wordt een link naar het bestand dat Canvas bij het importeren in de cursusbestanden zet.

Niet ondersteund: tabellen, LaTeX en Markdown-opmaak.

## Gebruik

Open `index.html` in de browser. Er is geen build nodig.
