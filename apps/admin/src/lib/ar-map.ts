import provincesGeo from '@/data/ar-provinces.json';

/**
 * Pre-projected SVG path data for each Argentine province, keyed by
 * the CDP `region.id` (1..24, matching the seeded INDEC table). Built
 * once at module load from the bundled GeoJSON; the projection is a
 * simple equirectangular fit to a portrait viewBox — fine for a
 * country-scale choropleth and avoids dragging in d3-geo.
 *
 * The source geojson does not include CABA (id=1) because most public
 * sources treat it as a city, not a polygon. We expose its centroid as
 * a separate marker so the choropleth can still surface it.
 */

interface FeatureCollection {
  type: 'FeatureCollection';
  features: Feature[];
}

interface Feature {
  type: 'Feature';
  properties: { name: string };
  geometry: Polygon | MultiPolygon;
}

interface Polygon {
  type: 'Polygon';
  coordinates: number[][][];
}

interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

const VIEWBOX_W = 400;
const VIEWBOX_H = 720;
// Argentina mainland bbox with a small margin so paths don't kiss the
// edges. CABA marker fits inside the Buenos Aires polygon naturally.
const LNG_MIN = -75;
const LNG_MAX = -52;
const LAT_MIN = -55.5;
const LAT_MAX = -21.5;

export const VIEWBOX = `0 0 ${VIEWBOX_W} ${VIEWBOX_H}`;

function project(lng: number, lat: number): [number, number] {
  const x = ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * VIEWBOX_W;
  const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * VIEWBOX_H;
  return [x, y];
}

function ringToPath(ring: number[][]): string {
  let d = '';
  for (let i = 0; i < ring.length; i += 1) {
    const pt = ring[i];
    if (!pt || pt.length < 2) continue;
    const [lng, lat] = pt as [number, number];
    const [x, y] = project(lng, lat);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d.length > 0 ? d + 'Z' : '';
}

function geometryToPath(g: Polygon | MultiPolygon): string {
  if (g.type === 'Polygon') {
    return g.coordinates.map(ringToPath).join(' ');
  }
  return g.coordinates
    .map((poly) => poly.map(ringToPath).join(' '))
    .filter((s) => s.length > 0)
    .join(' ');
}

function ringCentroid(ring: number[][]): [number, number] {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of ring) {
    if (!pt || pt.length < 2) continue;
    const lng = pt[0];
    const lat = pt[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') continue;
    sx += lng;
    sy += lat;
    n += 1;
  }
  if (n === 0) return [0, 0];
  return project(sx / n, sy / n);
}

function geometryCentroid(g: Polygon | MultiPolygon): [number, number] {
  const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0]?.[0];
  return ring ? ringCentroid(ring) : [0, 0];
}

/**
 * Maps the matischroder dataset's plain ASCII names to the seeded
 * `region.id`. Order matches the INDEC IDs we use everywhere else.
 */
const NAME_TO_REGION_ID: Record<string, number> = {
  'Buenos Aires': 2,
  Catamarca: 3,
  Chaco: 4,
  Chubut: 5,
  Cordoba: 6,
  Corrientes: 7,
  'Entre Rios': 8,
  Formosa: 9,
  Jujuy: 10,
  'La Pampa': 11,
  'La Rioja': 12,
  Mendoza: 13,
  Misiones: 14,
  Neuquen: 15,
  'Rio Negro': 16,
  Salta: 17,
  'San Juan': 18,
  'San Luis': 19,
  'Santa Cruz': 20,
  'Santa Fe': 21,
  'Santiago del Estero': 22,
  'Tierra del Fuego': 23,
  Tucuman: 24,
};

export interface ProvincePath {
  region_id: number;
  name: string;
  d: string;
  centroid: [number, number];
}

const collection = provincesGeo as FeatureCollection;

export const PROVINCE_PATHS: readonly ProvincePath[] = collection.features.flatMap((f) => {
  const id = NAME_TO_REGION_ID[f.properties.name];
  if (id === undefined) return [];
  return [
    {
      region_id: id,
      name: f.properties.name,
      d: geometryToPath(f.geometry),
      centroid: geometryCentroid(f.geometry),
    },
  ];
});

/**
 * CABA marker: small dot rendered above the choropleth at its real
 * coordinates (the geojson doesn't include a polygon for it).
 */
export const CABA = {
  region_id: 1,
  name: 'Ciudad Autónoma de Buenos Aires',
  centroid: project(-58.4, -34.6) as [number, number],
};

export const VIEWBOX_DIMS = { width: VIEWBOX_W, height: VIEWBOX_H };
