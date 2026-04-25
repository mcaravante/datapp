import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../db/prisma.service';

export interface RegionResolution {
  /** Matched region id, or `null` if we couldn't map the input. */
  regionId: number | null;
  /** Normalized canonical name when matched, otherwise the original raw value. */
  canonicalName: string | null;
}

/**
 * Maps free-form region values from Magento to entries in our pre-seeded
 * `region` table (24 INDEC Argentine provinces, plus future countries).
 *
 * Magento returns regions in two shapes:
 *   1. Object: `{ region: 'Buenos Aires', region_code: 'BA', region_id: 123 }`
 *   2. String: `'Buenos Aires'`
 *
 * Both are accepted via {@link toRegionString} below. Once we have a string
 * we normalize (lower, strip accents, collapse whitespace, drop punctuation)
 * and look it up in:
 *   - the alias table (CABA → C, Capital Federal → C, etc.)
 *   - the canonical INDEC names loaded from the DB
 *
 * Unmatched values get bucketed in `geo_unmatched` for manual review by the
 * caller (we return `regionId: null`; the caller writes the audit row so the
 * resolver stays pure).
 */
@Injectable()
export class RegionResolverService implements OnModuleInit {
  private readonly logger = new Logger(RegionResolverService.name);

  /** countryCode → normalized name (or alias) → region id */
  private readonly index = new Map<string, Map<string, number>>();
  /** countryCode → region id → canonical name */
  private readonly canonicalNames = new Map<string, Map<number, string>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.loadIndex();
  }

  /**
   * Resolve a Magento region (string OR `{region, region_code, region_id}`)
   * to our region id. Returns `{ regionId: null, canonicalName: null }` when
   * unmatched.
   */
  resolve(countryCode: string, raw: unknown): RegionResolution {
    const candidates = collectCandidates(raw);
    if (candidates.length === 0) {
      return { regionId: null, canonicalName: null };
    }

    const country = countryCode.toUpperCase();
    const byName = this.index.get(country);
    const byId = this.canonicalNames.get(country);
    if (!byName || !byId) {
      return { regionId: null, canonicalName: null };
    }

    for (const candidate of candidates) {
      const normalized = normalize(candidate);
      if (!normalized) continue;
      const aliased = AR_ALIASES[normalized] ?? normalized;
      const id = byName.get(aliased);
      if (id !== undefined) {
        return { regionId: id, canonicalName: byId.get(id) ?? null };
      }
    }
    return { regionId: null, canonicalName: null };
  }

  /** Reload the in-memory index. Useful in tests + after seeding new regions. */
  async loadIndex(): Promise<void> {
    const rows = await this.prisma.region.findMany({
      where: { isActive: true },
      select: { id: true, countryCode: true, code: true, name: true },
    });

    const index = new Map<string, Map<string, number>>();
    const canonical = new Map<string, Map<number, string>>();
    for (const r of rows) {
      const country = r.countryCode.toUpperCase();
      if (!index.has(country)) index.set(country, new Map());
      if (!canonical.has(country)) canonical.set(country, new Map());
      index.get(country)!.set(normalize(r.name), r.id);
      // Some Magento regions come back as just the ISO sub-code (e.g. "B"
      // for Buenos Aires) — index by code too.
      index.get(country)!.set(normalize(r.code), r.id);
      canonical.get(country)!.set(r.id, r.name);
    }

    this.index.clear();
    this.canonicalNames.clear();
    for (const [k, v] of index) this.index.set(k, v);
    for (const [k, v] of canonical) this.canonicalNames.set(k, v);

    const totalRegions = rows.length;
    this.logger.log(
      `Region index loaded: ${totalRegions.toString()} rows across ${this.index.size.toString()} countries`,
    );
  }
}

/**
 * Magento aliases for Argentine provinces. Keys MUST be already-normalized
 * (lowercase, no accents, no punctuation). Values are the INDEC `code`
 * (single letter) seeded in the `region` table.
 */
const AR_ALIASES: Readonly<Record<string, string>> = {
  caba: 'c',
  capital: 'c',
  capitalfederal: 'c',
  ciudaddebuenosaires: 'c',
  ciudadautonomadebuenosaires: 'c',
  ciudadautdebuenosaires: 'c',
  cdadautdebuenosaires: 'c',
  // Tierra del Fuego shorthand (canonical name is long).
  tierradelfuego: 'v',
  tierradelfuegoantartidaeislasdelatlanticosur: 'v',
  // Common typos we accept.
  santafe: 's',
  santiago: 'g',
  santiagodelestero: 'g',
};

/** Pull every plausible string value out of the heterogeneous Magento input. */
function collectCandidates(raw: unknown): string[] {
  if (raw == null) return [];
  if (typeof raw === 'string') return [raw];
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const out: string[] = [];
    if (typeof obj['region'] === 'string') out.push(obj['region']);
    if (typeof obj['region_code'] === 'string') out.push(obj['region_code']);
    return out;
  }
  return [];
}

/** Lowercase, strip accents, drop everything that isn't [a-z0-9]. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
