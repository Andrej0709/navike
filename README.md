# Navike

Aplikacija za navike sa ekipom: slikaš dokaz, skupljaš poene, takmičiš se sa drugarima na nedeljnoj rang listi.

## Šta je gde

| Fajl | Šta radi |
|---|---|
| `index.html`, `styles.css`, `app.js` | Aplikacija (ono što vidiš u browseru) |
| `config.js` | Adresa i ključ Supabase projekta |
| `supabase/schema.sql` | Baza: tabele, pravila pristupa, računanje poena |
| `server.js` | Mali lokalni server za testiranje (`node server.js`, pa otvori http://localhost:5173) |
| `prototip/` | Prvi prototip sa izmišljenim podacima |

## Podešavanje Supabase (jednom)

1. Otvori https://supabase.com i prijavi se (GitHub ili email).
2. **New project**: ime `navike`, smisli lozinku za bazu i sačuvaj je, region **Central EU (Frankfurt)**. Sačekaj 1–2 minuta da se napravi.
3. Levo **SQL Editor** → **New query** → nalepi ceo sadržaj fajla `supabase/schema.sql` → **Run**. Treba da piše "Success".
4. Levo **Authentication** → **URL Configuration**:
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs** → Add URL: `http://localhost:5173/**`
5. Zupčanik **Project Settings** → **API** (ili dugme **Connect** gore): kopiraj **Project URL** i **anon public** (ili **publishable**) ključ u `config.js`.

> Nikad ne stavljaj **service_role** / **secret** ključ u `config.js` niti ga šalji bilo kome. On zaobilazi sva pravila pristupa.

## Prijava preko Google naloga (kasnije)

Dugme već postoji, ali radi tek kad se u Supabase uključi Google provajder (Authentication → Sign In / Providers → Google) uz Client ID i Secret iz Google Cloud konzole.

## Pravila igre

- Poeni: osnova po težini (lako 5, srednje 10, teško 20) × streak množilac (+10% za svaki dan zaredom, najviše 2×).
- Poene računa server, ne telefon, tako da se ne može varati.
- Jedna navika = jedna objava dnevno, uvek sa slikom. Ista slika ne može dva puta.
- Rang lista se resetuje svakog ponedeljka.
- Slike vide samo članovi ekipe.
