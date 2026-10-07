/**
 * MyTree — species master list and impact factors.
 *
 * Row format (pipe separated):  common | scientific | native(1/0) | category | CO2 kg/yr at maturity | max height m | growth cm/yr (first 5 yrs) | canopy m² at maturity | care tip
 *
 * IMPACT FORMULAS (all are ESTIMATES — they are always labelled as such in the UI):
 *   Annual CO₂ rate at age a (years):  r(a) = peak × min(1, 0.1 + 0.9 × a / 10)      (ramps from 10% to 100% over 10 years)
 *   Cumulative CO₂ (kg) to age a:       ∫ r = peak × (0.1a + 0.045a²) for a ≤ 10; peak × (5.5 + (a − 10)) beyond
 *   O₂ produced (kg)                    = CO₂ sequestered × 32/44  (stoichiometry of photosynthesis, mass basis)
 *   Canopy at age a (m²)                = canopy_max × min(1, (a / 15)^1.5)
 *   Height at age a (cm)                = min(maxH×100, growth × a × 1.1^min(a,5))   (rough planning curve, not a prediction)
 * Peak values are rounded literature-style figures (≈10–60 kg CO₂/yr for common Indian trees) and should be
 * replaced with local research data by the species master list editor in the Super Admin area.
 */
(function () {
  'use strict';
  var MT = window.MT;
  var RAW = [
    'Neem|Azadirachta indica|1|shade|22|20|70|60|Full sun. Water twice a week in year one; very drought hardy after.',
    'Banyan|Ficus benghalensis|1|shade|50|25|60|400|Needs lots of room. Water weekly for two years; avoid planting near buildings.',
    'Peepal|Ficus religiosa|1|shade|45|25|65|250|Plant in open space away from walls. Water weekly in dry months.',
    'Mango|Mangifera indica|1|fruit|35|25|45|120|Full sun. Mulch the base and water deeply every 7–10 days when young.',
    'Jamun|Syzygium cumini|1|fruit|30|25|50|100|Likes moist soil. Water twice weekly in summer when young.',
    'Gulmohar|Delonix regia|0|flowering|25|12|90|110|Fast grower, shallow roots — stake against wind for the first year.',
    'Rain Tree|Samanea saman|0|shade|40|25|100|300|Very fast growing; needs wide space. Water weekly in summer.',
    'Karanj (Pongamia)|Pongamia pinnata|1|shade|28|18|80|90|Tolerates salt and drought. Water every 5–7 days initially.',
    'Arjun|Terminalia arjuna|1|medicinal|30|25|60|120|Grows well near water. Keep soil moist during the first two years.',
    'Ashoka|Saraca asoca|1|flowering|18|9|40|40|Prefers partial shade and moist soil. Mulch heavily.',
    'Amaltas (Golden Shower)|Cassia fistula|1|flowering|20|12|70|70|Full sun. Prune lightly after flowering.',
    'Tamarind|Tamarindus indica|1|fruit|32|20|40|110|Slow but long-lived. Water weekly in year one.',
    'Teak|Tectona grandis|1|timber|35|30|90|80|Deep, well-drained soil. Weed the base; water weekly in dry season.',
    'Sal|Shorea robusta|1|timber|30|30|50|90|Prefers deep soil and good rainfall. Protect saplings from grazing.',
    'Sandalwood|Santalum album|1|medicinal|12|12|30|30|Needs a host plant nearby (e.g. pigeon pea). Do not overwater.',
    'Mahogany|Swietenia macrophylla|0|timber|30|30|80|100|Plant in fertile soil. Protect from strong wind when young.',
    'Silver Oak|Grevillea robusta|0|timber|28|30|120|60|Fast grower; good as a windbreak. Water weekly initially.',
    'Eucalyptus|Eucalyptus globulus|0|timber|30|35|150|50|Very thirsty — avoid planting near farmland or wells; prefer native species.',
    'Bamboo|Bambusa vulgaris|1|grass|40|15|200|20|Plant in clumps. Water twice weekly; mulch with leaves.',
    'Coconut|Cocos nucifera|0|palm|25|20|50|30|Likes coastal sandy soil. Water weekly; add salt and compost yearly.',
    'Date Palm|Phoenix dactylifera|0|palm|20|20|30|25|Full sun, sandy soil. Water weekly when young.',
    'Areca Palm|Dypsis lutescens|0|palm|8|6|40|8|Bright shade. Keep soil moist, not soggy.',
    'Palmyra Palm|Borassus flabellifer|1|palm|22|25|25|25|Extremely hardy; plant seeds or large saplings. Little water once settled.',
    'Mahua|Madhuca longifolia|1|fruit|28|18|45|90|Full sun. Drought tolerant once established.',
    'Bael|Aegle marmelos|1|medicinal|18|12|35|45|Hardy. Water every 10 days in year one; avoid waterlogging.',
    'Amla (Indian Gooseberry)|Phyllanthus emblica|1|fruit|16|12|45|40|Full sun. Water weekly when young; mulch to keep roots cool.',
    'Guava|Psidium guajava|0|fruit|12|8|60|30|Full sun. Water twice a week; prune after fruiting.',
    'Papaya|Carica papaya|0|fruit|5|5|150|8|Needs well-drained soil — roots rot if waterlogged. Water 2–3 times a week.',
    'Lemon|Citrus limon|0|fruit|8|5|40|12|Full sun. Water regularly; feed with compost every few months.',
    'Orange|Citrus sinensis|0|fruit|10|8|40|15|Full sun and regular water. Mulch the base.',
    'Pomegranate|Punica granatum|0|fruit|8|5|40|10|Hardy. Water weekly; prune suckers.',
    'Custard Apple|Annona squamosa|0|fruit|10|6|45|15|Well-drained soil. Water weekly in dry months.',
    'Sapota (Chikoo)|Manilkara zapota|0|fruit|15|15|35|40|Water twice weekly in summer when young.',
    'Jackfruit|Artocarpus heterophyllus|1|fruit|30|20|50|80|Deep soil with space. Water weekly; mulch well.',
    'Umbar (Cluster Fig)|Ficus racemosa|1|shade|30|18|55|90|Loves moist ground near streams. Water weekly.',
    'Ber (Indian Jujube)|Ziziphus mauritiana|1|fruit|10|8|50|25|Very drought hardy. Prune in dry season.',
    'Wood Apple (Kavath)|Limonia acidissima|1|fruit|14|12|35|40|Hardy and slow. Water every 10 days when young.',
    'Mulberry|Morus alba|0|fruit|12|10|80|30|Fast grower. Water weekly; prune annually.',
    'Cashew|Anacardium occidentale|0|fruit|18|12|50|60|Sandy, well-drained soil. Water weekly in dry season.',
    'Litchi|Litchi chinensis|0|fruit|12|10|35|40|Needs humidity and rich soil. Keep moist.',
    'Avocado|Persea americana|0|fruit|15|12|50|45|Well-drained soil; never waterlogged. Mulch generously.',
    'Drumstick (Moringa)|Moringa oleifera|1|medicinal|10|8|150|15|Very fast. Prune to keep it bushy; water weekly.',
    'Curry Leaf|Murraya koenigii|1|medicinal|5|5|40|8|Partial sun. Water twice weekly; harvest leaves lightly.',
    'Champa (Temple Tree)|Plumeria obtusa|1|flowering|10|8|40|25|Full sun; let soil dry between watering.',
    'Frangipani|Plumeria rubra|0|flowering|8|7|35|20|Full sun; very little water. Cuttings root easily.',
    'Parijat (Night Jasmine)|Nyctanthes arbor-tristis|1|flowering|6|7|35|15|Partial sun. Water twice weekly; prune after flowering.',
    'Bakul (Spanish Cherry)|Mimusops elengi|1|flowering|22|15|35|60|Slow growing; fragrant. Water weekly in year one.',
    'Kachnar (Orchid Tree)|Bauhinia variegata|1|flowering|14|10|55|40|Full sun. Water weekly when young.',
    'Palash (Flame of the Forest)|Butea monosperma|1|flowering|18|12|55|45|Hardy, good for dry soils. Little care once rooted.',
    'Semal (Silk Cotton)|Bombax ceiba|1|shade|35|30|90|110|Fast and tall; needs space. Water weekly initially.',
    'Kadamba|Neolamarckia cadamba|1|shade|35|25|130|90|One of the fastest native trees. Keep soil moist.',
    'Indian Cork Tree|Millingtonia hortensis|1|flowering|15|20|80|45|Good avenue tree. Water twice weekly in summer.',
    'Copper Pod|Peltophorum pterocarpum|0|shade|25|18|90|90|Fast shade tree; prune to shape.',
    'Siris|Albizia lebbeck|1|shade|30|20|100|110|Fixes nitrogen. Water weekly for first year.',
    'Kanchan (Mountain Ebony)|Bauhinia purpurea|1|flowering|12|9|55|30|Full sun. Prune lightly after bloom.',
    'Yellow Bells (Tecoma)|Tecoma stans|0|flowering|6|6|70|15|Full sun and little water; can become invasive.',
    'Jarul (Queen’s Crape Myrtle)|Lagerstroemia speciosa|1|flowering|18|15|65|50|Full sun. Needs weekly water in dry months.',
    'Weeping Fig|Ficus benjamina|0|shade|20|15|60|60|Prune to control size; keep away from drains.',
    'Pilkhan (Java Fig)|Ficus virens|1|shade|40|20|55|150|Great avenue tree. Water weekly in year one.',
    'Hardwickia (Anjan)|Hardwickia binata|1|timber|28|20|45|70|Dry-land specialist. Water monthly after year one.',
    'Chir Pine|Pinus roxburghii|1|timber|30|35|50|40|Hill species. Plant in well-drained, sunny slopes.',
    'Deodar|Cedrus deodara|1|timber|35|40|35|40|Cool climate. Plant in autumn or monsoon.',
    'Himalayan Oak|Quercus leucotrichophora|1|timber|30|25|30|60|Hill species; slow. Protect from browsing.',
    'Rhododendron|Rhododendron arboreum|1|flowering|10|12|20|30|Acidic, cool, moist soil with partial shade.',
    'Mangrove (Red)|Rhizophora mucronata|1|coastal|20|15|40|25|Plant only in tidal mud flats with local forest-dept. guidance.',
    'Sheesham (Indian Rosewood)|Dalbergia sissoo|1|timber|30|25|90|80|Fast; fixes nitrogen. Water weekly in year one.',
    'Babul|Vachellia nilotica|1|shade|18|15|60|40|Thorny and tough. Almost no water after establishment.',
    'Khejri|Prosopis cineraria|1|shade|15|12|30|50|Desert tree; extremely drought tolerant — avoid over-watering.',
    'Kapok (Ceiba)|Ceiba pentandra|0|shade|35|30|120|110|Very fast; needs open space.',
    'Casuarina|Casuarina equisetifolia|0|coastal|25|25|130|35|Good windbreak on coasts. Tolerates salty soil.',
    'Subabul|Leucaena leucocephala|0|timber|18|15|200|30|Rapid growth; fodder and fuel. Can spread — plant sparingly.',
    'Gliricidia|Gliricidia sepium|0|shade|12|10|180|25|Used as living fence; prune often.',
    'Harad (Myrobalan)|Terminalia chebula|1|medicinal|22|25|45|80|Medicinal fruit. Water weekly when young.',
    'Baheda|Terminalia bellirica|1|medicinal|25|30|50|90|Likes well-drained soil. Little care once rooted.',
    'Kusum|Schleichera oleosa|1|timber|20|20|40|60|Slow growing hardwood. Protect from fire and grazing.',
    'Rohida (Marwar Teak)|Tecomella undulata|1|flowering|14|9|35|35|Desert species; drought tolerant.',
    'Indian Beech (Karanj Hill)|Millettia pinnata|1|shade|26|18|75|85|Tolerates wet or dry soil.',
    'Ashwatha Hybrid Fig|Ficus lacor|1|shade|25|15|55|60|Moist soil; water weekly.',
    'Bottle Brush|Callistemon viminalis|0|flowering|6|7|55|20|Full sun; tolerates poor soil.',
    'Tabebuia (Pink Trumpet)|Tabebuia rosea|0|flowering|14|15|65|45|Full sun; water weekly in summer.',
    'African Tulip|Spathodea campanulata|0|flowering|20|18|100|70|Fast and showy; brittle in storms — stake early.',
    'Jacaranda|Jacaranda mimosifolia|0|flowering|16|15|70|60|Blooms purple in spring. Well-drained soil.',
    'Cannonball Tree|Couroupita guianensis|0|flowering|25|20|60|60|Needs moist soil. Sacred in temples; water weekly.',
    'Indian Almond (Badam)|Terminalia catappa|0|shade|25|20|80|90|Coastal tolerant; layered canopy. Water weekly initially.',
    'Rudraksha|Elaeocarpus ganitrus|1|medicinal|20|20|45|60|Moist, humid, rich soil. Partial shade when young.',
    'Neem (Persian Lilac / Bakain)|Melia azedarach|1|shade|18|15|110|50|Fast; frost tolerant. Water weekly in year one.',
    'Putranjiva|Putranjiva roxburghii|1|shade|18|15|40|50|Neat evergreen for avenues; moderate water.',
    'Ashoka (False / Mast Tree)|Polyalthia longifolia|0|shade|12|12|80|15|Tall, narrow — ideal for boundaries. Water weekly.',
    'Hibiscus (Gudhal)|Hibiscus rosa-sinensis|0|flowering|3|3|40|6|Full sun. Water regularly; prune in winter.',
    'Jasmine (Mogra)|Jasminum sambac|1|flowering|2|2|30|3|Sunny spot. Water 2–3 times a week.',
    'Bougainvillea|Bougainvillea glabra|0|flowering|3|5|60|10|Full sun; flowers best when slightly dry.',
    'Tulsi Tree (Holy Basil Shrub)|Ocimum tenuiflorum|1|medicinal|1|1|30|1|Sunny window or garden. Pinch flowers to keep leafy.',
    'Aloe Vera|Aloe vera|1|medicinal|1|1|10|1|Bright light; water only when the soil is dry.',
    'Ber Hybrid (Apple Ber)|Ziziphus mauritiana ‘Apple’|0|fruit|9|6|55|20|Full sun; prune after harvest.',
    'Fig (Anjeer)|Ficus carica|0|fruit|10|7|45|25|Full sun; moderate water.',
    'Apple (Hill)|Malus domestica|0|fruit|10|8|35|25|Cool climate; chill hours needed. Prune in winter.',
    'Walnut|Juglans regia|0|fruit|22|20|35|70|Cool, deep soil. Slow starter, long lived.',
    'Almond|Prunus dulcis|0|fruit|10|8|35|20|Cool-temperate; protect blossoms from frost.',
    'Pear|Pyrus communis|0|fruit|12|10|35|30|Needs a pollinating partner nearby.',
    'Peach|Prunus persica|0|fruit|9|6|50|20|Full sun; prune hard each winter.',
    'Lychee Hybrid (Shahi)|Litchi chinensis ‘Shahi’|0|fruit|12|10|35|40|Warm humid climate; keep moist.',
    'Kokum|Garcinia indica|1|fruit|14|12|30|35|Western Ghats species; partial shade when young.',
    'Nutmeg|Myristica fragrans|0|fruit|12|12|30|30|Humid, shaded and rich soil.',
    'Teak (Dwarf Hybrid)|Tectona hybrid|0|timber|20|20|90|50|Needs fertile soil; weed regularly.',
    'Sissoo Hybrid (Red Silk Cotton)|Bombax insigne|1|flowering|20|20|70|70|Open sun; water weekly in year one.',
    'Pterocarpus (Bijasal)|Pterocarpus marsupium|1|timber|22|25|45|65|Slow, valuable timber. Moderate water.',
    'Nagkesar|Mesua ferrea|1|flowering|22|25|35|55|Prefers humid areas and partial shade when young.'
  ];

  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  var list = RAW.map(function (r) {
    var p = r.split('|');
    return {
      id: slug(p[0]), common: p[0], scientific: p[1], native: p[2] === '1', category: p[3],
      co2: +p[4], maxH: +p[5], growth: +p[6], canopy: +p[7], tip: p[8]
    };
  });
  var byId = {}; list.forEach(function (s) { byId[s.id] = s; });
  var other = { id: 'other', common: 'Other (not listed)', scientific: '', native: false, category: 'other', co2: 15, maxH: 12, growth: 50, canopy: 40, tip: 'Check local advice for water and sun needs; keep soil moist for the first year.' };
  byId.other = other;

  MT.species = {
    list: list,
    all: function () { return list.slice(); },
    other: other,
    get: function (id) { return byId[id] || other; },
    categories: ['shade', 'fruit', 'flowering', 'timber', 'medicinal', 'palm', 'coastal', 'grass'],
    /** Annual CO₂ rate (kg/yr) at age a (years). */
    co2Rate: function (id, a) { var s = MT.species.get(id); return s.co2 * Math.min(1, 0.1 + 0.9 * Math.max(0, a) / 10); },
    /** O₂ (kg) = CO₂ × 32/44. */
    o2FromCo2: function (co2) { return co2 * 32 / 44; },
    canopyAt: function (id, a) { var s = MT.species.get(id); return s.canopy * Math.min(1, Math.pow(Math.max(0, a) / 15, 1.5)); },
    heightAt: function (id, a) { var s = MT.species.get(id); return Math.min(s.maxH * 100, s.growth * a * Math.pow(1.1, Math.min(a, 5))); },
    /** Platform-wide average used on the landing page before per-species data is known (kg CO₂ per tree per year). */
    AVG_CO2_PER_TREE_YEAR: 21
  };
  /** Cumulative CO₂ (kg) from planting to age a. ∫₀¹⁰(0.1+0.09t)dt = 5.5, then 1 × peak per year. */
  MT.species.co2Total = function (id, a) {
    var s = MT.species.get(id); a = Math.max(0, a);
    if (a <= 10) return s.co2 * (0.1 * a + 0.045 * a * a);
    return s.co2 * (5.5 + (a - 10));
  };
  /** Merge edits/additions saved by the Super Admin (collection `species`, doc id = species id). */
  MT.species.apply = function (docs) {
    docs.forEach(function (d) {
      var sp = { id: d.id, common: d.common, scientific: d.scientific || '', native: !!d.native, category: d.category || 'shade', co2: +d.co2 || 0, maxH: +d.maxH || 1, growth: +d.growth || 1, canopy: +d.canopy || 1, tip: d.tip || '', custom: true };
      var i = list.findIndex(function (x) { return x.id === d.id; }); if (i > -1) list[i] = sp; else list.push(sp); byId[d.id] = sp;
    });
    spIndexReset();
  };
  function spIndexReset() { if (MT.bulk && MT.bulk._resetSpecies) MT.bulk._resetSpecies(); }
  MT.species.load = function () { return MT.db.list('species', { limit: 500 }).then(MT.species.apply).catch(function () {}); };
  MT.species.ageYears = function (plantedOn, now) { return Math.max(0, ((now || Date.now()) - new Date(plantedOn).getTime()) / (365.25 * 86400000)); };
})();
