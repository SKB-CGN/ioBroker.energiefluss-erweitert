**Allgemein:**
- [x] Konfiguration via Web-Oberfläche statt über ioBroker
- [x] Die Arbeitsfläche lässt sich frei in Breite und Höhe gestalten
- [x] Grundwerte können für jedes Element angegeben werden, damit sie nicht erneut für jedes Element geaendert werden müssen
- [x] Alle Datenpunkt-Anzeigen lassen sich für sich selbst konfigurieren:
- Quelle kann W oder kW sein
- Umrechnung von W in kW kann erfolgen
- Einheit wird pro Element gewählt 
- jede Datenquelle kann ihren eigenen Schwellenwert haben
- Anzahl der Dezimalstellen ist wählbar (0, 1, 2)
- [x] Der Benutzer kann unbegrenzt viele Datenpunkte über den Object-Browser hinzufügen, die im Adapter verwendet werden
- [x] Für den gesamten Workspace lassen sich eigene CSS Styles integrieren, die der Benutzer frei festlegen kann
- [x] Es gibt eine Erinnerung, wenn die Seite verlassen, Änderungen aber nicht gespeichert wurden
- [x] Während der Konfiguration eines Elements wird der aktuelle Status gespeichert - dieser erlaubt es, das Element in seinem ursprünglichen Status wiederherzustellen
- [x] Alle Seiten sind responsive. Sie laufen auf PC, Tablet, Handy und lassen sich dort auch konfigurieren
- [x] Der Adapter benutzt die schnelleren Web-Sockets von ioBroker und reagiert etwa 10 Mal schneller, jedoch auch 10 Mal schonender im Browser (oder anderer Anzeige)

**Elemente:**
- [x] Es können **unbegrenzt** viele Elemente auf der Arbeitsfläche abgelegt werden (Texte, Datenpunkte, Rechtecke, Kreise, Icons, etc.)
- [x] Größe, Position, Farbe, Schatten, Transparenz anpassbar
- [x] Positionierung via Maus, Tastatur oder Koordinaten-Eingabe
- [x] Fange Elemente mit der Maus, um mehrere zu verschieben 
- [x] Richte Elemente aneinander aus (mitte, rechts, links, vertikale Oberkante, vertikale Unterkante und vertikaler Mittelpunkt)
- [x] Rechtecke oder Kreise können mit einem Datenpunkt belegt werden und anhand des Wertes eine Füllfarbe erhalten. Diese kann prozentual sein oder anhand eines Wertes:
- Prozent: Das Element wird anhand des Datenpunktes prozentual gefüllt
- max. Wert: Das Element wird erneut prozentual gefüllt, jedoch anhand des Wertes. Beispiel: max Wert 4000, Datenpunkt-Wert 3000 -> 3000/4000 * 100 -> 75%
- [x] Web-Adressen hinterlegbar, auf die bei einem Klick/Tap verwiesen wird. 
- Anzeige in Overlay, einer neuen Seite (Tab) oder derselben Seite möglich

**Texte:**
- [x] Die letzte Änderung des Datenpunktes kann angezeigt werden. Relativ zu jetzt, Zeitstempel DE und Zeitstempel US
- [x] Textausrichtung ist möglich (rechts, mitte, links)
- [x] Datenpunkte, die sowohl positive als auch negative Werte liefern, können positiv dargestellt werden, wenn sie negativ sind

**Icons:**
- [x] Icons von Iconify (https://iconify.design/) lassen sich direkt über den Energiefluss Workspace integrieren
- [x] Größe, Position, Farbe, Schatten, Transparenz anpassbar
- [ ] Datenpunkt zuweisen (in Arbeit)

**Animation:**
- [x] Anpassbar (Farbe der Punkte, Farbe der Linie)
- [x] positiver oder negativer Datenpunkt Wert
- [x] Schwellenwert möglich
- [x] Es kann die Geschwindigkeit oder die Anzahl der Punkte anhand der Last geändert werden

**Verbindungen:**
- [x] Elemente (Kreis oder Rechteck) können frei untereinander verbunden werden. Es gibt einen **Element Modus** und einen **Connection Point**-Modus.
- Element: Die Linie wird immer am nächst passenden Eingang angedockt und verschiebt sich passend, wenn das Element bewegt wird.
- Connection Point: Die Linie wird einem der verfügbaren 12 möglichen Eingänge zugewiesen und hält diesen bei, auch wenn das Element bewegt wird
- Jede Linie kann neu verbunden werden - auch wenn bereits Einstellungen auf der Linie gemacht wurden

**Berechnungen:**
- [x] Berechnung der Batterielaufzeit (Laden & Entladen) kann über die Quelle berechnet werden
