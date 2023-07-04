**Allgemein:**
- [x] Konfiguration via Web-Oberfläche statt über ioBroker
- [x] Die Arbeitsfläche lässt sich frei in Breite und Hoehe gestalten
- [x] Grundwerte koennen für jedes Element angegeben werden, damit sie nicht erneut fuer jedes Element geaendert werden muessen
- [x] Alle Datenpunkt-Anzeigen lassen sich fuer sich selbst konfigurieren:
- Quelle kann W oder kW sein
- Umrechnung von W in kW kann erfolgen
- Einheit wird pro Element gewählt 
- jede Datenquelle kann ihren eigenen Schwellenwert haben
- Anzahl der Dezimalstellen ist waehlbar (0, 1, 2)
- [x] Der Benutzer kann unbegrenzt viele Datenpunkte ueber den Object-Browser hinzufuegen, die im Adapter verwendet werden
- [x] Fuer den gesamten Workspace lassen sich eigene CSS Styles integrieren, die der Benutzer frei festlegen kann
- [x] Es gibt eine Erinnerung, wenn die Seite verlassen, Änderungen aber nicht gespeichert wurden
- [x] Waehrend der Konfiguration eines Elements wird der aktuelle Status gespeichert - dieser erlaubt es, das Element in seinem urspruenglichen Status wiederherzustellen
- [x] Alle Seiten sind responsive. Sie laufen auf PC, Tablet, Handy und lassen sich dort auch konfigurieren
- [x] Der Adapter benutzt die schnelleren Web-Sockets von ioBroker und reagiert etwa 10 Mal schneller, jedoch auch 10 Mal schonender im Browser (oder anderer Anzeige)
- [x] verschiedene Grundeinstellungen koennen festgelegt werden, um Farben, Groeßen, Formen vorzubelegen

**Elemente:**
- [x] Es koennen **unbegrenzt** viele Elemente auf der Arbeitsflaeche abgelegt werden (Texte, Datenpunkte, Rechtecke, Kreise, Icons, etc.)
- [x] Groeße, Position, Farbe, Schatten, Transparenz anpassbar
- [x] Positionierung via Maus, Tastatur oder Koordinaten-Eingabe
- [x] Fange Elemente mit der Maus, um mehrere zu verschieben 
- [x] Richte Elemente aneinander aus (mitte, rechts, links, vertikale Oberkante, vertikale Unterkante und vertikaler Mittelpunkt)
- [x] Rechtecke oder Kreise koennen mit einem Datenpunkt belegt werden und anhand des Wertes eine Fuellfarbe erhalten. Diese kann prozentual sein oder anhand eines Wertes:
- Prozent: Das Element wird anhand des Datenpunktes prozentual gefuellt
- max. Wert: Das Element wird erneut prozentual gefuellt, jedoch anhand des Wertes. Beispiel: max Wert 4000, Datenpunkt-Wert 3000 -> 3000/4000 * 100 -> 75%
- [x] Web-Adressen hinterlegbar, auf die bei einem Klick/Tap verwiesen wird. 
- Anzeige in Overlay, einer neuen Seite (Tab) oder derselben Seite moeglich
- [x] Elemente koennen dupliziert werden
- [x] CSS-Klassen koennen den verschiedenen Stati des Datenpunktes zugewiesen werden. Aktiv positiv, Aktiv negativ, Inaktiv positiv und Inaktiv negativ

**Texte:**
- [x] Die letzte Änderung des Datenpunktes kann angezeigt werden. Relativ zu jetzt, Zeitstempel DE und Zeitstempel US
- [x] Textausrichtung ist moeglich (rechts, mitte, links)
- [x] Datenpunkte, die sowohl positive als auch negative Werte liefern, koennen positiv dargestellt werden, wenn sie negativ sind

**Icons:**
- [x] Icons von Iconify (https://iconify.design/) lassen sich direkt ueber den Energiefluss Workspace integrieren
- [x] Groeße, Position, Farbe, Schatten, Transparenz anpassbar
- [ ] Datenpunkt zuweisen (in Arbeit)

**Animation:**
- [x] Anpassbar (Farbe der Punkte, Farbe der Linie)
- [x] positiver oder negativer Datenpunkt Wert
- [x] Schwellenwert moeglich
- [x] Es kann die Geschwindigkeit oder die Anzahl der Punkte anhand der Last geaendert werden
- [x] Bi-direktionale Linien möglich (Aenderung der Animationsrichtung bei Wechsel von positiv zu negativ)

**Verbindungen:**
- [x] Elemente (Kreis oder Rechteck) koennen frei untereinander verbunden werden. Es gibt einen **Element Modus** und einen **Connection Point**-Modus.
- Element: Die Linie wird immer am naechst passenden Eingang angedockt und verschiebt sich passend, wenn das Element bewegt wird.
- Connection Point: Die Linie wird einem der verfuegbaren 12 moeglichen Eingaenge zugewiesen und haelt diesen bei, auch wenn das Element bewegt wird
- [x] Jede Linie kann neu verbunden werden - auch wenn bereits Einstellungen auf der Linie gemacht wurden

**Berechnungen:**
- [x] Berechnung der Batterielaufzeit (Laden & Entladen) kann ueber die Quelle berechnet werden
