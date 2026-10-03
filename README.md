# Tikom G8000 für Home Assistant

Ein Seitenleisten-Panel für den Tikom G8000 (Tuya), komplett lokal über
[Tuya Local](https://github.com/make-all/tuya-local). Der Roboter braucht kein Internet.

Das Panel zeigt deinen selbst gemalten Wohnungsplan. Du tippst einen Raum an,
wählst Saugen, Wischen oder Beides und drückst "Los". Der Roboter fährt von der
Station in den Raum, reinigt dort die eingestellte Zeit und fährt zurück.

## Einrichtung in etwa 10 Minuten

Voraussetzung: HACS und Home Assistant 2026.8.0 oder neuer.

1. HACS > drei Punkte > **Benutzerdefinierte Repositories** > diese Repository-URL
   eintragen, Kategorie **Integration** > **Tikom G8000** herunterladen.
   Falls noch nicht vorhanden, auch **Tuya Local** herunterladen.
2. Home Assistant neu starten.
3. Einstellungen > Geräte & Dienste > **Integration hinzufügen** > "Tikom G8000".
   Das installiert die Gerätedatei für Tuya Local. Du siehst jetzt den Hinweis,
   dass dein Roboter in Tuya Local angelegt werden muss.
4. Home Assistant noch einmal neu starten (damit Tuya Local die neue Gerätedatei sieht).
5. In **Tuya Local** den Roboter hinzufügen und den Gerätetyp
   `tikom_g8000_robot_vacuum_mop` wählen. Gibt es schon ein Gerät mit einem anderen Typ
   (zum Beispiel "Vacuum and mop"), dieses vorher löschen. Die Entitäten heißen danach
   neu, bestehende Automationen dafür musst du anpassen.
6. "Tikom G8000" noch einmal hinzufügen. Gibt es genau einen Tuya-Local-Staubsauger,
   richtet sich alles ohne Rückfrage ein.
7. In der Seitenleiste **Mücke** (so heißt dein Roboter) öffnen. Das Panel führt dich durch
   drei Schritte, die du in der Liste "Einrichtung" abhaken kannst:
   1. **Roboter messen** (Tab "Fahren"): Roboter 5 Sekunden vorwärts fahren lassen,
      die Strecke mit dem Zollstock messen und eintragen. Dann dasselbe für das Drehen.
   2. **Plan malen** (Tab "Plan"): Räume anlegen, mit Pinsel oder Rechteck die Fläche malen,
      Teppiche markieren, die Ladestation setzen und ihre Blickrichtung wählen.
      Ein Foto deines Grundrisses kannst du als Vorlage zum Nachzeichnen hinterlegen.
   3. **Testfahrt** (Tab "Übersicht"): Raum antippen, "Nur hinfahren". Danach gibst du an,
      ob der Roboter zu kurz, zu weit, zu viel oder zu wenig gedreht hat.
      Jede Rückmeldung verbessert die Messwerte um 5 Prozent.

## Was du bekommst

| Bereich | Inhalt |
|---|---|
| Übersicht | Status, Akku, Plan mit antippbaren Räumen, Modus Saugen/Wischen/Beides, "Los", Testfahrt, Schnellwahl für Saugkraft und Wassermenge |
| Plan | Pinsel, Rechteck, Radierer, Teppiche, Station, Zielpunkt je Raum, Raumnamen, Farben, Minuten je Raum, Hintergrundbild, Rückgängig, automatisches Speichern |
| Fahren | Messung von Geschwindigkeit und Drehrate, Fahr-Tasten mit Aufnahme, Aufnahme als Weg für einen Raum speichern |
| Zubehör | Restzeit von Filter, Seitenbürste und Rollbürste, Einstellungen wie in der App |
| Entitäten | Staubsauger "Räume", Tasten und Zahlen je Raum, damit du Automationen und Dashboards bauen kannst |

Der Wischmodus meidet Teppiche automatisch, wenn du sie im Plan markiert hast.

## Räume als Home-Assistant-Bereiche

Einstellungen > Geräte & Dienste > Entitäten > `vacuum.<name>_raume` > Zahnrad >
**Map vacuum segments to areas**. Danach geht

```yaml
action: vacuum.clean_area
target:
  entity_id: vacuum.mucke_raume
data:
  cleaning_area_id:
    - kueche
```

## Grenzen

- **Keine automatische Kartenaufnahme.** Der G8000 gibt seine interne Karte über Tuya Local
  nicht heraus. Dein Plan ist deshalb selbst gemalt. Verschobene Stühle oder Gegenstände trägst
  du bei Bedarf im Plan nach. Die Rückmeldungen nach einer Fahrt gleichen nur
  Geschwindigkeit und Drehrate an, nicht die Möbel.
- **Fahrt ohne Sensorrückmeldung.** Der Roboter bekommt Fahrbefehle mit Zeiten. Auf langen Wegen
  summieren sich kleine Abweichungen. Kurze Wege mit wenigen Kurven funktionieren am besten.
- **Reinigung im Raum** läuft in der Betriebsart des Roboters (Smart, Kante oder Zufällig) für die
  eingestellten Minuten, nicht als gezeichnete Bahn.
- Der Roboter muss auf der Station stehen, bevor ein Raum startet.

## Sicherheit

- Das Panel und alle Befehle sind nur für Administratoren erreichbar.
- Jeder Befehl wird auf Typ, Länge und Wertebereich geprüft (Plan, Bild, Farben, Namen, Zeiten).
- Fahrbefehle sind begrenzt: höchstens 30 Sekunden je Schritt, 60 Schritte und 10 Minuten je Weg.
  Während der Roboter saugt, werden Fahrbefehle abgelehnt.
- Vom Panel wird genau eine Datei ausgeliefert, kein Ordner. Texte aus Plan und Entitäten
  werden vor der Anzeige maskiert.
- Beim Kopieren der Gerätedatei werden Symlinks und fremde Pfade abgelehnt.
- Es gibt keine Verbindung ins Internet.

## Fehlersuche

- Panel zeigt "Keine Verbindung": Integration "Tikom G8000" eingerichtet? Als Administrator angemeldet?
- Zubehör oder Einstellungen fehlen: Roboter in Tuya Local mit dem Typ
  `tikom_g8000_robot_vacuum_mop` angelegt?
- "Erst kalibrieren": Tab "Fahren", beide Messungen speichern.
- Tuya Local zeigt den Gerätetyp nicht: Home Assistant neu starten.
