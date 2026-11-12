// Jazykové verzie hry (SK / EN). Hodnota je reťazec, pole reťazcov alebo funkcia vracajúca reťazec.
const BTN2 = 'style="background:#2a4a85;color:#fff"';

const sk = {
  title: 'Tornádo Idle · METEO 24',
  headline: 'Tornádo · priamy prenos z postihnutej oblasti',
  lblDamage: 'Celková spôsobená škoda', lblWind: 'Rýchlosť vetra', diam: 'Priemer', zone: 'Zóna', lblQuest: 'Úloha',
  boost: 'SUPERCELA', boostTitle: 'Supercela (medzerník)',
  panelTitle: 'Predpoveď · <span>Vylepšenia</span>', saved: 'Hra sa ukladá automaticky', newsLabel: 'SPRÁVY',
  hint: 'Klik = nasmeruj tornádo · ťahaj = otáčaj kameru · koliesko = zoom · 1–6 = vylepšenia · medzerník = Supercela',
  tCine: 'Filmový vzhľad (C)', tReset: 'Nová hra', tMute: 'Zvuk (M)', tLang: 'Jazyk / Language',
  up_power: 'Sila vetra', up_radius: 'Priemer vírenia', up_speed: 'Rýchlosť posunu', up_storm: 'Búrka s bleskami', up_value: 'Poistné plnenia', up_offline: 'Nočná zmena (offline)',
  dmg: 'dmg/s', off: 'vypnuté', lv: 'Úr. ', maximum: '(maximum)', tb: 'TB',
  tiers: ['Domček', 'Rodinný dom', 'Panelák', 'Kancelárska budova', 'Mrakodrap', 'Megaveža'],
  destroyedN: n => `${n} zničených`,
  front: n => `Front č. ${n}`,
  ropeStart: ['Tornádo sa zužuje do lana a vlní sa – nepodceňujte ho!', 'Pozor: tornádo sa mení na úzke lano, stále je však nebezpečné.'],
  ropeEnd: 'Tornádo opäť naberá silu a rozširuje sa.',
  sparkNews: ['Poškodené vedenie sršia iskry. Elektrikári tvrdia, že to nie je ich vina.', 'V troskách zaiskrilo. Dobrá správa: aspoň niečo svieti.', 'Z ruín preskakujú iskry. Poisťovňa to už zapísala ako „svetelnú show“.'],
  fire: ['Hasiči hlásia požiar v ruinách. Hasičská stanica tiež horí.', 'V troskách vypukol požiar. Dym je vidieť až za hranice okresu.', 'Horí. Hasiči sú na ceste, cesta však nie je na mieste.', 'Plameň v ruinách: plynári prosia obyvateľov, aby nefajčili.'],
  milestone: n => `Zničených už ${n} objektov. Poisťovne sú v panike.`,
  boostNews: 'SUPERCELA! Tornádo na 10 sekúnd strojnásobilo silu a zrýchlilo.',
  storm: ['Nad mestom sa strieda blesk za bleskom.', 'Meteorológovia: „Zachovajte pokoj, ak sa dá.“', 'Búrková aktivita je extrémna – blesky všade navôkol.'],
  tierNews: name => `Pozor: v zóne pribudli objekty typu „${name}“. Vyššia škoda, vyššie zisky!`,
  megaNews: 'Mesto sa rozrastá – nové budovy sú ešte vyššie a odolnejšie!',
  prestigeName: 'Nový front',
  prestigeNeedNews: x => `Nový front: potrebuješ aspoň ${x} škody v tomto fronte.`,
  prestigeModal: (g, now, next) => `<div class="lbl">Prestíž</div><h1>NOVÝ <em>FRONT</em></h1>
    <p>Z tornáda sa stane nová tlaková níž. Stratíš peniaze, vylepšenia a mesto sa postaví odznova, ale získaš trvalý bonus.</p>
    <div class="big">+${g} 🌀</div><p>Bonus ku všetkým škodám: ×${now} → <b>×${next}</b></p>
    <button id="m-yes">NOVÝ FRONT</button> <button id="m-no" ${BTN2}>ZRUŠIŤ</button>`,
  prestigeDone: 'Nový front sa formuje! Mesto sa postavilo odznova.',
  prestigeGain: (g, next, now) => `+${g} 🌀 · bonus ×${next} <b>(teraz ×${now})</b>`,
  prestigeNeed: (x, now) => `Potrebuješ ${x} škody v tomto fronte · bonus teraz ×${now}`,
  start: 'ZAČAŤ', locked: 'ZAMKNUTÉ',
  quests: [n => `Znič ${n} budov`, n => `Rozmetaj ${n} ${n < 5 ? 'autá' : 'áut'}`, n => `Kúp ${n} vylepšenia`, n => n > 1 ? `Zlom ${n} mosty` : 'Zlom most', () => 'Použi Supercelu ⚡', n => `Spôsob škodu ${n} €`],
  questDone: (text, r) => `Úloha splnená: ${text} – odmena ${r} €.`,
  buy_power: (k, ef) => `Sila vetra stúpla na ${k} km/h – ${ef}. Obyvatelia sa zamýšľajú nad presťahovaním.`,
  buy_radius: 'Tornádo sa rozšírilo. Do cesty mu už padá aj susedná ulica.', buy_speed: 'Tornádo zrýchlilo – meteorológovia nestíhajú aktualizovať mapy.',
  buy_storm: 'Nad oblasťou sa rozbúrila elektrická búrka.', buy_value: 'Poisťovne vyplácajú viac. Škody sú rekordné!', buy_offline: 'Nočná zmena prináša zisk aj mimo vysielania.',
  resetModal: `<div class="lbl">Nová hra</div><h1>Začať <em>odznova</em>?</h1><p>Všetok postup vrátane prestíže sa stratí.</p><button id="m-yes">ZMAZAŤ</button> <button id="m-no" ${BTN2}>ZRUŠIŤ</button>`,
  dur: mins => mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`,
  offlineModal: (t, eff, gain) => `<div class="lbl">Správa z miesta udalosti</div><h1>Vitaj <em>späť</em></h1><p>Počas tvojej neprítomnosti (${t}) tornádo ďalej ničilo – pri účinnosti ${eff} %.</p><div class="big">+${gain} €</div><p>Vylepši „Nočnú zmenu“ pre vyšší offline zisk.</p><button id="m-ok">POKRAČOVAŤ</button>`,
  introModal: `<h1>TORNÁDO <em>IDLE</em></h1>
  <p>Vitaj v priamom prenose METEO 24. Malý vír sa blíži k mestu. Ničí domy – za každú škodu dostávaš peniaze, ktoré investuješ do silnejšieho vetra.</p>
  <ul><li><b>Klik</b> do sveta alebo na radar – nasmeruje tornádo</li><li><b>Ťahanie</b> – otáčanie kamery, <b>koliesko</b> – zoom</li><li>Bez zásahu si tornádo vyberá najvýnosnejšie ciele samo</li><li>Hra sa ukladá a zarába aj keď si preč</li></ul>
  <button id="m-ok">ŠTART</button>`,
  news1: 'Meteorologický ústav varuje: nad regiónom sa formuje tornádo.', news2: 'Ovládanie: kliknutím nasmeruješ tornádo, inak si cestu hľadá samo.',
  flavor: [
    'Predpoveď na zajtra: tornádo. Opäť.', 'Dopravná situácia: cesty sú voľné, lebo tam už nič nie je.', 'Starosta: „Mali sme zostať doma.“',
    'Tlak vzduchu klesá, nálada obyvateľov tiež.', 'Poisťovňa oznamuje, že už nikoho nepoistí. Nikdy.', 'Neodporúčame pikniky v okruhu 50 km od vírenia.',
    'Reportér hlási zo strechy domu. Dom už nie je.', 'Psy sa skrývajú, mačky to riešia po svojom.', 'Zber odpadu odložený. Odpad sa zbiera sám.',
    'Odborníci: „Čím väčší vietor, tým väčšie ťažkosti.“', 'Tornádo vraj radšej mieri na mrakodrapy. Má rado výhľady.', 'Slnečné prestávky sa dnes nepredpokladajú.',
    'Realitná kancelária ponúka pozemky s výhľadom. Výhľad je teraz všade.', 'Miestny záhradkár: „Trampolínu som naposledy videl nad kostolom.“',
    'Krava zo susednej dediny hlási pristátie. Je v poriadku, len zmätená.', 'Pocitová teplota: lietajúca.', 'Biometeorologická záťaž: áno.',
    'Dáždnik dnes nepomôže. Ani zajtra.', 'Vodiči, pozor: v protismere letí garáž.', 'Pošta doručuje aj dnes. Kam, to nevie nikto.',
    'Účes dňa: všetky naraz.', 'Susedia sa konečne spoznali. Stretli sa na tej istej streche.', 'Peľová situácia: peľ odletel aj so stromami.',
    'Meteorológ odmieta komentár a drží sa stĺpa.', 'Školy zatvorené. Žiaci aj tak tvrdia, že úlohu im odfúklo.', 'Pes zjedol domácu úlohu? Nie, tentoraz naozaj tornádo.',
    'Bielizeň vyvesená ráno už schne v susednom okrese.', 'Veterná elektráreň hlási rekordný výkon aj rekordnú vzdialenosť.', 'Stavebný úrad: „Kolaudácie dnes neprebiehajú. Nie je čo.“',
    'Navigácia: „Po sto metroch odbočte. Alebo budete odbočení.“', 'Smetiari štrajkujú z princípu. Nemajú čo zbierať.', 'Výstraha tretieho stupňa. Štvrtý stupeň ešte nevymysleli.',
    'Horoskop pre všetky znamenia: dnes vás niečo zdvihne.', 'Šarkaniáda sa ruší pre nadbytok vetra.', 'Kominár oznamuje, že komíny si dnes čistia samy.',
    'Rybári hlásia úlovok. Chytili plot.', 'Ceny nehnuteľností klesajú. Doslova, z výšky.', 'Tornádo zatiaľ neodpovedalo na žiadosť o rozhovor.',
    'Dnešná relácia vzniká v teréne. Štúdio je tiež v teréne, proti našej vôli.', 'Odporúčame vetrať. Vlastne nie, to sa vybaví samo.',
    'Mestská polícia rozdáva pokuty za nesprávne parkovanie na strechách.', 'Babka z tretieho poschodia: „Za mojich čias fúkalo viac.“',
    'Holuby dnes lietajú pozadu a hnevajú sa.', 'Dopravný podnik: autobus číslo 7 dnes premáva vzduchom.', 'Futbalový zápas prerušený. Lopta je v inom kraji, bránka tiež.',
    'Kúpalisko hlási: voda z bazéna prší o dve ulice ďalej.', 'Predavač dáždnikov prvýkrát v živote uvažuje o inej práci.', 'Rosný bod sme stratili. Ak ho nájdete, vráťte ho na ústav.',
  ],
};

const en = {
  title: 'Tornado Idle · METEO 24',
  headline: 'Tornado · live from the affected area',
  lblDamage: 'Total damage caused', lblWind: 'Wind speed', diam: 'Diameter', zone: 'Zone', lblQuest: 'Mission',
  boost: 'SUPERCELL', boostTitle: 'Supercell (space bar)',
  panelTitle: 'Forecast · <span>Upgrades</span>', saved: 'The game saves automatically', newsLabel: 'NEWS',
  hint: 'Click = steer the tornado · drag = rotate camera · wheel = zoom · 1–6 = upgrades · space = Supercell',
  tCine: 'Cinematic look (C)', tReset: 'New game', tMute: 'Sound (M)', tLang: 'Jazyk / Language',
  up_power: 'Wind force', up_radius: 'Vortex diameter', up_speed: 'Travel speed', up_storm: 'Thunderstorm', up_value: 'Insurance payouts', up_offline: 'Night shift (offline)',
  dmg: 'dmg/s', off: 'off', lv: 'Lv. ', maximum: '(maximum)', tb: 'TS',
  tiers: ['Cottage', 'Family house', 'Apartment block', 'Office building', 'Skyscraper', 'Megatower'],
  destroyedN: n => `${n} destroyed`,
  front: n => `Front #${n}`,
  ropeStart: ['The tornado is narrowing into a rope and writhing – do not underestimate it!', 'Warning: the tornado is roping out, but it is still dangerous.'],
  ropeEnd: 'The tornado is regaining strength and widening again.',
  sparkNews: ['Damaged power lines are throwing sparks. The electricians say it is not their fault.', 'Sparks in the rubble. Good news: at least something is lit.', 'Sparks are jumping out of the ruins. The insurer has already logged it as a "light show".'],
  fire: ['Firefighters report a blaze in the ruins. The fire station is also on fire.', 'A fire has broken out in the rubble. The smoke is visible from the next county.', 'Fire! The firefighters are on their way; the way, however, is no longer there.', 'Flames in the ruins: the gas company kindly asks residents not to smoke.'],
  milestone: n => `${n} structures destroyed so far. Insurers are panicking.`,
  boostNews: 'SUPERCELL! For 10 seconds the tornado has tripled its power and sped up.',
  storm: ['Lightning bolt after lightning bolt over the city.', 'Meteorologists: "Stay calm, if at all possible."', 'Storm activity is extreme – lightning everywhere.'],
  tierNews: name => `Alert: "${name}" structures have appeared in the zone. More damage, more profit!`,
  megaNews: 'The city is growing – new buildings are even taller and tougher!',
  prestigeName: 'New front',
  prestigeNeedNews: x => `New front: you need at least ${x} damage in this front.`,
  prestigeModal: (g, now, next) => `<div class="lbl">Prestige</div><h1>NEW <em>FRONT</em></h1>
    <p>The tornado becomes a new low-pressure system. You lose your money and upgrades and the city is rebuilt, but you gain a permanent bonus.</p>
    <div class="big">+${g} 🌀</div><p>Bonus to all damage: ×${now} → <b>×${next}</b></p>
    <button id="m-yes">NEW FRONT</button> <button id="m-no" ${BTN2}>CANCEL</button>`,
  prestigeDone: 'A new front is forming! The city has been rebuilt from scratch.',
  prestigeGain: (g, next, now) => `+${g} 🌀 · bonus ×${next} <b>(now ×${now})</b>`,
  prestigeNeed: (x, now) => `You need ${x} damage in this front · bonus now ×${now}`,
  start: 'START', locked: 'LOCKED',
  quests: [n => `Destroy ${n} buildings`, n => `Toss ${n} cars`, n => `Buy ${n} upgrades`, n => n > 1 ? `Break ${n} bridges` : 'Break a bridge', () => 'Use Supercell ⚡', n => `Cause ${n} € of damage`],
  questDone: (text, r) => `Mission complete: ${text} – reward ${r} €.`,
  buy_power: (k, ef) => `Wind force is up to ${k} km/h – ${ef}. Residents are considering moving away.`,
  buy_radius: 'The tornado has widened. The next street over is now in its path too.', buy_speed: 'The tornado has sped up – meteorologists cannot update the maps fast enough.',
  buy_storm: 'An electrical storm has erupted over the area.', buy_value: 'Insurers are paying out more. Damage is at a record high!', buy_offline: 'The night shift brings in profit even off the air.',
  resetModal: `<div class="lbl">New game</div><h1>Start <em>over</em>?</h1><p>All progress, including prestige, will be lost.</p><button id="m-yes">DELETE</button> <button id="m-no" ${BTN2}>CANCEL</button>`,
  dur: mins => mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`,
  offlineModal: (t, eff, gain) => `<div class="lbl">Report from the scene</div><h1>Welcome <em>back</em></h1><p>While you were away (${t}) the tornado kept on wrecking – at ${eff} % efficiency.</p><div class="big">+${gain} €</div><p>Upgrade "Night shift" for higher offline income.</p><button id="m-ok">CONTINUE</button>`,
  introModal: `<h1>TORNADO <em>IDLE</em></h1>
  <p>Welcome to METEO 24, live. A small vortex is approaching the city. It wrecks houses – every bit of damage earns you money to invest in stronger wind.</p>
  <ul><li><b>Click</b> the world or the radar – steers the tornado</li><li><b>Drag</b> – rotate the camera, <b>wheel</b> – zoom</li><li>Left alone, the tornado picks the most profitable targets itself</li><li>The game saves itself and keeps earning while you are away</li></ul>
  <button id="m-ok">START</button>`,
  news1: 'The weather service warns: a tornado is forming over the region.', news2: 'Controls: click to steer the tornado, otherwise it finds its own way.',
  flavor: [
    'Forecast for tomorrow: tornado. Again.', 'Traffic update: the roads are clear, because nothing is left on them.', 'The mayor: "We should have stayed home."',
    'Air pressure is dropping, and so is public morale.', 'The insurance company announces it will never insure anyone again. Ever.', 'Picnics are not recommended within 50 km of the vortex.',
    'Our reporter is live from the roof of a house. The house is gone.', 'Dogs are hiding; cats are handling it their own way.', 'Rubbish collection postponed. The rubbish is collecting itself.',
    'Experts: "The stronger the wind, the bigger the trouble."', 'The tornado reportedly prefers skyscrapers. It likes a view.', 'No sunny spells expected today.',
    'An estate agent is offering plots with a view. The view is now everywhere.', 'Local gardener: "I last saw my trampoline above the church."',
    'A cow from the next village reports a landing. She is fine, just confused.', 'Feels-like temperature: airborne.', 'Weather-related stress level: yes.',
    'An umbrella will not help today. Or tomorrow.', 'Drivers, beware: a garage is flying in the oncoming lane.', 'The post is still being delivered. Where to, nobody knows.',
    'Hairstyle of the day: all of them at once.', 'The neighbours have finally met. They ran into each other on the same roof.', 'Pollen report: the pollen left together with the trees.',
    'The meteorologist declines to comment and is holding on to a lamp post.', 'Schools are closed. Pupils still claim the wind blew their homework away.', 'The dog ate my homework? No, this time it really was the tornado.',
    'Laundry hung out this morning is now drying in the next county.', 'The wind farm reports record output and record travel distance.', 'Building office: "No inspections today. There is nothing to inspect."',
    'Sat-nav: "In one hundred metres, turn. Or be turned."', 'Bin men are on strike on principle. There is nothing to collect.', 'Level three warning in effect. Level four has not been invented yet.',
    'Horoscope for all signs: something will lift you up today.', 'The kite festival is cancelled due to an excess of wind.', 'The chimney sweep announces that chimneys are cleaning themselves today.',
    'Anglers report a catch. They caught a fence.', 'Property prices are falling. Literally, from a height.', 'The tornado has not yet responded to our interview request.',
    'Today\'s show comes to you from the field. The studio is also in the field, against our will.', 'We recommend airing your rooms. Actually, never mind, that will sort itself out.',
    'Police are issuing tickets for illegal parking on rooftops.', 'Granny from the third floor: "It was windier in my day."',
    'Pigeons are flying backwards today and they are furious.', 'Public transport: bus number 7 is running by air today.', 'Football match abandoned. The ball is in another county, and so is the goal.',
    'The swimming pool reports its water is raining two streets away.', 'The umbrella seller is considering a career change for the first time in his life.', 'We have lost the dew point. If found, please return it to the institute.',
  ],
};

const LANGS = { sk, en };
let cur = 'sk';
export const setLangCode = c => { cur = LANGS[c] ? c : 'sk'; };
export const lang = () => cur;
export function t(key, ...args) {
  const v = LANGS[cur][key] !== undefined ? LANGS[cur][key] : sk[key];
  return typeof v === 'function' ? v(...args) : v;
}
