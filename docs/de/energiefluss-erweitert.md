- [x] Konfiguration via Web-Oberfläche statt über ioBroker
- [x] Die Arbeitsfläche lässt sich frei in Breite und Höhe gestalten
- [x] Es können **unbegrenzt** viele Elemente auf der Arbeitsfläche abgelegt werden (Texte, Datenpunkte, Rechtecke, Kreise, Icons, etc.)
- [x] Jedes Element lässt sich in Größe, Position, Farbe, Schatten, Transparenz anpassen
- [x] Elemente können via Maus, Tastatur oder Koordinaten-Eingabe positioniert werden
- [x] Elemente können aneinander ausgerichtet werden (mitte, rechts, links, vertikale Oberkante, vertikale Unterkante und vertikaler Mittelpunkt)
- [x] Animationen lassen sich anpassen (Farbe der Punkte, Farbe der Linie)
- [x] Animationen können erfolgen, wenn der Datenpunkt Wert positiv oder negativ ist. Auch hier ist ein Schwellenwert möglich.
- [x] Die Elemente können frei untereinander verbunden werden. Es gibt einen Element Modus und einen Connection Point Modus.
- **Element:** Die Linie wird immer am nächst passenden Eingang angedockt und verschiebt sich passend, wenn das Element bewegt wird.
- **Connection Point:** Die Linie wird einem der verfügbaren 12 möglichen Eingänge zugewiesen und hält diesen bei, auch wenn das Element bewegt wird
- [x] Der Benutzer kann unbegrenzt viele Datenpunkte über den Object-Browser hinzufügen, die im Adapter verwendet werden
- [x] Jedem Datenpunkt-Text, Rechteck oder Kreis kann ein Datenpunkt zugewiesen werden
- [x] Alle Datenpunkt-Anzeigen lassen sich für sich selbst konfigurieren:
Quelle kann W oder kW sein, Umrechnung von W in kW kann erfolgen - muss aber nicht, die Einheit wird pro Element gewählt, jede Datenquelle kann ihren eigenen Schwellenwert haben, die Anzahl der Dezimalstellen ist wählbar (0, 1, 2)
- [x] Rechtecke oder Kreise können mit einem Datenpunkt belegt werden und anhand des Wertes eine Füllfarbe erhalten. Diese kann prozentual sein oder mit maximalem Wert.
**Prozent:** Das Element wird anhand des Datenpunktes prozentual gefüllt
**max. Wert:** Das Element wird erneut prozentual gefüllt, jedoch anhand des Wertes. Beispiel: max Wert 4000, Datenpunkt-Wert 3000 -> 3000/4000 * 100 -> 75%
- [x] Datenpunkte, die sowohl positive als auch negative Werte liefern, können positiv dargestellt werden, wenn sie negativ sind (und nur dann)
- [x] Icons von Iconify (https://iconify.design/) lassen sich direkt über den Energiefluss Workspace integrieren und in ihrer Farbe, Größe, Position und Schattierung anpassen
- [x] Für den gesamten Workspace lassen sich eigene CSS Style integrieren, die der Benutzer frei festlegen kann
- [x] Es gibt eine Erinnerung, wenn die Seite verlassen wurde, Änderungen aber nicht gespeichert wurden
- [x] Während der Konfiguration eines Elements wird der aktuelle Status gespeichert - dieser erlaubt es, das Element in seinem ursprünglichen Status wiederherzustellen, sollte man sich verklickt haben
- [x] Bei Rechtecken und Kreisen können nun Adressen hinterlegt werden, auf die bei einem Klick/Tap verwiesen wird. Die Anzeige ist in einem Overlay, einer neuen Seite (Tab) oder derselben Seite möglich
- [x] Alle Seiten sind responsive - heisst, sie laufen auf PC, Tablet, Handy und lassen sich dort auch konfigurieren
- [x] Der Adapter benutzt nun die schnelleren Web-Sockets von ioBroker und reagiert etwa 10 Mal schneller, jedoch auch 10 Mal schonender im Browser (oder anderer Anzeige)
