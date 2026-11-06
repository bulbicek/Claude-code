# Omaľovánka

Mobilná omaľovánka (PWA, jeden `index.html`, bez závislostí, všetko beží v zariadení).

- **Realita**: fotka → čiarová omaľovánka (Difference of Gaussians na každom RGB kanáli, uzavreté obrysy).
- **Fantázia**: fotka → vitráž (Voronoi) s hrubými obrysmi fotky; bez fotky náhodná mandala.
- Posuvník zložitosti 1–10, ťuknutím vyplníš pole, štipnutím priblížiš, späť, uloženie/zdieľanie PNG.

Spustenie: `python3 -m http.server -d omalovanka 8000` a otvoriť na telefóne (kamera vyžaduje HTTPS alebo localhost).
