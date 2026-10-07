#!/usr/bin/env node
/** Checks that the keyless imagery endpoints used by the green-cover swipe respond. Run on a machine with internet access. */
const checks = [
  ['Esri World Imagery (current)', 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/5/12/22'],
  ['Esri Wayback configuration', 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json'],
  ['NASA GIBS true colour', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-06-01/GoogleMapsCompatible_Level9/5/12/22.jpg'],
  ['NASA GIBS NDVI 8-day', 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_NDVI_8Day/default/2024-06-01/GoogleMapsCompatible_Level9/5/12/22.png']
];
let bad = 0;
for (const [name, url] of checks) {
  try { const r = await fetch(url); console.log((r.ok ? 'OK  ' : 'FAIL') + ' ' + r.status + '  ' + name + '  (' + (r.headers.get('content-type') || '') + ')'); if (!r.ok) bad++; }
  catch (e) { console.log('FAIL     ' + name + ' — ' + e.message); bad++; }
}
if (bad) { console.log('\nSome endpoints failed. Edit js/data/imagery.js (see the comments at the top).'); process.exit(1); }
